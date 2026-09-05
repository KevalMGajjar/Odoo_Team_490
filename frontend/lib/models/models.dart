library;

/// Lightweight models for the sync bulk response.
///
/// These are plain Dart classes (no code-gen) that deserialise from the JSON
/// returned by GET /sync/bulk. Each mirrors its Prisma model closely enough
/// for display, but strips unnecessary backend detail.

// ─────────────────────────── User ───────────────────────────

class AppUser {
  final String id;
  final String name;
  final String email;
  final String role;
  final String? contactId;

  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.contactId,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        email: json['email'] as String,
        role: json['role'] as String,
        contactId: json['contactId'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'role': role,
        'contactId': contactId,
      };

  bool get isAdmin => role == 'admin';
  bool get isAccountant => role == 'invoicing_user';
  bool get isPortal => role == 'contact';
}

// ─────────────────────────── Contact ───────────────────────────

class Contact {
  final String id;
  final String name;
  final String type;
  final String? email;
  final String? mobile;
  final String? city;
  final String? state;
  final String? pincode;
  final String? profileImage;
  final String status;

  const Contact({
    required this.id,
    required this.name,
    required this.type,
    this.email,
    this.mobile,
    this.city,
    this.state,
    this.pincode,
    this.profileImage,
    this.status = 'active',
  });

  factory Contact.fromJson(Map<String, dynamic> json) => Contact(
        id: json['id'] as String,
        name: json['name'] as String,
        type: json['type'] as String,
        email: json['email'] as String?,
        mobile: json['mobile'] as String?,
        city: json['city'] as String?,
        state: json['state'] as String?,
        pincode: json['pincode'] as String?,
        profileImage: json['profileImage'] as String?,
        status: json['status'] as String? ?? 'active',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'type': type,
        'email': email,
        'mobile': mobile,
        'city': city,
        'state': state,
        'pincode': pincode,
        'profileImage': profileImage,
        'status': status,
      };
}

// ─────────────────────────── Product ───────────────────────────

class Product {
  final String id;
  final String name;
  final String type;
  final String? category;
  final String salesPrice;
  final String cost;
  final String status;

  const Product({
    required this.id,
    required this.name,
    required this.type,
    this.category,
    this.salesPrice = '0',
    this.cost = '0',
    this.status = 'active',
  });

  factory Product.fromJson(Map<String, dynamic> json) => Product(
        id: json['id'] as String,
        name: json['name'] as String,
        type: json['type'] as String,
        category: (json['category'] is Map)
            ? json['category']['name'] as String?
            : json['category'] as String?,
        salesPrice: _str(json['salesPrice'] ?? json['sales_price']),
        cost: _str(json['cost']),
        status: json['status'] as String? ?? 'active',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'type': type,
        'category': category,
        'salesPrice': salesPrice,
        'cost': cost,
        'status': status,
      };
}

// ─────────────────────────── Chart of Account ───────────────────────────

class Account {
  final String id;
  final String code;
  final String name;
  final String type;
  final String status;

  const Account({
    required this.id,
    required this.code,
    required this.name,
    required this.type,
    this.status = 'active',
  });

  factory Account.fromJson(Map<String, dynamic> json) => Account(
        id: json['id'] as String,
        code: json['code'] as String,
        name: json['name'] as String,
        type: json['type'] as String,
        status: json['status'] as String? ?? 'active',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'code': code,
        'name': name,
        'type': type,
        'status': status,
      };
}

// ─────────────────────────── Journal ───────────────────────────

class Journal {
  final String id;
  final String name;
  final String type;
  final String code;
  final String status;

  const Journal({
    required this.id,
    required this.name,
    required this.type,
    required this.code,
    this.status = 'active',
  });

  factory Journal.fromJson(Map<String, dynamic> json) => Journal(
        id: json['id'] as String,
        name: json['name'] as String,
        type: json['type'] as String,
        code: json['code'] as String,
        status: json['status'] as String? ?? 'active',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'type': type,
        'code': code,
        'status': status,
      };
}

// ─────────────────────────── Customer Invoice ───────────────────────────

class CustomerInvoice {
  final String id;
  final String number;
  final String customerId;
  final String? customerName;
  final String invoiceDate;
  final String? dueDate;
  final String state;
  final String settleState;
  final String untaxed;
  final String taxAmount;
  final String total;
  final String amountResidual;
  final List<InvoiceLine> lines;

  const CustomerInvoice({
    required this.id,
    required this.number,
    required this.customerId,
    this.customerName,
    required this.invoiceDate,
    this.dueDate,
    this.state = 'draft',
    this.settleState = 'not_paid',
    this.untaxed = '0',
    this.taxAmount = '0',
    this.total = '0',
    this.amountResidual = '0',
    this.lines = const [],
  });

  factory CustomerInvoice.fromJson(Map<String, dynamic> json) =>
      CustomerInvoice(
        id: json['id'] as String,
        number: json['number'] as String,
        customerId: json['customerId'] ?? json['customer_id'] ?? '',
        customerName: json['customer']?['name'] as String?,
        invoiceDate: _dateStr(json['invoiceDate'] ?? json['invoice_date']),
        dueDate: _dateStr(json['dueDate'] ?? json['due_date']),
        state: json['state'] as String? ?? 'draft',
        settleState: json['settleState'] ?? json['settle_state'] ?? 'not_paid',
        untaxed: _str(json['untaxed']),
        taxAmount: _str(json['taxAmount'] ?? json['tax_amount']),
        total: _str(json['total']),
        amountResidual: _str(json['amountResidual'] ?? json['amount_residual']),
        lines: (json['lines'] as List<dynamic>?)
                ?.map((l) => InvoiceLine.fromJson(l as Map<String, dynamic>))
                .toList() ??
            [],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'number': number,
        'customerId': customerId,
        'customerName': customerName,
        'invoiceDate': invoiceDate,
        'dueDate': dueDate,
        'state': state,
        'settleState': settleState,
        'untaxed': untaxed,
        'taxAmount': taxAmount,
        'total': total,
        'amountResidual': amountResidual,
        'lines': lines.map((l) => l.toJson()).toList(),
      };
}

class InvoiceLine {
  final String id;
  final String productId;
  final String? productName;
  final String quantity;
  final String unitPrice;
  final String taxRate;
  final String subtotal;

  const InvoiceLine({
    required this.id,
    required this.productId,
    this.productName,
    this.quantity = '0',
    this.unitPrice = '0',
    this.taxRate = '0',
    this.subtotal = '0',
  });

  factory InvoiceLine.fromJson(Map<String, dynamic> json) => InvoiceLine(
        id: json['id'] as String,
        productId: json['productId'] ?? json['product_id'] ?? '',
        productName: json['product']?['name'] as String?,
        quantity: _str(json['quantity']),
        unitPrice: _str(json['unitPrice'] ?? json['unit_price']),
        taxRate: _str(json['taxRate'] ?? json['tax_rate']),
        subtotal: _str(json['subtotal']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'productId': productId,
        'productName': productName,
        'quantity': quantity,
        'unitPrice': unitPrice,
        'taxRate': taxRate,
        'subtotal': subtotal,
      };
}

// ─────────────────────────── Vendor Bill ───────────────────────────

class VendorBill {
  final String id;
  final String number;
  final String vendorId;
  final String? vendorName;
  final String billDate;
  final String? dueDate;
  final String state;
  final String settleState;
  final String untaxed;
  final String taxAmount;
  final String total;
  final String amountResidual;
  final List<BillLine> lines;

  const VendorBill({
    required this.id,
    required this.number,
    required this.vendorId,
    this.vendorName,
    required this.billDate,
    this.dueDate,
    this.state = 'draft',
    this.settleState = 'not_paid',
    this.untaxed = '0',
    this.taxAmount = '0',
    this.total = '0',
    this.amountResidual = '0',
    this.lines = const [],
  });

  factory VendorBill.fromJson(Map<String, dynamic> json) => VendorBill(
        id: json['id'] as String,
        number: json['number'] as String,
        vendorId: json['vendorId'] ?? json['vendor_id'] ?? '',
        vendorName: json['vendor']?['name'] as String?,
        billDate: _dateStr(json['billDate'] ?? json['bill_date']),
        dueDate: _dateStr(json['dueDate'] ?? json['due_date']),
        state: json['state'] as String? ?? 'draft',
        settleState: json['settleState'] ?? json['settle_state'] ?? 'not_paid',
        untaxed: _str(json['untaxed']),
        taxAmount: _str(json['taxAmount'] ?? json['tax_amount']),
        total: _str(json['total']),
        amountResidual: _str(json['amountResidual'] ?? json['amount_residual']),
        lines: (json['lines'] as List<dynamic>?)
                ?.map((l) => BillLine.fromJson(l as Map<String, dynamic>))
                .toList() ??
            [],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'number': number,
        'vendorId': vendorId,
        'vendorName': vendorName,
        'billDate': billDate,
        'dueDate': dueDate,
        'state': state,
        'settleState': settleState,
        'untaxed': untaxed,
        'taxAmount': taxAmount,
        'total': total,
        'amountResidual': amountResidual,
        'lines': lines.map((l) => l.toJson()).toList(),
      };
}

class BillLine {
  final String id;
  final String productId;
  final String? productName;
  final String quantity;
  final String unitPrice;
  final String taxRate;
  final String subtotal;

  const BillLine({
    required this.id,
    required this.productId,
    this.productName,
    this.quantity = '0',
    this.unitPrice = '0',
    this.taxRate = '0',
    this.subtotal = '0',
  });

  factory BillLine.fromJson(Map<String, dynamic> json) => BillLine(
        id: json['id'] as String,
        productId: json['productId'] ?? json['product_id'] ?? '',
        productName: json['product']?['name'] as String?,
        quantity: _str(json['quantity']),
        unitPrice: _str(json['unitPrice'] ?? json['unit_price']),
        taxRate: _str(json['taxRate'] ?? json['tax_rate']),
        subtotal: _str(json['subtotal']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'productId': productId,
        'productName': productName,
        'quantity': quantity,
        'unitPrice': unitPrice,
        'taxRate': taxRate,
        'subtotal': subtotal,
      };
}

// ─────────────────────────── Payment ───────────────────────────

class Payment {
  final String id;
  final String number;
  final String direction;
  final String partnerId;
  final String? partnerName;
  final String? journalName;
  final String paymentDate;
  final String amount;
  final String state;

  const Payment({
    required this.id,
    required this.number,
    required this.direction,
    required this.partnerId,
    this.partnerName,
    this.journalName,
    required this.paymentDate,
    this.amount = '0',
    this.state = 'draft',
  });

  factory Payment.fromJson(Map<String, dynamic> json) => Payment(
        id: json['id'] as String,
        number: json['number'] as String,
        direction: json['direction'] as String,
        partnerId: json['partnerId'] ?? json['partner_id'] ?? '',
        partnerName: json['partner']?['name'] as String?,
        journalName: json['journal']?['name'] as String?,
        paymentDate: _dateStr(json['paymentDate'] ?? json['payment_date']),
        amount: _str(json['amount']),
        state: json['state'] as String? ?? 'draft',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'number': number,
        'direction': direction,
        'partnerId': partnerId,
        'partnerName': partnerName,
        'journalName': journalName,
        'paymentDate': paymentDate,
        'amount': amount,
        'state': state,
      };
}

// ─────────────────────────── Purchase Order ───────────────────────────

class PurchaseOrder {
  final String id;
  final String number;
  final String vendorId;
  final String? vendorName;
  final String orderDate;
  final String state;
  final String untaxed;
  final String taxAmount;
  final String total;

  const PurchaseOrder({
    required this.id,
    required this.number,
    required this.vendorId,
    this.vendorName,
    required this.orderDate,
    this.state = 'draft',
    this.untaxed = '0',
    this.taxAmount = '0',
    this.total = '0',
  });

  factory PurchaseOrder.fromJson(Map<String, dynamic> json) => PurchaseOrder(
        id: json['id'] as String,
        number: json['number'] as String,
        vendorId: json['vendorId'] ?? json['vendor_id'] ?? '',
        vendorName: json['vendor']?['name'] as String?,
        orderDate: json['orderDate'] ?? json['order_date'] ?? '',
        state: json['state'] as String? ?? 'draft',
        untaxed: _str(json['untaxed']),
        taxAmount: _str(json['taxAmount'] ?? json['tax_amount']),
        total: _str(json['total']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'number': number,
        'vendorId': vendorId,
        'vendorName': vendorName,
        'orderDate': orderDate,
        'state': state,
        'untaxed': untaxed,
        'taxAmount': taxAmount,
        'total': total,
      };
}

// ─────────────────────────── Sales Order ───────────────────────────

class SalesOrder {
  final String id;
  final String number;
  final String customerId;
  final String? customerName;
  final String orderDate;
  final String state;
  final String untaxed;
  final String taxAmount;
  final String total;

  const SalesOrder({
    required this.id,
    required this.number,
    required this.customerId,
    this.customerName,
    required this.orderDate,
    this.state = 'draft',
    this.untaxed = '0',
    this.taxAmount = '0',
    this.total = '0',
  });

  factory SalesOrder.fromJson(Map<String, dynamic> json) => SalesOrder(
        id: json['id'] as String,
        number: json['number'] as String,
        customerId: json['customerId'] ?? json['customer_id'] ?? '',
        customerName: json['customer']?['name'] as String?,
        orderDate: json['orderDate'] ?? json['order_date'] ?? '',
        state: json['state'] as String? ?? 'draft',
        untaxed: _str(json['untaxed']),
        taxAmount: _str(json['taxAmount'] ?? json['tax_amount']),
        total: _str(json['total']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'number': number,
        'customerId': customerId,
        'customerName': customerName,
        'orderDate': orderDate,
        'state': state,
        'untaxed': untaxed,
        'taxAmount': taxAmount,
        'total': total,
      };
}

// ─────────────────────────── Journal Entry ───────────────────────────

class JournalEntry {
  final String id;
  final String number;
  final String? journalName;
  final String date;
  final String? reference;
  final String? narration;
  final String state;
  final List<JournalItem> items;

  const JournalEntry({
    required this.id,
    required this.number,
    this.journalName,
    required this.date,
    this.reference,
    this.narration,
    this.state = 'draft',
    this.items = const [],
  });

  factory JournalEntry.fromJson(Map<String, dynamic> json) => JournalEntry(
        id: json['id'] as String,
        number: json['number'] as String,
        journalName: json['journal']?['name'] as String?,
        date: _dateStr(json['date']),
        reference: json['reference'] as String?,
        narration: json['narration'] as String?,
        state: json['state'] as String? ?? 'draft',
        items: (json['items'] as List<dynamic>?)
                ?.map((i) => JournalItem.fromJson(i as Map<String, dynamic>))
                .toList() ??
            [],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'number': number,
        'journalName': journalName,
        'date': date,
        'reference': reference,
        'narration': narration,
        'state': state,
        'items': items.map((i) => i.toJson()).toList(),
      };

  String get totalDebit {
    var sum = 0.0;
    for (final item in items) {
      sum += double.tryParse(item.debit) ?? 0;
    }
    return sum.toStringAsFixed(2);
  }

  String get totalCredit {
    var sum = 0.0;
    for (final item in items) {
      sum += double.tryParse(item.credit) ?? 0;
    }
    return sum.toStringAsFixed(2);
  }
}

class JournalItem {
  final String id;
  final String? accountName;
  final String? accountCode;
  final String? partnerName;
  final String? label;
  final String debit;
  final String credit;

  const JournalItem({
    required this.id,
    this.accountName,
    this.accountCode,
    this.partnerName,
    this.label,
    this.debit = '0',
    this.credit = '0',
  });

  factory JournalItem.fromJson(Map<String, dynamic> json) => JournalItem(
        id: json['id'] as String,
        accountName: json['account']?['name'] as String?,
        accountCode: json['account']?['code'] as String?,
        partnerName: json['partner']?['name'] as String?,
        label: json['label'] as String?,
        debit: _str(json['debit']),
        credit: _str(json['credit']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'accountName': accountName,
        'accountCode': accountCode,
        'partnerName': partnerName,
        'label': label,
        'debit': debit,
        'credit': credit,
      };
}

// ─────────────────────────── Sync Meta ───────────────────────────

class SyncMeta {
  final String userId;
  final String syncedAt;
  final String role;

  const SyncMeta({
    required this.userId,
    required this.syncedAt,
    required this.role,
  });

  factory SyncMeta.fromJson(Map<String, dynamic> json) => SyncMeta(
        userId: json['userId'] as String,
        syncedAt: json['syncedAt'] as String,
        role: json['role'] as String,
      );

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'syncedAt': syncedAt,
        'role': role,
      };

  DateTime get syncedAtDate => DateTime.parse(syncedAt);
}

// ─────────────────────────── Bulk Response ───────────────────────────

class SyncBulkResponse {
  final String syncedAt;
  final AppUser? user;
  final Map<String, List<Map<String, dynamic>>> rawData;

  const SyncBulkResponse({
    required this.syncedAt,
    this.user,
    required this.rawData,
  });

  factory SyncBulkResponse.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>? ?? {};
    final rawData = <String, List<Map<String, dynamic>>>{};

    for (final entry in data.entries) {
      if (entry.value is List) {
        rawData[entry.key] = (entry.value as List)
            .map((item) => item as Map<String, dynamic>)
            .toList();
      }
    }

    return SyncBulkResponse(
      syncedAt: json['syncedAt'] as String? ?? DateTime.now().toUtc().toIso8601String(),
      user: json['user'] != null ? AppUser.fromJson(json['user'] as Map<String, dynamic>) : null,
      rawData: rawData,
    );
  }

  List<Contact> get contacts =>
      _parse(rawData['contacts'], Contact.fromJson);
  List<Product> get products =>
      _parse(rawData['products'], Product.fromJson);
  List<Account> get accounts =>
      _parse(rawData['accounts'], Account.fromJson);
  List<Journal> get journals =>
      _parse(rawData['journals'], Journal.fromJson);
  List<CustomerInvoice> get customerInvoices =>
      _parse(rawData['customerInvoices'], CustomerInvoice.fromJson);
  List<VendorBill> get vendorBills =>
      _parse(rawData['vendorBills'], VendorBill.fromJson);
  List<Payment> get payments =>
      _parse(rawData['payments'], Payment.fromJson);
  List<PurchaseOrder> get purchaseOrders =>
      _parse(rawData['purchaseOrders'], PurchaseOrder.fromJson);
  List<SalesOrder> get salesOrders =>
      _parse(rawData['salesOrders'], SalesOrder.fromJson);
  List<JournalEntry> get journalEntries =>
      _parse(rawData['journalEntries'], JournalEntry.fromJson);
}

List<T> _parse<T>(
    List<Map<String, dynamic>>? items, T Function(Map<String, dynamic>) fn) {
  if (items == null || items.isEmpty) return [];
  return items.map(fn).toList();
}

/// Safely coerce Prisma Decimal values (sent as strings) to a string.
String _str(dynamic v) {
  if (v == null) return '0';
  return v.toString();
}

/// Format ISO date strings into YYYY-MM-DD
String _dateStr(dynamic v) {
  if (v == null) return '';
  final s = v.toString();
  if (s.contains('T')) {
    return s.split('T')[0];
  }
  return s;
}
