import 'time_utils.dart';

/// AU-036: buyer-facing escrow display states (BUYER_FLOW_SPEC §8 table).
///
/// Escrow is manual: GloboExpats verifies payment and releases payout; the
/// seller never sees an order while `escrowPending` (T25).
class EscrowView {
  final String banner; // short copy line
  final String badge; // escrow badge label
  final String tone; // info | success | warning | neutral

  const EscrowView(this.banner, this.badge, this.tone);
}

class Escrow {
  Escrow._();

  /// Map a live order's fields to its buyer-visible escrow state.
  static EscrowView view({
    required String? orderStatus,
    required bool escrowPending,
    required String? paymentStatus,
    required String? payoutStatus,
    required String? refundStatus,
    num? refundAmount,
    dynamic confirmationDeadline,
    DateTime? nowUtc, // reserved: deadline-relative banners
  }) {
    if (refundStatus == 'REFUNDED') {
      final amt = refundAmount;
      final amtTxt = amt == null ? '' : ' · TSh ${_num(amt)}';
      return EscrowView('Refunded$amtTxt', 'Refunded', 'warning');
    }
    // REFUND_PENDING (e.g. seller-cancelled order, money still held) must be
    // visible — the reference renders getRefundStatusLabel() for it
    // (lib/order-status.ts) and hiding the state left cancelled orders
    // showing nothing about the buyer's money (AU-037 D2).
    if (refundStatus == 'REFUND_PENDING') {
      return const EscrowView(
        'Cancellation refund pending - GloboExpats will return your money',
        'Refund pending',
        'warning',
      );
    }

    // §8 state 2 precedes any HELD reading: the backend defaults
    // payoutStatus=HELD on every order (@Builder.Default), so a fresh
    // AWAITING_PAYMENT order would otherwise show "held" copy while the
    // payment is still under verification.
    if (escrowPending) {
      // state 2: submitted, awaiting verification
      return const EscrowView(
        'Payment submitted - awaiting GloboExpats verification',
        'Under review',
        'info',
      );
    }

    switch (payoutStatus) {
      case 'RELEASED':
        return const EscrowView(
            'Payment released to seller', 'Released', 'success');
      case 'HELD':
        // HELD spans confirmed-through-delivered; refine by status
        switch (orderStatus) {
          case 'AWAITING_SELLER_CONFIRMATION':
            return const EscrowView('Payment confirmed - awaiting seller',
                'Held by GloboExpats', 'info');
          case 'DELIVERED':
          case 'PICKED_UP':
            return const EscrowView(
                'Delivered - confirm receipt to release payment',
                'Held by GloboExpats',
                'info');
          default:
            return const EscrowView(
                'Money held by GloboExpats until delivery', 'Held', 'neutral');
        }
    }

    if (paymentStatus == 'PENDING' || orderStatus == 'AWAITING_PAYMENT') {
      return const EscrowView(
          'Money will be held by GloboExpats until your order is delivered',
          'Pending',
          'neutral');
    }
    return const EscrowView('', '', 'neutral');
  }

  /// T25: while escrowPending the SELLER cannot see the order at all.
  static bool sellerCanSeeOrder({required bool escrowPending}) =>
      !escrowPending;

  /// Rejected-proof correction window: explicit deadline > rejectedAt+48h >
  /// max(receipt stamps)+48h (BUYER_FLOW_SPEC §7).
  static DateTime? correctionDeadline({
    dynamic explicitDeadline,
    dynamic rejectedAt,
    List<dynamic> receiptStamps = const [],
  }) {
    final exp = TimeUtils.tryParseBackendTimestamp(explicitDeadline);
    if (exp != null) return exp;
    final rej = TimeUtils.tryParseBackendTimestamp(rejectedAt);
    DateTime? best =
        rej?.add(const Duration(hours: 48));
    for (final s in receiptStamps) {
      final t = TimeUtils.tryParseBackendTimestamp(s);
      if (t != null) {
        final cand = t.add(const Duration(hours: 48));
        if (best == null || cand.isAfter(best)) best = cand;
      }
    }
    return best;
  }

  static String _num(num v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toString();
}
