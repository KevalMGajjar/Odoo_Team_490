import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../services/sync_manager.dart';

/// Pull down on any list to re-sync.
///
/// Wraps the same path the "Sync Now" button uses rather than a second one, so
/// there is one definition of what a refresh is. Swallows the case where a sync
/// is already running: the button and a pull can both be triggered within a
/// second of each other, and starting two would have them race to write the
/// same Hive boxes.
///
/// The child must be a scrollable that reaches the top, and should carry
/// `AlwaysScrollableScrollPhysics` so the gesture works on a short list too —
/// without it, a list that does not fill the screen cannot be pulled at all.
class PullToRefresh extends StatelessWidget {
  final Widget child;

  const PullToRefresh({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppTheme.brand,
      backgroundColor: AppTheme.sheet,
      displacement: 28,
      onRefresh: () => _refresh(context),
      child: child,
    );
  }

  static Future<void> _refresh(BuildContext context) async {
    final sync = context.read<SyncManager>();
    final auth = context.read<AuthProvider>();
    final data = context.read<DataProvider>();

    if (auth.user == null || sync.isSyncing) return;

    final ok = await sync.syncAll(userId: auth.user!.id, role: auth.user!.role);
    if (ok) data.loadFromStorage();

    // Offline is the expected case for this app rather than an error, so it
    // says so plainly instead of showing a failure.
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not reach the server — showing cached data'),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }
}
