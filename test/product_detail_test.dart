import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';
import 'package:globoexpats_mobile/screens/seller_profile_screen.dart';

MockClient _detailClient({int? sellerId}) {
  return MockClient((request) async {
    if (request.url.path == '/api/v1/displayItem/itemDetails/101') {
      return http.Response(
        jsonEncode({
          'productId': 101,
          'productName': 'Wooden bowls set',
          'productDescription': 'Five nesting bowls, hand carved.',
          'productAskingPrice': 51000,
          'productCurrency': 'TZS',
          'productCondition': 'New',
          'productQuantity': 3,
          'productImages': [
            {'imageUrl': '/uploads/bowls.webp'}
          ],
          'productRegion': 'dar es salaam',
          'placeName': '44 Pazi St',
          'sellerName': 'Anusiata Mlelwa',
          if (sellerId != null) 'sellerId': sellerId,
          'sellerOrganization': 'Anusiata Crafts',
          'productRating': 4.5,
          'totalRatingsCount': 12,
          'sameRegionDeliveryFeeMin': 3000,
          'sameRegionDeliveryFeeMax': 17000,
          'subcategoryName': 'Kitchen & Dining',
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    return http.Response('not found', 404);
  });
}

void main() {
  testWidgets('short seller name is visibly linked and opens the correct shop',
      (tester) async {
    final api = ApiClient(client: _detailClient(sellerId: 128));
    await tester.pumpWidget(MaterialApp(
      home: ProductDetailScreen(productId: 101, api: api),
    ));
    await tester.pumpAndSettle();
    final seller = find.byKey(const ValueKey('product-seller-name'));
    final text = tester.widget<Text>(seller);
    expect(text.data, 'Anusiata M.');
    expect(text.style!.decoration, TextDecoration.underline);
    expect(find.text('Anusiata Mlelwa'), findsNothing);
    await tester.ensureVisible(seller);
    await tester.tap(seller);
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<SellerProfileScreen>(find.byType(SellerProfileScreen))
            .sellerId,
        128);
  });
  testWidgets(
      'product detail shows price, name, seller, description and delivery',
      (tester) async {
    final api = ApiClient(client: _detailClient());
    await tester.pumpWidget(
      MaterialApp(home: ProductDetailScreen(productId: 101, api: api)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Wooden bowls set'), findsOneWidget);
    expect(find.text('TSh 51,000'), findsOneWidget);
    expect(find.text('Anusiata M.'), findsOneWidget);
    expect(find.text('Anusiata Mlelwa'), findsNothing);
    // The web product summary uses the public seller name only; organization
    // is deliberately not repeated in this compact row.
    expect(find.text('Anusiata Crafts'), findsNothing);
    expect(find.text('Five nesting bowls, hand carved.'), findsOneWidget);
    expect(find.text('Description'), findsOneWidget);
    // Web mobile parity: add-to-cart is the icon action in the floating dock.
    expect(find.byTooltip('Add to cart'), findsOneWidget);
  });

  testWidgets('tapping Add to cart adds to the CartStore and confirms',
      (tester) async {
    final api = ApiClient(client: _detailClient());
    CartStore.instance.clear();
    // AU-018: add-to-cart is gated on a signed-in account, so authenticate
    // first (the fixture detail has no sellerId match → not an own item).
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(
      MaterialApp(home: ProductDetailScreen(productId: 101, api: api)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Add to cart'));
    await tester.pump();
    expect(find.text('Added to cart'), findsOneWidget);
    expect(CartStore.instance.count, 1);
    CartStore.instance.clear();
    AuthStore.instance = null;
  });

  testWidgets('AU-019: WhatsApp row hidden when whatsappNumber absent',
      (tester) async {
    MockClient((req) async {
      if (req.url.path.startsWith('/api/v1/displayItem/itemDetails')) {
        return http.Response(
          jsonEncode({
            'productId': 615,
            'productName': 'Perfume',
            'productPrice': 626000,
            'productQuantity': 5,
            // no whatsappNumber key
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    await tester
        .pumpWidget(MaterialApp(home: ProductDetailScreen(productId: 615)));
    await tester.pumpAndSettle();
    expect(find.textContaining('WhatsApp seller'), findsNothing);
  });

  testWidgets('AU-014: stepper capped by stock; "N available" readout',
      (tester) async {
    final api = ApiClient(client: _detailClient()); // productQuantity: 3
    await tester.pumpWidget(
      MaterialApp(home: ProductDetailScreen(productId: 101, api: api)),
    );
    await tester.pumpAndSettle();

    // Availability readout mirrors the sandbox stock (web parity
    // "{n} available · {sold} sold"; sold segment only when > 0).
    expect(find.text('3 available'), findsOneWidget);

    // Tapping + up to the cap is possible…
    await tester.ensureVisible(find.widgetWithIcon(IconButton, Icons.add));
    await tester.pumpAndSettle();
    IconButton plusButton() =>
        tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.add));
    plusButton().onPressed!();
    await tester.pump();
    plusButton().onPressed!();
    await tester.pump();
    expect(find.text('3'), findsOneWidget); // qty readout == stock

    // …but never past it: the + button is disabled at the cap.
    final buttons = find
        .byType(IconButton)
        .evaluate()
        .map((e) => e.widget as IconButton)
        .where((b) => b.icon is Icon && (b.icon as Icon).icon == Icons.add)
        .toList();
    expect(buttons, isNotEmpty);
    expect(buttons.single.onPressed, isNull);
  });

  testWidgets('AU-014: sold segment renders when soldQuantity > 0',
      (tester) async {
    final api = ApiClient(client: MockClient((request) async {
      if (request.url.path.endsWith('/itemDetails/101')) {
        return http.Response(
          jsonEncode({
            'productId': 101,
            'productName': 'Wooden bowls set',
            'productDescription': 'Five nesting bowls, hand carved.',
            'productAskingPrice': 51000,
            'productQuantity': 7,
            'soldQuantity': 2,
            'productImages': [
              {'imageUrl': '/uploads/bowls.webp'}
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('not found', 404);
    }));
    await tester.pumpWidget(
      MaterialApp(home: ProductDetailScreen(productId: 101, api: api)),
    );
    await tester.pumpAndSettle();

    expect(find.text('7 available · 2 sold'), findsOneWidget);
  });
}
