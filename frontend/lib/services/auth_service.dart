import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/models.dart';
import 'api_service.dart';
import 'offline_storage.dart';

/// Authentication service managing session state, user caching in Hive,
/// and coordination with offline storage on login/logout.
class AuthService {
  static const _tokenKey = 'uf_jwt_token';
  static const _userKey = 'uf_active_user';
  static const _authBoxName = 'auth_session';

  final ApiService _apiService;
  final OfflineStorage _offlineStorage;

  AppUser? _currentUser;
  String? _token;

  AuthService({
    required ApiService apiService,
    required OfflineStorage offlineStorage,
  })  : _apiService = apiService,
        _offlineStorage = offlineStorage;

  AppUser? get currentUser => _currentUser;
  String? get token => _token;
  bool get isAuthenticated => _currentUser != null;

  /// Initialize session from local Hive cache instantly
  Future<void> init() async {
    try {
      if (!Hive.isBoxOpen(_authBoxName)) {
        await Hive.openBox<String>(_authBoxName);
      }
      final authBox = Hive.box<String>(_authBoxName);

      _token = authBox.get(_tokenKey);

      final cachedUserJson = authBox.get(_userKey);
      if (cachedUserJson != null) {
        try {
          final map = jsonDecode(cachedUserJson) as Map<String, dynamic>;
          _currentUser = AppUser.fromJson(map);
        } catch (_) {}
      }

      if (_token != null) {
        _apiService.setToken(_token);
      }
    } catch (_) {}
  }

  /// Perform login and persist credentials & user info
  Future<AppUser> login(String email, String password) async {
    final result = await _apiService.login(email: email, password: password);
    final user = result['user'] as AppUser;
    final token = result['token'] as String?;

    _currentUser = user;
    _token = token;

    if (!Hive.isBoxOpen(_authBoxName)) {
      await Hive.openBox<String>(_authBoxName);
    }
    final authBox = Hive.box<String>(_authBoxName);
    await authBox.put(_userKey, jsonEncode(user.toJson()));

    if (token != null) {
      _apiService.setToken(token);
      await authBox.put(_tokenKey, token);
    }

    return user;
  }

  /// Verify session with server if online, or return cached user
  Future<AppUser?> refreshSession() async {
    if (_token == null) return null;

    try {
      final user = await _apiService.getMe();
      _currentUser = user;
      if (Hive.isBoxOpen(_authBoxName)) {
        final authBox = Hive.box<String>(_authBoxName);
        await authBox.put(_userKey, jsonEncode(user.toJson()));
      }
      return user;
    } catch (e) {
      // Retain cached user if request fails
      return _currentUser;
    }
  }

  /// Sign out: clear token, cached session, and wipe cached ERP data
  Future<void> logout() async {
    final userId = _currentUser?.id;
    try {
      await _apiService.logout();
    } catch (_) {}

    _currentUser = null;
    _token = null;
    _apiService.setToken(null);

    if (Hive.isBoxOpen(_authBoxName)) {
      final authBox = Hive.box<String>(_authBoxName);
      await authBox.clear();
    }

    if (userId != null) {
      await _offlineStorage.clearForUser(userId);
    } else {
      await _offlineStorage.clearAll();
    }
  }
}
