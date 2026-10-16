import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/order_journey.dart';

/// "Outside the order I have a journey of 4 steps / Inside the order I have a
/// journey of 6 steps."
///
/// The order card showed the desktop's four-step journey while the order's
/// own page put the six-step lifecycle timeline under the heading "Order
/// tracking" — so one order looked like it was on two different journeys
/// depending on where you looked at it. On the desktop, "Order tracking"
/// (`app/orders/[id]/page.tsx:1191`) renders the SAME four-step rail as the
/// card; the six-step timeline is a separate block further down the page.
void main() {
  OrderJourney buyer(String status,
          {bool detailed = false,
          bool pickup = false,
          String? transporter,
          String? window,
          bool making = false}) =>
      buildOrderJourney(
        status: status,
        selling: false,
        pickup: pickup,
        detailed: detailed,
        transporterName: transporter,
        deliveryWindowLabel: window,
        productionAwaitingCompletion: making,
      );

  OrderJourney seller(String status, {bool detailed = false}) =>
      buildOrderJourney(
          status: status, selling: true, pickup: false, detailed: detailed);

  group('one order, one journey', () {
    test('the buyer sees the same four steps inside and outside', () {
      final card = buyer('IN_TRANSIT');
      final inside = buyer('IN_TRANSIT', detailed: true);

      expect(card.steps.map((s) => s.label).toList(), const [
        'Seller confirms',
        'Preparing order',
        'Out for delivery',
        'Delivered',
      ]);
      expect(inside.steps.map((s) => s.label).toList(),
          card.steps.map((s) => s.label).toList());
      expect(inside.index, card.index,
          reason: 'the same order cannot be at step 3 of 4 on one screen and '
              'somewhere else on another');
    });

    test('inside the order each step explains itself', () {
      final card = buyer('PAID');
      final inside = buyer('PAID', detailed: true);

      expect(card.steps.every((s) => s.detail == null), isTrue,
          reason: 'the card has no room for it, like the desktop card');
      expect(
          inside.steps[0].detail, 'Waiting for the seller to confirm the item');
      expect(inside.steps[1].detail, 'The seller is preparing your order');
    });

    test(
        "a named transporter is named, and the delivery window is the "
        'arrival line', () {
      final inside = buyer('IN_TRANSIT',
          detailed: true,
          transporter: 'Juma Kessy',
          window: '19 Sep Morning (10:00–12:00)');
      expect(inside.steps[2].detail, 'Juma Kessy is bringing your order');
      expect(inside.steps[3].detail, '19 Sep Morning (10:00–12:00)');

      final anonymous = buyer('IN_TRANSIT', detailed: true);
      expect(anonymous.steps[2].detail, 'Your order is travelling to you');
      expect(anonymous.steps[3].detail, 'Your order has arrived');
    });

    test('a made-to-order item says so on the preparing step', () {
      expect(buyer('PAID', detailed: true, making: true).steps[1].detail,
          'The seller is making your item');
    });
  });

  group('the seller rail', () {
    test('the card leads with Payment secured, the order page does not', () {
      expect(seller('PAID').steps.first.label, 'Payment secured');
      expect(seller('PAID').steps.length, 5);

      // Web `sellerJourneySteps` on the detail page drops it: by the time a
      // sale has its own page, it is paid.
      expect(
          seller('PAID', detailed: true).steps.first.label, 'Seller confirms');
      expect(seller('PAID', detailed: true).steps.length, 4);
    });

    test('both rails point at the same real stage', () {
      for (final status in ['PAID', 'IN_TRANSIT', 'DELIVERED']) {
        expect(seller(status).index, seller(status, detailed: true).index + 1,
            reason: 'the card rail is the detail rail plus the payment step');
      }
    });

    test('the seller reads their own instruction, not the buyer copy', () {
      final inside = seller('AWAITING_SELLER_CONFIRMATION', detailed: true);
      expect(inside.steps[0].detail, 'Confirm the item before preparing it');
      expect(inside.steps[1].detail, 'Prepare the complete order for handover');
    });
  });

  group('pickup orders', () {
    test('only the order page renames the handover steps', () {
      final card = buyer('AWAITING_PICKUP', pickup: true);
      expect(card.steps[2].label, 'Out for delivery',
          reason: 'web getBuyerOrderTransport swaps the icon, not the copy');

      final inside = buyer('AWAITING_PICKUP', pickup: true, detailed: true);
      expect(inside.steps[2].label, 'Ready for collection');
      expect(inside.steps[3].label, 'Collected');
      expect(inside.steps[2].detail, 'Your item is packed and waiting for you');
    });
  });

  group('where the order has got to', () {
    test('a transporter lined up is still "Preparing order"', () {
      for (final status in [
        'AWAITING_DELIVERY',
        'SELLER_PREPARING_ORDER',
        'READY_FOR_DISPATCH',
        'AWAITING_DISPATCH',
        'SCHEDULED',
      ]) {
        expect(buyer(status).index, 1, reason: '$status: nothing has left yet');
      }
    });

    test('in transit, delivered and completed', () {
      expect(buyer('IN_TRANSIT').index, 2);
      expect(buyer('DELIVERED').index, 3);
      expect(buyer('COMPLETED').index, 3);
      expect(buyer('PICKED_UP').index, 3);
    });

    test('a cancelled order is flagged rather than placed on the rail', () {
      for (final status in ['CANCELLED', 'FAILED', 'EXPIRED']) {
        expect(buyer(status).cancelled, isTrue);
      }
      expect(buyer('IN_TRANSIT').cancelled, isFalse);
    });
  });
}
