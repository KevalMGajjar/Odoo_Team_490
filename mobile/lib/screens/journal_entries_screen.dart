import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../config/formatting.dart';

import '../models/models.dart';
import '../providers/data_provider.dart';
import '../widgets/status_badge.dart';

/// "Miscellaneous Journal" -> "Miscellaneous". Every journal in the chart ends
/// in the same word, so it is pure width.
String _shortJournal(String? name) {
  final value = (name ?? 'General').trim();
  const suffix = ' Journal';
  return value.endsWith(suffix) ? value.substring(0, value.length - suffix.length) : value;
}

class JournalEntriesScreen extends StatelessWidget {
  const JournalEntriesScreen({super.key});

  void _showEntryDetails(BuildContext context, JournalEntry entry) {
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
                      entry.number,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.brand,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Journal: ${entry.journalName ?? 'General Journal'}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textMuted),
                    ),
                  ],
                ),
                StatusBadge(status: entry.state),
              ],
            ),
            const SizedBox(height: 10),
            Text('Date: ${Fmt.day(entry.date)} ${entry.reference != null ? '• Ref: ${entry.reference}' : ''}',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppTheme.textMuted)),
            const Divider(height: 28),

            const Text(
              'JOURNAL ITEMS (DOUBLE-ENTRY BALANCED LEDGER)',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                color: AppTheme.textMuted,
              ),
            ),
            const SizedBox(height: 10),

            // Header for table
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
              decoration: BoxDecoration(
                color: AppTheme.subtle,
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              ),
              child: const Row(
                children: [
                  Expanded(flex: 3, child: Text('Account / Partner', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppTheme.textMuted))),
                  Expanded(flex: 2, child: Text('Debit', textAlign: TextAlign.right, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppTheme.debit))),
                  Expanded(flex: 2, child: Text('Credit', textAlign: TextAlign.right, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppTheme.credit))),
                ],
              ),
            ),

            Expanded(
              child: ListView.separated(
                itemCount: entry.items.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (ctx, i) {
                  final item = entry.items[i];
                  final debit = double.tryParse(item.debit) ?? 0;
                  final credit = double.tryParse(item.credit) ?? 0;

                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                    child: Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${item.accountCode ?? ''} ${item.accountName ?? 'Account'}',
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppTheme.text),
                              ),
                              if (item.partnerName != null || item.label != null)
                                Text(
                                  item.partnerName ?? item.label ?? '',
                                  style: const TextStyle(fontSize: 11.5, color: AppTheme.textMuted),
                                ),
                            ],
                          ),
                        ),
                        Expanded(
                          flex: 2,
                          child: Text(
                            debit > 0 ? fmt.format(debit) : '—',
                            textAlign: TextAlign.right,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.debit),
                          ),
                        ),
                        Expanded(
                          flex: 2,
                          child: Text(
                            credit > 0 ? fmt.format(credit) : '—',
                            textAlign: TextAlign.right,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.credit),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            const Divider(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Row(
                  children: [
                    Icon(Icons.check_circle, size: 16, color: AppTheme.successText),
                    SizedBox(width: 6),
                    Text('Total Balanced Ledger:', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                  ],
                ),
                Row(
                  children: [
                    Text('D: ${fmt.format(double.tryParse(entry.totalDebit) ?? 0)}',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppTheme.debit)),
                    const SizedBox(width: 14),
                    Text('C: ${fmt.format(double.tryParse(entry.totalCredit) ?? 0)}',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppTheme.credit)),
                  ],
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
    final fmt = Fmt.currency;

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: data.journalEntries.isEmpty
          ? const Center(
              child: Text('No journal entries cached', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 96),
              itemCount: data.journalEntries.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (ctx, i) {
                final entry = data.journalEntries[i];
                final totalDebit = double.tryParse(entry.totalDebit) ?? 0;

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
                      onTap: () => _showEntryDetails(context, entry),
                      borderRadius: BorderRadius.circular(AppTheme.radius),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEEF2FF),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Icon(Icons.account_balance_rounded, color: Color(0xFF4F46E5), size: 20),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    crossAxisAlignment: CrossAxisAlignment.center,
                                    children: [
                                      Expanded(
                                        child: Text(
                                          entry.number,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                            fontSize: 14.5,
                                            color: AppTheme.text,
                                            letterSpacing: -0.2,
                                          ),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Text(
                                        fmt.format(totalDebit),
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 14.5,
                                          color: AppTheme.text,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Row(
                                    crossAxisAlignment: CrossAxisAlignment.center,
                                    children: [
                                      Expanded(
                                        child: Text(
                                          // The amount moved up beside the
                                          // number so this line has the width
                                          // for a date. It was competing with
                                          // the total and losing — rows read
                                          // "Bank Journal • 2026-05-1…", which
                                          // truncates the one field you scan for.
                                          // "Journal" is the suffix of every
                                          // journal name, so it distinguishes
                                          // nothing and costs the eight
                                          // characters that were pushing the
                                          // date off the end of the line.
                                          '${_shortJournal(entry.journalName)} • ${Fmt.day(entry.date)} • ${entry.items.length} lines',
                                          style: const TextStyle(fontSize: 12, color: AppTheme.textMuted, fontWeight: FontWeight.w500),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      StatusBadge(status: entry.state),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
