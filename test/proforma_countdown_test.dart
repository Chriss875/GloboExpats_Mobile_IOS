import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/countdown.dart';

void main() {
  final now = DateTime.utc(2026, 3, 1, 9);
  ProformaCountdownState? state(String status, DateTime expires) =>
      Countdown.proformaState(
        proformaStatus: status,
        expiresAt: expires.toIso8601String(),
        nowUtc: now,
      );

  group('proforma countdown states (web parity PaymentCountdown)', () {
    test('a comfortable deadline just counts down', () {
      final s = state('PENDING_PAYMENT', now.add(const Duration(hours: 5)))!;
      expect(s.tone, CountdownTone.normal);
      expect(s.title, 'Proforma invoice expires');
      expect(s.label, startsWith('Complete payment within'));
    });

    test('under three hours it turns urgent, like web', () {
      final s = state('PENDING_PAYMENT', now.add(const Duration(hours: 2)))!;
      expect(s.tone, CountdownTone.urgent);
      expect(s.title, 'Proforma invoice expiring soon');
    });

    test('an expired invoice SAYS so instead of the timer vanishing', () {
      // Previously this returned null, so the buyer lost the reservation with
      // no explanation at all.
      final s = state('PENDING_PAYMENT', now.subtract(const Duration(minutes: 1)))!;
      expect(s.tone, CountdownTone.expired);
      expect(s.title, 'Proforma invoice has expired');
      expect(s.label, contains('reserved items were released'));
      expect(s.label, contains('re-order'));
    });

    test('once payment is submitted the timer is hidden (expiry paused)', () {
      expect(state('PAYMENT_SUBMITTED', now.add(const Duration(hours: 5))), isNull);
      expect(state('CONFIRMED', now.add(const Duration(hours: 5))), isNull);
      expect(state('CANCELLED', now.add(const Duration(hours: 5))), isNull);
    });

    test('a missing expiry renders nothing rather than guessing', () {
      expect(
          Countdown.proformaState(
              proformaStatus: 'PENDING_PAYMENT', expiresAt: null, nowUtc: now),
          isNull);
    });

    test('the old label helper still answers for existing callers', () {
      expect(
          Countdown.proformaLabel(
              proformaStatus: 'PENDING_PAYMENT',
              expiresAt: now.add(const Duration(hours: 5)).toIso8601String(),
              nowUtc: now),
          startsWith('Complete payment within'));
    });
  });
}
