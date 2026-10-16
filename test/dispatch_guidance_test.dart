import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/dispatch.dart';

/// "in completed orders i still see it says dispatch window has passed".
///
/// The backend keeps returning `dispatchBlockers` and the delivery window
/// after an order is done, and the detail page rendered both whenever they
/// were present. So a finished order still carried "It is too early to
/// dispatch this order" and an unlock countdown for a window long gone.
void main() {
  group('dispatch guidance', () {
    test('applies while the goods are still with the seller', () {
      for (final status in [
        'PAID',
        'AWAITING_DELIVERY',
        'AWAITING_BUYER_CONFIRMATION',
        'SELLER_PREPARING_ORDER',
        'SCHEDULED',
        'READY_FOR_DISPATCH',
        'AWAITING_DISPATCH',
      ]) {
        expect(dispatchGuidanceApplies(status), isTrue, reason: status);
      }
    });

    test('stops the moment the order leaves the seller', () {
      for (final status in [
        'IN_TRANSIT',
        'DELIVERED',
        'PICKED_UP',
        'COMPLETED',
        'CANCELLED',
        'FAILED',
        'EXPIRED',
      ]) {
        expect(dispatchGuidanceApplies(status), isFalse,
            reason: '$status: dispatch is behind this order, not ahead of it');
      }
    });

    test('reads a status however it is spelled', () {
      expect(dispatchGuidanceApplies('ready-for-dispatch'), isTrue);
      expect(dispatchGuidanceApplies('  awaiting delivery '), isTrue);
      expect(dispatchGuidanceApplies(null), isFalse);
      expect(dispatchGuidanceApplies(''), isFalse);
    });
  });
}
