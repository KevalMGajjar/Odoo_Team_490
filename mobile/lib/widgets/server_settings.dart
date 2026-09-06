import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/api_config.dart';
import '../config/theme.dart';
import '../providers/connectivity_provider.dart';

/// Where the app should look for the backend.
///
/// Reachable from the login screen and from the profile menu, because the
/// address changes more often than anything else about a demo build: it is
/// baked in at compile time, and a laptop's LAN address is different on every
/// network it joins. Being able to correct it only before signing in meant
/// reinstalling the app to recover from a changed Wi-Fi.
Future<void> showServerSettings(BuildContext context) {
  final controller = TextEditingController(text: ApiConfig.baseUrl);

  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text('API Server URL',
          style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Emulator: 10.0.2.2:4000 · Desktop or web: 127.0.0.1:4000 · '
            'Phone: the computer’s Wi-Fi address, e.g. 192.168.1.20:4000',
            style: TextStyle(fontSize: 12.5, color: AppTheme.textMuted, height: 1.4),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: controller,
            autocorrect: false,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'BASE URL',
              hintText: 'http://192.168.1.20:4000',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () {
            // A saved URL outlives the network it was for and overrides the
            // address compiled into the build, so there has to be a way back.
            ApiConfig.clearCustomBaseUrl();
            Navigator.pop(ctx);
            context.read<ConnectivityProvider>().checkNow();
          },
          child: const Text('Use default'),
        ),
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ElevatedButton(
          onPressed: () {
            final entered = controller.text.trim();
            if (entered.isNotEmpty) ApiConfig.setCustomBaseUrl(entered);
            Navigator.pop(ctx);
            context.read<ConnectivityProvider>().checkNow();
          },
          child: const Text('Save'),
        ),
      ],
    ),
  );
}
