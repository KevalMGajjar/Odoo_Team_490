import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'config/theme.dart';
import 'config/api_config.dart';
import 'services/offline_storage.dart';
import 'services/connectivity_service.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'services/sync_manager.dart';
import 'providers/connectivity_provider.dart';
import 'providers/auth_provider.dart';
import 'providers/data_provider.dart';
import 'screens/login_screen.dart';
import 'screens/app_shell.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. Initialize local persistent Hive storage
  await OfflineStorage.init();

  // Restore a saved server URL before any request is made.
  ApiConfig.loadSavedBaseUrl();

  // 2. Initialize connectivity (non-blocking)
  final connectivityService = ConnectivityService();
  connectivityService.init();

  // 3. Initialize API & Storage singletons
  final apiService = ApiService();
  final offlineStorage = OfflineStorage();

  // 4. Initialize Auth & Sync managers
  final authService = AuthService(
    apiService: apiService,
    offlineStorage: offlineStorage,
  );

  final syncManager = SyncManager(
    apiService: apiService,
    offlineStorage: offlineStorage,
    connectivityService: connectivityService,
  );

  // Created here rather than inside the provider so the sync manager can push
  // freshly synced records straight into it, without depending on which screen
  // happens to be mounted when the sync finishes.
  final dataProvider = DataProvider(offlineStorage);
  syncManager.onSyncCompleted = dataProvider.loadFromStorage;

  runApp(
    MultiProvider(
      providers: [
        // Services
        Provider<ApiService>.value(value: apiService),
        Provider<OfflineStorage>.value(value: offlineStorage),
        Provider<ConnectivityService>.value(value: connectivityService),
        Provider<AuthService>.value(value: authService),
        ChangeNotifierProvider<SyncManager>.value(value: syncManager),

        // Providers
        ChangeNotifierProvider<ConnectivityProvider>(
          create: (_) => ConnectivityProvider(connectivityService),
        ),
        ChangeNotifierProvider<AuthProvider>(
          create: (_) => AuthProvider(
            authService: authService,
            apiService: apiService,
          )..init(),
        ),
        ChangeNotifierProvider<DataProvider>.value(value: dataProvider),
      ],
      child: const UrbanFurnitureApp(),
    ),
  );
}

class UrbanFurnitureApp extends StatelessWidget {
  const UrbanFurnitureApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Urban Furniture — Offline-First Accounting',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const RootGate(),
    );
  }
}

class RootGate extends StatefulWidget {
  const RootGate({super.key});

  @override
  State<RootGate> createState() => _RootGateState();
}

class _RootGateState extends State<RootGate> {
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      _initialized = true;
      final auth = context.read<AuthProvider>();
      if (auth.isAuthenticated) {
        final user = auth.user!;
        context.read<SyncManager>().loadInitialStatus(user.id);
        context.read<DataProvider>().loadFromStorage();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    // Session restore is async. Without this branch the first frame renders the
    // login screen and then snaps to the app, so every cold start flashed a
    // sign-in form at an already-signed-in user.
    if (auth.isRestoringSession) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
      );
    }

    if (auth.isAuthenticated) {
      return const AppShell();
    }

    return const LoginScreen();
  }
}
