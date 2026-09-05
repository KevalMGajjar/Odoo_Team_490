import 'package:flutter/foundation.dart';
import 'dart:io' show Platform;

/// API configuration for the Urban Furniture backend.
class ApiConfig {
  static String? _customBaseUrl;

  /// Override the base URL at runtime (e.g., from settings or network detection).
  static void setCustomBaseUrl(String url) {
    _customBaseUrl = url.endsWith('/') ? url.substring(0, url.length - 1) : url;
  }

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
  static const String signup = '/auth/signup';
  static const String logout = '/auth/logout';
  static const String me = '/auth/me';
  static const String demoAccounts = '/auth/demo-accounts';
  static const String syncBulk = '/sync/bulk';
  static const String health = '/health';

  /// Timeouts
  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 30);

  /// Health ping interval for connectivity verification
  static const Duration healthPingInterval = Duration(seconds: 30);
}
