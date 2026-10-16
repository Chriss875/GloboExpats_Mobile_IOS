import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/escrow.dart';
import 'package:globoexpats_mobile/domain/time_utils.dart';

void main() {
  test('AU-036: state 2 — submitted under review (escrowPending)', () {
    // Live backend value: payoutStatus defaults to HELD on every order
    // (@Builder.Default), so state 2 must win over the HELD branch.
    final v = Escrow.view(
      orderStatus: 'AWAITING_PAYMENT',
      escrowPending: true,
      paymentStatus: 'PENDING',
      payoutStatus: 'HELD',
      refundStatus: null,
    );
    expect(v.banner, contains('awaiting GloboExpats verification'));
    expect(v.badge, 'Under review');
  });

  test('AU-036: state 3 — confirmed, held, awaiting seller', () {
    final v = Escrow.view(
      orderStatus: 'AWAITING_SELLER_CONFIRMATION',
      escrowPending: false,
      paymentStatus: 'PAID',
      payoutStatus: 'HELD',
      refundStatus: null,
    );
    expect(v.banner, 'Payment confirmed - awaiting seller');
    expect(v.badge, 'Held by GloboExpats');
  });

  test('AU-036: delivered still HELD until admin releases', () {
    final v = Escrow.view(
      orderStatus: 'DELIVERED',
      escrowPending: false,
      paymentStatus: 'PAID',
      payoutStatus: 'HELD',
      refundStatus: null,
    );
    expect(v.banner, contains('confirm receipt'));
  });

  test('AU-036: released and refunded states', () {
    final rel = Escrow.view(
      orderStatus: 'COMPLETED',
      escrowPending: false,
      paymentStatus: 'PAID',
      payoutStatus: 'RELEASED',
      refundStatus: null,
    );
    expect(rel.badge, 'Released');

    // sandbox-proven refund fixture: REFUNDED with amount 72000
    final ref = Escrow.view(
      orderStatus: 'CANCELLED',
      escrowPending: false,
      paymentStatus: 'REFUNDED',
      payoutStatus: 'HELD',
      refundStatus: 'REFUNDED',
      refundAmount: 72000,
    );
    expect(ref.banner, 'Refunded · TSh 72000');
  });

  test('AU-037 D2: REFUND_PENDING on a cancelled order is visible', () {
    // sandbox-proven fixture: CANCELLED + refundStatus=REFUND_PENDING,
    // refundAmount 16000, payoutStatus HELD — the banner must not be empty
    // (reference renders getRefundStatusLabel() = 'Refund pending').
    final v = Escrow.view(
      orderStatus: 'CANCELLED',
      escrowPending: false,
      paymentStatus: 'PAID',
      payoutStatus: 'HELD',
      refundStatus: 'REFUND_PENDING',
      refundAmount: 16000,
    );
    expect(v.banner, contains('refund pending'));
    expect(v.badge, 'Refund pending');
    expect(v.tone, 'warning');
  });

  test('AU-036 T25: seller cannot see escrowPending order', () {
    expect(Escrow.sellerCanSeeOrder(escrowPending: true), isFalse);
    expect(Escrow.sellerCanSeeOrder(escrowPending: false), isTrue);
  });

  test('AU-036: correction deadline precedence (explicit > rejected+48h > receipts+48h)', () {
    final explicit =
        TimeUtils.parseBackendTimestamp('2026-08-25T10:00:00Z');
    expect(
      Escrow.correctionDeadline(explicitDeadline: explicit.toIso8601String()),
      explicit,
    );
    // rejectedAt + 48h
    final rej = DateTime.utc(2026, 8, 20, 12, 0, 0);
    final dl = Escrow.correctionDeadline(rejectedAt: rej.toIso8601String());
    expect(dl, rej.add(const Duration(hours: 48)));
    // later receipt stamp wins over rejectedAt
    final receipt = DateTime.utc(2026, 8, 21, 8, 0, 0);
    final dl2 = Escrow.correctionDeadline(
      rejectedAt: rej.toIso8601String(),
      receiptStamps: [receipt.toIso8601String()],
    );
    expect(dl2, receipt.add(const Duration(hours: 48)));
  });
}
