import 'package:hive_flutter/hive_flutter.dart';
import '../models/models.dart';

/// Persistent local storage using Hive.
///
/// Each entity type gets its own Hive box, storing raw JSON maps.
/// This avoids Hive TypeAdapters (code-gen overhead) while still giving
/// us persistent, indexed, per-record storage.
///
/// The "overwrite" sync strategy: on each sync, every box is cleared and
/// repopulated from the bulk API response. No merge, no delta, no conflicts.
class OfflineStorage {
  static const _metaBoxName = 'sync_meta';

  static const _boxNames = [
    'contacts',
    'products',
    'accounts',
    'journals',
    'taxes',
    'currencies',
    'currencyRates',
    'purchaseOrders',
    'salesOrders',
    'vendorBills',
    'customerInvoices',
    'payments',
    'journalEntries',
    'analyticAccounts',
    'budgets',
  ];

  /// Call once at app startup before any other Hive operation.
  static Future<void> init() async {
    await Hive.initFlutter();
    // Open all boxes upfront so reads are instant
    await Hive.openBox<Map>(_metaBoxName);
    for (final name in _boxNames) {
      await Hive.openBox<Map>(name);
    }
  }

  /// Persist the full bulk sync response into Hive.
  ///
  /// Runs inside a batch: clears each box then inserts all records.
  /// If any step fails, the previous cache is already gone — but since
  /// a partial API response is impossible (single HTTP call), this only
  /// fails on device-level storage errors.
  Future<void> saveSync(
    String userId,
    String syncedAt,
    String role,
    Map<String, List<Map<String, dynamic>>> rawData,
  ) async {
    // Save each entity collection
    for (final name in _boxNames) {
      final box = Hive.box<Map>(name);
      await box.clear();
      final items = rawData[name];
      if (items != null && items.isNotEmpty) {
        final entries = <String, Map>{};
        for (final item in items) {
          final id = item['id'] as String?;
          if (id != null) {
            entries[id] = item;
          }
        }
        await box.putAll(entries);
      }
    }

    // Save sync metadata
    final metaBox = Hive.box<Map>(_metaBoxName);
    await metaBox.put(userId, {
      'userId': userId,
      'syncedAt': syncedAt,
      'role': role,
    });
  }

  /// Load sync metadata for a user (null if never synced).
  SyncMeta? getSyncMeta(String userId) {
    final metaBox = Hive.box<Map>(_metaBoxName);
    final raw = metaBox.get(userId);
    if (raw == null) return null;
    return SyncMeta.fromJson(Map<String, dynamic>.from(raw));
  }

  /// Check if any cached data exists for this user.
  bool hasCachedData(String userId) => getSyncMeta(userId) != null;

  /// Load all items from a specific entity box.
  List<Map<String, dynamic>> getAll(String boxName) {
    final box = Hive.box<Map>(boxName);
    return box.values
        .map((m) => Map<String, dynamic>.from(m))
        .toList();
  }

  /// Load typed lists from cache.
  List<Contact> get contacts =>
      getAll('contacts').map(Contact.fromJson).toList();

  List<Product> get products =>
      getAll('products').map(Product.fromJson).toList();

  List<Account> get accounts =>
      getAll('accounts').map(Account.fromJson).toList();

  List<Journal> get journals =>
      getAll('journals').map(Journal.fromJson).toList();

  List<CustomerInvoice> get customerInvoices =>
      getAll('customerInvoices').map(CustomerInvoice.fromJson).toList();

  List<VendorBill> get vendorBills =>
      getAll('vendorBills').map(VendorBill.fromJson).toList();

  List<Payment> get payments =>
      getAll('payments').map(Payment.fromJson).toList();

  List<PurchaseOrder> get purchaseOrders =>
      getAll('purchaseOrders').map(PurchaseOrder.fromJson).toList();

  List<SalesOrder> get salesOrders =>
      getAll('salesOrders').map(SalesOrder.fromJson).toList();

  List<JournalEntry> get journalEntries =>
      getAll('journalEntries').map(JournalEntry.fromJson).toList();

  /// Clear ALL cached data (called on logout).
  Future<void> clearAll() async {
    for (final name in _boxNames) {
      await Hive.box<Map>(name).clear();
    }
    await Hive.box<Map>(_metaBoxName).clear();
  }

  /// Clear data for a specific user only.
  Future<void> clearForUser(String userId) async {
    // In overwrite mode, boxes aren't user-scoped, so clear everything.
    // If multi-user-per-device is needed later, partition by userId prefix.
    await clearAll();
  }
}
