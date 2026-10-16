import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/domain/dispatch_errors.dart';
import 'package:globoexpats_mobile/domain/production_time.dart';
import 'package:globoexpats_mobile/models/order.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/orders_screen.dart';
import 'package:globoexpats_mobile/widgets/delivery_journey.dart';
import 'package:globoexpats_mobile/widgets/order_status_timeline.dart';

/// Redesign: [OrderStatusTimeline] renders its step logic through the shared
/// [DeliveryJourney] rail rather than its own numbered/checkmarked circles.
/// Reading `currentIndex`/`cancelled` off the mounted widget verifies exactly
/// the same status-matching business logic the old checkmark-counting
/// assertions did, without depending on which icon happens to be drawn.
DeliveryJourney _journey(WidgetTester tester) =>
    tester.widget<DeliveryJourney>(find.byType(DeliveryJourney));

MockClient _ordersClient() => MockClient((request) async {
      // ignore: avoid_print
      print('REQ ${request.url.path}');
      if (request.url.path == '/api/v1/orders') {
        return http.Response(
          jsonEncode([
            {
              'orderId': 'o-1',
              'orderNumber': 'ORD-1001',
              'status': 'PENDING_PAYMENT',
              'paymentStatus': 'PENDING',
              'totalAmount': 167000,
              'currency': 'TZS',
              'sellerName': 'Radha Saindrane',
              'createdAt': '2026-08-20T10:00:00',
            },
            {
              'orderId': 'o-2',
              'orderNumber': 'ORD-1002',
              'status': 'DELIVERED',
              'paymentStatus': 'PAID',
              'totalAmount': 120000,
              'currency': 'TZS',
              'sellerName': 'Another Seller',
              'createdAt': '2026-08-18T10:00:00',
            },
          ]),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path == '/api/v1/orders/o-1') {
        return http.Response(
          jsonEncode({
            'orderId': 'o-1',
            'orderNumber': 'ORD-1001',
            'status': 'PENDING_PAYMENT',
            'paymentStatus': 'PENDING',
            'escrowPending': true,
            'subtotal': 150000,
            'deliveryFee': 17000,
            'totalAmount': 167000,
            'currency': 'TZS',
            'sellerName': 'Radha Saindrane',
            'deliveryAddress': '44 Pazi St',
            'deliveryCity': 'Dar es Salaam',
            'deliveryMethod': 'DELIVERY',
            'fulfillmentType': 'SELLER_DELIVERY',
            'items': [
              {
                'orderItemId': 13,
                'productId': 615,
                'productName': 'LANCÔME PARIS La vie est belle',
                'quantity': 2,
                'price': 626000.0,
                'image': 'uploads/x.webp',
                'selectedChoices': [
                  {
                    'definitionId': 15,
                    'attributeName': 'Pack Size',
                    'valueId': 'v1',
                    'valueLabel': 'Single',
                  },
                ],
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path == '/api/v1/orders/o-3/confirm-receipt') {
        // Probed sandbox behavior: already-rated → 409 ALREADY_RATED.
        return http.Response(
          jsonEncode({
            'success': false,
            'errorCode': 'ALREADY_RATED',
            'message': 'You have already rated this user for this order.',
          }),
          409,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path == '/api/v1/orders/o-4') {
        // Selling order at the stock gate.
        return http.Response(
          jsonEncode({
            'orderId': 'o-4',
            'orderNumber': 'ORD-1004',
            'status': 'AWAITING_SELLER_CONFIRMATION',
            'paymentStatus': 'PAID',
            'escrowPending': false,
            'totalAmount': 60000,
            'currency': 'TZS',
            'orderType': 'selling',
            'fulfillmentType': 'SELLER_DELIVERY',
            'buyerName': 'Gate Buyer',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path == '/api/v1/orders/o-3' ||
          request.url.path.startsWith('/api/v1/orders/o-3/')) {
        // DELIVERED buying order → buyer-actionable (Confirm Received shows).
        return http.Response(
          jsonEncode({
            'orderId': 'o-3',
            'orderNumber': 'ORD-1003',
            'status': 'DELIVERED',
            'paymentStatus': 'PAID',
            'payoutStatus': 'HELD',
            'escrowPending': false,
            'totalAmount': 90000,
            'currency': 'TZS',
            'orderType': 'buying',
            'fulfillmentType': 'SELLER_DELIVERY',
            'sellerName': 'Third Seller',
            'buyerRated': false,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

/// Returns one order detail for `/api/v1/orders/{orderId}`; everything else 404s.
MockClient _detailClient(String orderId, Map<String, dynamic> body) =>
    MockClient((request) async {
      if (request.url.path == '/api/v1/orders/$orderId') {
        return http.Response(jsonEncode(body), 200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 404);
    });

Map<String, dynamic> _tripOrder(String id, String status, {bool selling = false}) => {
      'orderId': id,
      'orderNumber': 'ORD-$id',
      'status': status,
      'orderType': selling ? 'selling' : 'buying',
      'fulfillmentType': 'SELLER_DELIVERY',
      'totalAmount': 45000,
      'currency': 'TZS',
      if (status == 'AWAITING_BUYER_CONFIRMATION')
        'trip': {
          'proposedDeliveryTime': '2026-09-10T08:00:00.000Z',
          'deliveryTimeStatus': 'PROPOSED',
          'transporter': {
            'fullName': 'Juma Ali',
            'phoneNumber': '+255700000000',
          },
        },
    };

void main() {
  testWidgets('orders list renders order numbers, statuses and amounts',
      (tester) async {
    final api = ApiClient(client: _ordersClient());
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(
      MaterialApp(home: OrdersScreen(auth: auth, api: api)),
    );
    await tester.pumpAndSettle();

    // The list opens on "Ongoing & overdue" (web parity), so the delivered
    // order lives under Completed rather than alongside the active one.
    expect(find.text('ORD-1001'), findsOneWidget);
    expect(find.text('Total: TSh 167,000'), findsOneWidget);

    // Web parity: the list rows carry NO status pill — the journey rail, the
    // hint line and the CTA already say where the order is, so repeating it
    // beside the title was noise. The role-appropriate wording itself is
    // still covered by the label-map group below and still shown on the
    // order DETAIL screen's meta summary.
    expect(find.textContaining('awaiting GloboExpats verification'),
        findsNothing); // raw enum never leaks to buyer wording
    expect(find.text('PENDING PAYMENT'), findsNothing);

    await tester.tap(find.text('Completed'));
    await tester.pumpAndSettle();
    expect(find.text('ORD-1002'), findsOneWidget);
    expect(find.text('Total: TSh 120,000'), findsOneWidget);
    expect(find.text('Delivered - confirm received'), findsNothing);
    // Web parity `getOrderActionHint`: the list card now surfaces the same
    // "what to do next" hint the detail screen shows, not just the status.
    expect(find.text('Delivered! Rate the seller to complete your order.'),
        findsOneWidget);
  });

  testWidgets('order detail shows totals, address and escrow state',
      (tester) async {
    final api = ApiClient(client: _ordersClient());
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(orderId: 'o-1', token: 'jwt', api: api),
    ));
    await tester.pumpAndSettle();

    // Redesign: the detail page's own title moved into the metadata card's
    // "Order number" cell, and it now carries the same '#' prefix as the web
    // reference's Order ID.
    expect(find.text('#ORD-1001'), findsOneWidget);
    // The AU-035 line-items section grew the detail page, so the escrow block
    // sits below the fold — scroll the payment section into view first.
    await tester.scrollUntilVisible(find.text('Payment:'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('44 Pazi St'), findsOneWidget);
    // AU-036 §8 state 2: submitted under review banner replaces raw status text
    expect(find.textContaining('awaiting GloboExpats verification'), findsOneWidget);
  });

  test('Order detail parses items[] with selected-choice labels (AU-035)', () {
    final o = Order.fromJson({
      'orderId': 'o-det',
      'orderNumber': 'ORD-2001',
      'status': 'IN_TRANSIT',
      'subtotal': 626000,
      'deliveryFee': 4000,
      'totalAmount': 630000,
      'currency': 'TZS',
      'items': [
        {
          'orderItemId': 13,
          'productId': 615,
          'productName': 'LANCÔME PARIS La vie est belle',
          'quantity': 2,
          'price': 626000.0,
          'image': 'uploads/x.webp',
          'selectedChoices': [
            {'definitionId': 15, 'attributeName': 'Pack Size', 'valueId': 'v1', 'valueLabel': 'Single'},
            {'definitionId': 16, 'attributeName': '', 'valueId': 'v2', 'valueLabel': 'Gift wrap'},
          ],
        },
      ],
    });
    expect(o.items, hasLength(1));
    final item = o.items.single;
    expect(item.productId, 615);
    expect(item.productName, contains('LANCÔME'));
    expect(item.quantityLabel, '2 × TSh 626,000');
    expect(item.choiceLabels, ['Pack Size: Single', 'Gift wrap']);
  });

  test('Order list rows without items parse to empty (no crash)', () {
    final o = Order.fromJson({'orderId': 'o-1', 'status': 'PAID'});
    expect(o.items, isEmpty);
  });

  test('AU-034: status groups — ongoing/overdue/completed/cancelled', () {
    Order mk(String status, {String? dl}) => Order.fromJson({
          'orderId': 'x', 'status': status,
          if (dl != null) 'fulfillmentDeadline': dl,
        });
    // ongoing: future deadline
    final future = DateTime.now().toUtc().add(const Duration(hours: 5)).toIso8601String();
    expect(mk('IN_TRANSIT', dl: future).group, OrderGroup.ongoing);
    // overdue: past deadline, not terminal
    final past = DateTime.now().toUtc().subtract(const Duration(hours: 5)).toIso8601String();
    expect(mk('IN_TRANSIT', dl: past).group, OrderGroup.overdue);
    expect(mk('AWAITING_DELIVERY', dl: past).group, OrderGroup.overdue);
    // completed + legacy CONFIRMED normalize
    expect(mk('COMPLETED', dl: past).group, OrderGroup.completed);
    expect(mk('CONFIRMED').group, OrderGroup.completed);
    // cancelled family
    expect(mk('CANCELLED').group, OrderGroup.cancelled);
    expect(mk('EXPIRED').group, OrderGroup.cancelled);
    expect(mk('FAILED').group, OrderGroup.cancelled);
    // no deadline -> ongoing while active
    expect(mk('PAID').group, OrderGroup.ongoing);
  });

  group('AU-034: overdue deadline fallback chain (BIZLOG-08)', () {
    DateTime utc(int y, int mo, int d, [int h = 0, int mi = 0]) =>
        DateTime.utc(y, mo, d, h, mi);

    test('server deadline chain: fulfillmentDeadline wins over deliveryDeadline',
        () {
      final o = Order.fromJson({
        'orderId': 'x',
        'status': 'PAID',
        'fulfillmentDeadline': '2026-08-01T10:00:00Z',
        'deliveryDeadline': '2026-08-02T10:00:00Z',
      });
      expect(o.deliveryDeadlineUtc, utc(2026, 8, 1, 10));
    });

    test('deliveryDueAt / promisedDeliveryAt join the explicit chain', () {
      expect(
        Order.fromJson({
          'orderId': 'x',
          'status': 'PAID',
          'deliveryDueAt': '2026-08-03T09:00:00Z',
        }).deliveryDeadlineUtc,
        utc(2026, 8, 3, 9),
      );
      expect(
        Order.fromJson({
          'orderId': 'x',
          'status': 'PAID',
          'promisedDeliveryAt': '2026-08-04T09:30:00Z',
        }).deliveryDeadlineUtc,
        utc(2026, 8, 4, 9, 30),
      );
    });

    test('falls back to trip.proposedDeliveryTime', () {
      final o = Order.fromJson({
        'orderId': 'x',
        'status': 'PAID',
        'trip': {'proposedDeliveryTime': '2026-08-01T11:00:00Z'},
      });
      expect(o.deliveryDeadlineUtc, utc(2026, 8, 1, 11));
    });

    test('multiple buyer windows stay valid until the latest resolved end', () {
      final o = Order.fromJson({
        'orderId': 'x',
        'status': 'PAID',
        'preferredDeliveryWindows': [
          {'date': '2026-08-01', 'slot': 'MORNING'}, // ends 12:00 EAT = 09:00Z
          {'date': '2026-08-02', 'slot': 'AFTERNOON'}, // ends 16:00 EAT = 13:00Z
        ],
      });
      expect(o.deliveryDeadlineUtc, utc(2026, 8, 2, 13));
    });

    test('a server endsAt override beats the slot end', () {
      final o = Order.fromJson({
        'orderId': 'x',
        'status': 'PAID',
        'preferredDeliveryWindows': [
          {
            'date': '2026-08-01',
            'slot': 'EVENING', // fixed end 20:00 EAT = 17:00Z
            'endsAt': '2026-08-01T21:00:00+03:00', // 18:00Z
          },
        ],
      });
      expect(o.deliveryDeadlineUtc, utc(2026, 8, 1, 18));
    });

    test('legacy single-window orders fall back to the window end', () {
      final o = Order.fromJson({
        'orderId': 'x',
        'status': 'PAID',
        'preferredDeliveryDate': '2026-08-01',
        'preferredDeliverySlot': 'EVENING',
      });
      expect(o.deliveryDeadlineUtc, utc(2026, 8, 1, 17));
    });

    test('legacy SELLER_HOURS is excluded from the deadline (web parity)', () {
      final o = Order.fromJson({
        'orderId': 'x',
        'status': 'PAID',
        'preferredDeliveryDate': '2026-08-01',
        'preferredDeliverySlot': 'SELLER_HOURS',
      });
      expect(o.deliveryDeadlineUtc, isNull);
    });

    test('an active order with only a past window end is overdue', () {
      final pastDay =
          DateTime.now().toUtc().subtract(const Duration(days: 3)).toIso8601String();
      final o = Order.fromJson({
        'orderId': 'x',
        'status': 'AWAITING_DELIVERY',
        'preferredDeliveryWindows': [
          {'date': pastDay.substring(0, 10), 'slot': 'MORNING'},
        ],
      });
      expect(o.deliveryDeadlineUtc, isNotNull);
      expect(o.group, OrderGroup.overdue);
    });

    test('dispatchOpensAt is carried into deliveryWindowFields', () {
      final o = Order.fromJson({
        'orderId': 'x',
        'status': 'PAID',
        'dispatchOpensAt': '2026-08-01T09:00:00Z',
      });
      expect(o.deliveryWindowFields['dispatchOpensAt'], '2026-08-01T09:00:00Z');
    });
  });

  test('AU-034: naive timestamps parse as UTC and render in EAT (+3)', () {
    final o = Order.fromJson({'orderId': 'x', 'createdAt': '2026-08-20T10:00:00'});
    // naive -> UTC; EAT stamp = 13:00
    expect(o.createdAtLabel, '20 Aug, 13:00');
    final withOffset = Order.fromJson({'orderId': 'x', 'createdAt': '2026-02-19T08:07:54Z'});
    expect(withOffset.createdAtLabel, '19 Feb, 11:07');
  });

  test('AU-034: buying/selling split via orderType fallback', () {
    expect(Order.fromJson({'orderId': 'a', 'orderType': 'selling'}).isSelling, isTrue);
    expect(Order.fromJson({'orderId': 'b', 'orderType': 'buying'}).isSelling, isFalse);
    expect(Order.fromJson({'orderId': 'c'}).isSelling, isFalse);
  });

  group('AU-035: buyer-perspective label map (BUYER_FLOW_SPEC §9)', () {
    // Exact strings from the reference `lib/order-status.ts`.
    const expected = {
      'PENDING': 'Payment submitted - being verified',
      'AWAITING_PAYMENT': 'Awaiting payment verification',
      'AWAITING_SELLER_CONFIRMATION': 'Payment confirmed - awaiting seller',
      'PAID': 'Payment confirmed - order placed',
      'AWAITING_DELIVERY': 'Seller confirmed - preparing your delivery',
      'READY_FOR_DISPATCH': 'Driver assigned - dispatch in progress',
      'AWAITING_BUYER_CONFIRMATION': 'Confirm the new delivery time',
      'IN_TRANSIT': 'Out for delivery',
      'DELIVERED': 'Delivered - confirm received',
      'AWAITING_PICKUP': 'Ready for pickup',
      'PICKED_UP': 'Picked up',
      'COMPLETED': 'Completed',
      'CANCELLED': 'Cancelled',
    };
    test('every buyer label matches the reference exactly', () {
      expected.forEach((status, label) {
        expect(orderStatusLabel(status), label, reason: status);
      });
    });
    test('legacy CONFIRMED normalizes to COMPLETED (web normalizeOrderStatus)', () {
      expect(normalizeOrderStatus('CONFIRMED'), 'COMPLETED');
      expect(orderStatusLabel('CONFIRMED'), 'Completed');
      final o = Order.fromJson({'orderId': 'x', 'status': 'CONFIRMED'});
      expect(o.normalizedStatus, 'COMPLETED');
      expect(o.isTerminal, isTrue);
      expect(o.group, OrderGroup.completed);
      // whitespace/dash tolerance mirrors the web implementation
      expect(normalizeOrderStatus(' in transit '), 'IN_TRANSIT');
      expect(normalizeOrderStatus('awaiting-payment'), 'AWAITING_PAYMENT');
      expect(normalizeOrderStatus(null), 'UNKNOWN');
    });
    test('seller perspective uses seller wording; unknown falls back humanised',
        () {
      expect(
          orderStatusLabel('AWAITING_SELLER_CONFIRMATION', perspective: 'seller'),
          'New order - confirm item is available');
      // legacy CONFIRMED still reads Completed for sellers
      expect(orderStatusLabel('CONFIRMED', perspective: 'seller'), 'Completed');
      expect(orderStatusLabel('SOME_FUTURE_STATUS'), 'SOME FUTURE STATUS');
    });
  });

  group('AU-035: order detail line items', () {
    testWidgets('detail renders items with qty × unit price + choice labels',
        (tester) async {
      final api = ApiClient(client: _ordersClient());
      await tester.pumpWidget(MaterialApp(
        home: OrderDetailScreen(orderId: 'o-1', token: 'jwt', api: api),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Items Ordered'), findsOneWidget);
      // "Quantity: 2 x TSh 626,000" line tile
      expect(find.textContaining('2 × TSh 626,000'), findsOneWidget);
      expect(find.text('Pack Size: Single'), findsOneWidget);
      expect(find.text('LANCÔME PARIS La vie est belle'), findsOneWidget);
    });

    test('unitPrice wins over price when present (getOrderItemUnitPrice)', () {
      final item = OrderItem.fromJson({
        'productId': 1,
        'productName': 'X',
        'quantity': 3,
        'price': 1000.0,
        'unitPrice': 2500.0,
      });
      expect(item.effectiveUnitPrice, 2500);
      expect(item.quantityLabel, contains('TSh 2,500'));
      // falls back to price
      expect(
          OrderItem.fromJson({
            'productId': 1,
            'productName': 'X',
            'price': 1000.0,
          }).effectiveUnitPrice,
          1000);
    });

    test('rental booking detection + vehicle/property kind from slugs', () {
      final booking = {
        'listingType': 'FOR_RENT',
        'ratePeriod': 'NIGHT',
        'startDate': '2026-08-09',
        'endDate': '2026-08-11',
        'billableUnits': 2,
      };
      final property = Order.fromJson({
        'orderId': 'r1',
        'items': [
          {
            'productId': 623,
            'productName': 'Beach apartment',
            'productCategorySlug': 'real-estate',
            'quantity': 1,
            'price': 90000.0,
            'rentalBooking': booking,
          },
        ],
      });
      expect(property.rental, isNotNull);
      expect(property.rental!.kind, RentalKind.property);
      // A nightly property booking is a short stay (web 2026-10): its step
      // reads "Check-in"; a monthly let keeps "Arrival / check-in".
      expect(property.rental!.isShortStay, isTrue);
      expect(property.rental!.startStepLabel, 'Check-in');
      expect(
          RentalPresentation(RentalKind.property, {...booking, 'ratePeriod': 'MONTH'})
              .startStepLabel,
          'Arrival / check-in');

      final vehicle = Order.fromJson({
        'orderId': 'r2',
        'items': [
          {
            'productId': 470,
            'productName': 'Prado',
            'productCategory': 'Vehicle',
            'quantity': 1,
            'price': 120000.0,
            'rentalBooking': booking,
          },
        ],
      });
      expect(vehicle.rental!.isVehicle, isTrue);
      expect(vehicle.rental!.startStepLabel, 'Rental pickup');

      // no booking -> null
      expect(Order.fromJson({'orderId': 'r3'}).rental, isNull);
    });

    test('buyer-only codes parse and stay absent when backend hides them', () {
      // deliveryCode only while IN_TRANSIT (API_MAP contract note 5)
      final transit = Order.fromJson({
        'orderId': 'd1',
        'status': 'IN_TRANSIT',
        'deliveryCode': '934415',
      });
      expect(transit.deliveryCode, '934415');
      // after DELIVERED the field arrives null
      expect(
          Order.fromJson({'orderId': 'd2', 'status': 'DELIVERED'}).deliveryCode,
          isNull);
      expect(
          Order.fromJson({
            'orderId': 'd3',
            'status': 'AWAITING_PICKUP',
            'rentalHandoffCode': '482913',
          }).rentalHandoffCode,
          '482913');
    });
  });

  group('AU-035: OrderStatusTimeline widget', () {
    testWidgets('delivery sequence shows all six steps for a fresh order',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(status: 'PENDING', fulfillmentType: 'SELLER_DELIVERY'),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Order placed'), findsOneWidget); // buyer wording
      expect(find.text('Waiting for seller to confirm availability'), findsOneWidget);
      expect(find.text('Arranging delivery'), findsOneWidget);
      expect(find.text('In transit'), findsOneWidget);
      expect(find.text('Delivered'), findsOneWidget);
      expect(find.text('Completed'), findsOneWidget);
    });

    testWidgets('seller wording swaps role-specific steps', (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(
              status: 'PAID', fulfillmentType: 'SELLER_DELIVERY', perspective: 'seller'),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Payment secured'), findsOneWidget);
      expect(find.text('Confirm item availability'), findsOneWidget);
      expect(find.text('Assign rider'), findsOneWidget);
      expect(find.text('Order placed'), findsNothing);
    });

    testWidgets('DELIVERED checks off Delivered; Completed stays current (not done)',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(status: 'DELIVERED', fulfillmentType: 'SELLER_DELIVERY'),
        ),
      ));
      await tester.pumpAndSettle();
      // Every step through Delivered reads as done; the still-outstanding
      // Completed step (index 5 of 6) is the one that stays current.
      final deliveredTile = tester.element(find.text('Delivered'));
      expect(deliveredTile, isNotNull);
      final dj = _journey(tester);
      expect(dj.cancelled, isFalse);
      expect(dj.steps.length, 6);
      expect(dj.currentIndex, 5);
    });

    testWidgets('COMPLETED renders every step done (six checks, no numbers)',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(status: 'COMPLETED', fulfillmentType: 'SELLER_DELIVERY'),
        ),
      ));
      await tester.pumpAndSettle();
      // currentIndex at the last step marks every step (including itself)
      // done - same "all complete" state the old six checkmarks pinned.
      expect(_journey(tester).currentIndex, 5);
    });

    testWidgets('legacy CONFIRMED behaves as COMPLETED in the timeline',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(status: 'CONFIRMED', fulfillmentType: 'SELLER_DELIVERY'),
        ),
      ));
      await tester.pumpAndSettle();
      expect(_journey(tester).currentIndex, 5);
    });

    testWidgets('IN_TRANSIT marks In transit current between Delivery and Delivered',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(status: 'IN_TRANSIT', fulfillmentType: 'SELLER_DELIVERY'),
        ),
      ));
      await tester.pumpAndSettle();
      // steps 0-2 done, In transit current (index 3 of 6), Delivered/Completed
      // still pending.
      expect(_journey(tester).currentIndex, 3);
    });

    testWidgets('pickup sequence differs from delivery (no In transit step)',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(status: 'AWAITING_PICKUP', fulfillmentType: 'BUYER_PICKUP'),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Ready for pickup'), findsOneWidget);
      expect(find.text('Picked up'), findsOneWidget);
      expect(find.text('In transit'), findsNothing);
      expect(_journey(tester).currentIndex, 2); // placed+confirm done, ready current
    });

    testWidgets('ORDERS-13: made-to-order splices a production step that stays current',
        (tester) async {
      // Delivery order promised in 3 days, still being made: the timeline shows
      // placed → confirm → Production · 3 days → Arranging delivery → …
      // and the production step is the one in progress (web awaitingProduction).
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(
            status: 'AWAITING_DELIVERY',
            fulfillmentType: 'SELLER_DELIVERY',
            production: const ProductionSource(
              productionTimeDays: 3,
              expectedCompletionAt: null,
              completedAt: null,
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Production · 3 days'), findsOneWidget);
      expect(find.text('Arranging delivery'), findsOneWidget);
      // placed + confirm done; production (index 2 of 7) is current.
      expect(_journey(tester).currentIndex, 2);
    });

    testWidgets('ORDERS-13: once production completes the arrange step goes current',
        (tester) async {
      // Same order after the seller confirms the item is made — the production
      // step reads done (checked) and Arranging delivery becomes current.
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(
            status: 'AWAITING_DELIVERY',
            fulfillmentType: 'SELLER_DELIVERY',
            production: ProductionSource(
              productionTimeDays: 3,
              expectedCompletionAt: DateTime.utc(2026, 8, 25),
              completedAt: DateTime.utc(2026, 9, 1),
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Production · 3 days'), findsOneWidget);
      // placed + confirm + production done; arrange (index 3 of 7) is current.
      expect(_journey(tester).currentIndex, 3);
    });

    testWidgets('ORDERS-13: rental orders never get a production step',
        (tester) async {
      final rental = RentalPresentation.fromItems([
        OrderItem.fromJson({
          'productId': 470,
          'productName': 'Prado',
          'productSubcategorySlug': 'cars-for-rent',
          'rentalBooking': {'ratePeriod': 'DAY'},
        }),
      ]);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(
            status: 'AWAITING_PICKUP',
            fulfillmentType: 'BUYER_PICKUP',
            rental: rental,
            production: const ProductionSource(productionTimeDays: 5),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Production · 5 days'), findsNothing);
      expect(find.text('Rental pickup'), findsOneWidget);
    });

    testWidgets('rental sequence uses rental wording and stage mapping',
        (tester) async {
      final rental = RentalPresentation.fromItems([
        OrderItem.fromJson({
          'productId': 470,
          'productName': 'Prado',
          'productSubcategorySlug': 'cars-for-rent',
          'rentalBooking': {'ratePeriod': 'DAY'},
        }),
      ]);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(
              status: 'AWAITING_PICKUP', fulfillmentType: 'BUYER_PICKUP', rental: rental),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Booking placed'), findsOneWidget);
      expect(rental!.isVehicle, isTrue);
      expect(find.text('Rental pickup'), findsOneWidget); // vehicle start step
      expect(find.text('Rental period'), findsOneWidget);
      expect(find.text('Seller confirmation'), findsOneWidget);
      // AWAITING_PICKUP maps to the start step (index 2 of 5).
      expect(_journey(tester).currentIndex, 2);
    });

    testWidgets('cancelled order shows failure copy and only first step active',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: OrderStatusTimeline(status: 'CANCELLED', fulfillmentType: 'SELLER_DELIVERY'),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Order cancelled'), findsOneWidget);
      expect(_journey(tester).cancelled, isTrue);
    });
  });

  testWidgets('AU-034: the three web status groups filter the list',
      (tester) async {
    final api = ApiClient(client: _ordersClient());
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(
      MaterialApp(home: OrdersScreen(auth: auth, api: api)),
    );
    await tester.pumpAndSettle();

    // Web parity: three groups, ongoing and overdue merged, and no "All".
    for (final label in ['Ongoing & overdue', 'Completed', 'Cancelled']) {
      expect(find.text(label), findsOneWidget, reason: 'group tab $label');
    }
    expect(find.text('All'), findsNothing);
    expect(find.text('Overdue'), findsNothing);

    // The list opens on the active group, headed like the web.
    expect(find.text('Active Orders'), findsOneWidget);
    expect(find.text('ORD-1001'), findsOneWidget);
    expect(find.text('ORD-1002'), findsNothing);

    // Completed keeps only the DELIVERED order, under its own heading.
    await tester.tap(find.text('Completed'));
    await tester.pumpAndSettle();
    expect(find.text('Past Purchases'), findsOneWidget);
    expect(find.text('ORD-1002'), findsOneWidget);
    expect(find.text('ORD-1001'), findsNothing);

    await tester.tap(find.text('Ongoing & overdue'));
    await tester.pumpAndSettle();
    expect(find.text('ORD-1001'), findsOneWidget);
    expect(find.text('ORD-1002'), findsNothing);
  });

  testWidgets('AU-037: DELIVERED order shows Rate Seller; ALREADY_RATED 409 surfaces',
      (tester) async {
    final api = ApiClient(client: _ordersClient());
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(orderId: 'o-3', token: 'jwt', api: api),
    ));
    await tester.pumpAndSettle();

    // DELIVERED + buying → buyer-actionable; label flips to Rate Seller.
    // The detail is a ListView; drag it up until the actions row appears,
    // then tap the FilledButton (the Text alone may not be hit-testable).
    // Detail is a ListView; drag from its (on-screen) body — the delivery /
    // fulfillment rows above the actions grew, so target the list not a label.
    await tester.drag(find.byType(ListView).first, const Offset(0, -600));
    await tester.pumpAndSettle();
    // Rate Seller is a FilledButton.icon — tap its icon child, which is
    // always hit-testable regardless of the label's layout offset.
    await tester.tap(find.byIcon(Icons.check_circle_outline).last);
    await tester.pumpAndSettle();
    // D-3 escrow-release gate: the web 'Confirm you received your items'
    // warning precedes the rating modal; only 'Yes' reaches the release PATCH.
    expect(find.text('Confirm you received your items'), findsOneWidget);
    await tester.tap(find.text('Yes, I received them'));
    await tester.pumpAndSettle();
    expect(find.text('Submit'), findsOneWidget, reason: 'rating dialog opens');
  });

  test('AU-038: dispatch blocker messages map codes to reference copy', () {
    // Exact port of lib/dispatch-errors.ts — code-keyed, never status-keyed.
    expect(
        getDispatchBlockedMessage('DISPATCH_TOO_EARLY'),
        contains('too early to dispatch'));
    expect(isDispatchTimingReason('DISPATCH_TOO_EARLY'), isTrue);
    expect(isDispatchTimingReason('NO_TRANSPORTER_ASSIGNED'), isFalse);
    expect(getDispatchBlockedMessage('SOMETHING_ELSE'), isNull);
    final msgs = getDispatchBlockerMessages([
      'NO_TRANSPORTER_ASSIGNED',
      {'reason': 'TRANSPORT_MODE_MISMATCH'},
    ]);
    expect(msgs, hasLength(2));
    expect(msgs.first, contains('No transporter is assigned'));
  });

  testWidgets('AU-038: selling order at stock gate shows Confirm availability + decline',
      (tester) async {
    final api = ApiClient(client: _ordersClient());
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(orderId: 'o-4', token: 'jwt', api: api),
    ));
    await tester.pumpAndSettle();
    // The gate sits below the fold — drag the list up, then assert labels.
    await tester.drag(find.byType(ListView).first, const Offset(0, -600));
    await tester.pumpAndSettle();
    // D-2: the gate keeps web's singular confirm label for an item-less order
    // and the web decline trigger copy ('Item is unavailable').
    expect(find.text('Confirm availability'), findsOneWidget);
    expect(find.text('Item is unavailable'), findsOneWidget);
  });

  testWidgets('AU-037b: submitting the rating dialog surfaces ALREADY_RATED verbatim',
      (tester) async {
    final api = ApiClient(client: _ordersClient());
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(orderId: 'o-3', token: 'jwt', api: api),
    ));
    await tester.pumpAndSettle();
    // Detail is a ListView; drag from its (on-screen) body — the delivery /
    // fulfillment rows above the actions grew, so target the list not a label.
    await tester.drag(find.byType(ListView).first, const Offset(0, -600));
    await tester.pumpAndSettle();

    // The detail is a ListView; drag it up until the actions row appears,
    // then tap the FilledButton (the Text alone may not be hit-testable).
    await tester.tap(find.byIcon(Icons.check_circle_outline).last);
    await tester.pumpAndSettle();
    // D-3 escrow-release gate: click through the web warning dialog first.
    await tester.tap(find.text('Yes, I received them'));
    await tester.pumpAndSettle();
    expect(find.text('Submit'), findsOneWidget, reason: 'rating dialog opens');

    // Submitting fires PATCH confirm-receipt; the backend's real ALREADY_RATED
    // 409 body must surface verbatim — never faked as success.
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();
    expect(find.textContaining('already rated'), findsOneWidget,
        reason: 'backend error text shown to the user, not swallowed');
  });

  test('Order detail parses logistics-v2 trip + transporter (delivery-time)', () {
    final o = Order.fromJson({
      'orderId': 'o-trip',
      'orderNumber': 'ORD-TRIP',
      'status': 'AWAITING_BUYER_CONFIRMATION',
      'orderType': 'buying',
      'trip': {
        'proposedDeliveryTime': '2026-09-10T08:00:00.000Z',
        'deliveryTimeStatus': 'PROPOSED',
        'transporter': {
          'fullName': 'Juma Ali',
          'phoneNumber': '+255700000000',
        },
      },
    });
    expect(o.proposedDeliveryTime, '2026-09-10T08:00:00.000Z');
    expect(o.deliveryTimeStatus, 'PROPOSED');
    expect(o.transporterName, 'Juma Ali');
    expect(o.transporterPhone, '+255700000000');

    // whatsApp number is the fallback when phoneNumber is missing.
    final o2 = Order.fromJson({
      'orderId': 'o-trip2',
      'trip': {
        'deliveryTimeStatus': 'BUYER_CONFIRMED',
        'transporter': {
          'fullName': 'Neema J',
          'whatsAppPhoneNumber': '+255711111111',
        },
      },
    });
    expect(o2.deliveryTimeStatus, 'BUYER_CONFIRMED');
    expect(o2.transporterName, 'Neema J');
    expect(o2.transporterPhone, '+255711111111');

    // Legacy orders without a trip stay null everywhere.
    final o3 = Order.fromJson({'orderId': 'o-legacy'});
    expect(o3.proposedDeliveryTime, isNull);
    expect(o3.deliveryTimeStatus, isNull);
    expect(o3.transporterName, isNull);
  });

  testWidgets(
      'buyer AWAITING_BUYER_CONFIRMATION shows the delivery-time banner',
      (tester) async {
    final api = ApiClient(
        client: _detailClient(
            'o-dt', _tripOrder('o-dt', 'AWAITING_BUYER_CONFIRMATION')));
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(orderId: 'o-dt', token: 'jwt', api: api),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Can you receive this delivery?'), findsOneWidget);
    expect(find.text('Yes, I can receive it'), findsOneWidget);
    expect(find.text('Request another time'), findsOneWidget);
    // Web copy names the transporter and the proposed time. The tracking
    // rail names them too now ("Juma Ali is bringing your order", web
    // `buyerJourneySteps`), so pin the banner's own sentence.
    expect(find.textContaining('scheduled to deliver on'), findsOneWidget);
    expect(
        find.textContaining('Juma Ali is scheduled to deliver on'), findsOneWidget);
  });

  testWidgets('seller READY_FOR_DISPATCH shows an enabled Dispatch items button',
      (tester) async {
    final api = ApiClient(
        client: _detailClient('o-rd', {
      ..._tripOrder('o-rd', 'READY_FOR_DISPATCH', selling: true),
      'canDispatch': true,
    }));
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(orderId: 'o-rd', token: 'jwt', api: api),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('dispatch-order-btn')), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Dispatch items'), findsOneWidget);
    final btn = tester.widget<FilledButton>(
        find.byKey(const ValueKey('dispatch-order-btn')));
    expect(btn.onPressed, isNotNull, reason: 'canDispatch true ⇒ enabled');
  });

  testWidgets('timing-locked dispatch shows a disabled Dispatch button',
      (tester) async {
    final api = ApiClient(
        client: _detailClient('o-rd2', {
      ..._tripOrder('o-rd2', 'READY_FOR_DISPATCH', selling: true),
      'canDispatch': false,
      'dispatchBlockedReason': 'DISPATCH_TOO_EARLY',
    }));
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(orderId: 'o-rd2', token: 'jwt', api: api),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('dispatch-order-btn')), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    final btn = tester.widget<FilledButton>(
        find.byKey(const ValueKey('dispatch-order-btn')));
    expect(btn.onPressed, isNull,
        reason: 'DISPATCH_TOO_EARLY keeps the CTA visible but greyed');
  });

  testWidgets('non-timing dispatch blocker hides the button and says why',
      (tester) async {
    final api = ApiClient(
        client: _detailClient('o-rd3', {
      ..._tripOrder('o-rd3', 'READY_FOR_DISPATCH', selling: true),
      'canDispatch': false,
      'dispatchBlockedReason': 'NO_TRANSPORTER_ASSIGNED',
    }));
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(orderId: 'o-rd3', token: 'jwt', api: api),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.textContaining('No transporter is assigned'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('dispatch-order-btn')), findsNothing,
        reason: 'a fixable blocker withholds dispatch instead of failing it');
    expect(find.textContaining('No transporter is assigned'), findsOneWidget);
  });

  testWidgets('seller SELLER_DELIVERY IN_TRANSIT hides Mark delivered',
      (tester) async {
    final api = ApiClient(
        client: _detailClient('o-rd4', _tripOrder('o-rd4', 'IN_TRANSIT', selling: true)));
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(orderId: 'o-rd4', token: 'jwt', api: api),
    ));
    await tester.pumpAndSettle();
    // Scroll to the IN_TRANSIT seller hint box — right where a "Mark
    // delivered" button would sit for a hand-delivered (pickup) order.
    await tester.scrollUntilVisible(
        find.textContaining("enter the buyer's code once handed over"), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Mark delivered'), findsNothing,
        reason:
            'SELLER_DELIVERY closes via the buyer handover code, never the seller');
  });

  testWidgets('rating below 3 stars requires a review', (tester) async {
    final api = ApiClient(client: _ordersClient());
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(orderId: 'o-3', token: 'jwt', api: api),
    ));
    await tester.pumpAndSettle();
    // Detail is a ListView; drag from its (on-screen) body — the delivery /
    // fulfillment rows above the actions grew, so target the list not a label.
    await tester.drag(find.byType(ListView).first, const Offset(0, -600));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.check_circle_outline).last);
    await tester.pumpAndSettle();
    // D-3 escrow-release gate: click through the web warning dialog first.
    await tester.tap(find.text('Yes, I received them'));
    await tester.pumpAndSettle();
    expect(find.text('Submit'), findsOneWidget, reason: 'rating dialog opens');

    // 1 star (tap the first of the five filled stars), then Submit with no
    // review → the dialog must block, not silently accept.
    await tester.tap(find.byIcon(Icons.star).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();
    expect(find.text('Please provide a review for ratings below 3 stars.'),
        findsOneWidget);
    expect(find.text('Review *'), findsOneWidget);

    // Typing a review clears the error; the dialog can be dismissed.
    await tester.enterText(find.byType(TextField).last, 'Great service');
    await tester.pumpAndSettle();
    expect(find.text('Please provide a review for ratings below 3 stars.'),
        findsNothing);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('Submit'), findsNothing);
  });

  testWidgets('ORDERS-seller-14: seller verifies a renter handoff code at pickup',
      (tester) async {
    final calls = <String>[];
    final bodies = <Map<String, dynamic>>[];
    final detail = {
      'orderId': 'o-rh',
      'orderNumber': 'ORD-RH',
      'status': 'AWAITING_PICKUP',
      'paymentStatus': 'PAID',
      'totalAmount': 240000,
      'currency': 'TZS',
      'orderType': 'selling',
      'fulfillmentType': 'BUYER_PICKUP',
      'buyerName': 'Rental Buyer',
      'items': [
        {
          'productId': 470,
          'productName': 'Prado',
          'productCategory': 'Vehicle',
          'quantity': 1,
          'price': 120000.0,
          'rentalBooking': {'ratePeriod': 'DAY'},
        },
      ],
    };
    final api = ApiClient(
      client: MockClient((req) async {
        final p = req.url.path;
        if (p == '/api/v1/orders/o-rh' && req.method == 'GET') {
          return http.Response(jsonEncode(detail), 200,
              headers: {'content-type': 'application/json'});
        }
        if (p == '/api/v1/orders/o-rh/verify-rental-handoff' &&
            req.method == 'POST') {
          calls.add(p);
          bodies.add((jsonDecode(utf8.decode(req.bodyBytes))
              as Map).cast<String, dynamic>());
          return http.Response('{}', 200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{"error":"not found"}', 404);
      }),
    );
    // A tall surface so the whole detail ListView (incl. the deep seller
    // verify card) is built without scrolling.
    tester.view.physicalSize = const Size(900, 3600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(MaterialApp(
        home: OrderDetailScreen(orderId: 'o-rh', token: 'jwt', api: api)));
    await tester.pumpAndSettle();

    // Vehicle rental wording on the seller-side verify card (web
    // RentalHandoffCodeCard perspective 'seller'); no generic pickup shortcut.
    expect(find.text('Confirm pickup'), findsNWidgets(2)); // heading + button
    expect(find.byKey(const ValueKey('rental-handoff-code-input')),
        findsOneWidget);
    expect(find.text('3 of 3 attempts remaining'), findsOneWidget);
    expect(find.text('Mark picked up'), findsNothing);

    // A partial code keeps the button disabled.
    await tester.enterText(
        find.byKey(const ValueKey('rental-handoff-code-input')), '12');
    await tester.pumpAndSettle();
    expect(tester
            .widget<FilledButton>(
                find.byKey(const ValueKey('rental-handoff-verify-btn')))
            .onPressed,
        isNull);

    // A correct six-digit code POSTs verify-rental-handoff {code}.
    await tester.enterText(
        find.byKey(const ValueKey('rental-handoff-code-input')), '123456');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('rental-handoff-verify-btn')));
    await tester.pumpAndSettle();
    expect(calls, contains('/api/v1/orders/o-rh/verify-rental-handoff'));
    expect(bodies.single['code'], '123456');
    // Success feedback on the (still-AWAITING_PICKUP mock) reload.
    expect(find.textContaining('Pickup confirmed'), findsOneWidget);
  });

  testWidgets('ORDERS-seller-14: a wrong handoff code consumes an attempt',
      (tester) async {
    final detail = {
      'orderId': 'o-rh2',
      'orderNumber': 'ORD-RH2',
      'status': 'AWAITING_PICKUP',
      'paymentStatus': 'PAID',
      'totalAmount': 240000,
      'currency': 'TZS',
      'orderType': 'selling',
      'fulfillmentType': 'BUYER_PICKUP',
      'buyerName': 'Rental Buyer',
      'items': [
        {
          'productId': 470,
          'productName': 'Prado',
          'productCategory': 'Vehicle',
          'quantity': 1,
          'price': 120000.0,
          'rentalBooking': {'ratePeriod': 'DAY'},
        },
      ],
    };
    final api = ApiClient(
      client: MockClient((req) async {
        final p = req.url.path;
        if (p == '/api/v1/orders/o-rh2' && req.method == 'GET') {
          return http.Response(jsonEncode(detail), 200,
              headers: {'content-type': 'application/json'});
        }
        if (p == '/api/v1/orders/o-rh2/verify-rental-handoff') {
          return http.Response(
              jsonEncode({
                'success': false,
                'message': 'INVALID_RENTAL_HANDOFF_CODE',
                'attemptsRemaining': 2,
              }),
              400,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{"error":"not found"}', 404);
      }),
    );
    tester.view.physicalSize = const Size(900, 3600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(MaterialApp(
        home: OrderDetailScreen(orderId: 'o-rh2', token: 'jwt', api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Confirm pickup'), findsNWidgets(2));
    await tester.enterText(
        find.byKey(const ValueKey('rental-handoff-code-input')), '111111');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('rental-handoff-verify-btn')));
    await tester.pumpAndSettle();
    expect(find.text('2 of 3 attempts remaining'), findsOneWidget);
  });

  test('ORDERS-09: deliveryWindowLabel renders the buyer-selected window', () {
    final o = Order.fromJson({
      'orderId': 'w1',
      'status': 'AWAITING_DELIVERY',
      'preferredDeliveryWindows': [
        {'date': '2099-01-02', 'slot': 'MORNING'},
        {'date': '2099-01-02', 'slot': 'AFTERNOON'},
      ],
    });
    // 2099-01-02 is never "Today"/"Tomorrow", so the label is the dated form
    // — deterministic regardless of the test clock.
    expect(o.deliveryWindowLabel,
        '02 Jan Morning (10:00–12:00) · 02 Jan Afternoon (12:00–16:00)');

    // Legacy single-window order fields resolve too.
    final legacy = Order.fromJson({
      'orderId': 'w2',
      'preferredDeliveryDate': '2099-01-02',
      'preferredDeliverySlot': 'EVENING',
    });
    expect(legacy.deliveryWindowLabel, '02 Jan Evening (16:00–20:00)');

    // No window data → no label.
    expect(Order.fromJson({'orderId': 'w3'}).deliveryWindowLabel, isNull);
  });

  // ── Order-card next step: progress and action must agree, and both must be
  // the web's own vocabulary (dashboard getSellerOrderMilestone /
  // getOrderActionHint). Regression: an AWAITING_DELIVERY sale fell through
  // the step map's default to "Placed" while its button said "Arrange
  // dispatch" — a phrase web never uses, from a local label rewriter.
  MockClient oneOrderClient(Map<String, dynamic> order) =>
      MockClient((request) async {
        if (request.url.path == '/api/v1/orders') {
          return http.Response(jsonEncode([order]), 200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 404);
      });

  Map<String, dynamic> card(String status, {required bool selling}) => {
        'orderId': 'o-card',
        'orderNumber': 'ORD-9001',
        'status': status,
        'paymentStatus': 'PAID',
        'totalAmount': 100000,
        'currency': 'TZS',
        'orderType': selling ? 'selling' : 'buying',
        'fulfillmentType': 'SELLER_DELIVERY',
        if (selling) 'buyerName': 'A Buyer' else 'sellerName': 'A Seller',
        'createdAt': '2026-08-20T10:00:00',
      };

  Future<void> pumpCard(WidgetTester tester, Map<String, dynamic> order) async {
    final api = ApiClient(client: oneOrderClient(order));
    final auth =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(
        MaterialApp(home: OrdersScreen(auth: auth, api: api, initialTab: (order['orderType'] == 'selling') ? 'selling' : 'buying')));
    await tester.pumpAndSettle();
  }

  for (final status in const ['PAID', 'AWAITING_DELIVERY']) {
    testWidgets('selling $status: rail sits on Preparing order and the CTA is '
        'Assign rider', (tester) async {
      await pumpCard(tester, card(status, selling: true));

      // Web sellerJourneyStepIndex: preparing = 2 on the five-step seller rail.
      final rail = _journey(tester);
      expect(rail.steps.length, 5);
      expect(rail.currentIndex, 2);
      expect(rail.steps[rail.currentIndex].label, 'Preparing order');
      expect(find.text('Placed'), findsNothing);

      // The CTA is the hint's own copy — web's, not a local rewrite.
      expect(find.text('Assign rider'), findsOneWidget);
      expect(find.text('Arrange dispatch'), findsNothing);
      expect(find.text('View next step'), findsNothing);
    });

    testWidgets('buying $status shows no action button at all', (tester) async {
      await pumpCard(tester, card(status, selling: false));

      // Web renders the button only when actionHint.cta is set; the buyer's
      // wait states carry none.
      expect(find.byType(OrderActionButton), findsNothing);
      expect(find.textContaining('The seller is preparing'), findsOneWidget);

      // Buyer rail: four steps, "Preparing order" current (index 1).
      final rail = _journey(tester);
      expect(rail.steps.length, 4);
      expect(rail.steps.first.label, 'Seller confirms');
      expect(rail.currentIndex, status == 'PAID' ? 0 : 1);
    });
  }

  testWidgets('the order CTA is the web button size, not the app default',
      (tester) async {
    await pumpCard(tester, card('PAID', selling: true));

    // Web: h-10 (40px). The app's default FilledButton is a 50px stadium.
    final box = tester.getSize(find.byType(OrderActionButton));
    expect(box.height, 40);
    final shape = tester
        .widget<FilledButton>(find.descendant(
            of: find.byType(OrderActionButton), matching: find.byType(FilledButton)))
        .style!
        .shape!
        .resolve({}) as RoundedRectangleBorder;
    expect(shape.borderRadius, BorderRadius.circular(12));
  });
}
