import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/payment_timing.dart';

void main() {
  test('moves a submitted payment to overdue after 30 minutes', () {
    final payment = <String, dynamic>{
      'status': 'PAYMENT_SUBMITTED',
      'submittedAt': '2026-08-04T09:00:00Z',
    };
    expect(
        isPaymentReviewOverdue(payment,
            nowUtc: DateTime.utc(2026, 8, 4, 9, 29, 59)),
        isFalse);
    expect(
        isPaymentReviewOverdue(payment,
            nowUtc: DateTime.utc(2026, 8, 4, 9, 30, 0)),
        isTrue);
  });

  test('treats backend LocalDateTime payment timestamps as UTC', () {
    final payment = <String, dynamic>{
      'status': 'PAYMENT_SUBMITTED',
      'submittedAt': '2026-08-08T19:52:15.215714',
    };
    expect(
        isPaymentReviewOverdue(payment,
            nowUtc: DateTime.utc(2026, 8, 8, 19, 58, 24)),
        isFalse);
    expect(
        isPaymentReviewOverdue(payment,
            nowUtc: DateTime.utc(2026, 8, 8, 20, 22, 15, 216)),
        isTrue);
  });

  test('uses the backend overdue decision when it is supplied', () {
    expect(
        isPaymentReviewOverdue(<String, dynamic>{
          'status': 'PAYMENT_SUBMITTED',
          'submittedAt': '2026-08-08T10:00:00',
          'overdue': false,
        }, nowUtc: DateTime.utc(2026, 8, 8, 20, 0, 0)),
        isFalse);
    expect(
        isPaymentReviewOverdue(<String, dynamic>{
          'status': 'PAYMENT_SUBMITTED',
          'submittedAt': '2026-08-08T10:00:00',
          'overdue': true,
        }, nowUtc: DateTime.utc(2026, 8, 8, 10, 5, 0)),
        isTrue);
  });

  test('does not classify approved or rejected payments as overdue', () {
    const submittedAt = '2026-08-04T09:00:00Z';
    final now = DateTime.utc(2026, 8, 4, 12, 0, 0);
    expect(
        isPaymentReviewOverdue(
            <String, dynamic>{'status': 'CONFIRMED', 'submittedAt': submittedAt},
            nowUtc: now),
        isFalse);
    expect(
        isPaymentReviewOverdue(
            <String, dynamic>{'status': 'REJECTED', 'submittedAt': submittedAt},
            nowUtc: now),
        isFalse);
    expect(
        isPaymentReviewOverdue(
            <String, dynamic>{'status': 'VERIFIED', 'submittedAt': submittedAt},
            nowUtc: now),
        isFalse);
  });

  test('earliest SUBMITTED receipt stamp drives the overdue clock', () {
    // The web takes Math.min across SUBMITTED receipts before falling back to
    // the payment-level submittedAt.
    final payment = <String, dynamic>{
      'status': 'PAYMENT_SUBMITTED',
      'submittedAt': '2026-08-04T08:00:00Z',
      'receipts': [
        {'status': 'SUBMITTED', 'submittedAt': '2026-08-04T09:00:00Z'},
        {'status': 'SUBMITTED', 'submittedAt': '2026-08-04T09:10:00Z'},
      ],
    };
    // 9:29:59 -> within 30min of the EARLIEST receipt (9:00), still pending.
    expect(
        isPaymentReviewOverdue(payment,
            nowUtc: DateTime.utc(2026, 8, 4, 9, 29, 59)),
        isFalse);
    expect(
        isPaymentReviewOverdue(payment,
            nowUtc: DateTime.utc(2026, 8, 4, 9, 30, 0)),
        isTrue);
  });
}
