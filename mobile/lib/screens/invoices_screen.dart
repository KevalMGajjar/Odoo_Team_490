import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../config/formatting.dart';
import '../models/models.dart';
import '../providers/data_provider.dart';
import '../widgets/status_badge.dart';

class InvoicesScreen extends StatefulWidget {
  const InvoicesScreen({super.key});

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String _searchQuery = '';
  String _filterState = 'all';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _showInvoiceDetails(CustomerInvoice inv) {
    final fmt = Fmt.currency;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        height: MediaQuery.of(context).size.height * 0.8,
        decoration: const BoxDecoration(
          color: AppTheme.sheet,
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      inv.number,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.brand,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Customer: ${inv.customerName ?? 'N/A'}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textMuted),
                    ),
                  ],
                ),
                Row(
                  children: [
                    StatusBadge(status: inv.state),
                    const SizedBox(width: 6),
                    StatusBadge(status: inv.settleState),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text('Date: ${Fmt.day(inv.invoiceDate)}',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppTheme.textMuted)),
                if (inv.dueDate != null) ...[
                  const SizedBox(width: 16),
                  Text('Due: ${Fmt.day(inv.dueDate)}',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppTheme.textMuted)),
                ],
              ],
            ),
            const Divider(height: 28),
            const Text(
              'LINE ITEMS',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                color: AppTheme.textMuted,
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: inv.lines.isEmpty
                  ? const Center(
                      child: Text('No item lines available',
                          style: TextStyle(fontSize: 12.5, color: AppTheme.textMuted)),
                    )
                  : ListView.separated(
                      itemCount: inv.lines.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (ctx, i) {
                        final line = inv.lines[i];
                        final subtotal = double.tryParse(line.subtotal) ?? 0;
                        final price = double.tryParse(line.unitPrice) ?? 0;
                        return ListTile(
                          dense: true,
                          contentPadding: const EdgeInsets.symmetric(vertical: 2),
                          title: Text(
                            line.productName ?? 'Product Item',
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
                          ),
                          subtitle: Text(
                            'Qty: ${line.quantity} × ${fmt.format(price)} (Tax: ${line.taxRate}%)',
                            style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
                          ),
                          trailing: Text(
                            fmt.format(subtotal),
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                          ),
                        );
                      },
                    ),
            ),
            const Divider(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Untaxed Amount:', style: TextStyle(fontSize: 13, color: AppTheme.textMuted)),
                Text(fmt.format(double.tryParse(inv.untaxed) ?? 0),
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Tax Amount:', style: TextStyle(fontSize: 13, color: AppTheme.textMuted)),
                Text(fmt.format(double.tryParse(inv.taxAmount) ?? 0),
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total Amount:',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                Text(
                  fmt.format(double.tryParse(inv.total) ?? 0),
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 17, color: AppTheme.brand),
                ),
              ],
            ),
            if (double.tryParse(inv.amountResidual) != null &&
                double.parse(inv.amountResidual) > 0) ...[
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Amount Due (Residual):',
                      style: TextStyle(fontWeight: FontWeight.w700, color: AppTheme.overdue)),
                  Text(
                    fmt.format(double.tryParse(inv.amountResidual) ?? 0),
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15, color: AppTheme.overdue),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _showBillDetails(VendorBill bill) {
    final fmt = Fmt.currency;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        height: MediaQuery.of(context).size.height * 0.8,
        decoration: const BoxDecoration(
          color: AppTheme.sheet,
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      bill.number,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.credit,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Vendor: ${bill.vendorName ?? 'N/A'}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textMuted),
                    ),
                  ],
                ),
                Row(
                  children: [
                    StatusBadge(status: bill.state),
                    const SizedBox(width: 6),
                    StatusBadge(status: bill.settleState),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text('Date: ${Fmt.day(bill.billDate)}',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppTheme.textMuted)),
                if (bill.dueDate != null) ...[
                  const SizedBox(width: 16),
                  Text('Due: ${Fmt.day(bill.dueDate)}',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppTheme.textMuted)),
                ],
              ],
            ),
            const Divider(height: 28),
            const Text(
              'BILL ITEMS',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                color: AppTheme.textMuted,
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: bill.lines.isEmpty
                  ? const Center(
                      child: Text('No item lines available',
                          style: TextStyle(fontSize: 12.5, color: AppTheme.textMuted)),
                    )
                  : ListView.separated(
                      itemCount: bill.lines.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (ctx, i) {
                        final line = bill.lines[i];
                        final subtotal = double.tryParse(line.subtotal) ?? 0;
                        final price = double.tryParse(line.unitPrice) ?? 0;
                        return ListTile(
                          dense: true,
                          contentPadding: const EdgeInsets.symmetric(vertical: 2),
                          title: Text(
                            line.productName ?? 'Product Item',
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
                          ),
                          subtitle: Text(
                            'Qty: ${line.quantity} × ${fmt.format(price)} (Tax: ${line.taxRate}%)',
                            style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
                          ),
                          trailing: Text(
                            fmt.format(subtotal),
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                          ),
                        );
                      },
                    ),
            ),
            const Divider(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Untaxed Amount:', style: TextStyle(fontSize: 13, color: AppTheme.textMuted)),
                Text(fmt.format(double.tryParse(bill.untaxed) ?? 0),
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Tax Amount:', style: TextStyle(fontSize: 13, color: AppTheme.textMuted)),
                Text(fmt.format(double.tryParse(bill.taxAmount) ?? 0),
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total Bill:',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                Text(
                  fmt.format(double.tryParse(bill.total) ?? 0),
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 17, color: AppTheme.credit),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();
    final currencyFmt = Fmt.currency;

    final filteredInvoices = data.customerInvoices.where((inv) {
      final matchesSearch = _searchQuery.isEmpty ||
          inv.number.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          (inv.customerName?.toLowerCase().contains(_searchQuery.toLowerCase()) ?? false);
      final matchesState = _filterState == 'all' || inv.state == _filterState;
      return matchesSearch && matchesState;
    }).toList();

    final filteredBills = data.vendorBills.where((bill) {
      final matchesSearch = _searchQuery.isEmpty ||
          bill.number.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          (bill.vendorName?.toLowerCase().contains(_searchQuery.toLowerCase()) ?? false);
      final matchesState = _filterState == 'all' || bill.state == _filterState;
      return matchesSearch && matchesState;
    }).toList();

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(48),
        child: Container(
          color: AppTheme.sheet,
          child: TabBar(
            controller: _tabController,
            labelColor: AppTheme.brand,
            unselectedLabelColor: AppTheme.textMuted,
            indicatorColor: AppTheme.brand,
            indicatorWeight: 3,
            labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            tabs: [
              Tab(text: 'Customer Invoices (${data.customerInvoices.length})'),
              Tab(text: 'Vendor Bills (${data.vendorBills.length})'),
            ],
          ),
        ),
      ),
      body: Column(
        children: [
          // Filter & Search toolbar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            color: AppTheme.sheet,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      hintText: 'Search number, partner...',
                      prefixIcon: Icon(Icons.search_rounded, size: 18),
                      isDense: true,
                    ),
                    onChanged: (val) => setState(() => _searchQuery = val),
                  ),
                ),
                const SizedBox(width: 10),
                DropdownButtonHideUnderline(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppTheme.sheet,
                      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: DropdownButton<String>(
                      value: _filterState,
                      icon: const Icon(Icons.arrow_drop_down, color: AppTheme.textMuted),
                      items: const [
                        DropdownMenuItem(value: 'all', child: Text('All States', style: TextStyle(fontSize: 13))),
                        DropdownMenuItem(value: 'draft', child: Text('Draft', style: TextStyle(fontSize: 13))),
                        DropdownMenuItem(value: 'posted', child: Text('Posted', style: TextStyle(fontSize: 13))),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _filterState = val);
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Lists View
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                // Invoices Tab
                filteredInvoices.isEmpty
                    ? const Center(
                        child: Text(
                          'No customer invoices match your query.',
                          style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 16, 20, 96),
                        itemCount: filteredInvoices.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (ctx, i) {
                          final inv = filteredInvoices[i];
                          final amount = double.tryParse(inv.total) ?? 0;
                          return Container(
                            decoration: BoxDecoration(
                              color: AppTheme.sheet,
                              borderRadius: BorderRadius.circular(AppTheme.radius),
                              border: Border.all(color: AppTheme.border, width: 1),
                              boxShadow: AppTheme.cardShadow,
                            ),
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () => _showInvoiceDetails(inv),
                                borderRadius: BorderRadius.circular(AppTheme.radius),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        crossAxisAlignment: CrossAxisAlignment.center,
                                        children: [
                                          Expanded(
                                            child: Text(
                                              inv.number,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 14.5,
                                                color: AppTheme.text,
                                                letterSpacing: -0.2,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Text(
                                            currencyFmt.format(amount),
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 15,
                                              color: AppTheme.brand,
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        crossAxisAlignment: CrossAxisAlignment.center,
                                        children: [
                                          Expanded(
                                            child: Text(
                                              '${inv.customerName ?? 'Customer'} • ${Fmt.day(inv.invoiceDate)}',
                                              style: const TextStyle(
                                                fontSize: 12,
                                                color: AppTheme.textMuted,
                                                fontWeight: FontWeight.w500,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              StatusBadge(status: inv.state),
                                              const SizedBox(width: 6),
                                              StatusBadge(status: inv.settleState),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),

                // Vendor Bills Tab
                filteredBills.isEmpty
                    ? const Center(
                        child: Text(
                          'No vendor bills match your query.',
                          style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 16, 20, 96),
                        itemCount: filteredBills.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (ctx, i) {
                          final bill = filteredBills[i];
                          final amount = double.tryParse(bill.total) ?? 0;
                          return Container(
                            decoration: BoxDecoration(
                              color: AppTheme.sheet,
                              borderRadius: BorderRadius.circular(AppTheme.radius),
                              border: Border.all(color: AppTheme.border, width: 1),
                              boxShadow: AppTheme.cardShadow,
                            ),
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () => _showBillDetails(bill),
                                borderRadius: BorderRadius.circular(AppTheme.radius),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        crossAxisAlignment: CrossAxisAlignment.center,
                                        children: [
                                          Expanded(
                                            child: Text(
                                              bill.number,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 14.5,
                                                color: AppTheme.text,
                                                letterSpacing: -0.2,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Text(
                                            currencyFmt.format(amount),
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 15,
                                              color: AppTheme.credit,
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        crossAxisAlignment: CrossAxisAlignment.center,
                                        children: [
                                          Expanded(
                                            child: Text(
                                              '${bill.vendorName ?? 'Vendor'} • ${Fmt.day(bill.billDate)}',
                                              style: const TextStyle(
                                                fontSize: 12,
                                                color: AppTheme.textMuted,
                                                fontWeight: FontWeight.w500,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              StatusBadge(status: bill.state),
                                              const SizedBox(width: 6),
                                              StatusBadge(status: bill.settleState),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
