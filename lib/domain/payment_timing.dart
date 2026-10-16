/// Payment-review timing rules — port of the reference `lib/payment-timing.ts`
/// (BIZLOG-18 / NOTIFP admin_payment_review).
///
/// GloboExpats finance staff review submitted payment proofs within a 30-minute
/// SLA. Once that window has passed with the proof still under review, the
/// payment is OVERDUE and surfaces as an urgent task for the reviewer (admin)
/// and a "review is overdue" signal for the buyer. Pure functions over the
/// decoded JSON maps the API returns; screen/banner wiring is Phase 6.
library;

import 'time_utils.dart';

/// The finance-review SLA: 30 minutes (web PAYMENT_REVIEW_LIMIT_MS).
const int kPaymentReviewLimitMs = 30 * 60 * 1000;

String _normalize(String? value) =>
    (value ?? '').trim().toUpperCase().replaceAll(RegExp(r'[\s-]+'), '_');

DateTime? _timestamp(String? value) => TimeUtils.tryParseBackendTimestamp(value);

/// True while a submitted proof is still waiting on finance review — web
/// `isPaymentPendingReview` (lib/payment-timing.ts:35-46). Confirmed/verified/
/// approved/expired/cancelled/rejected payments are no longer under review.
bool isPaymentPendingReview(Map<String, dynamic> payment) {
  final status = _normalize(payment['status']?.toString());
  if (const {
        'CONFIRMED', 'VERIFIED', 'APPROVED', 'EXPIRED', 'CANCELLED', 'REJECTED',
      }.contains(status)) {
    return false;
  }
  final receipts = (payment['receipts'] as List?) ?? const [];
  final receiptStatuses = receipts
      .whereType<Map>()
      .map((r) => _normalize(r['status']?.toString()))
      .toList();
  return receiptStatuses.contains('SUBMITTED') ||
      const {
        'PAYMENT_SUBMITTED', 'SUBMITTED', 'PENDING_VERIFICATION', 'UNDER_REVIEW',
      }.contains(status);
}

/// Earliest `submittedAt` across SUBMITTED receipts, else the payment's own
/// `submittedAt` (web `getPaymentReviewSubmittedAt`: Math.min of the receipts).
DateTime? getPaymentReviewSubmittedAt(Map<String, dynamic> payment) {
  final receipts = (payment['receipts'] as List?) ?? const [];
  DateTime? earliest;
  for (final r in receipts) {
    if (r is! Map) continue;
    if (_normalize(r['status']?.toString()) != 'SUBMITTED') continue;
    final t = _timestamp(r['submittedAt']?.toString());
    if (t != null && (earliest == null || t.isBefore(earliest))) earliest = t;
  }
  return earliest ?? _timestamp(payment['submittedAt']?.toString());
}

/// True once a submitted proof has waited past the 30-minute review SLA — web
/// `isPaymentReviewOverdue` (lib/payment-timing.ts:59-67). The backend's
/// explicit `overdue` flag wins when present; otherwise the submittedAt+30min
/// derivation kicks in, so reviewers/buyers still see OVERDUE when the server
/// has not stamped it.
bool isPaymentReviewOverdue(Map<String, dynamic> payment, {DateTime? nowUtc}) {
  if (!isPaymentPendingReview(payment)) return false;
  final flagged = payment['overdue'];
  if (flagged is bool) return flagged;
  final submittedAt = getPaymentReviewSubmittedAt(payment);
  if (submittedAt == null) return false;
  final now = nowUtc ?? DateTime.now().toUtc();
  return now.difference(submittedAt).inMilliseconds >= kPaymentReviewLimitMs;
}

