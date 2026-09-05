import 'package:flutter/material.dart';
import '../config/theme.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  final bool isPaymentState;

  const StatusBadge({
    super.key,
    required this.status,
    this.isPaymentState = false,
  });

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    String label;
    IconData? icon;

    final normalized = status.toLowerCase().replaceAll(' ', '_');

    switch (normalized) {
      case 'posted':
        bg = const Color(0xFFF3E8FF);
        fg = const Color(0xFF7E22CE);
        label = 'POSTED';
        icon = Icons.check_circle_outline;
        break;
      case 'paid':
        bg = AppTheme.successSurface;
        fg = AppTheme.successText;
        label = 'PAID';
        icon = Icons.done_all;
        break;
      case 'partial':
      case 'partially_paid':
        bg = AppTheme.warningSurface;
        fg = AppTheme.warningText;
        label = 'PARTIAL';
        icon = Icons.pie_chart_outline;
        break;
      case 'not_paid':
        bg = AppTheme.dangerSurface;
        fg = const Color(0xFFB91C1C);
        label = 'NOT PAID';
        icon = Icons.error_outline;
        break;
      case 'overdue':
        bg = AppTheme.dangerSurface;
        fg = AppTheme.overdue;
        label = 'OVERDUE';
        icon = Icons.warning_amber_rounded;
        break;
      case 'active':
        bg = AppTheme.infoSurface;
        fg = const Color(0xFF0369A1);
        label = 'ACTIVE';
        icon = Icons.circle;
        break;
      case 'archived':
        bg = AppTheme.subtle;
        fg = const Color(0xFF475569);
        label = 'ARCHIVED';
        break;
      case 'customer':
        bg = const Color(0xFFE0E7FF);
        fg = const Color(0xFF4338CA);
        label = 'CUSTOMER';
        icon = Icons.person_outline;
        break;
      case 'vendor':
        bg = const Color(0xFFFAE8FF);
        fg = const Color(0xFF86198F);
        label = 'VENDOR';
        icon = Icons.storefront_outlined;
        break;
      case 'admin':
        bg = const Color(0xFFF5E8F3);
        fg = AppTheme.brand;
        label = 'ADMIN';
        icon = Icons.shield_outlined;
        break;
      case 'invoicing_user':
        bg = AppTheme.infoSurface;
        fg = const Color(0xFF0284C7);
        label = 'ACCOUNTANT';
        icon = Icons.calculate_outlined;
        break;
      case 'contact':
        bg = const Color(0xFFFFEDD5);
        fg = AppTheme.credit;
        label = 'PORTAL';
        icon = Icons.person;
        break;
      case 'draft':
      default:
        bg = AppTheme.subtle;
        fg = const Color(0xFF475569);
        label = normalized.toUpperCase();
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: fg.withValues(alpha: 0.18), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: fg,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}
