/// FINANC-04/D-4/D-5: buyer payment-recovery model.
///
/// Pure port of the web's `lib/buyer-payment-recovery.ts`. Shared by the
/// order-detail payment banners and the "Pay now" / "Upload new proof" CTAs.
/// These helpers only READ payment state — they never move money.
library;

String _norm(dynamic v) => (v ?? '').toString().trim().toUpperCase();

/// `paymentRecoveryState`: 'pending_payment' | 'under_review' | 'rejected' |
/// 'verified' | 'expired' — web `getBuyerPaymentRecoveryState`.
///
/// Precedence is load-bearing (web comment): a replacement SUBMITTED receipt
/// outranks an older REJECTED one, so a corrected payment is never left in
/// "action required".
String buyerPaymentRecoveryState({
  String? status,
  List<Map<String, dynamic>> receipts = const [],
}) {
  final s = _norm(status);
  final receiptStatuses = [
    for (final r in receipts) _norm(r['status']),
  ];
  if (const ['CONFIRMED', 'VERIFIED'].contains(s)) return 'verified';
  if (const ['EXPIRED', 'CANCELLED'].contains(s)) return 'expired';
  if (receiptStatuses.contains('SUBMITTED')) return 'under_review';
  if (s == 'REJECTED' || receiptStatuses.contains('REJECTED')) {
    return 'rejected';
  }
  if (const [
    'PAYMENT_SUBMITTED',
    'SUBMITTED',
    'PENDING_VERIFICATION',
    'UNDER_REVIEW'
  ].contains(s)) {
    return 'under_review';
  }
  return 'pending_payment';
}

/// Rejection reasons from the REJECTED receipts (old audit rows survive a
/// correction), each with the web's missing-reason fallback.
List<String> paymentRejectionReasons({
  String? status,
  List<Map<String, dynamic>> receipts = const [],
}) =>
    [
      for (final r in receipts)
        if (_norm(r['status']) == 'REJECTED')
          (r['rejectionReason']?.toString().trim().isNotEmpty ?? false)
              ? r['rejectionReason'].toString().trim()
              : 'No reason was provided. Contact support.',
    ];

/// Web `findPaymentForOrder`: locate the buyer-payment row behind this order
/// by proforma id first, then by any order id the row lists.
Map<String, dynamic>? findPaymentForOrder(
  List<Map<String, dynamic>> payments,
  String orderId,
  String? proformaId,
) {
  final orderKey = orderId;
  final proformaKey = proformaId ?? '';
  for (final payment in payments) {
    final pid = (payment['proformaId'] ?? '').toString();
    if (proformaKey.isNotEmpty && pid == proformaKey) return payment;
    final orderIds = payment['orderIds'];
    if (orderIds is List && orderIds.any((id) => id.toString() == orderKey)) {
      return payment;
    }
  }
  return null;
}

/// Receipt list from a payments row or embedded summary (aliases both spell).
List<Map<String, dynamic>> paymentReceiptsOf(Map<String, dynamic> summary) {
  final raw = summary['receipts'] ?? summary['paymentReceipts'] ?? const [];
  if (raw is! List) return const [];
  return [
    for (final r in raw)
      if (r is Map) r.cast<String, dynamic>(),
  ];
}

/// Humanized enum label — web `formatOrderEnumLabel` ('MOBILE_MONEY' →
/// 'Mobile money').
String formatOrderEnumLabel(dynamic v) {
  final s = (v ?? '').toString().trim().replaceAll('_', ' ');
  if (s.isEmpty) return s;
  return s[0].toUpperCase() + s.substring(1).toLowerCase();
}
