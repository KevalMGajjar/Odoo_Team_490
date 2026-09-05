import 'package:flutter/foundation.dart';
import '../models/models.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService _authService;
  final ApiService _apiService;

  bool _isLoading = false;
  String? _error;
  List<Map<String, dynamic>> _demoAccounts = [];

  AuthProvider({
    required AuthService authService,
    required ApiService apiService,
  })  : _authService = authService,
        _apiService = apiService;

  AppUser? get user => _authService.currentUser;
  bool get isAuthenticated => _authService.isAuthenticated;
  bool get isLoading => _isLoading;
  String? get error => _error;
  List<Map<String, dynamic>> get demoAccounts => _demoAccounts;

  /// Initialize session from secure storage or local cache
  Future<void> init() async {
    _isLoading = true;
    notifyListeners();

    try {
      await _authService.init();
      // Optionally fetch demo accounts in background
      fetchDemoAccounts();
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Sign in with email and password
  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      await _authService.login(email, password);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  /// Sign out and clear cached user data
  Future<void> logout() async {
    _isLoading = true;
    notifyListeners();
    try {
      await _authService.logout();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Fetch demo accounts for one-click demo logins
  Future<void> fetchDemoAccounts() async {
    try {
      _demoAccounts = await _apiService.getDemoAccounts();
      notifyListeners();
    } catch (_) {
      // Fallback demo accounts if server endpoint fails or offline
      if (_demoAccounts.isEmpty) {
        _demoAccounts = [
          {'name': 'Admin User', 'email': 'admin@urbanfurniture.com', 'role': 'admin'},
          {'name': 'Accountant User', 'email': 'accountant@urbanfurniture.com', 'role': 'invoicing_user'},
          {'name': 'Deco Addict (Portal)', 'email': 'portal@urbanfurniture.com', 'role': 'contact'},
        ];
        notifyListeners();
      }
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
