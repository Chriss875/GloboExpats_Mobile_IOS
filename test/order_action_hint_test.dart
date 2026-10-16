import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/order_action_hint.dart';

/// Phase 3: what each side should do next about an order. Port of the web
/// `getOrderActionHint`, which mobile had no equivalent of — it showed where
/// an order *was* but never whether it was waiting on you.
void main() {
  OrderActionHint? buyer(String status, {String? fulfillment}) =>
      getOrderActionHint(status, 'buyer', fulfillmentType: fulfillment);
  OrderActionHint? seller(String status,
          {String? fulfillment, bool? canDispatch, String? blockedReason}) =>
      getOrderActionHint(status, 'seller',
          fulfillmentType: fulfillment,
          canDispatch: canDispatch,
          dispatchBlockedReason: blockedReason);

  group('the two sides are told different things about one status', () {
    test('awaiting seller confirmation', () {
      expect(seller('AWAITING_SELLER_CONFIRMATION')!.cta, 'Confirm availability');
      expect(seller('AWAITING_SELLER_CONFIRMATION')!.actionable, isTrue);
      // The buyer can only wait.
      expect(buyer('AWAITING_SELLER_CONFIRMATION')!.cta, isNull);
      expect(buyer('AWAITING_SELLER_CONFIRMATION')!.actionable, isFalse);
    });

    test('in transit — the seller enters the code, the buyer shows it', () {
      expect(seller('IN_TRANSIT')!.cta, 'Confirm delivery');
      expect(buyer('IN_TRANSIT')!.cta, 'View delivery code');
    });

    test('delivered — the buyer rates, the seller waits', () {
      expect(buyer('DELIVERED')!.cta, 'Rate Seller');
      expect(seller('DELIVERED')!.cta, isNull);
      expect(seller('DELIVERED')!.tone, HintTone.success);
    });
  });

  group('pickup orders never mention a driver', () {
    test('the seller waits for collection instead of assigning one', () {
      expect(seller('PAID', fulfillment: 'BUYER_PICKUP')!.cta, isNull);
      expect(seller('PAID', fulfillment: 'BUYER_PICKUP')!.label,
          contains('pick up'));
      expect(seller('PAID')!.cta, 'Assign rider');
    });

    test('the buyer is told it is being prepared for pickup', () {
      expect(buyer('PAID', fulfillment: 'BUYER_PICKUP')!.label,
          contains('pickup'));
      expect(buyer('PAID')!.label, contains('delivery'));
    });
  });

  group('a withheld dispatch explains itself', () {
    test('a timing lock keeps the button, greyed', () {
      final hint = seller('READY_FOR_DISPATCH',
          canDispatch: false, blockedReason: 'DISPATCH_TOO_EARLY')!;
      // Hiding it would read as "broken" rather than "not yet". Web keeps ONE
      // CTA across all four seller dispatch statuses: "Assign rider".
      expect(hint.cta, 'Assign rider');
      expect(hint.disabled, isTrue);
      expect(hint.actionable, isFalse);
      expect(hint.tone, HintTone.info);
      expect(hint.label, contains('too early'));
    });

    test('a fixable blocker withholds the button and warns', () {
      final hint = seller('READY_FOR_DISPATCH',
          canDispatch: false, blockedReason: 'NO_TRANSPORTER_ASSIGNED')!;
      expect(hint.cta, isNull);
      expect(hint.tone, HintTone.warning);
      expect(hint.label, contains('transporter'));
    });

    test('an unknown blocker still says something useful', () {
      final hint =
          seller('READY_FOR_DISPATCH', canDispatch: false, blockedReason: 'MYSTERY')!;
      expect(hint.cta, isNull);
      // Web's fallback copy for an unrecognised blocker.
      expect(hint.label, contains('Complete delivery setup'));
    });

    test('an absent canDispatch flag never strips the button', () {
      // Only an explicit false withholds it, so a backend that omits the flag
      // cannot silently disable dispatch.
      expect(seller('READY_FOR_DISPATCH')!.cta, 'Assign rider');
      expect(seller('READY_FOR_DISPATCH')!.actionable, isTrue);
    });

    test('a pickup order is never blocked on a rider it does not need', () {
      // Web guards the whole blocked branch with `&& !isPickup`.
      final hint = seller('READY_FOR_DISPATCH',
          fulfillment: 'BUYER_PICKUP',
          canDispatch: false,
          blockedReason: 'NO_TRANSPORTER_ASSIGNED')!;
      expect(hint.cta, isNull);
      expect(hint.label, contains('pick up'));
      expect(hint.disabled, isFalse);
    });
  });

  group('status handling', () {
    test('normalises spacing, hyphens and case', () {
      expect(buyer('in transit')!.cta, 'View delivery code');
      expect(buyer('IN-TRANSIT')!.cta, 'View delivery code');
    });

    test('a status with nothing to do returns no hint', () {
      expect(buyer('COMPLETED'), isNull);
      expect(seller('CANCELLED'), isNull);
      expect(buyer(''), isNull);
    });

    test('buyer-only and seller-only statuses stay on their own side', () {
      expect(buyer('PICKED_UP')!.cta, 'Confirm received');
      expect(seller('PICKED_UP'), isNull);
      expect(buyer('AWAITING_PICKUP')!.actionable, isFalse);
    });
  });
}
