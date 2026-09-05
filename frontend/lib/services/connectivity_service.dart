import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import '../config/api_config.dart';

/// Service responsible for real-time online/offline network detection.
///
/// Actively verifies connectivity against the backend `/health` endpoint
/// rather than relying solely on OS network interface flags (which often report `none`
/// for localhost/loopback on Windows and Web).
class ConnectivityService {
  final Connectivity _connectivity = Connectivity();
  final Dio _pingDio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 3),
      receiveTimeout: const Duration(seconds: 3),
    ),
  );

  bool _isOnline = false;
  Timer? _pingTimer;
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  final _statusController = StreamController<bool>.broadcast();

  Stream<bool> get onStatusChange => _statusController.stream;
  bool get isOnline => _isOnline;
  bool get hasNetworkInterface => _isOnline;
  bool get isBackendReachable => _isOnline;

  /// Non-blocking initialization
  void init() {
    // Ping immediately on start
    pingBackend();

    // Listen to network changes
    try {
      _subscription = _connectivity.onConnectivityChanged.listen((_) {
        pingBackend();
      });
    } catch (_) {}

    // Start periodic health pings
    _startPingTimer();
  }

  void _startPingTimer() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(ApiConfig.healthPingInterval, (_) {
      pingBackend();
    });
  }

  /// Ping the backend /health endpoint to verify real connectivity
  Future<bool> pingBackend() async {
    try {
      final url = '${ApiConfig.baseUrl}${ApiConfig.health}';
      final response = await _pingDio.get(url);
      final ok = response.statusCode == 200 || response.statusCode == 503;
      _updateStatus(ok);
      return ok;
    } catch (_) {
      // If localhost failed, try 127.0.0.1 fallback
      if (ApiConfig.baseUrl.contains('localhost')) {
        try {
          final fallbackUrl = '${ApiConfig.baseUrl.replaceAll('localhost', '127.0.0.1')}${ApiConfig.health}';
          final response = await _pingDio.get(fallbackUrl);
          final ok = response.statusCode == 200 || response.statusCode == 503;
          if (ok) {
            ApiConfig.setCustomBaseUrl(ApiConfig.baseUrl.replaceAll('localhost', '127.0.0.1'));
          }
          _updateStatus(ok);
          return ok;
        } catch (_) {}
      }

      _updateStatus(false);
      return false;
    }
  }

  void _updateStatus(bool online) {
    final wasOnline = _isOnline;
    _isOnline = online;

    if (wasOnline != _isOnline) {
      _statusController.add(_isOnline);
    }
  }

  void dispose() {
    _pingTimer?.cancel();
    _subscription?.cancel();
    _statusController.close();
  }
}
