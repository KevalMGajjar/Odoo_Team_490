import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../widgets/pull_to_refresh.dart';
import '../config/formatting.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../widgets/kpi_card.dart';
import '../widgets/status_badge.dart';

class DashboardScreen extends StatelessWidget {
  final Function(int)? onNavigateTab;

  const DashboardScreen({super.key, this.onNavigateTab});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final data = context.watch<DataProvider>();
    final user = auth.user;

    final currencyFmt = Fmt.currency;

    return PullToRefresh(
      child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Section
          Text(
            'Welcome back, ${user?.name.isNotEmpty == true ? user!.name : user?.email ?? 'User'}',
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppTheme.text,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              StatusBadge(status: user?.role ?? 'User'),
              Text(
                'Local cache: ${data.customerInvoices.length} invoices • ${data.contacts.length} contacts • ${data.products.length} products',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),

          // KPI Cards Grid
          LayoutBuilder(
            builder: (context, constraints) {
              final isWide = constraints.maxWidth > 700;
              final crossAxisCount = isWide ? 4 : 2;

              // A fixed height, not an aspect ratio. The card's content —
              // label, figure, subtitle — is the same height whatever the
              // screen width, but a ratio ties height to width: tuned to fit
              // on a 412px phone it overflowed by 11 pixels on a 360px one.
              return GridView(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: crossAxisCount,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  mainAxisExtent: isWide ? 104 : 112,
                ),
                children: [
                  KpiCard(
                    title: 'Receivables',
                    value: currencyFmt.format(data.totalReceivables),
                    subtitle: '${data.overdueInvoicesCount} overdue',
                    icon: Icons.trending_up_rounded,
                    accentColor: AppTheme.secondary,
                    onTap: () => onNavigateTab?.call(1),
                  ),
                  KpiCard(
                    title: 'Payables',
                    value: currencyFmt.format(data.totalPayables),
                    subtitle: '${data.vendorBills.length} vendor bills',
                    icon: Icons.trending_down_rounded,
                    accentColor: AppTheme.credit,
                    onTap: () => onNavigateTab?.call(1),
                  ),
                  KpiCard(
                    title: 'Invoiced',
                    value: currencyFmt.format(data.totalSalesInvoiced),
                    subtitle: '${data.customerInvoices.length} total invoices',
                    icon: Icons.receipt_long_rounded,
                    accentColor: AppTheme.brand,
                    onTap: () => onNavigateTab?.call(1),
                  ),
                  KpiCard(
                    title: 'Catalog',
                    value: '${data.totalActiveProducts}',
                    subtitle: '${data.totalActiveContacts} active contacts',
                    icon: Icons.inventory_2_rounded,
                    accentColor: AppTheme.debit,
                    onTap: () => onNavigateTab?.call(3),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 22),

          // Quick Access Actions
          const Text(
            'QUICK ACCESS',
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: AppTheme.textMuted,
            ),
          ),
          const SizedBox(height: 8),

          LayoutBuilder(
            builder: (context, constraints) {
              final isNarrow = constraints.maxWidth < 460;

              return Row(
                children: [
                  Expanded(
                    child: _QuickButton(
                      icon: Icons.receipt_long_rounded,
                      label: isNarrow ? 'Invoices' : 'Customer Invoices',
                      count: '${data.customerInvoices.length}',
                      accentColor: AppTheme.brand,
                      isNarrow: isNarrow,
                      onTap: () => onNavigateTab?.call(1),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _QuickButton(
                      icon: Icons.people_alt_rounded,
                      label: 'Contacts',
                      count: '${data.contacts.length}',
                      accentColor: AppTheme.secondary,
                      isNarrow: isNarrow,
                      onTap: () => onNavigateTab?.call(2),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _QuickButton(
                      icon: Icons.menu_book_rounded,
                      label: 'Ledger',
                      count: '${data.journalEntries.length}',
                      accentColor: AppTheme.debit,
                      isNarrow: isNarrow,
                      onTap: () => onNavigateTab?.call(4),
                    ),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 22),

          // Recent Invoices Table Card
          Container(
            decoration: BoxDecoration(
              color: AppTheme.sheet,
              borderRadius: BorderRadius.circular(AppTheme.radius),
              border: Border.all(color: AppTheme.border, width: 1),
              boxShadow: AppTheme.cardShadow,
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.history_rounded, size: 18, color: AppTheme.brand),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Recent Invoices',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.text,
                            letterSpacing: -0.2,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      TextButton(
                        onPressed: () => onNavigateTab?.call(1),
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          minimumSize: const Size(40, 28),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('View All', style: TextStyle(fontSize: 12.5)),
                            SizedBox(width: 2),
                            Icon(Icons.chevron_right_rounded, size: 16),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 16),
                  if (data.customerInvoices.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Center(
                        child: Text(
                          'No cached invoices found. Press Sync Now to load records.',
                          style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
                        ),
                      ),
                    )
                  else
                    ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: data.customerInvoices.take(5).length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final inv = data.customerInvoices[index];
                        final amount = double.tryParse(inv.total) ?? 0;
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
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
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13.5,
                                        color: AppTheme.text,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    currencyFmt.format(amount),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 14,
                                      color: AppTheme.brand,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 5),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                crossAxisAlignment: CrossAxisAlignment.center,
                                children: [
                                  Expanded(
                                    child: Text(
                                      '${inv.customerName ?? 'Customer'} • ${Fmt.dayShort(inv.invoiceDate)}',
                                      style: const TextStyle(
                                        fontSize: 11.5,
                                        color: AppTheme.textMuted,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      StatusBadge(status: inv.state),
                                      const SizedBox(width: 4),
                                      StatusBadge(status: inv.settleState),
                                    ],
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
      ),
    );
  }
}

class _QuickButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final String count;
  final Color accentColor;
  final bool isNarrow;
  final VoidCallback onTap;

  const _QuickButton({
    required this.icon,
    required this.label,
    required this.count,
    required this.accentColor,
    this.isNarrow = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
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
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppTheme.radius),
          hoverColor: AppTheme.hover,
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: isNarrow ? 8 : 12,
              vertical: isNarrow ? 10 : 12,
            ),
            child: isNarrow
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(icon, size: 18, color: accentColor),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: AppTheme.subtle,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: AppTheme.border),
                            ),
                            child: Text(
                              count,
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: AppTheme.textMuted,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.text,
                        ),
                      ),
                    ],
                  )
                : Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(7),
                        decoration: BoxDecoration(
                          color: accentColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(icon, size: 16, color: accentColor),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          label,
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.text,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppTheme.subtle,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: AppTheme.border),
                        ),
                        child: Text(
                          count,
                          style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.textMuted,
                          ),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
