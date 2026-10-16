import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/countdown.dart';
import 'package:globoexpats_mobile/domain/time_utils.dart';

void main() {
  final now = DateTime.utc(2026, 8, 23, 12, 0, 0);

  test('AU-031: remaining time and HH:MM:SS format', () {
    final exp = now.add(const Duration(minutes: 42, seconds: 13));
    expect(Countdown.remaining(exp, now), const Duration(minutes: 42, seconds: 13));
    expect(Countdown.format(const Duration(minutes: 42, seconds: 13)), '00:42:13');
    expect(Countdown.format(const Duration(hours: 2)), '02:00:00');
    // past -> clamped at zero
    expect(
        Countdown.format(const Duration(hours: -1).abs()), isNot('00:00:00'));
  });

  test('AU-031: urgent styling under 3h threshold', () {
    expect(Countdown.isUrgent(const Duration(hours: 2, minutes: 59)), isTrue);
    expect(Countdown.isUrgent(const Duration(hours: 3)), isFalse);
    expect(Countdown.isUrgent(Duration.zero), isFalse);
  });

  test('AU-031: countdown hidden once status != PENDING_PAYMENT', () {
    expect(Countdown.visibleForStatus('PENDING_PAYMENT'), isTrue);
    expect(Countdown.visibleForStatus('PAYMENT_SUBMITTED'), isFalse);
    expect(Countdown.visibleForStatus('CONFIRMED'), isFalse);
    expect(Countdown.visibleForStatus('EXPIRED'), isFalse);
    expect(Countdown.visibleForStatus(null), isFalse);
  });

  test('AU-031: proformaLabel renders only for live pending proformas', () {
    final expiresAt = TimeUtils.parseBackendTimestamp('2026-08-23T12:42:13Z');
    final label = Countdown.proformaLabel(
      proformaStatus: 'PENDING_PAYMENT',
      expiresAt: expiresAt.toIso8601String(),
      nowUtc: now,
    );
    expect(label, 'Complete payment within 00:42:13');

    // submitted hides it even with a future expiry (review pauses expiry)
    expect(
      Countdown.proformaLabel(
        proformaStatus: 'PAYMENT_SUBMITTED',
        expiresAt: expiresAt.toIso8601String(),
        nowUtc: now,
      ),
      isNull,
    );

    // Expired instant -> web parity: the buyer is TOLD the reservation is
    // gone rather than the timer silently disappearing (PaymentCountdown's
    // expired state). It used to return null here.
    expect(
      Countdown.proformaLabel(
        proformaStatus: 'PENDING_PAYMENT',
        expiresAt: now.subtract(const Duration(minutes: 1)).toIso8601String(),
        nowUtc: now,
      ),
      contains('reserved items were released'),
    );
  });

  test('AU-031: T9 vector — expiresAt == createdAt + 60min', () {
    // sandbox-proven pair from the curl probe (PF-2026-000024)
    final created =
        TimeUtils.parseBackendTimestamp('2026-08-23T12:30:34.105351Z');
    final expires =
        TimeUtils.parseBackendTimestamp('2026-08-23T13:30:34.105351Z');
    final diff = expires.difference(created);
    expect(diff.inSeconds - 3600, lessThanOrEqualTo(10));
    expect(3600 - diff.inSeconds, lessThanOrEqualTo(10));
  });
}
