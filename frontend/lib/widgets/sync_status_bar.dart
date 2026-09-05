import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../config/theme.dart';
import '../providers/connectivity_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../services/sync_manager.dart';

class SyncStatusBar extends StatefulWidget {
  const SyncStatusBar({super.key});

  @override
  State<SyncStatusBar> createState() => _SyncStatusBarState();
}

class _SyncStatusBarState extends State<SyncStatusBar>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _triggerSync(BuildContext context) async {
    final syncManager = context.read<SyncManager>();
    final auth = context.read<AuthProvider>();
    final data = context.read<DataProvider>();

    if (auth.user == null || syncManager.isSyncing) return;

    _animController.repeat();
    final success = await syncManager.syncAll(
      userId: auth.user!.id,
      role: auth.user!.role,
    );
    _animController.stop();
    _animController.reset();

    if (success) {
      data.loadFromStorage();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Row(
              children: [
                Icon(Icons.check_circle, size: 16, color: Colors.white),
                SizedBox(width: 8),
                Text('Local cache updated with latest records'),
              ],
            ),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            duration: const Duration(seconds: 2),
            backgroundColor: const Color(0xFF047857),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final connectivity = context.watch<ConnectivityProvider>();
    final syncManager = context.watch<SyncManager>();
    final auth = context.watch<AuthProvider>();

    final isOnline = connectivity.isOnline;
    final isSyncing = syncManager.isSyncing;
    final lastSynced = syncManager.lastSyncedAt;
    final isExpired = syncManager.isSessionExpired;

    if (isSyncing && !_animController.isAnimating) {
      _animController.repeat();
    } else if (!isSyncing && _animController.isAnimating) {
      _animController.stop();
      _animController.reset();
    }

    String syncText;
    if (isSyncing) {
      syncText = 'Syncing data...';
    } else if (lastSynced != null) {
      syncText = 'Updated ${timeago.format(lastSynced)}';
    } else {
      syncText = 'Offline cache ready';
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Top status bar banner
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 7),
          decoration: BoxDecoration(
            color: isOnline ? AppTheme.sheet : const Color(0xFFFFFBEB),
            border: const Border(bottom: BorderSide(color: AppTheme.border, width: 1)),
          ),
          child: Row(
            children: [
              // Online / Offline indicator badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: isOnline
                      ? const Color(0xFFD1FAE5)
                      : const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: isOnline
                        ? const Color(0xFF047857).withValues(alpha: 0.2)
                        : const Color(0xFFB45309).withValues(alpha: 0.2),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6.5,
                      height: 6.5,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isOnline
                            ? const Color(0xFF10B981)
                            : const Color(0xFFF59E0B),
                        boxShadow: [
                          BoxShadow(
                            color: isOnline
                                ? const Color(0x6610B981)
                                : const Color(0x66F59E0B),
                            blurRadius: 4,
                            spreadRadius: 1,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      isOnline ? 'Online' : 'Offline Mode',
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                        color: isOnline
                            ? const Color(0xFF047857)
                            : const Color(0xFFB45309),
                        letterSpacing: 0.3,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),

              // Relative timestamp / offline cached hint
              Expanded(
                child: Text(
                  isOnline
                      ? syncText
                      : 'Browsing cached records • $syncText',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.textMuted,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),

              // Sync Action Button
              InkWell(
                onTap: isOnline && !isSyncing ? () => _triggerSync(context) : null,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: isOnline
                        ? AppTheme.brandLight
                        : AppTheme.subtle,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: isOnline
                          ? AppTheme.brand.withValues(alpha: 0.25)
                          : AppTheme.border,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      RotationTransition(
                        turns: _animController,
                        child: Icon(
                          Icons.sync,
                          size: 13,
                          color: isOnline
                              ? AppTheme.brand
                              : AppTheme.textFaint,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        isSyncing
                            ? 'Syncing...'
                            : (isOnline ? 'Sync Now' : 'Offline'),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: isOnline
                              ? AppTheme.brand
                              : AppTheme.textFaint,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),

        // Session expired warning banner
        if (isExpired)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
            color: const Color(0xFFFEF2F2),
            child: Row(
              children: [
                const Icon(Icons.warning_amber_rounded,
                    size: 16, color: Color(0xFFDC2626)),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Session expired. Sign in when online to refresh your data.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF991B1B),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => auth.logout(),
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(50, 24),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text(
                    'Sign In',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFFDC2626),
                      decoration: TextDecoration.underline,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
