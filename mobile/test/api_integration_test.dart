import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:urban_furniture/config/api_config.dart';
import 'package:urban_furniture/models/models.dart';
import 'package:urban_furniture/services/api_service.dart';

/// Live contract tests against a running backend on http://127.0.0.1:4000.
///
/// These exist because the app's login and role handling drifted out of sync
/// with the backend (it still signed in by email, and checked role names the
/// server had dropped). A unit test with a mocked client would have passed
/// happily through both bugs — only talking to the real API catches them.
///
/// Skipped automatically when the backend isn't running, so the suite stays
/// green offline.
void main() {
  // flutter_test installs an HttpOverrides that fails every real request.
  setUpAll(() => HttpOverrides.global = null);

  Future<bool> backendUp() async {
    try {
      final client = HttpClient()..connectionTimeout = const Duration(seconds: 2);
      final req = await client.getUrl(Uri.parse('${ApiConfig.baseUrl}/health'));
      final res = await req.close();
      client.close();
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  group('auth contract', () {
    test('signs in with a Login ID and returns a usable session', () async {
      if (!await backendUp()) {
        markTestSkipped('backend not running on ${ApiConfig.baseUrl}');
        return;
      }
      final api = ApiService();
      final result = await api.login(loginId: 'admin01', password: 'demo123');

      final user = result.user!;
      expect(user.loginId, 'admin01');
      expect(user.role, 'admin');
      expect(user.isAdmin, isTrue);
      expect(user.isInternal, isTrue);
      expect(user.isPortal, isFalse);
      // A demo account skips the emailed code — that is what makes one-tap
      // demo sign-in possible, and what this test depends on.
      expect(result.needsCode, isFalse);
      // A bearer token is required for every later call on a native client.
      expect(result.token, isA<String>());
      expect(result.token!.isNotEmpty, isTrue);
    });

    test('a portal user is recognised as portal', () async {
      if (!await backendUp()) {
        markTestSkipped('backend not running');
        return;
      }
      final api = ApiService();
      final result = await api.login(loginId: 'nimesh01', password: 'demo123');
      final user = result.user!;

      expect(user.role, 'user');
      // Regression guard: this read role == 'contact' and was always false,
      // which handed a portal user the full internal staff UI.
      expect(user.isPortal, isTrue);
      expect(user.isInternal, isFalse);
    });

    test('a wrong password is rejected, not silently accepted', () async {
      if (!await backendUp()) {
        markTestSkipped('backend not running');
        return;
      }
      final api = ApiService();
      expect(
        () => api.login(loginId: 'admin01', password: 'wrong-password'),
        throwsA(isA<ApiException>()),
      );
    });
  });

  group('sync contract', () {
    test('bulk sync falls back to REST and returns real records', () async {
      if (!await backendUp()) {
        markTestSkipped('backend not running');
        return;
      }
      final api = ApiService();
      await api.login(loginId: 'admin01', password: 'demo123');

      // /sync/bulk does not exist on this backend; the client must fall back
      // to the individual REST endpoints rather than surfacing a 404.
      final sync = await api.fetchBulkSync();

      expect(sync.rawData['contacts'], isNotEmpty, reason: 'contacts should sync');
      expect(sync.rawData['products'], isNotEmpty, reason: 'products should sync');
      expect(sync.rawData['customerInvoices'], isNotEmpty, reason: 'invoices should sync');
      expect(DateTime.tryParse(sync.syncedAt), isNotNull);
    });

    test('a portal user syncs their own documents, not an empty app', () async {
      if (!await backendUp()) {
        markTestSkipped('backend not running');
        return;
      }
      final api = ApiService();
      final result = await api.login(loginId: 'nimesh01', password: 'demo123');
      final user = result.user!;

      // Portal users are refused by every company-wide endpoint, so syncing
      // them down the staff path produced nothing but 403s and an empty app.
      final sync = await api.fetchBulkSync(role: user.role);
      final invoices = sync.rawData['customerInvoices'] ?? [];

      expect(invoices, isNotEmpty, reason: 'portal user should see their own invoices');
      expect(() => invoices.map(CustomerInvoice.fromJson).toList(), returnsNormally);
      expect(invoices.first['invoiceDate'], isNotNull, reason: 'date must be mapped for display');
    });

    test('every synced collection parses into its model without throwing', () async {
      if (!await backendUp()) {
        markTestSkipped('backend not running');
        return;
      }
      final api = ApiService();
      await api.login(loginId: 'admin01', password: 'demo123');
      final sync = await api.fetchBulkSync();

      // Guards against backend schema drift silently breaking the app: any
      // renamed or newly-required field shows up here as a parse failure.
      expect(() => sync.rawData['contacts']!.map(Contact.fromJson).toList(), returnsNormally);
      expect(() => sync.rawData['products']!.map(Product.fromJson).toList(), returnsNormally);
      expect(() => sync.rawData['accounts']!.map(Account.fromJson).toList(), returnsNormally);
      expect(() => sync.rawData['customerInvoices']!.map(CustomerInvoice.fromJson).toList(), returnsNormally);
      expect(() => sync.rawData['vendorBills']!.map(VendorBill.fromJson).toList(), returnsNormally);
      expect(() => sync.rawData['journalEntries']!.map(JournalEntry.fromJson).toList(), returnsNormally);
      expect(() => sync.rawData['payments']!.map(Payment.fromJson).toList(), returnsNormally);
    });
  });
}
