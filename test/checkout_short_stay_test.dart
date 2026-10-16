// A checkout of short stays only reads as a booking (web 2026-10,
// docs/short-stays-booking.md): "Book your stay", guest details instead of a
// delivery address, the stay's dates instead of a quantity, and a review that
// says the booking still needs payment verification and host confirmation.
// Wording only — a mixed cart keeps the ordinary checkout.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/domain/rentals.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

void main() {
  http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
      headers: {'content-type': 'application/json'});

  final api = ApiClient(client: MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/user-details')) {
      return ok({
        'firstName': 'Amina',
        'lastName': 'Juma',
        'loggingEmail': 'amina@example.com',
        'whatsAppPhoneNumber': '+255767800110',
      });
    }
    if (path.endsWith('/get-addresses')) return ok(const []);
    return http.Response('{}', 404);
  }));

  RentalBooking stay() => buildRentalBooking(
        const RentalConfiguration(
            ratePeriod: RentalRatePeriod.night, shortStay: true),
        DateTime(2026, 9, 2),
        DateTime(2026, 9, 5),
        sellerUnitRate: 90000,
        sellingUnitRate: 110000,
        pickupTime: '2:00 PM',
        returnTime: '10:00 AM',
      );

  void addStay() => CartStore.instance.addDetail(
        productId: 470,
        sellerId: '88',
        sellerName: 'Sea View Host',
        title: 'Sea View Flat',
        price: 330000,
        transportRequirement: 'EXEMPT',
        rentalBooking: stay(),
      );

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(400, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@x.com');
    await tester.pumpWidget(MaterialApp(home: CheckoutFlowHarness(api: api)));
    await tester.pumpAndSettle();
  }

  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
  });
  tearDown(() async {
    AuthStore.instance = null;
    // ignore: discarded_futures
    CartStore.instance.reset();
  });

  testWidgets('a stay checkout asks for the guest, not a delivery address',
      (tester) async {
    addStay();
    await pump(tester);

    expect(find.text('Book your stay'), findsOneWidget);
    expect(find.text('Guest details'), findsWidgets);
    expect(find.text('Delivery Address'), findsNothing);
    expect(find.text('Select From Saved Addresses'), findsNothing);
    expect(find.textContaining('Your stay (1)'), findsOneWidget);
    expect(find.text('Review quantities before delivery.'), findsNothing);
    expect(find.text('Your stay'), findsOneWidget,
        reason: 'the line shows its dates, never a quantity');

    await tester.scrollUntilVisible(find.text('Continue to review'), 300,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Continue to review'));
    await tester.pumpAndSettle();

    expect(find.text('Review your stay'), findsOneWidget,
        reason: 'no saved address is needed to go on');
    expect(find.textContaining('host confirmation'), findsWidgets);
    expect(find.text('Guest contact'), findsOneWidget);
  });

  testWidgets('a stay with an ordinary product keeps the normal checkout',
      (tester) async {
    addStay();
    CartStore.instance.addDetail(
      productId: 615,
      sellerId: '128',
      sellerName: 'Globo Expats',
      title: 'The Diary of a CEO',
      price: 35000,
      transportRequirement: 'REQUIRED',
      deliveryTransportMode: 'BODA',
    );
    await pump(tester);

    expect(find.text('Checkout'), findsOneWidget);
    expect(find.text('Delivery Address'), findsOneWidget);
    expect(find.text('Book your stay'), findsNothing);
  });
}
