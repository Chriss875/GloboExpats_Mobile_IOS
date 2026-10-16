import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/delivery_code.dart';

void main() {
  test('AU-039: code card shows only while IN_TRANSIT code present', () {
    final h = DeliveryHandoff.fromOrder(
        {'deliveryCode': '934415', 'status': 'IN_TRANSIT'});
    expect(h.shouldShowCode, isTrue);
    expect(h.code, '934415');
    // sandbox-proven: after DELIVERED backend returns deliveryCode null
    final done = DeliveryHandoff.fromOrder({'deliveryCode': null});
    expect(done.shouldShowCode, isFalse);
  });

  test('AU-039: verify response parsing — wrong code keeps attempts', () {
    // verbatim sandbox response shape
    final r = DeliveryHandoff.verifyResponse({
      'success': false,
      'message': 'INVALID_DELIVERY_CODE',
      'attemptsRemaining': 2,
    });
    expect(r.locked, isFalse);
    expect(r.attemptsRemaining, 2);
    final locked = DeliveryHandoff.verifyResponse({
      'success': false,
      'message': 'INVALID_DELIVERY_CODE',
      'attemptsRemaining': 0,
    });
    expect(locked.locked, isTrue);
  });

  test('AU-039: success verify → delivered, deadline = +48h (T19)', () {
    final ok = DeliveryHandoff.verifyResponse({'status': 'DELIVERED'});
    expect(ok.locked, isFalse);
    final deliveredAt = DateTime.utc(2026, 8, 23, 12, 33, 34);
    final dl = DeliveryHandoff.confirmationDeadline(
        deliveredAt.toIso8601String());
    expect(dl, deliveredAt.add(const Duration(hours: 48)));
  });

  test('AU-039: naive deliveredAt parses as UTC for the deadline math', () {
    // backend emits naive ISO like "2026-08-23T12:33:34.338200991"
    final dl = DeliveryHandoff.confirmationDeadline(
        '2026-08-23T12:33:34.338');
    expect(dl!.isUtc, isTrue);
    expect(dl.day, 25); // +48h -> Aug 25 UTC
  });
}
