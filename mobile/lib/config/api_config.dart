import 'package:flutter/foundation.dart';
import 'dart:io' show Platform;
import 'package:hive_flutter/hive_flutter.dart';

/// API configuration for the Urban Furniture backend.
class ApiConfig {
  static String? _customBaseUrl;

  static const _settingsBox = 'app_settings';
  static const _baseUrlKey = 'api_base_url';

  /// Restore a previously saved server URL. Called once at startup, after Hive
  /// is initialised — a phone pointing at a LAN backend shouldn't have to be
  /// reconfigured on every launch.
  static void loadSavedBaseUrl() {
    try {
      if (Hive.isBoxOpen(_settingsBox)) {
        final saved = Hive.box<String>(_settingsBox).get(_baseUrlKey);
        if (saved != null && saved.isNotEmpty) _customBaseUrl = saved;
      }
    } catch (_) {}
  }

  /// Override the base URL at runtime (e.g., from settings or network detection).
  static void setCustomBaseUrl(String url, {bool persist = true}) {
    final cleaned = url.endsWith('/') ? url.substring(0, url.length - 1) : url;
    _customBaseUrl = cleaned;
    if (!persist) return;
    try {
      if (Hive.isBoxOpen(_settingsBox)) {
        Hive.box<String>(_settingsBox).put(_baseUrlKey, cleaned);
      }
    } catch (_) {}
  }

  /// Forget a saved URL and fall back to the platform default.
  static void clearCustomBaseUrl() {
    _customBaseUrl = null;
    try {
      if (Hive.isBoxOpen(_settingsBox)) Hive.box<String>(_settingsBox).delete(_baseUrlKey);
    } catch (_) {}
  }

  /// True when the app is pointed somewhere other than the platform default —
  /// worth surfacing, because a saved URL outlives the network it was for.
  static bool get hasCustomBaseUrl => _customBaseUrl != null && _customBaseUrl!.isNotEmpty;

  /// Base URL of the Express API.
  /// Automatically resolves based on platform:
  /// - Android Emulator: 10.0.2.2:4000
  /// - Web / Windows / macOS / Linux / iOS Simulator: localhost:4000
  static String get baseUrl {
    if (_customBaseUrl != null && _customBaseUrl!.isNotEmpty) {
      return _customBaseUrl!;
    }
    const envUrl = String.fromEnvironment('API_URL', defaultValue: '');
    if (envUrl.isNotEmpty) return envUrl;

    if (kIsWeb) return 'http://127.0.0.1:4000';
    try {
      if (Platform.isAndroid) return 'http://10.0.2.2:4000';
    } catch (_) {}
    return 'http://127.0.0.1:4000';
  }

  /// Endpoints
  static const String login = '/auth/login';
  static const String loginVerify = '/auth/login/verify';
  static const String signup = '/auth/signup';
  static const String logout = '/auth/logout';
  static const String me = '/auth/me';
  static const String demoAccounts = '/auth/demo-accounts';
  static const String syncBulk = '/sync/bulk';
  /// Portal users are scoped to their own documents by this endpoint.
  static const String portalDocuments = '/portal/documents';
  static const String health = '/health';

  /// Timeouts
  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 30);

  /// Health ping interval for connectivity verification
  static const Duration healthPingInterval = Duration(seconds: 30);
}
