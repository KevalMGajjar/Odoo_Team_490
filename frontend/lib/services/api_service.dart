import 'package:dio/dio.dart';
import '../config/api_config.dart';
import '../models/models.dart';

/// Central HTTP Client wrapper utilizing Dio with automatic JWT bearer token injection
/// and uniform error handling for offline/network issues.
class ApiService {
  late final Dio _dio;
  String? _token;

  ApiService({String? token}) {
    _token = token;
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConfig.baseUrl,
        connectTimeout: ApiConfig.connectTimeout,
        receiveTimeout: ApiConfig.receiveTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    // Auth & Error Interceptor
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          // Update baseUrl dynamically in case runtime settings changed
          options.baseUrl = ApiConfig.baseUrl;
          if (_token != null && _token!.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $_token';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) {
          return handler.next(error);
        },
      ),
    );
  }

  /// Update the active JWT token
  void setToken(String? token) {
    _token = token;
  }

  /// POST /auth/login
  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _dio.post(
        ApiConfig.login,
        data: {'email': email, 'password': password},
      );

      final data = response.data as Map<String, dynamic>;
      final userJson = data['user'] as Map<String, dynamic>;
      final token = data['token'] as String?;

      if (token != null) {
        setToken(token);
      }

      return {
        'user': AppUser.fromJson(userJson),
        'token': token,
      };
    } on DioException catch (e) {
      throw _parseDioError(e);
    }
  }

  /// GET /auth/me
  Future<AppUser> getMe() async {
    try {
      final response = await _dio.get(ApiConfig.me);
      final data = response.data as Map<String, dynamic>;
      return AppUser.fromJson(data['user'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _parseDioError(e);
    }
  }

  /// POST /auth/logout
  Future<void> logout() async {
    try {
      await _dio.post(ApiConfig.logout);
    } catch (_) {
      // Best-effort logout on server
    } finally {
      setToken(null);
    }
  }

  /// GET /auth/demo-accounts
  Future<List<Map<String, dynamic>>> getDemoAccounts() async {
    try {
      final response = await _dio.get(ApiConfig.demoAccounts);
      final data = response.data as Map<String, dynamic>;
      final accounts = data['accounts'] as List<dynamic>? ?? [];
      return accounts.map((a) => a as Map<String, dynamic>).toList();
    } on DioException catch (e) {
      throw _parseDioError(e);
    }
  }

  /// GET /sync/bulk with universal fallback to individual REST endpoints
  /// This ensures 100% compatibility whether connected to the dedicated sync backend
  /// or the standard Next.js / Express website backend.
  Future<SyncBulkResponse> fetchBulkSync() async {
    try {
      final response = await _dio.get(ApiConfig.syncBulk);
      final data = response.data as Map<String, dynamic>;
      return SyncBulkResponse.fromJson(data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) {
        // Fallback: Fetch directly from standard REST endpoints
        return _fetchFromRestEndpoints();
      }
      throw _parseDioError(e);
    }
  }

  /// Parallel fetch from standard REST endpoints
  Future<SyncBulkResponse> _fetchFromRestEndpoints() async {
    final results = await Future.wait([
      _safeGetList('/contacts?pageSize=500'),
      _safeGetList('/products?pageSize=500'),
      _safeGetList('/accounts?pageSize=500'),
      _safeGetList('/journals?pageSize=500'),
      _safeGetList('/taxes?pageSize=500'),
      _safeGetList('/currencies?pageSize=500'),
      _safeGetList('/currency-rates?pageSize=500'),
      _safeGetList('/purchase-orders?pageSize=500'),
      _safeGetList('/sales-orders?pageSize=500'),
      _safeGetList('/bills?pageSize=500'),
      _safeGetList('/invoices?pageSize=500'),
      _safeGetList('/payments?pageSize=500'),
      _safeGetList('/journal-entries?pageSize=500'),
      _safeGetList('/analytic-accounts?pageSize=500'),
      _safeGetList('/budgets?pageSize=500'),
    ]);

    final rawData = <String, List<Map<String, dynamic>>>{
      'contacts': results[0],
      'products': results[1],
      'accounts': results[2],
      'journals': results[3],
      'taxes': results[4],
      'currencies': results[5],
      'currencyRates': results[6],
      'purchaseOrders': results[7],
      'salesOrders': results[8],
      'vendorBills': results[9],
      'customerInvoices': results[10],
      'payments': results[11],
      'journalEntries': results[12],
      'analyticAccounts': results[13],
      'budgets': results[14],
    };

    return SyncBulkResponse(
      syncedAt: DateTime.now().toUtc().toIso8601String(),
      rawData: rawData,
    );
  }

  Future<List<Map<String, dynamic>>> _safeGetList(String path) async {
    try {
      final res = await _dio.get(path);
      final data = res.data;
      if (data is Map<String, dynamic>) {
        final rows = data['rows'] ?? data['data'] ?? data['items'];
        if (rows is List) {
          return rows.map((r) => Map<String, dynamic>.from(r as Map)).toList();
        }
      } else if (data is List) {
        return data.map((r) => Map<String, dynamic>.from(r as Map)).toList();
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  /// Helper to convert DioException to user-friendly message
  Exception _parseDioError(DioException error) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.connectionError) {
      return Exception('Server unreachable. Please check your connection.');
    }

    if (error.response != null) {
      final status = error.response?.statusCode;
      final body = error.response?.data;
      String? message;
      if (body is Map<String, dynamic>) {
        message = body['error'] as String? ?? body['message'] as String?;
      }

      if (status == 401) {
        return ApiException(status ?? 401, message ?? 'Invalid credentials or session expired.');
      }
      if (status == 403) {
        return ApiException(status ?? 403, message ?? 'You do not have permission for this action.');
      }
      if (status == 404) {
        return ApiException(status ?? 404, message ?? 'Resource not found.');
      }
      if (message != null && message.isNotEmpty) {
        return ApiException(status ?? 500, message);
      }
    }

    return Exception(error.message ?? 'An unexpected network error occurred.');
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);

  @override
  String toString() => message;
}
