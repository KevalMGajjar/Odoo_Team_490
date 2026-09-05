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

  /// GET /sync/bulk
  /// Fetches the full dataset scoped to the current user's role
  Future<SyncBulkResponse> fetchBulkSync() async {
    try {
      final response = await _dio.get(ApiConfig.syncBulk);
      final data = response.data as Map<String, dynamic>;
      return SyncBulkResponse.fromJson(data);
    } on DioException catch (e) {
      throw _parseDioError(e);
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
