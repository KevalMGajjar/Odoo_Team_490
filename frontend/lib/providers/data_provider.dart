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

  void _loadFromHive() {
    _contacts = _storage.contacts;
    _products = _storage.products;
    _accounts = _storage.accounts;
    _journals = _storage.journals;
    _customerInvoices = _storage.customerInvoices;
    _vendorBills = _storage.vendorBills;
    _payments = _storage.payments;
    _purchaseOrders = _storage.purchaseOrders;
    _salesOrders = _storage.salesOrders;
    _journalEntries = _storage.journalEntries;
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
