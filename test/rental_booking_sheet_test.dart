// Rental "Book now" — web parity with product-actions.tsx +
// product-choice-selector.tsx + rental-date-range-calendar.tsx.
//
// The reported bug: on the apartment listing, "Buy now" only toasted
// "Select your rental dates to continue." because the dates lived in two bare
// buttons on the page and the button never opened anything. The web opens a
// booking sheet with a calendar; so does the app now.
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
import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';
import 'package:globoexpats_mobile/screens/product_quick_add.dart';

http.Response _json(Object b) => http.Response(jsonEncode(b), 200,
    headers: {'content-type': 'application/json'});

// Next month, so the dates are always in the future and on one page.
final _now = DateTime.now();
final _month = DateTime(_now.year, _now.month + 1, 1);
DateTime _d(int day) => DateTime(_month.year, _month.month, day);
Finder _day(int day) =>
    find.byKey(ValueKey('rental-day-${rentalDateToJson(_d(day))}'));

/// Shaped like the live Sinza apartment (product 470): a nightly short stay
/// whose check-in/checkout times are single-value choice attributes.
MockClient _client({int bookedFrom = 10, int bookedTo = 12}) =>
    MockClient((req) async {
      final path = req.url.path;
      if (path.endsWith('/itemDetails/470/rental-availability')) {
        return _json({
          'productId': 470,
          'bookedToday': false,
          'availableFrom': rentalDateToJson(_now),
          'bookedRanges': [
            {
              'startDate': rentalDateToJson(_d(bookedFrom)),
              'endDate': rentalDateToJson(_d(bookedTo)),
            }
          ],
        });
      }
      if (path.endsWith('/itemDetails/470')) {
        return _json({
          'productId': 470,
          'productName': 'Modern Business Stay Apartment at Sinza',
          'productAskingPrice': 110000,
          'productCurrency': 'TZS',
          'productQuantity': 1,
          'sellerId': 88,
          'sellerPayout': 98000,
          'categoryName': 'Real Estate',
          'categoryCommissionPercentage': 8.0,
          'vatRate': 0.0,
          'selcomCommissionRate': 0.011,
          'selcomTransactionRate': 0.025,
          'latitude': -6.7883,
          'longitude': 39.2277,
          'transportRequirement': 'EXEMPT',
          'rentalConfiguration': {
            'enabled': true,
            'listingType': 'FOR_RENT',
            'ratePeriod': 'NIGHT'
          },
          'choiceConfiguration': {
            'hasChoices': true,
            'attributes': [
              {
                'definitionId': 77,
                'name': 'Check-in time',
                'required': false,
                'values': [
                  {'id': 'ci', 'label': '1:00 PM', 'active': true}
                ],
              },
              {
                'definitionId': 78,
                'name': 'Checkout time',
                'required': false,
                'values': [
                  {'id': 'co', 'label': '11:00 AM', 'active': true}
                ],
              },
            ],
          },
          'productImages': [],
        });
      }
      return http.Response('{}', 404);
    });

Future<void> _openSheet(WidgetTester tester) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
      home: ProductDetailScreen(
          productId: 470, api: ApiClient(client: _client()))));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Book now'));
  await tester.pumpAndSettle();
  await tester.tap(find.byTooltip('Next month'));
  await tester.pumpAndSettle();
}

Finder get _sheetBookNow => find.descendant(
    of: find.byType(BottomSheet), matching: find.text('Book now'));

bool _enabled(WidgetTester tester, Finder button) =>
    tester
        .widget<FilledButton>(
            find.ancestor(of: button, matching: find.byType(FilledButton)))
        .onPressed !=
    null;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  setUp(() {
    CartStore.instance.clear();
    AuthStore.instance =
        AuthStore(initialToken: 'jwt-test', initialEmail: 'buyer@test.tz');
  });
  tearDown(() {
    CartStore.instance.clear();
    AuthStore.instance = null;
  });

  testWidgets('a rental page offers Book now, never a cart or quantity',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: ProductDetailScreen(
            productId: 470, api: ApiClient(client: _client()))));
    await tester.pumpAndSettle();

    expect(find.text('Book now'), findsOneWidget);
    expect(find.text('Buy now'), findsNothing);
    expect(find.byTooltip('Add to cart'), findsNothing);
    expect(find.byTooltip('See on map'), findsOneWidget);
    expect(find.text('Quantity'), findsNothing);
  });

  testWidgets('Book now opens the calendar instead of a dead-end toast',
      (tester) async {
    await _openSheet(tester);

    expect(find.text('Choose dates'), findsOneWidget);
    expect(find.textContaining('Select your rental dates'), findsNothing);
    expect(find.text('Choose a valid start and end date to continue.'),
        findsOneWidget);
    expect(_enabled(tester, _sheetBookNow), isFalse);
    expect(find.text('Quantity'), findsNothing);
  });

  testWidgets('picking check-in and checkout books the nights at the total',
      (tester) async {
    await _openSheet(tester);

    await tester.tap(_day(2));
    await tester.pumpAndSettle();
    await tester.tap(_day(5));
    await tester.pumpAndSettle();

    expect(find.text('3 nights selected.'), findsOneWidget);
    expect(
        find.descendant(
            of: find.byType(BottomSheet),
            matching: find.text('TSh 330,000', findRichText: true)),
        findsOneWidget);
    expect(_enabled(tester, _sheetBookNow), isTrue);

    await tester.tap(_sheetBookNow);
    await tester.pump();

    final line = CartStore.instance.items.single;
    expect(line.quantity, 1);
    expect(line.price, 330000,
        reason: 'a rental line is priced at the booking total (web parity)');
    final b = line.rentalBooking!;
    expect(b.billableUnits, 3);
    expect(b.sellingUnitRate, 110000);
    expect(b.sellerUnitRate, 98000,
        reason: 'the seller rate comes from the payout, not the buyer price');
    expect(b.sellerTotal, 294000);
    expect(b.pickupTime, '1:00 PM');
    expect(b.returnTime, '11:00 AM');
    expect(b.startDate, _d(2));
    expect(b.endDate, _d(5));
  });

  testWidgets('booked nights cannot be crossed, but can be the checkout day',
      (tester) async {
    await _openSheet(tester); // nights 10 and 11 are booked

    await tester.tap(_day(8));
    await tester.pumpAndSettle();
    // A range over the booked nights is refused…
    await tester.tap(_day(14));
    await tester.pumpAndSettle();
    expect(find.textContaining('nights selected'), findsNothing);

    // …but checking out on the first booked day is fine: checkout is not a
    // night spent there.
    await tester.tap(_day(10));
    await tester.pumpAndSettle();
    expect(find.text('2 nights selected.'), findsOneWidget);
  });

  testWidgets('the card books a rental in the same sheet (web handleBuyOnPlatform)',
      (tester) async {
    tester.view.physicalSize = const Size(900, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final api = ApiClient(client: _client());
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: QuickAddCartButton(
            api: api,
            product: const Product(
                productId: 470,
                productName: 'Modern Business Stay Apartment at Sinza',
                productAskingPrice: 110000,
                productQuantity: 1,
                isRental: true),
          ),
        ),
      ),
    ));
    expect(find.byIcon(Icons.event_available_outlined), findsOneWidget);
    expect(find.byIcon(Icons.shopping_cart_outlined), findsNothing);

    await tester.tap(find.byKey(const ValueKey('quick-add-470')));
    await tester.pumpAndSettle();
    expect(find.text('Choose dates'), findsOneWidget);
    expect(CartStore.instance.count, 0,
        reason: 'nothing undated may reach the cart');
  });

  test('the list payload marks rentals', () {
    expect(
        Product.fromJson({
          'productId': 470,
          'productName': 'x',
          'rentalConfiguration': {'ratePeriod': 'NIGHT'}
        }).isRental,
        isTrue);
    expect(Product.fromJson({'productId': 1, 'productName': 'y'}).isRental,
        isFalse);
  });
}
