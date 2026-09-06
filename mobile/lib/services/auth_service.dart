import 'dart:async';
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
  final OfflineStorage? _offlineStorage;

  AppUser? _currentUser;
  String? _token;

  AuthService({
    required ApiService apiService,
    OfflineStorage? offlineStorage,
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

  /// Step one of sign-in (by Login ID).
  ///
  /// Returns either a signed-in result or a pending challenge — see
  /// [LoginResult]. Only a signed-in result touches the session, so a pending
  /// challenge leaves any previous session and cached data exactly as they
  /// were: a half-finished sign-in must not sign the current user out.
  Future<LoginResult> login(String loginId, String password) async {
    final result = await _apiService.login(loginId: loginId, password: password);
    if (!result.needsCode) await _establishSession(result);
    return result;
  }

  /// Step two: redeem the emailed code.
  Future<LoginResult> verifyLogin(String challengeId, String otp) async {
    final result = await _apiService.verifyLogin(challengeId: challengeId, otp: otp);
    await _establishSession(result);
    return result;
  }

  Future<void> _establishSession(LoginResult result) async {
    final user = result.user!;
    final token = result.token;

    // The offline cache is device-wide, not per-user. Keeping it across a
    // change of user would show one person's company data to the next one who
    // signs in on the same device, so drop it whenever the user changes.
    final previous = _offlineStorage?.getSyncMeta()?.userId;
    if (previous != null && previous != user.id) {
      await _offlineStorage?.clearAll();
    }

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

  /// Sign out: clear token & cached auth session, while PRESERVING offline ERP cache.
  Future<void> logout() async {
    // Local state first, and never wait on the network.
    //
    // This used to await the server call. Offline — which for this app is a
    // normal state, not an error — that is a ten-second connect timeout during
    // which the button does nothing, so the session looks impossible to end.
    // An offline-first app has to be able to sign out with no network at all;
    // the server is told as a courtesy, not as a precondition.
    _currentUser = null;
    _token = null;

    if (Hive.isBoxOpen(_authBoxName)) {
      final authBox = Hive.box<String>(_authBoxName);
      await authBox.clear();
    }

    unawaited(_apiService.logout());

    // Offline-first: the cached ERP data deliberately survives logout, so the
    // same user signing back in sees their records instantly even with no
    // network. It is NOT a leak — login() clears the cache if a *different*
    // user signs in on this device.
  }
}
