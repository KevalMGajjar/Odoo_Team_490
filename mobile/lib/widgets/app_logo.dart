import 'package:flutter/material.dart';
import '../config/theme.dart';

/// The Urban Furniture mark: a sofa, in the brand plum.
///
/// Drawn rather than shipped as an asset, so it stays crisp at any size and
/// needs no SVG dependency. The geometry is the same 24-unit grid used by
/// frontend/components/ui/Logo.js — the two clients show one shape, not two
/// interpretations of it. If the coordinates change here, change them there.
class AppLogo extends StatelessWidget {
  /// Overall size. With [tile] the mark is drawn at 62% of it, centred.
  final double size;

  /// Wrap the mark in a rounded plum square, for use as an app icon.
  final bool tile;

  /// Colour of the mark itself. Ignored when [tile] is set, where it is white.
  final Color? color;

  const AppLogo({super.key, this.size = 32, this.tile = true, this.color});

  @override
  Widget build(BuildContext context) {
    final mark = CustomPaint(
      size: Size.square(tile ? size * 0.62 : size),
      painter: _SofaPainter(tile ? Colors.white : (color ?? AppTheme.brand)),
    );

    if (!tile) return mark;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppTheme.brand,
        borderRadius: BorderRadius.circular(size * 0.23),
      ),
      child: Center(child: mark),
    );
  }
}

class _SofaPainter extends CustomPainter {
  final Color color;
  const _SofaPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color..isAntiAlias = true;
    // Everything below is in the same 24-unit space as the SVG, scaled to fit.
    final u = size.width / 24;
    void rrect(double x, double y, double w, double h, double r) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(x * u, y * u, w * u, h * u),
          Radius.circular(r * u),
        ),
        paint,
      );
    }

    rrect(5, 4.5, 14, 7.5, 2.6);      // back cushion
    rrect(2.2, 8.6, 4.2, 8.4, 2.1);   // left arm
    rrect(17.6, 8.6, 4.2, 8.4, 2.1);  // right arm
    rrect(5, 11.4, 14, 5.6, 2.0);     // seat
    rrect(5.4, 16.6, 2.2, 2.9, 0.9);  // legs
    rrect(16.4, 16.6, 2.2, 2.9, 0.9);
  }

  @override
  bool shouldRepaint(_SofaPainter old) => old.color != color;
}
