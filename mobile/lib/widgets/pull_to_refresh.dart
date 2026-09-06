import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/api_config.dart';
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

    // A pull always ends in a message. Returning quietly on failure looked
    // exactly like the gesture not being wired up at all — which is what it
    // was reported as — and a throw from syncAll left the spinner to be
    // dismissed by the framework with nothing said either way.
    bool ok = false;
    try {
      ok = await sync.syncAll(userId: auth.user!.id, role: auth.user!.role);
      if (ok) data.loadFromStorage();
    } catch (_) {
      ok = false;
    }

    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(ok
              ? 'Updated from ${ApiConfig.baseUrl}'
              // Offline is a normal state for this app, not an error — but the
              // address is named, because a wrong one looks identical to a
              // server that is down.
              : 'Could not reach ${ApiConfig.baseUrl} — showing cached data'),
          duration: const Duration(seconds: 3),
        ),
      );
  }
}
