import 'package:flutter/foundation.dart';
import '../models/models.dart';
import '../services/offline_storage.dart';

class DataProvider extends ChangeNotifier {
  final OfflineStorage _storage;

  List<Contact> _contacts = [];
  List<Product> _products = [];
  List<Account> _accounts = [];
  List<Journal> _journals = [];
  List<CustomerInvoice> _customerInvoices = [];
  List<VendorBill> _vendorBills = [];
  List<Payment> _payments = [];
  List<PurchaseOrder> _purchaseOrders = [];
  List<SalesOrder> _salesOrders = [];
  List<JournalEntry> _journalEntries = [];

  bool _isLoading = false;

  DataProvider(this._storage) {
    _loadFromHive();
  }

  List<Contact> get contacts => _contacts;
  List<Product> get products => _products;
  List<Account> get accounts => _accounts;
  List<Journal> get journals => _journals;
  List<CustomerInvoice> get customerInvoices => _customerInvoices;
  List<VendorBill> get vendorBills => _vendorBills;
  List<Payment> get payments => _payments;
  List<PurchaseOrder> get purchaseOrders => _purchaseOrders;
  List<SalesOrder> get salesOrders => _salesOrders;
  List<JournalEntry> get journalEntries => _journalEntries;
  bool get isLoading => _isLoading;

  /// Has any data been cached locally?
  bool get hasData =>
      _contacts.isNotEmpty ||
      _customerInvoices.isNotEmpty ||
      _vendorBills.isNotEmpty ||
      _products.isNotEmpty;

  /// Sorted here, once, rather than in each screen.
  ///
  /// Hive returns records in whatever order they were written, which is the
  /// order the server happened to send them — so the invoice list opened on
  /// 0015, 0013, 0019, 0003. Not wrong, exactly, but a list with no order is
  /// the fastest way to make a working app look broken, and every screen
  /// re-sorting for itself is how two screens end up disagreeing.
  ///
  /// Dates are ISO-8601 strings (`2026-07-15`), which sort correctly as text —
  /// no parsing needed, and no throwing on a malformed one.
  void _loadFromHive() {
    _contacts = _sorted(_storage.contacts, (a, b) => a.name.compareTo(b.name));
    _products = _sorted(_storage.products, (a, b) => a.name.compareTo(b.name));
    _accounts = _sorted(_storage.accounts, (a, b) => a.code.compareTo(b.code));
    _journals = _sorted(_storage.journals, (a, b) => a.code.compareTo(b.code));

    // Documents read newest-first: the ones you are asked about are the recent
    // ones, and scrolling to the bottom for today's invoice is nobody's idea.
    _customerInvoices = _sorted(_storage.customerInvoices, (a, b) => b.invoiceDate.compareTo(a.invoiceDate));
    _vendorBills = _sorted(_storage.vendorBills, (a, b) => b.billDate.compareTo(a.billDate));
    _payments = _sorted(_storage.payments, (a, b) => b.paymentDate.compareTo(a.paymentDate));
    _purchaseOrders = _sorted(_storage.purchaseOrders, (a, b) => b.orderDate.compareTo(a.orderDate));
    _salesOrders = _sorted(_storage.salesOrders, (a, b) => b.orderDate.compareTo(a.orderDate));
    _journalEntries = _sorted(_storage.journalEntries, (a, b) => b.date.compareTo(a.date));
  }

  /// Sort a copy. Hive hands back its own list, and sorting it in place would
  /// reorder the cache underneath anything else holding a reference to it.
  static List<T> _sorted<T>(List<T> source, int Function(T, T) compare) {
    final copy = List<T>.of(source);
    copy.sort(compare);
    return copy;
  }

  /// Load all cached entities from Hive and notify listeners
  void loadFromStorage() {
    _isLoading = true;
    _loadFromHive();
    _isLoading = false;
    notifyListeners();
  }

  // ─────────────────────────── Computed KPIs ───────────────────────────

  /// Total customer receivables (sum of unpaid invoice balances)
  double get totalReceivables {
    double total = 0;
    for (final inv in _customerInvoices) {
      if (inv.state == 'posted' && inv.settleState != 'paid') {
        total += double.tryParse(inv.amountResidual) ?? 0;
      }
    }
    return total;
  }

  /// Total vendor payables (sum of unpaid bill balances)
  double get totalPayables {
    double total = 0;
    for (final bill in _vendorBills) {
      if (bill.state == 'posted' && bill.settleState != 'paid') {
        total += double.tryParse(bill.amountResidual) ?? 0;
      }
    }
    return total;
  }

  /// Total invoiced sales
  double get totalSalesInvoiced {
    double total = 0;
    for (final inv in _customerInvoices) {
      if (inv.state == 'posted') {
        total += double.tryParse(inv.total) ?? 0;
      }
    }
    return total;
  }

  /// Number of overdue customer invoices
  int get overdueInvoicesCount {
    final now = DateTime.now();
    int count = 0;
    for (final inv in _customerInvoices) {
      if (inv.state == 'posted' && inv.settleState != 'paid' && inv.dueDate != null) {
        final due = DateTime.tryParse(inv.dueDate!);
        if (due != null && due.isBefore(now)) {
          count++;
        }
      }
    }
    return count;
  }

  /// Total active products
  int get totalActiveProducts =>
      _products.where((p) => p.status == 'active').length;

  /// Total active contacts
  int get totalActiveContacts =>
      _contacts.where((c) => c.status == 'active').length;

  /// Filtered invoices by state
  List<CustomerInvoice> getInvoicesByState(String state) {
    if (state == 'all') return _customerInvoices;
    return _customerInvoices.where((i) => i.state == state).toList();
  }

  /// Filtered bills by state
  List<VendorBill> getBillsByState(String state) {
    if (state == 'all') return _vendorBills;
    return _vendorBills.where((b) => b.state == state).toList();
  }
}
