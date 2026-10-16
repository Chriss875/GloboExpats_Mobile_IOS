// Bookings in My Space, matching the web (2026-10, docs/short-stays-booking.md):
// All / Bookings / Products when there are stays, stay cards with dates and
// a stage instead of a delivery journey, the host's phone once paid, the
// guest's check-in code with "I've arrived", and a host who confirms or
// declines a booking rather than "items".
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/orders_screen.dart';

Map<String, dynamic> _stay({
  String status = 'AWAITING_PICKUP',
  bool selling = false,
  String? code = '482913',
  int attempts = 0,
}) =>
    {
      'orderId': 'stay-1',
      'orderNumber': 'ORD-STAY',
      'status': status,
      'paymentStatus': 'PAID',
      'totalAmount': 330000,
      'currency': 'TZS',
      'orderType': selling ? 'selling' : 'buying',
      'sellerName': 'Neema Host',
      'sellerPhone': '+255700000001',
      'buyerName': 'Amina Guest',
      'buyerPhone': '+255700000002',
      'rentalHandoffCode': code,
      'rentalHandoffCodeAttempts': attempts,
      'sellerPickupPlaceName': 'Sea View Flat',
      'sellerPickupCity': 'Dar es Salaam',
      'sellerPickupLatitude': -6.8,
      'sellerPickupLongitude': 39.28,
      'createdAt': '2026-10-01T10:00:00',
      'items': [
        {
          'productId': 470,
          'productName': 'Sea View Flat',
          'productCategorySlug': 'real-estate',
          'productSubcategorySlug': 'short-stays-holiday-rentals',
          'quantity': 1,
          'price': 330000.0,
          'rentalBooking': {
            'listingType': 'SHORT_STAY',
            'ratePeriod': 'NIGHT',
            'startDate': '2027-01-02',
            'endDate': '2027-01-05',
            'pickupTime': '2:00 PM',
            'returnTime': '10:00 AM',
            'billableUnits': 3,
          },
        }
      ],
    };

Map<String, dynamic> _product() => {
      'orderId': 'prod-1',
      'orderNumber': 'ORD-BOOK',
      'status': 'PAID',
      'paymentStatus': 'PAID',
      'totalAmount': 35000,
      'currency': 'TZS',
      'orderType': 'buying',
      'sellerName': 'Book Shop',
      'fulfillmentType': 'SELLER_DELIVERY',
      'createdAt': '2026-10-01T10:00:00',
      'items': [
        {'productId': 615, 'productName': 'A Book', 'quantity': 1, 'price': 35000.0}
      ],
    };

http.Response _json(Object b) => http.Response(jsonEncode(b), 200,
    headers: {'content-type': 'application/json'});

void main() {
  Future<List<String>> pumpList(
      WidgetTester tester, List<Map<String, dynamic>> orders,
      {String tab = 'buying'}) async {
    tester.view.physicalSize = const Size(500, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final calls = <String>[];
    final api = ApiClient(client: MockClient((req) async {
      calls.add(req.url.path);
      if (req.url.path == '/api/v1/orders') return _json(orders);
      return http.Response('{}', 404);
    }));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(
        home: OrdersScreen(auth: auth, api: api, initialTab: tab)));
    await tester.pumpAndSettle();
    return calls;
  }

  testWidgets('stays and products can be told apart', (tester) async {
    await pumpList(tester, [_stay(), _product()]);
    expect(find.byKey(const ValueKey('order-kind-filter')), findsOneWidget);
    expect(find.text('Sea View Flat'), findsWidgets);
    expect(find.text('A Book'), findsOneWidget);

    await tester.tap(find.text('Bookings'));
    await tester.pumpAndSettle();
    expect(find.text('A Book'), findsNothing);

    await tester.tap(find.text('Products'));
    await tester.pumpAndSettle();
    expect(find.text('A Book'), findsOneWidget);
    expect(find.byKey(const ValueKey('rental-stay-dates')), findsNothing);
  });

  testWidgets('no stays, no extra filter', (tester) async {
    await pumpList(tester, [_product()]);
    expect(find.byKey(const ValueKey('order-kind-filter')), findsNothing);
  });

  testWidgets('a guest’s stay card: dates, stage, host phone, code',
      (tester) async {
    await pumpList(tester, [_stay()]);

    expect(find.textContaining('BOOKING ID', findRichText: true), findsOneWidget);
    expect(find.text('Stay booking'), findsOneWidget);
    expect(find.text('Your stay'), findsOneWidget);
    expect(find.text('2 Jan 2027'), findsOneWidget);
    expect(find.text('5 Jan 2027'), findsOneWidget);
    expect(find.text('Check-in scheduled'), findsOneWidget);
    expect(find.text('Host'), findsOneWidget);
    expect(find.text('+255700000001'), findsOneWidget);
    expect(find.byKey(const ValueKey('rental-location-link')), findsOneWidget);
    expect(find.text('482913'), findsOneWidget);
    expect(find.byKey(const ValueKey('rental-code-regenerate')), findsNothing,
        reason: 'a new code only after three failed checks');

    await tester.tap(find.byKey(const ValueKey('rental-code-arrived')));
    await tester.pumpAndSettle();
    expect(find.text('Show your host this check-in code'), findsOneWidget);
    expect(find.byKey(const ValueKey('rental-code-large')), findsOneWidget);
  });

  testWidgets('without a code the guest can generate one', (tester) async {
    final calls = await pumpList(tester, [_stay(code: null)]);
    await tester.tap(find.byKey(const ValueKey('rental-code-generate')));
    await tester.pumpAndSettle();
    expect(calls.any((c) => c.endsWith('/regenerate-rental-handoff-code')),
        isTrue);
  });

  testWidgets('after three failed checks a new code is offered',
      (tester) async {
    await pumpList(tester, [_stay(attempts: 3)]);
    expect(find.byKey(const ValueKey('rental-code-regenerate')), findsOneWidget);
  });

  testWidgets('the host sees the guest, never the code', (tester) async {
    await pumpList(tester, [_stay(selling: true)], tab: 'selling');
    expect(find.text('Guest stay'), findsOneWidget);
    expect(find.text('Guest'), findsOneWidget);
    expect(find.text('+255700000002'), findsOneWidget);
    expect(find.byKey(const ValueKey('rental-code-card')), findsNothing);
    expect(find.text('482913'), findsNothing);
  });

  group('the booking itself', () {
    Future<void> pumpDetail(WidgetTester tester, Map<String, dynamic> order) async {
      tester.view.physicalSize = const Size(900, 4000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final client = MockClient((req) async {
        if (req.url.path == '/api/v1/orders/stay-1') return _json(order);
        return http.Response('{}', 404);
      });
      await tester.pumpWidget(MaterialApp(
        home: OrderDetailScreen(
          orderId: 'stay-1',
          token: 'jwt',
          api: ApiClient(client: client),
          paymentsHttpClient: client,
        ),
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('reads as a stay, not a delivery', (tester) async {
      await pumpDetail(tester, _stay());
      expect(find.text('Booking number'), findsOneWidget);
      expect(find.text('Your stay'), findsWidgets);
      expect(find.text('Stay details'), findsOneWidget);
      expect(find.text('Delivery address'), findsNothing);
      expect(find.byKey(const ValueKey('rental-code-card')), findsOneWidget);
    });

    testWidgets('a host confirms or declines the booking', (tester) async {
      await pumpDetail(
          tester, _stay(status: 'AWAITING_SELLER_CONFIRMATION', selling: true));
      expect(find.text('Confirm booking'), findsWidgets);
      expect(find.text('Decline booking'), findsOneWidget);
      expect(find.textContaining("Confirm your guest's stay"), findsOneWidget);

      await tester.tap(find.text('Decline booking'));
      await tester.pumpAndSettle();
      expect(find.text('Decline this booking?'), findsOneWidget);
      expect(find.text('Reason for the guest *'), findsOneWidget);
    });
  });
}
