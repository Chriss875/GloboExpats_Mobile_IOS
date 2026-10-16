import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/dispatch.dart';

void main() {
  test('AU-038: every backend blocker code has an explainer', () {
    for (final code in [
      'NOT_READY_FOR_DISPATCH',
      'ITEM_AVAILABILITY_UNRESOLVED',
      'PRODUCTION_NOT_COMPLETE',
      'NO_TRANSPORTER_ASSIGNED',
      'TRANSPORTER_INACTIVE',
      'TRANSPORT_MODE_MISMATCH',
      'DISPATCH_DETAILS_INCOMPLETE',
      'DISPATCH_TOO_EARLY',
    ]) {
      expect(DispatchBlockers.explainer(code), isNotNull, reason: code);
    }
    expect(DispatchBlockers.explainer(null), isNull);
    // unknown codes pass through rather than crash
    expect(DispatchBlockers.explainer('SOMETHING_NEW'), 'SOMETHING_NEW');
  });

  test('AU-038: explainAll maps a real blocker list', () {
    final lines = DispatchBlockers.explainAll(
        ['NO_TRANSPORTER_ASSIGNED', 'DISPATCH_TOO_EARLY']);
    expect(lines, hasLength(2));
    expect(lines.first, contains('transporter'));
  });

  test('AU-038: availability gate shows only on AWAITING_SELLER_CONFIRMATION', () {
    expect(AvailabilityGate.shouldShow('AWAITING_SELLER_CONFIRMATION'), isTrue);
    expect(
        AvailabilityGate.shouldShow('AWAITING_SELLER_CONFIRMATION',
            escrowPending: true),
        isFalse,
        reason: 'T25: seller cannot even see the order while escrowPending');
    expect(AvailabilityGate.shouldShow('IN_TRANSIT'), isFalse);
  });

  test('AU-038: decline requires a reason', () {
    expect(AvailabilityGate.validateDeclineReason(null), isNotNull);
    expect(AvailabilityGate.validateDeclineReason('   '), isNotNull);
    expect(AvailabilityGate.validateDeclineReason('Out of stock'), isNull);
  });
}
