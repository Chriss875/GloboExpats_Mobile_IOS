import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/domain/description_parser.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});

Map<String, dynamic> _detailPayload({
  int qty = 3,
  String? whatsapp,
  int? sellerId = 7,
  int? sellerUserId,
  String description =
      'Hand carved bowls.\n\n--- SPECIFICATIONS ---\nMaterial: Teak\nItem Age: 2 years',
}) =>
    {
      'productId': 101,
      'productName': 'Wooden bowls set',
      'productDescription': description,
      'productAskingPrice': 51000,
      'productQuantity': qty,
      'sellerId': sellerId,
      if (sellerUserId != null) 'sellerUserId': sellerUserId,
      if (whatsapp != null) 'whatsappNumber': whatsapp,
      'productImages': [
        {'imageUrl': '/uploads/bowls.webp'}
      ],
    };

ApiClient _apiWith(Map<String, dynamic> detail) => ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/itemDetails/101')) return _json(detail);
        if (req.url.path.startsWith('/api/v1/user-ratings/')) {
          return _json({
            'content': [
              {
                'ratingId': 1,
                'authorName': 'Amina J.',
                'stars': 4.5,
                'reviewText': 'Great seller, fast delivery.',
              },
              {
                'ratingId': 2,
                'authorName': 'Baraka',
                'stars': 5.0,
                'reviewText': ''
              },
            ],
            'totalElements': 12,
          });
        }
        if (req.url.path.endsWith('/user-details')) {
          // Viewer id 7 == fixture sellerId → the own-item guard applies.
          return _json({'userId': detail['sellerId'] ?? 7, 'roles': []});
        }
        // click tracking + anything else
        return _json({});
      }),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AU-017 parseProductDescription', () {
    test('splits prose from --- SPECIFICATIONS --- block', () {
      final p = parseProductDescription(
          'Nice item\nsecond line\n\n--- SPECIFICATIONS ---\nMaterial: Teak\nWeight: 2 kg');
      expect(p.description, 'Nice item\nsecond line');
      expect(p.specifications, {'Material': 'Teak', 'Weight': '2 kg'});
    });

    test('no separator means no specs', () {
      final p = parseProductDescription('Just a plain description.');
      expect(p.description, 'Just a plain description.');
      expect(p.specifications, isEmpty);
    });

    test('empty/null input is safe', () {
      expect(parseProductDescription(null).specifications, isEmpty);
      expect(parseProductDescription('').description, '');
    });
  });

  testWidgets('AU-017: Reviews tab renders written seller feedback',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: ProductDetailScreen(
            productId: 101, api: _apiWith(_detailPayload()))));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Reviews'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reviews'));
    await tester.pumpAndSettle();

    // Review rows come from the seller's public ratings endpoint. The compact
    // tab intentionally keeps the heading free of an unreliable product-level
    // count when the detail payload does not include one.
    expect(find.text('Seller reviews'), findsOneWidget);
    expect(find.text('Amina J.'), findsOneWidget);
    expect(find.text('Great seller, fast delivery.'), findsOneWidget);
    // Star-only ratings contribute to the summary but are not fabricated into
    // written review cards.
    expect(find.text('Baraka'), findsNothing);
    expect(find.text('4.5'), findsOneWidget);
    // Placeholder copy from the old build must never appear.
    expect(find.textContaining('Reviews available for this product'),
        findsNothing);
  });

  testWidgets('AU-017: SPECIFICATIONS block renders as a spec table',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: ProductDetailScreen(
            productId: 101, api: _apiWith(_detailPayload()))));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Specs'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Specs'));
    await tester.pumpAndSettle();

    expect(find.text('Technical Specifications'), findsOneWidget);
    expect(find.text('Material'), findsOneWidget);
    expect(find.text('Teak'), findsOneWidget);
    expect(find.text('Item Age'), findsOneWidget);
    // The raw separator must not leak into rendered prose.
    expect(find.textContaining('--- SPECIFICATIONS ---'), findsNothing);
  });

  testWidgets('AU-018: own item is rejected with the reference toast',
      (tester) async {
    CartStore.instance.clear();
    // Viewer id == sellerId → own listing.
    AuthStore.instance = AuthStore(
        api: _apiWith(_detailPayload()),
        initialToken: 'jwt',
        initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(
        home: ProductDetailScreen(
            productId: 101, api: _apiWith(_detailPayload()))));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Add to cart'));
    await tester.pump();
    expect(
        find.textContaining('You cannot add your own listed items to the cart'),
        findsOneWidget);
    expect(CartStore.instance.count, 0); // nothing was added
    CartStore.instance.clear();
  });

  testWidgets('AU-018: out of stock disables purchase buttons and flips label',
      (tester) async {
    AuthStore.instance = null;
    await tester.pumpWidget(MaterialApp(
        home: ProductDetailScreen(
            productId: 101, api: _apiWith(_detailPayload(qty: 0)))));
    await tester.pumpAndSettle();

    expect(find.text('Out of stock'), findsOneWidget);
    final buy = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Out of stock'));
    expect(buy.onPressed, isNull);
  });

  testWidgets('AU-018: signed-out add shows the Login Required toast',
      (tester) async {
    AuthStore.instance = null;
    CartStore.instance.clear();
    await tester.pumpWidget(MaterialApp(
        home: ProductDetailScreen(
            productId: 101, api: _apiWith(_detailPayload()))));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Add to cart'));
    await tester.pump();
    expect(find.textContaining('Login Required'), findsOneWidget);
    expect(CartStore.instance.count, 0);
    CartStore.instance.clear();
  });
}
