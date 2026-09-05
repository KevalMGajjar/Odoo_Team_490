import 'package:flutter_test/flutter_test.dart';
import 'package:urban_furniture/services/password.dart';

/// The Dart, JavaScript and Node implementations must produce byte-identical
/// output — they are three halves of one wire contract. If they ever drift,
/// logins fail with "incorrect password" and nothing points at the cause.
///
/// These vectors were produced by the Node implementation
/// (backend/src/lib/password.js) and are pinned here deliberately.
void main() {
  test('derives the same value as the server implementation', () async {
    expect(
      await PasswordDerivation.derive('admin01', 'demo123'),
      '35ccfed852c9305347118ba45d0fb9e7e995833960054717ef406e22282b4a40',
    );
    expect(
      await PasswordDerivation.derive('nimesh01', 'demo123'),
      '9ee17e1d62d4719be26a5fe5cee317ac35343616792acf0e7357dffdb5fc304d',
    );
  });

  test('salt is case-insensitive and trimmed, matching the other clients', () async {
    final a = await PasswordDerivation.derive('Admin01', 'demo123');
    final b = await PasswordDerivation.derive('  admin01  ', 'demo123');
    expect(a, b);
  });
}
