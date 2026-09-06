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

  /// An ISO date string as `18 Jul 2026`.
  ///
  /// The API sends dates as `2026-07-18` and the screens were printing them
  /// raw, which is both harder to read at a glance and wider — wide enough
  /// that the ledger rows were truncating the date itself. Returns the input
  /// unchanged if it will not parse, because a malformed date is worth showing
  /// rather than swallowing.
  static String day(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final parsed = DateTime.tryParse(iso);
    return parsed == null ? iso : date.format(parsed);
  }

  /// `18 Jul` — for rows already under a "Recent" heading, where the year is
  /// the least useful part and the first thing to cost a truncation.
  static String dayShort(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final parsed = DateTime.tryParse(iso);
    return parsed == null ? iso : shortDate.format(parsed);
  }
}
