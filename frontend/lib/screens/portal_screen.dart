import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../widgets/status_badge.dart';
import '../widgets/kpi_card.dart';

class PortalScreen extends StatelessWidget {
  const PortalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final data = context.watch<DataProvider>();
    final user = auth.user;
    final fmt = NumberFormat.currency(symbol: '\$', decimalDigits: 2);

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Portal Header Card
          Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppTheme.brand, Color(0xFF8E5182)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.brand.withValues(alpha: 0.25),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.all(22),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: Colors.white.withValues(alpha: 0.2),
                    child: Text(
                      user?.name.isNotEmpty == true ? user!.name[0].toUpperCase() : 'C',
                      style: const TextStyle(fontSize: 22, color: Colors.white, fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.name.isNotEmpty == true ? user!.name : 'Customer Portal',
                          style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.3),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          user?.email ?? '',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
                  const StatusBadge(status: 'PORTAL'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),

          // Portal KPI Summary
          Row(
            children: [
              Expanded(
                child: KpiCard(
                  title: 'Outstanding Balance',
                  value: fmt.format(data.totalReceivables),
                  subtitle: '${data.overdueInvoicesCount} invoices pending payment',
                  icon: Icons.account_balance_wallet_rounded,
                  accentColor: AppTheme.overdue,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: KpiCard(
                  title: 'Total Invoices',
                  value: '${data.customerInvoices.length}',
                  subtitle: '${data.payments.length} payments recorded',
                  icon: Icons.receipt_long_rounded,
                  accentColor: AppTheme.secondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 26),

          // My Invoices
          const Text(
            'MY INVOICES',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: AppTheme.textMuted,
            ),
          ),
          const SizedBox(height: 10),

          if (data.customerInvoices.isEmpty)
            Container(
              decoration: BoxDecoration(
                color: AppTheme.sheet,
                borderRadius: BorderRadius.circular(AppTheme.radius),
                border: Border.all(color: AppTheme.border, width: 1),
                boxShadow: AppTheme.cardShadow,
              ),
              child: const Padding(
                padding: EdgeInsets.all(28),
                child: Center(
                  child: Text('No invoices found on this account.', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                ),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: data.customerInvoices.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (ctx, i) {
                final inv = data.customerInvoices[i];
                final total = double.tryParse(inv.total) ?? 0;
                final residual = double.tryParse(inv.amountResidual) ?? 0;

                return Container(
                  decoration: BoxDecoration(
                    color: AppTheme.sheet,
                    borderRadius: BorderRadius.circular(AppTheme.radius),
                    border: Border.all(color: AppTheme.border, width: 1),
                    boxShadow: AppTheme.cardShadow,
                  ),
                  child: Material(
                    color: Colors.transparent,
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
                                fmt.format(total),
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
                                  'Date: ${inv.invoiceDate} ${inv.dueDate != null ? '• Due: ${inv.dueDate}' : ''}',
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
                                  if (residual > 0) ...[
                                    Text(
                                      'Due: ${fmt.format(residual)}',
                                      style: const TextStyle(fontSize: 11, color: AppTheme.overdue, fontWeight: FontWeight.w700),
                                    ),
                                    const SizedBox(width: 8),
                                  ],
                                  StatusBadge(status: inv.settleState),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}
