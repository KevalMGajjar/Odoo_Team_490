import 'dart:convert';
import 'package:cryptography/cryptography.dart';

/// Dart twin of frontend/lib/password.js and backend/src/lib/password.js.
///
/// The typed password never leaves the device. What is sent is
/// PBKDF2-SHA256(password, salt = loginId), hex encoded, which the server then
/// bcrypts. All three implementations must agree exactly — the parameters
/// below are part of the wire contract, and changing any of them invalidates
/// every stored password.
class PasswordDerivation {
  static const _iterations = 100000;
  static const _bits = 256;

  static final _pbkdf2 = Pbkdf2(
    macAlgorithm: Hmac.sha256(),
    iterations: _iterations,
    bits: _bits,
  );

  /// Hex-encoded derived key. Runs off the UI thread's critical path by being
  /// awaited before the request; on a slow device this takes a moment, which
  /// is why the sign-in button shows a spinner while it happens.
  static Future<String> derive(String loginId, String password) async {
    final key = await _pbkdf2.deriveKey(
      secretKey: SecretKey(utf8.encode(password)),
      nonce: utf8.encode(loginId.trim().toLowerCase()),
    );
    final bytes = await key.extractBytes();
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}
