import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../widgets/pull_to_refresh.dart';
import '../providers/data_provider.dart';
import '../widgets/status_badge.dart';

class ContactsScreen extends StatefulWidget {
  const ContactsScreen({super.key});

  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> {
  String _search = '';
  String _typeFilter = 'all';

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();

    final contacts = data.contacts.where((c) {
      final matchSearch = _search.isEmpty ||
          c.name.toLowerCase().contains(_search.toLowerCase()) ||
          (c.email?.toLowerCase().contains(_search.toLowerCase()) ?? false) ||
          (c.city?.toLowerCase().contains(_search.toLowerCase()) ?? false);

      final matchType = _typeFilter == 'all' || c.type == _typeFilter;
      return matchSearch && matchType;
    }).toList();

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: Column(
        children: [
          // Filter / Search Toolbar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            color: AppTheme.sheet,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      hintText: 'Search contacts by name, email, city...',
                      prefixIcon: Icon(Icons.search_rounded, size: 18),
                      isDense: true,
                    ),
                    onChanged: (val) => setState(() => _search = val),
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
                      value: _typeFilter,
                      icon: const Icon(Icons.arrow_drop_down, color: AppTheme.textMuted),
                      items: const [
                        DropdownMenuItem(value: 'all', child: Text('All Types', style: TextStyle(fontSize: 13))),
                        DropdownMenuItem(value: 'customer', child: Text('Customers', style: TextStyle(fontSize: 13))),
                        DropdownMenuItem(value: 'vendor', child: Text('Vendors', style: TextStyle(fontSize: 13))),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _typeFilter = val);
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Contacts List
          Expanded(
            child: contacts.isEmpty
                ? const Center(
                    child: Text('No contacts found', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                  )
                : PullToRefresh(
                    child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 96),
                    itemCount: contacts.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (ctx, i) {
                      final c = contacts[i];
                      final isCustomer = c.type == 'customer';

                      return Container(
                        decoration: BoxDecoration(
                          color: AppTheme.sheet,
                          borderRadius: BorderRadius.circular(AppTheme.radius),
                          border: Border.all(color: AppTheme.border, width: 1),
                          boxShadow: AppTheme.cardShadow,
                        ),
                        child: Material(
                          color: Colors.transparent,
                          child: ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radius)),
                            leading: CircleAvatar(
                              radius: 20,
                              backgroundColor: isCustomer
                                  ? const Color(0xFFEEF2FF)
                                  : const Color(0xFFFDF4FF),
                              child: Text(
                                c.name.isNotEmpty ? c.name[0].toUpperCase() : '?',
                                style: TextStyle(
                                  color: isCustomer
                                      ? const Color(0xFF4F46E5)
                                      : const Color(0xFFC026D3),
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                ),
                              ),
                            ),
                            title: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    c.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                      color: AppTheme.text,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                StatusBadge(status: c.type),
                              ],
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                '${c.email ?? 'No email'} • ${c.mobile ?? 'No phone'}${c.city != null ? ' • ${c.city}' : ''}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.textMuted,
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  )),
          ),
        ],
      ),
    );
  }
}
