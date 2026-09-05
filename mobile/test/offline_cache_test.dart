import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:urban_furniture/models/models.dart';
import 'package:urban_furniture/services/offline_storage.dart';

/// Regression test for the crash that made the app unusable after a restart.
///
/// Hive hands back nested maps as dynamic-keyed maps. Reading them
/// straight into the models threw
///   `LinkedMap<dynamic, dynamic>` is not a subtype of `Map<String, dynamic>`
/// on the first launch *after* a sync — a white screen every time the app was
/// reopened, which is exactly when an offline-first app has to work.
///
/// It only reproduces through a real write-then-read cycle: immediately after
/// a sync the boxes still hold the original decoded JSON, so the casts pass.
/// That is why this test persists, closes, and reopens the boxes.
const _boxes = [
  'contacts', 'products', 'accounts', 'journals', 'taxes', 'currencies',
  'currencyRates', 'purchaseOrders', 'salesOrders', 'vendorBills',
  'customerInvoices', 'payments', 'journalEntries', 'analyticAccounts', 'budgets',
];

Future<void> _openAll() async {
  await Hive.openBox<Map>('sync_meta');
  for (final b in _boxes) {
    await Hive.openBox<Map>(b);
  }
}

void main() {
  late Directory tempDir;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('uf_hive_test');
    Hive.init(tempDir.path);
    await _openAll();
  });

  tearDown(() async {
    await Hive.close();
    await tempDir.delete(recursive: true);
  });

  test('nested records survive a write, close and reopen', () async {
    final storage = OfflineStorage();

    // Shaped like the real API payload: nested line items and a nested partner.
    await storage.saveSync('user-1', DateTime.now().toUtc().toIso8601String(), 'admin', {
      'customerInvoices': [
        {
          'id': 'inv-1',
          'number': 'INV/2026/0001',
          'invoiceDate': '2026-05-01',
          'dueDate': '2026-05-31',
          'state': 'posted',
          'settleState': 'not_paid',
          'untaxed': '1000.00',
          'taxAmount': '180.00',
          'total': '1180.00',
          'amountResidual': '1180.00',
          'customer': {'id': 'c-1', 'name': 'Gateway Hotels Ltd', 'type': 'customer'},
          'lines': [
            {
              'id': 'l-1',
              'productId': 'p-1',
              // Two levels of nesting — the exact shape that used to throw.
              'product': {'id': 'p-1', 'name': 'Office Chair'},
              'quantity': '2',
              'unitPrice': '500.00',
              'taxRate': '18',
              'subtotal': '1000.00',
            },
          ],
        },
      ],
      'contacts': [
        {'id': 'c-1', 'name': 'Gateway Hotels Ltd', 'type': 'customer', 'status': 'active'},
      ],
    });

    // Force a genuine round-trip through disk.
    await Hive.close();
    Hive.init(tempDir.path);
    await _openAll();

    final reopened = OfflineStorage();

    // Before the fix this threw instead of returning rows.
    late List<CustomerInvoice> invoices;
    expect(() => invoices = reopened.customerInvoices, returnsNormally);

    expect(invoices, hasLength(1));
    expect(invoices.first.number, 'INV/2026/0001');
    expect(invoices.first.lines, hasLength(1), reason: 'nested lines must survive');
    expect(invoices.first.lines.first.productName, 'Office Chair');
    expect(reopened.contacts.first.name, 'Gateway Hotels Ltd');

    final meta = reopened.getSyncMeta('user-1');
    expect(meta, isNotNull);
    expect(meta!.userId, 'user-1');
  });

  test('clearAll empties the cache', () async {
    final storage = OfflineStorage();
    await storage.saveSync('user-1', DateTime.now().toUtc().toIso8601String(), 'admin', {
      'contacts': [
        {'id': 'c-1', 'name': 'Test', 'type': 'customer', 'status': 'active'},
      ],
    });
    expect(storage.contacts, hasLength(1));

    await storage.clearAll();
    expect(storage.contacts, isEmpty);
    expect(storage.getSyncMeta('user-1'), isNull);
  });
}
