import 'package:flutter/foundation.dart';
import 'api_service.dart';
import 'offline_storage.dart';
import 'connectivity_service.dart';

enum SyncState { idle, syncing, success, error, offline }

/// SyncManager coordinates background and manual sync workflows.
///
/// Implements full overwrite bulk synchronization:
/// 1. Verifies connectivity
/// 2. Requests `GET /sync/bulk` with the active user's JWT
/// 3. Overwrites all local Hive entity boxes in a single atomic-like batch
/// 4. Updates SyncMeta (timestamp, userId, role)
class SyncManager extends ChangeNotifier {
  final ApiService _apiService;
  final OfflineStorage _offlineStorage;
  final ConnectivityService _connectivityService;

  SyncState _state = SyncState.idle;
  String? _lastError;
  DateTime? _lastSyncedAt;
  bool _isSessionExpired = false;

  /// Invoked after a sync has been written to disk.
  ///
  /// Wired once at startup to reload the DataProvider. It deliberately does
  /// not live in a widget: the previous code reloaded from a `.then()` on the
  /// login screen, which had already been replaced by the app shell by the
  /// time the sync finished, so the guard skipped the reload and the freshly
  /// synced records never reached the UI.
  VoidCallback? onSyncCompleted;

  SyncManager({
    required ApiService apiService,
    required OfflineStorage offlineStorage,
    required ConnectivityService connectivityService,
  })  : _apiService = apiService,
        _offlineStorage = offlineStorage,
        _connectivityService = connectivityService;

  SyncState get state => _state;
  bool get isSyncing => _state == SyncState.syncing;
  String? get lastError => _lastError;
  DateTime? get lastSyncedAt => _lastSyncedAt;
  bool get isSessionExpired => _isSessionExpired;

  /// Load initial sync status from local storage
  void loadInitialStatus(String userId) {
    final meta = _offlineStorage.getSyncMeta(userId);
    if (meta != null) {
      _lastSyncedAt = meta.syncedAtDate;
      notifyListeners();
    }
  }

  /// Trigger full bulk synchronization
  Future<bool> syncAll({required String userId, required String role}) async {
    if (_state == SyncState.syncing) return false;

    // Check online status
    if (!_connectivityService.isOnline) {
      _state = SyncState.offline;
      _lastError = 'Cannot sync while offline. Using cached data.';
      notifyListeners();
      return false;
    }

    _state = SyncState.syncing;
    _lastError = null;
    _isSessionExpired = false;
    notifyListeners();

    try {
      final response = await _apiService.fetchBulkSync(role: role);

      // Overwrite Hive cache
      await _offlineStorage.saveSync(
        userId,
        response.syncedAt,
        role,
        response.rawData,
      );

      _lastSyncedAt = DateTime.parse(response.syncedAt);
      _state = SyncState.success;
      _lastError = null;
      onSyncCompleted?.call();
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        _isSessionExpired = true;
        _lastError = 'Session expired. Please sign in again to sync.';
      } else {
        _lastError = e.message;
      }
      _state = SyncState.error;
      notifyListeners();
      return false;
    } catch (e) {
      _lastError = e.toString().replaceFirst('Exception: ', '');
      _state = SyncState.error;
      notifyListeners();
      return false;
    }
  }
}
