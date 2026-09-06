import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../widgets/app_logo.dart';
import '../providers/auth_provider.dart';
import '../providers/connectivity_provider.dart';
import '../providers/data_provider.dart';
import '../services/sync_manager.dart';
import '../widgets/sync_status_bar.dart';
import 'dashboard_screen.dart';
import 'invoices_screen.dart';
import 'contacts_screen.dart';
import 'products_screen.dart';
import 'journal_entries_screen.dart';
import 'portal_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _selectedTab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _runInitialSync();
    });
  }

  void _runInitialSync() async {
    if (!mounted) return;

    final auth = context.read<AuthProvider>();
    final syncManager = context.read<SyncManager>();
    final data = context.read<DataProvider>();
    final conn = context.read<ConnectivityProvider>();

    final user = auth.user;
    if (user == null) return;

    // 1. Immediately read all cached records from Hive
    syncManager.loadInitialStatus(user.id);
    data.loadFromStorage();

    // 2. Perform background sync if online
    if (conn.isOnline && !syncManager.isSyncing) {
      final success = await syncManager.syncAll(userId: user.id, role: user.role);
      if (success && mounted) {
        data.loadFromStorage();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final isPortal = user?.isPortal ?? false;

    // Build tabs based on role
    final List<Widget> pages = isPortal
        ? [const PortalScreen()]
        : [
            DashboardScreen(onNavigateTab: (index) => setState(() => _selectedTab = index)),
            const InvoicesScreen(),
            const ContactsScreen(),
            const ProductsScreen(),
            const JournalEntriesScreen(),
          ];

    final List<NavigationDestination> destinations = isPortal
        ? [
            const NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: 'My Portal',
            ),
          ]
        : [
            const NavigationDestination(
              icon: Icon(Icons.dashboard_outlined),
              selectedIcon: Icon(Icons.dashboard_rounded),
              label: 'Dashboard',
            ),
            const NavigationDestination(
              icon: Icon(Icons.receipt_long_outlined),
              selectedIcon: Icon(Icons.receipt_long_rounded),
              label: 'Invoices',
            ),
            const NavigationDestination(
              icon: Icon(Icons.people_outline),
              selectedIcon: Icon(Icons.people_alt_rounded),
              label: 'Contacts',
            ),
            const NavigationDestination(
              icon: Icon(Icons.inventory_2_outlined),
              selectedIcon: Icon(Icons.inventory_2_rounded),
              label: 'Products',
            ),
            const NavigationDestination(
              icon: Icon(Icons.menu_book_outlined),
              selectedIcon: Icon(Icons.menu_book_rounded),
              label: 'Ledger',
            ),
          ];

    return Scaffold(
      appBar: AppBar(
        // A two-line title beside a logo tile is a tight fit in Material's
        // default 56, leaving the subtitle sitting on the bar's edge.
        toolbarHeight: 64,
        title: Row(
          children: [
            const AppLogo(size: 32),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Urban Furniture',
                  style: TextStyle(
                    fontSize: 16.5,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.brand,
                    letterSpacing: -0.3,
                  ),
                ),
                Text(
                  isPortal ? 'Customer Portal' : 'Offline-First ERP',
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textMuted,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          // User Profile / Role menu
          PopupMenuButton<String>(
            tooltip: 'User profile',
            icon: CircleAvatar(
              radius: 16,
              backgroundColor: AppTheme.brandLight,
              child: Text(
                user?.name.isNotEmpty == true ? user!.name[0].toUpperCase() : 'U',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.brand,
                ),
              ),
            ),
            onSelected: (val) {
              if (val == 'logout') {
                auth.logout();
              }
            },
            itemBuilder: (ctx) => [
              PopupMenuItem(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?.name ?? 'User',
                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.text),
                    ),
                    Text(
                      '${user?.email} (${user?.role})',
                      style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                    ),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(Icons.logout_rounded, size: 16, color: AppTheme.overdue),
                    SizedBox(width: 8),
                    Text('Sign Out', style: TextStyle(color: AppTheme.overdue, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
        ],
      ),
      body: Column(
        children: [
          // Pinned sync status bar
          const SyncStatusBar(),

          // Active view
          Expanded(
            child: IndexedStack(
              index: _selectedTab >= pages.length ? 0 : _selectedTab,
              children: pages,
            ),
          ),
        ],
      ),
      bottomNavigationBar: isPortal
          ? null
          : NavigationBar(
              selectedIndex: _selectedTab >= destinations.length ? 0 : _selectedTab,
              onDestinationSelected: (idx) => setState(() => _selectedTab = idx),
              destinations: destinations,
              height: 64,
            ),
    );
  }
}
