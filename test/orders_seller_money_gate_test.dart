import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/models/order.dart';
import 'package:globoexpats_mobile/screens/orders_screen.dart';
import 'package:globoexpats_mobile/widgets/delivery_journey.dart';

/// Redesign: the tracking rail's current step is read off the mounted
/// [DeliveryJourney] rather than the retired 'Delivery journey' strip's own
/// milestone text.
/// The rail under "Order tracking" — the order page's only progress surface.
DeliveryJourney _journey(WidgetTester tester) =>
    tester.widget<DeliveryJourney>(find.byType(DeliveryJourney));

/// Group-3 display parity (D-1 … D-3): seller money-transparency breakdown,
/// the per-item availability-gate checklist, and the escrow-release confirm
/// warning. All assertions are display-only — no fake payment success.
void main() {
  // A selling order at the stock gate whose items carry stored seller
  // payouts / seller-facing commissions (web FINANC-07/08 payload shape).
  final Map<String, dynamic> gateOrder = {
    'orderId': 's-1',
    'orderNumber': 'ORD-S1',
    'status': 'AWAITING_SELLER_CONFIRMATION',
    'paymentStatus': 'PAID',
    'escrowPending': false,
    'totalAmount': 240000,
    'currency': 'TZS',
    'orderType': 'selling',
    'fulfillmentType': 'SELLER_DELIVERY',
    'buyerName': 'Gate Buyer',
    'items': [
      {
        'orderItemId': 1,
        'productId': 101,
        'productName': 'Oak Table',
        'quantity': 1,
        'price': 150000.0,
        'finalTotalSellingPrice': 150000.0,
        'sellerPayout': 132000.0,
        'sellerFacingCommissionAmount': 18000.0,
        'productionTimeDays': 3,
        'image': 'uploads/table.webp',
      },
      {
        'orderItemId': 2,
        'productId': 102,
        'productName': 'Lamp',
        'quantity': 2,
        'price': 45000.0,
        'finalTotalSellingPrice': 45000.0,
        'sellerPayout': 40000.0,
        'sellerFacingCommissionAmount': 5000.0,
      },
    ],
  };

  var confirmAvailabilityCalls = 0;

  MockClient sellingClient({String status = 'AWAITING_SELLER_CONFIRMATION'}) {
    final detail = Map<String, dynamic>.from(gateOrder);
    detail['status'] = status;
    return MockClient((req) async {
      final p = req.url.path;
      if (p == '/api/v1/orders/s-1' && req.method == 'GET') {
        return http.Response(jsonEncode(detail), 200,
            headers: {'content-type': 'application/json'});
      }
      if (p == '/api/v1/orders/s-1/confirm-availability' &&
          req.method == 'POST') {
        confirmAvailabilityCalls++;
        // The real transition would move the order to PAID; the mock keeps the
        // gate status so the reloaded screen still renders (asserting the call
        // fired, never faking a money movement).
        return http.Response('{}', 200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 404);
    });
  }

  MockClient buyingClient(String status) => MockClient((req) async {
        if (req.url.path == '/api/v1/orders/p-1') {
          return http.Response(
              jsonEncode({
                'orderId': 'p-1',
                'orderNumber': 'ORD-P1',
                'status': status,
                'paymentStatus': 'PAID',
                'payoutStatus': 'HELD',
                'escrowPending': false,
                'totalAmount': 90000,
                'currency': 'TZS',
                'orderType': 'buying',
                'fulfillmentType': 'BUYER_PICKUP',
                'sellerName': 'Third Seller',
                'buyerRated': false,
              }),
              200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 404);
      });

  Future<void> pumpDetail(WidgetTester tester, http.Client transport,
      {String orderId = 's-1'}) async {
    tester.view.physicalSize = const Size(900, 3800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final api = ApiClient(client: transport);
    await tester.pumpWidget(MaterialApp(
      home: OrderDetailScreen(
        key: ValueKey('order-$orderId'),
        orderId: orderId,
        token: 'jwt',
        api: api,
        paymentsHttpClient: transport,
      ),
    ));
    await tester.pumpAndSettle();
  }

  setUp(() {
    confirmAvailabilityCalls = 0;
  });

  group('computeSellerPricingTotals (FINANC-08 reverse-commission logic)', () {
    test('stored sellerPayout + sellerFacingCommissionAmount win per item', () {
      final o = Order.fromJson(gateOrder);
      final totals = computeSellerPricingTotals(o.items);
      // Oak Table 132000×1 + Lamp 40000×2 = 212000; cuts 18000×1 + 5000×2.
      expect(totals.sellerReceives, closeTo(212000, 0.001));
      expect(totals.globoExpatsCut, closeTo(28000, 0.001));
    });

    test('missing sellerPayout falls back to a live-rate reverse quote', () {
      final o = Order.fromJson({
        'orderId': 'x',
        'items': [
          {
            'orderItemId': 9,
            'productId': 5,
            'productName': 'Plain item',
            'quantity': 1,
            'price': 100000.0,
            'finalTotalSellingPrice': 100000.0,
            'productCategory': 'others',
          },
        ],
      });
      final totals = computeSellerPricingTotals(o.items);
      // Reverse commission with the default rates yields a finite seller
      // payout strictly below the price and a non-negative GloboExpats cut.
      expect(totals.sellerReceives, greaterThan(0));
      expect(totals.sellerReceives, lessThan(100000));
      expect(totals.globoExpatsCut,
          closeTo(100000 - totals.sellerReceives, 0.001));
    });

    test('empty items are a zero split (nothing to show)', () {
      final o = Order.fromJson({'orderId': 'y'});
      final totals = computeSellerPricingTotals(o.items);
      expect(totals.isZero, isTrue);
    });
  });

  testWidgets('D-1: seller detail shows Seller gets / GloboExpats gets split',
      (tester) async {
    await pumpDetail(tester, sellingClient());
    // The box sits in the money/payment region — bring it on screen.
    await tester.scrollUntilVisible(find.text('Seller gets'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Seller gets'), findsOneWidget);
    expect(find.text('GloboExpats gets'), findsOneWidget);
    expect(find.text('TSh 212,000'), findsWidgets);
    expect(find.text('TSh 28,000'), findsOneWidget);
  });

  testWidgets('D-1: buyer perspective never shows the seller split',
      (tester) async {
    await pumpDetail(tester, buyingClient('PICKED_UP'), orderId: 'p-1');
    await tester.scrollUntilVisible(find.text('Payment:'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Seller gets'), findsNothing);
    expect(find.text('GloboExpats gets'), findsNothing);
  });

  testWidgets(
      'D-2: availability gate lists every item with Buyer paid / You receive '
      'amounts and stays disabled until every item is checked', (tester) async {
    await pumpDetail(tester, sellingClient());
    await tester.scrollUntilVisible(
        find.text('Confirm all checked items'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();

    // Web copy header + production-deadline warning (3 calendar days).
    expect(find.textContaining('Confirm this item is available'),
        findsOneWidget);
    expect(
        find.textContaining('within 3 calendar days'), findsOneWidget);

    // Per-line money framing: Buyer paid + emerald You receive. (Product names
    // also appear in the "Items Ordered" block above, so ≥ 1 is the assertion.)
    expect(find.text('Oak Table'), findsWidgets);
    expect(find.text('Lamp'), findsWidgets);
    expect(find.textContaining('Buyer paid: TSh 150,000'), findsOneWidget);
    expect(find.textContaining('Buyer paid: TSh 90,000'), findsOneWidget);
    expect(find.textContaining('You receive: TSh 132,000'), findsOneWidget);
    expect(find.textContaining('You receive: TSh 80,000'), findsOneWidget);

    // Totals strip.
    expect(find.text('Order paid: TSh 240,000'), findsOneWidget);
    expect(find.text('Seller receives: TSh 212,000'), findsOneWidget);

    // Confirm stays disabled until BOTH line items are checked.
    final buttonFinder = find.ancestor(
        of: find.text('Confirm all checked items'),
        matching: find.bySubtype<FilledButton>());
    expect(tester.widget<FilledButton>(buttonFinder).onPressed, isNull);

    await tester.tap(find.byType(Checkbox).at(0));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(buttonFinder).onPressed, isNull,
        reason: 'one of two items checked is not enough');

    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(buttonFinder).onPressed, isNotNull,
        reason: 'all items checked ⇒ confirm enabled');

    // Confirming fires confirm-availability — a real call, never a stub.
    await tester.tap(find.text('Confirm all checked items'));
    await tester.pumpAndSettle();
    expect(confirmAvailabilityCalls, 1);
  });

  testWidgets('D-2: item is unavailable opens the web decline copy', (tester) async {
    await pumpDetail(tester, sellingClient());
    await tester.scrollUntilVisible(
        find.text('Item is unavailable'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Item is unavailable'));
    await tester.pumpAndSettle();
    expect(find.text('Item unavailable?'), findsOneWidget);
    expect(
        find.textContaining(
            'This cancels the order and the buyer is refunded in full'),
        findsOneWidget);
    // Decline still demands a reason.
    await tester.tap(find.text('Cancel & refund buyer'));
    await tester.pumpAndSettle();
    expect(find.text('Please enter a reason'), findsOneWidget);
  });

  testWidgets(
      'D-3: Confirm Received is gated by the escrow-release warning; Cancel '
      'stops before the rating PATCH', (tester) async {
    await pumpDetail(tester, buyingClient('PICKED_UP'), orderId: 'p-1');
    await tester.scrollUntilVisible(find.text('Confirm Received'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Confirm Received'));
    await tester.pumpAndSettle();
    // The irreversible-action warning names the escrow release.
    expect(find.text('Confirm you received your items'), findsOneWidget);
    expect(
        find.textContaining('releases payment to the seller'), findsOneWidget);

    // Cancel: back to the order, no rating dialog, no PATCH.
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('Submit'), findsNothing);

    // Yes: proceeds to the rating dialog (the release PATCH fires later).
    await tester.tap(find.text('Confirm Received'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Yes, I received them'));
    await tester.pumpAndSettle();
    expect(find.text('Submit'), findsOneWidget,
        reason: 'rating dialog opens only after the explicit yes');
  });

  // ---- D-4 / D-5: buyer payment-recovery on the order detail --------------

  Map<String, dynamic> buyerOrder({
    required String id,
    String status = 'PENDING',
    String? proformaId,
    String? paymentStatus = 'PAYMENT_SUBMITTED',
    String? method,
  }) =>
      {
        'orderId': id,
        'orderNumber': 'ORD-$id',
        'status': status,
        if (paymentStatus != null) 'paymentStatus': paymentStatus,
        if (proformaId != null) 'proformaId': proformaId,
        if (method != null) 'paymentMethodType': method,
        'totalAmount': 5000.0,
        'currency': 'TZS',
        'orderType': 'buying',
        'fulfillmentType': 'SELLER_DELIVERY',
        'sellerName': 'Recovery Seller',
      };

  MockClient recoveryClient({
    required String orderId,
    required Map<String, dynamic> order,
    List<Map<String, dynamic>> payments = const [],
  }) =>
      MockClient((req) async {
        if (req.url.path == '/api/v1/orders/$orderId') {
          return http.Response(jsonEncode(order), 200,
              headers: {'content-type': 'application/json'});
        }
        if (req.url.path == '/api/v1/payments/my') {
          return http.Response(jsonEncode(payments), 200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 404);
      });

  Future<AuthStore> authWith(http.Client transport) async {
    final store = AuthStore(
      api: ApiClient(client: transport),
      initialToken: 'jwt',
      initialEmail: 'buyer@recovery.test',
    );
    AuthStore.instance = store;
    return store;
  }

  Map<String, dynamic> paymentRow({
    String proformaId = 'pf-r',
    String status = 'PAYMENT_SUBMITTED',
    List<Map<String, dynamic>> receipts = const [],
    String? method = 'MOBILE_MONEY',
    String orderId = 'r-1',
    dynamic expiresAt,
  }) =>
      {
        'proformaId': proformaId,
        'proformaNumber': 'PF-2026-$proformaId',
        'grandTotal': 5000.0,
        'currency': 'TZS',
        'status': status,
        if (method != null) 'paymentMethodType': method,
        'orderIds': [orderId],
        if (expiresAt != null) 'expiresAt': expiresAt,
        'receipts': receipts,
      };

  testWidgets(
      'D-4: rejected proof shows the amber banner + reason + Upload new proof '
      'CTA that opens the Rejected payments tab', (tester) async {
    final order = buyerOrder(id: 'r-1', proformaId: 'pf-r', method: 'MOBILE_MONEY');
    final transport = recoveryClient(
      orderId: 'r-1',
      order: order,
      payments: [
        paymentRow(receipts: [
          {
            'status': 'REJECTED',
            'rejectionReason': 'Amount does not match',
            'rejectionReasonCode': 'AMOUNT_MISMATCH',
          },
        ]),
      ],
    );
    final store = await authWith(transport);

    await pumpDetail(tester, transport, orderId: 'r-1');
    // The banner is near the top of the detail.
    expect(find.text('Payment proof rejected - upload a corrected proof'),
        findsOneWidget);
    expect(find.text('Amount does not match'), findsOneWidget);

    // CTA deep-links to the Rejected tab of My Payments (a real screen push —
    // never a fake money action).
    await tester.tap(find.text('Upload new proof'));
    await tester.pumpAndSettle();
    expect(find.text('Rejected 1'), findsOneWidget);

    // Bottom Payment block rows carry the web method/status copy.
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Payment status'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Payment method'), findsOneWidget);
    expect(find.text('Mobile money'), findsOneWidget);
    expect(find.text('Payment status'), findsOneWidget);
    expect(find.text('Rejected - new proof required'), findsOneWidget);
    expect(store.token, 'jwt');
  });

  testWidgets(
      'D-4: corrected proof under review shows the blue banner and a '
      '"Submitted - under review" status row', (tester) async {
    final order = buyerOrder(id: 'r-2', proformaId: 'pf-r2');
    final transport = recoveryClient(
      orderId: 'r-2',
      order: order,
      payments: [
        paymentRow(
          proformaId: 'pf-r2',
          orderId: 'r-2',
          receipts: [
            {'status': 'REJECTED', 'rejectionReason': 'amount differs'},
            {'status': 'SUBMITTED'},
          ],
        ),
      ],
    );
    await authWith(transport);
    await pumpDetail(tester, transport, orderId: 'r-2');

    expect(find.text('New payment proof submitted - under review'),
        findsOneWidget);
    expect(
        find.textContaining('No further action is needed'),
        findsOneWidget);

    await tester.scrollUntilVisible(find.text('Payment status'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Submitted - under review'), findsOneWidget);
  });

  testWidgets(
      'D-5: an unpaid proforma shows the Pay now card with its countdown, and '
      'hides when the order has no proforma', (tester) async {
    final order = buyerOrder(
        id: 'n-1',
        status: 'AWAITING_PAYMENT',
        proformaId: 'pf-n1',
        paymentStatus: 'PENDING_PAYMENT');
    final transport = recoveryClient(
      orderId: 'n-1',
      order: order,
      payments: [
        paymentRow(
          proformaId: 'pf-n1',
          orderId: 'n-1',
          status: 'PENDING_PAYMENT',
          expiresAt: DateTime.now()
              .toUtc()
              .add(const Duration(minutes: 42))
              .toIso8601String(),
        ),
      ],
    );
    await authWith(transport);
    await pumpDetail(tester, transport, orderId: 'n-1');

    expect(find.text('Pay now'), findsOneWidget);
    expect(find.textContaining('Complete payment within'), findsOneWidget);

    // No proforma on the order (and none matched by order id) ⇒ no Pay now.
    final noProformaTransport = recoveryClient(
      orderId: 'n-2',
      order: buyerOrder(
        id: 'n-2',
        status: 'AWAITING_PAYMENT',
        proformaId: null,
        paymentStatus: 'PENDING_PAYMENT',
      ),
      payments: const [],
    );
    await authWith(noProformaTransport);
    await pumpDetail(tester, noProformaTransport, orderId: 'n-2');
    expect(find.text('Pay now'), findsNothing);
  });

  testWidgets(
      'D-6: eligible seller with selling orders gets the non-dismissible '
      'payout-setup prompt', (tester) async {
    final transport = MockClient((req) async {
      if (req.url.path == '/api/v1/orders') {
        return http.Response(
            jsonEncode([
              {
                'orderId': 's-9',
                'orderNumber': 'ORD-S9',
                'status': 'PAID',
                'orderType': 'selling',
                'totalAmount': 1000.0,
                'currency': 'TZS',
              },
            ]),
            200,
            headers: {'content-type': 'application/json'});
      }
      if (req.url.path ==
          '/api/v1/userManagement/payout-details/prompt-status') {
        return http.Response(
            jsonEncode({
              'hasListings': true,
              'configured': false,
              'shouldPrompt': true,
            }),
            200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 404);
    });
    final auth = AuthStore(
      api: ApiClient(client: transport),
      initialToken: 'jwt',
      initialEmail: 'seller@prompt.test',
    );
    AuthStore.instance = auth;
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(MaterialApp(
      home: OrdersScreen(
        auth: auth,
        api: ApiClient(client: transport),
        initialTab: 'selling',
      ),
    ));
    await tester.pumpAndSettle();

    // Web copy + a route into the payout-details screen (display-only).
    expect(find.text('Set up your payout method'), findsOneWidget);
    expect(
        find.textContaining(
            'Your seller payments will be sent here after the payment process'),
        findsOneWidget);
    expect(find.text('Set up now'), findsOneWidget);
  });

  testWidgets(
      'D-6: a configured seller is never interrupted by the payout prompt',
      (tester) async {
    final transport = MockClient((req) async {
      if (req.url.path == '/api/v1/orders') {
        return http.Response(
            jsonEncode([
              {
                'orderId': 's-10',
                'orderNumber': 'ORD-S10',
                'status': 'PAID',
                'orderType': 'selling',
                'totalAmount': 1000.0,
                'currency': 'TZS',
              },
            ]),
            200,
            headers: {'content-type': 'application/json'});
      }
      if (req.url.path ==
          '/api/v1/userManagement/payout-details/prompt-status') {
        return http.Response(
            jsonEncode({
              'hasListings': true,
              'configured': true,
              'shouldPrompt': false,
            }),
            200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 404);
    });
    final auth = AuthStore(
      api: ApiClient(client: transport),
      initialToken: 'jwt',
      initialEmail: 'seller@prompt.test',
    );
    AuthStore.instance = auth;
    await tester.pumpWidget(MaterialApp(
      home: OrdersScreen(
        auth: auth,
        api: ApiClient(client: transport),
        initialTab: 'selling',
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Set up your payout method'), findsNothing);
  });

  // ---- A-23 (ORDERS-12): buyer-journey milestone strip + narrative --------

  Map<String, dynamic> journeyOrder({
    required String id,
    required String status,
    String fulfillmentType = 'BUYER_PICKUP',
    String? transporterName,
  }) =>
      {
        'orderId': id,
        'orderNumber': 'ORD-$id',
        'status': status,
        'paymentStatus': 'PAID',
        'totalAmount': 45000.0,
        'currency': 'TZS',
        'orderType': 'buying',
        'fulfillmentType': fulfillmentType,
        'sellerName': 'Journey Seller',
        if (transporterName != null)
          'trip': {'transporter': {'fullName': transporterName}},
      };

  MockClient journeyClient(String orderId, Map<String, dynamic> order) =>
      MockClient((req) async {
        if (req.url.path == '/api/v1/orders/$orderId') {
          return http.Response(jsonEncode(order), 200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 404);
      });

  testWidgets(
      'A-23: buying pickup order shows the Delivery journey milestones and the '
      'collected narrative', (tester) async {
    await pumpDetail(
        tester,
        journeyClient('j-p1',
            journeyOrder(id: 'j-p1', status: 'PICKED_UP')),
        orderId: 'j-p1');

    // "Order tracking" is the same four-step journey the order card shows
    // (web `app/orders/[id]/page.tsx:1191`), with the pickup wording: a
    // collected order is on its last step.
    expect(find.text('Order tracking'), findsOneWidget);
    expect(_journey(tester).steps.length, 4);
    expect(find.text('Collected'), findsWidgets);
    expect(_journey(tester).currentIndex, 3);

    // The six-step lifecycle timeline is gone from the order page: one
    // order, one journey.
    expect(find.text('Ready for pickup'), findsNothing);
    expect(find.byType(DeliveryJourney), findsOneWidget);
  });

  testWidgets(
      'A-23: buying delivery order mid-transit shows the out-for-delivery '
      'milestone with the transporter narrative', (tester) async {
    await pumpDetail(
        tester,
        journeyClient(
            'j-d1',
            journeyOrder(
              id: 'j-d1',
              status: 'IN_TRANSIT',
              fulfillmentType: 'SELLER_DELIVERY',
              transporterName: 'Yusuf Ali',
            )),
        orderId: 'j-d1');

    // The tracking rail is the four-step journey: "Out for delivery", step 3
    // of 4, and it names the transporter under the step.
    expect(find.text('Order tracking'), findsOneWidget);
    expect(_journey(tester).steps.length, 4);
    expect(_journey(tester).currentIndex, 2);
    expect(find.text('Out for delivery'), findsWidgets);
    expect(find.text('Yusuf Ali is bringing your order'), findsOneWidget);
    expect(find.byType(DeliveryJourney), findsOneWidget,
        reason: 'the six-step lifecycle rail was removed from the page');

    // The assigned-transporter card still sits below the tracking panel.
    expect(find.text('Yusuf Ali'), findsOneWidget);
  });

  testWidgets(
      'A-23: the retired buyer-journey strip text never reappears for the seller',
      (tester) async {
    await pumpDetail(tester, sellingClient());
    // The tracking rail itself is shown to both roles; only the buyer-only
    // narrative strip this test used to pin is gone for good.
    expect(find.text('Order tracking'), findsOneWidget);
    expect(find.text('Delivery journey'), findsNothing);
    expect(find.text('Latest update'), findsNothing);
  });
}
