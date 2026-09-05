library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  AppTheme._();

  // ── Brand colours ──
  static const Color brand = Color(0xFF6B3E62);
  static const Color brandHover = Color(0xFF532E4C);
  static const Color brandLight = Color(0xFFF6EFF4);
  static const Color brandAccent = Color(0xFF8E5182);

  static const Color secondary = Color(0xFF02848A);
  static const Color secondaryLight = Color(0xFFE6F5F6);
  static const Color secondaryHover = Color(0xFF01696E);

  // ── Surfaces ──
  static const Color bg = Color(0xFFF8F9FC);
  static const Color sheet = Color(0xFFFFFFFF);
  static const Color subtle = Color(0xFFF1F4F9);
  static const Color hover = Color(0xFFEAEFF6);

  // ── Text ──
  static const Color text = Color(0xFF0F172A);
  static const Color textMuted = Color(0xFF64748B);
  static const Color textFaint = Color(0xFF94A3B8);
  static const Color textInvert = Color(0xFFFFFFFF);

  // ── Lines & Shadows ──
  static const Color border = Color(0xFFE2E8F0);
  static const Color borderStrong = Color(0xFFCBD5E1);

  static List<BoxShadow> get cardShadow => const [
        BoxShadow(
          color: Color(0x0A0F172A),
          blurRadius: 16,
          offset: Offset(0, 4),
          spreadRadius: 0,
        ),
        BoxShadow(
          color: Color(0x050F172A),
          blurRadius: 4,
          offset: Offset(0, 1),
          spreadRadius: 0,
        ),
      ];

  // ── Semantic (document states) ──
  static const Color draft = Color(0xFF64748B);
  static const Color posted = Color(0xFF6B3E62);
  static const Color paid = Color(0xFF10B981);
  static const Color partial = Color(0xFFF59E0B);
  static const Color overdue = Color(0xFFEF4444);
  static const Color info = Color(0xFF02848A);

  // ── Numeric emphasis ──
  static const Color debit = Color(0xFF2563EB);
  static const Color credit = Color(0xFFEA580C);

  // ── Shape ──
  static const double radius = 12.0;
  static const double radiusSm = 6.0;
  static const double radiusLg = 16.0;

  static ThemeData get lightTheme {
    final baseTextTheme = GoogleFonts.interTextTheme();

    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: bg,
      colorScheme: ColorScheme.fromSeed(
        seedColor: brand,
        primary: brand,
        secondary: secondary,
        surface: sheet,
        surfaceContainerLowest: sheet,
        surfaceContainerLow: subtle,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: sheet,
        foregroundColor: text,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: text,
          fontSize: 17,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
      ),
      cardTheme: CardThemeData(
        color: sheet,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: const BorderSide(color: border, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: sheet,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSm),
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSm),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSm),
          borderSide: const BorderSide(color: brand, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSm),
          borderSide: const BorderSide(color: overdue),
        ),
        labelStyle: const TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
          color: textMuted,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: brand,
          foregroundColor: textInvert,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusSm),
          ),
          textStyle: const TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: brand,
          side: const BorderSide(color: border),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusSm),
          ),
          textStyle: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: secondary,
          textStyle: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: border,
        thickness: 1,
        space: 0,
      ),
      textTheme: baseTextTheme.copyWith(
        bodyLarge: const TextStyle(fontSize: 14.5, color: text, letterSpacing: -0.1),
        bodyMedium: const TextStyle(fontSize: 13.5, color: text),
        bodySmall: const TextStyle(fontSize: 12, color: textMuted),
        titleLarge: const TextStyle(
          fontSize: 19,
          fontWeight: FontWeight.w700,
          color: text,
          letterSpacing: -0.4,
        ),
        titleMedium: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: text,
          letterSpacing: -0.2,
        ),
        labelSmall: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
          color: textMuted,
        ),
      ),
    );
  }
}
