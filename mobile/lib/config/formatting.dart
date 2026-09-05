import 'package:intl/intl.dart';

/// Shared display formatting.
///
/// Every screen previously built its own `NumberFormat.currency(symbol: '\$')`,
/// which showed US dollars for a business whose base currency is INR. Having
/// one formatter also gets the Indian grouping right — ₹1,57,060.00, not
/// ₹157,060.00 — matching the web app.
class Fmt {
  static final currency =
      NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);

  /// Compact form for tight spaces: ₹1.57L, ₹2.4Cr.
  static String compactMoney(num value) {
    final abs = value.abs();
    if (abs >= 10000000) return '₹${(value / 10000000).toStringAsFixed(2)}Cr';
    if (abs >= 100000) return '₹${(value / 100000).toStringAsFixed(2)}L';
    return currency.format(value);
  }

  static final date = DateFormat('dd MMM yyyy');
  static final shortDate = DateFormat('dd MMM');
}
