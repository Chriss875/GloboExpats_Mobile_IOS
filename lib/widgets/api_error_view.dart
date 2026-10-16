import 'package:flutter/material.dart';

import '../theme.dart';

/// Maps backend/business error tokens to buyer-facing copy
/// (BUYER_FLOW_SPEC §0/§5.4). Unknown messages render verbatim but never as a
/// raw stack trace. Used by every error surface (AU-005).
String friendlyErrorMessage(String raw) {
  final m = raw.toLowerCase();
  if (m.contains('insufficient_stock')) {
    return 'Not enough stock available for the quantity you chose.';
  }
  if (m.contains('account_blocked')) {
    return 'Your account is blocked. Contact support for help.';
  }
  if (m.contains('checkout_data_invalid') || m.contains('422')) {
    return 'Some checkout details were invalid. Please review and try again.';
  }
  if (m.contains('buyer_profile_setup_failed')) {
    return 'We could not set up your buyer profile. Try again or contact support.';
  }
  if (m.contains('payment_proof_required')) {
    return 'Add a payment proof (screenshot or transaction reference) before submitting.';
  }
  if (m.contains('proforma_expired')) {
    return 'This payment window expired. Start a fresh checkout to get updated prices.';
  }
  if (m.contains('correction_window_closed')) {
    return 'The 48-hour correction window has closed for this payment.';
  }
  if (m.contains('no_refund_due')) {
    return 'There is no refund due on this order.';
  }
  if (m.contains('order_refunded')) {
    return 'This order was already refunded — payment cannot be released.';
  }
  if (m.contains('order_not_delivered')) {
    return 'Payment can only be released after the order is delivered.';
  }
  if (m.contains('delivery_code_required')) {
    return 'A delivery code is required to complete this delivery.';
  }
  if (m.contains('dispatch_too_early')) {
    return 'Dispatch opens 1 hour before the delivery window starts.';
  }
  if (m.contains('already_nudged')) {
    return 'You already nudged this request.';
  }
  if (m.contains('seller not verified')) {
    return 'Your seller account is not verified yet. Complete verification first.';
  }
  if (m.contains('socket') || m.contains('timeout') || m.contains('network')) {
    return 'Network problem — check your connection and retry.';
  }
  // Unknown: show the server message, sanitized of internal jargon.
  return raw.replaceFirst(RegExp(r'^ApiException:\s*'), '');
}

/// Standard inline error block with an optional Retry action. Never renders a
/// stack trace; long server text is clamped.
class ApiErrorView extends StatelessWidget {
  final Object? error;
  final VoidCallback? onRetry;
  const ApiErrorView({super.key, this.error, this.onRetry});

  @override
  Widget build(BuildContext context) {
    final msg = friendlyErrorMessage(error?.toString() ?? 'Something went wrong');
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 44, color: Color(0xFFDC2626)),
            const SizedBox(height: 10),
            Text(
              msg.length > 220 ? '${msg.substring(0, 220)}…' : msg,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 14),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Empty-state placeholder per the platform's no-scaffolding rule: blocks hide
/// entirely on zero rows — callers render [EmptyState] only where the reference
/// shows explicit empty copy.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;
  const EmptyState({super.key, this.icon = Icons.inbox_outlined, required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: AppPalette.of(context).textSecondary),
          const SizedBox(height: 8),
          Text(message, style: TextStyle(color: AppPalette.of(context).textSecondary)),
        ],
      ),
    );
  }
}
