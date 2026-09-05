import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../config/api_config.dart';
import '../providers/auth_provider.dart';
import '../providers/connectivity_provider.dart';
import '../providers/data_provider.dart';
import '../services/sync_manager.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController(text: 'admin@urbanfurniture.com');
  final _passwordController = TextEditingController(text: 'demo123');
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _handleLogin() async {
    final auth = context.read<AuthProvider>();
    final syncManager = context.read<SyncManager>();
    final data = context.read<DataProvider>();

    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) return;

    final success = await auth.login(email, password);
    if (success && mounted) {
      final user = auth.user!;
      syncManager.loadInitialStatus(user.id);
      data.loadFromStorage();

      final conn = context.read<ConnectivityProvider>();
      if (conn.isOnline) {
        syncManager.syncAll(userId: user.id, role: user.role).then((synced) {
          if (synced && mounted) {
            data.loadFromStorage();
          }
        });
      }
    }
  }

  void _fillDemo(String email, String role) {
    setState(() {
      _emailController.text = email;
      _passwordController.text = 'demo123';
    });
  }

  void _showServerSettings() {
    final urlController = TextEditingController(text: ApiConfig.baseUrl);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('API Server URL', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Set backend host for emulator (10.0.2.2:4000), physical device (LAN IP:4000), or desktop/web (127.0.0.1:4000).',
              style: TextStyle(fontSize: 12.5, color: AppTheme.textMuted),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: urlController,
              decoration: const InputDecoration(
                labelText: 'BASE URL',
                hintText: 'http://127.0.0.1:4000',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              ApiConfig.setCustomBaseUrl(urlController.text.trim());
              Navigator.pop(ctx);
              context.read<ConnectivityProvider>().checkNow();
            },
            child: const Text('Save Settings'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final conn = context.watch<ConnectivityProvider>();

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined, size: 20, color: AppTheme.textMuted),
            tooltip: 'Server Settings',
            onPressed: _showServerSettings,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Container(
              decoration: BoxDecoration(
                color: AppTheme.sheet,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.border, width: 1),
                boxShadow: AppTheme.cardShadow,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 36),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Brand Logo & Title
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [AppTheme.brand, Color(0xFF8E5182)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: [
                              BoxShadow(
                                color: AppTheme.brand.withValues(alpha: 0.25),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.chair_rounded,
                            color: AppTheme.textInvert,
                            size: 28,
                          ),
                        ),
                        const SizedBox(width: 14),
                        const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Urban Furniture',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: AppTheme.brand,
                                letterSpacing: -0.4,
                              ),
                            ),
                            Text(
                              'Accounting & Invoicing • Offline-First',
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w500,
                                color: AppTheme.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    const Divider(),
                    const SizedBox(height: 18),

                    // Live Connection Pill Badge
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                        decoration: BoxDecoration(
                          color: conn.isOnline
                              ? const Color(0xFFD1FAE5)
                              : const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: conn.isOnline
                                ? const Color(0xFF047857).withValues(alpha: 0.2)
                                : const Color(0xFFB45309).withValues(alpha: 0.2),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: conn.isOnline
                                    ? const Color(0xFF10B981)
                                    : const Color(0xFFF59E0B),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              conn.isOnline ? 'Connected to Backend' : 'Offline Mode Active',
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                color: conn.isOnline
                                    ? const Color(0xFF047857)
                                    : const Color(0xFFB45309),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Error Notification
                    if (auth.error != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF2F2),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFFECACA)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline, size: 16, color: Color(0xFFDC2626)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                auth.error!,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: Color(0xFF991B1B),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                    ],

                    // Email Input
                    TextField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'EMAIL ADDRESS',
                        prefixIcon: Icon(Icons.email_outlined, size: 18),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Password Input
                    TextField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      decoration: InputDecoration(
                        labelText: 'PASSWORD',
                        prefixIcon: const Icon(Icons.lock_outline, size: 18),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                            size: 18,
                            color: AppTheme.textMuted,
                          ),
                          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                        ),
                      ),
                      onSubmitted: (_) => _handleLogin(),
                    ),
                    const SizedBox(height: 22),

                    // Submit Button
                    ElevatedButton(
                      onPressed: auth.isLoading ? null : _handleLogin,
                      child: auth.isLoading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Sign In to Workspace'),
                    ),
                    const SizedBox(height: 26),

                    // One-Click Demo Accounts Chips
                    const Text(
                      'DEMO ACCOUNTS (ONE-CLICK)',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                        color: AppTheme.textMuted,
                      ),
                    ),
                    const SizedBox(height: 10),

                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      alignment: WrapAlignment.center,
                      children: [
                        ActionChip(
                          avatar: const Icon(Icons.shield_outlined, size: 14, color: AppTheme.brand),
                          label: const Text('Admin', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
                          onPressed: () => _fillDemo('admin@urbanfurniture.com', 'admin'),
                        ),
                        ActionChip(
                          avatar: const Icon(Icons.calculate_outlined, size: 14, color: AppTheme.secondary),
                          label: const Text('Accountant', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
                          onPressed: () => _fillDemo('accountant@urbanfurniture.com', 'invoicing_user'),
                        ),
                        ActionChip(
                          avatar: const Icon(Icons.person_outline, size: 14, color: Color(0xFFC2410C)),
                          label: const Text('Portal Contact', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
                          onPressed: () => _fillDemo('nimesh@example.com', 'contact'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
