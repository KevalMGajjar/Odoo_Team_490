import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../providers/data_provider.dart';
import '../widgets/status_badge.dart';

class ProductsScreen extends StatefulWidget {
  const ProductsScreen({super.key});

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();
    final fmt = NumberFormat.currency(symbol: '\$', decimalDigits: 2);

    final products = data.products.where((p) {
      return _search.isEmpty ||
          p.name.toLowerCase().contains(_search.toLowerCase()) ||
          (p.category?.toLowerCase().contains(_search.toLowerCase()) ?? false);
    }).toList();

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: Column(
        children: [
          // Filter / Search Toolbar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            color: AppTheme.sheet,
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search products by name or category...',
                prefixIcon: Icon(Icons.search_rounded, size: 18),
                isDense: true,
              ),
              onChanged: (val) => setState(() => _search = val),
            ),
          ),
          const Divider(height: 1),

          // Products List
          Expanded(
            child: products.isEmpty
                ? const Center(
                    child: Text('No products found', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                    itemCount: products.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (ctx, i) {
                      final p = products[i];
                      final price = double.tryParse(p.salesPrice) ?? 0;
                      final cost = double.tryParse(p.cost) ?? 0;

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
                            leading: Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: AppTheme.brandLight,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Icon(Icons.chair_rounded, color: AppTheme.brand, size: 24),
                            ),
                            title: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    p.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                      color: AppTheme.text,
                                    ),
                                  ),
                                ),
                                StatusBadge(status: p.status),
                              ],
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                'Category: ${p.category ?? 'General'} • Cost: ${fmt.format(cost)}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.textMuted,
                                ),
                              ),
                            ),
                            trailing: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  fmt.format(price),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                    color: AppTheme.brand,
                                  ),
                                ),
                                const Text(
                                  'Sales Price',
                                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: AppTheme.textMuted),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
