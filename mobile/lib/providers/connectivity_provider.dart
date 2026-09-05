import 'dart:async';
import 'package:flutter/foundation.dart';
import '../services/connectivity_service.dart';

class ConnectivityProvider extends ChangeNotifier {
  final ConnectivityService _connectivityService;
  late StreamSubscription<bool> _subscription;

  bool _isOnline = true;
  bool _isChecking = false;

  ConnectivityProvider(this._connectivityService) {
    _isOnline = _connectivityService.isOnline;
    _subscription = _connectivityService.onStatusChange.listen((online) {
      _isOnline = online;
      notifyListeners();
    });
  }

  bool get isOnline => _isOnline;
  bool get isChecking => _isChecking;
  bool get isBackendReachable => _connectivityService.isBackendReachable;

  Future<void> checkNow() async {
    _isChecking = true;
    notifyListeners();
    _isOnline = await _connectivityService.pingBackend();
    _isChecking = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
