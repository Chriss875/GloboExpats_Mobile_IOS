import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';
import 'package:globoexpats_mobile/screens/product_quick_add.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "The Add to Cart button in the home page and market place pages vs that in
/// the product page particularly for this product work differently."
///
/// The product is the Cudy 4G router (prod listing 1168): two optional
/// internet-package attributes with priced options. The card put it straight
/// into the cart with nothing chosen — no packages offered, bare price — and
/// without the own-item or sign-in guards the product page runs. Both now go
/// through one purchase path.
void main() {
  Map<String, dynamic> router({
    int sellerId = 77,
    int quantity = 30,
    bool withChoices = true,
  }) =>
      {
        'productId': 1168,
        'productName': 'Cudy 4G LTE N300 Wi-Fi Universal Router',
        'productAskingPrice': 171000,
        'sellerPayout': 150000,
        'productQuantity': quantity,
        'sellerId': sellerId,
        'sellerName': 'Infinitynest',
        if (withChoices)
          'choiceConfiguration': {
            'hasChoices': true,
            'attributes': [
              {
                'definitionId': 1,
                'name': 'Compatibility',
                'required': false,
                'values': [
                  {
                    'id': 'v-sim',
                    'label': 'Vodacom and Yas SIM Cards',
                    'active': true
                  },
                ],
              },
              {
                'definitionId': 2,
                'name': 'One Month Internet Package - Vodacom',
                'required': false,
                'allowDifferentPrices': true,
                'defaultValueId': 'v-none',
                'values': [
                  {'id': 'v-none', 'label': 'None', 'active': true},
                  {
                    'id': 'v-10',
                    'label': '10Mbps',
                    'active': true,
                    'sellerPayoutAdjustment': 100000
                  },
                  {
                    'id': 'v-20',
                    'label': '20Mbps',
                    'active': true,
                    'sellerPayoutAdjustment': 120000
                  },
                ],
              },
            ],
          },
      };

  /// The card's view of the same listing: a search/feed summary.
  const card = Product(
    productId: 1168,
    productName: 'Cudy 4G LTE N300 Wi-Fi Universal Router',
    productAskingPrice: 171000,
    productQuantity: 30,
    sellerName: 'Infinitynest',
  );

  ApiClient api(Map<String, dynamic> detail, {int viewerId = 5}) =>
      ApiClient(client: MockClient((req) async {
        final path = req.url.path;
        http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
            headers: {'content-type': 'application/json'});
        if (path.contains('/displayItem/itemDetails/')) return ok(detail);
        if (path.endsWith('/user-details')) return ok({'userId': viewerId});
        if (path.contains('displayItem')) return ok({'content': []});
        return ok({});
      }));

  Future<void> pumpCardButton(WidgetTester tester, ApiClient client,
      {bool signedIn = true}) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    AuthStore.instance = signedIn
        ? AuthStore(api: client, initialToken: 'jwt', initialEmail: 'b@x.com')
        : null;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(child: QuickAddCartButton(product: card, api: client)),
      ),
    ));
    await tester.pump();
  }

  Future<void> tapCart(WidgetTester tester) async {
    await tester.tap(find.byKey(const ValueKey('quick-add-1168')));
    await tester.pumpAndSettle();
  }

  /// Picks [package] in the options sheet and confirms Add to cart.
  Future<void> addFromSheet(WidgetTester tester, String package) async {
    await tester.tap(find.text(package));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(
        of: find.byType(BottomSheet), matching: find.text('Add to cart')));
    await tester.pumpAndSettle();
  }

  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  tearDown(() async {
    AuthStore.instance = null;
    // ignore: discarded_futures
    CartStore.instance.reset();
  });

  testWidgets('the card offers the packages instead of skipping them',
      (tester) async {
    await pumpCardButton(tester, api(router()));

    await tapCart(tester);

    // The same sheet the product page opens — nothing is in the cart yet.
    expect(find.byType(BottomSheet), findsOneWidget);
    expect(find.text('10Mbps'), findsOneWidget);
    expect(find.text('20Mbps'), findsOneWidget);
    expect(CartStore.instance.items, isEmpty,
        reason: 'a listing with options is not added before one is chosen');

    await addFromSheet(tester, '20Mbps');

    expect(CartStore.instance.items, hasLength(1));
    // Round-tripped through JSON so the choices compare as plain maps.
    final line = jsonDecode(jsonEncode(CartStore.instance.items.single.toJson()))
        as Map<String, dynamic>;
    expect(line['choices'],
        contains(equals(const {'definitionId': 2, 'valueId': 'v-20'})),
        reason: 'the chosen package rides the cart line');
    expect(find.text('Added to cart'), findsOneWidget);
  });

  testWidgets('the card and the product page make the same cart line',
      (tester) async {
    // From the card.
    await pumpCardButton(tester, api(router()));
    await tapCart(tester);
    await addFromSheet(tester, '20Mbps');
    final fromCard = jsonDecode(
            jsonEncode(CartStore.instance.items.single.toJson()))
        as Map<String, dynamic>;

    // ignore: discarded_futures
    CartStore.instance.reset();
    await tester.pumpAndSettle();

    // From the product page, same choice.
    final client = api(router());
    AuthStore.instance =
        AuthStore(api: client, initialToken: 'jwt', initialEmail: 'b@x.com');
    await tester.pumpWidget(
        MaterialApp(home: ProductDetailScreen(productId: 1168, api: client)));
    await tester.pumpAndSettle();
    // With Buy now in the wide slot, the page's Add to cart is the dock's
    // cart icon.
    await tester.tap(find.byTooltip('Add to cart'));
    await tester.pumpAndSettle();
    await addFromSheet(tester, '20Mbps');
    final fromPage = jsonDecode(
            jsonEncode(CartStore.instance.items.single.toJson()))
        as Map<String, dynamic>;

    // Line ids and timestamps aside, the purchase is the same one.
    Map<String, dynamic> comparable(Map<String, dynamic> line) =>
        Map.of(line)
          ..remove('id')
          ..remove('addedAt');
    expect(comparable(fromCard), comparable(fromPage));
  });

  testWidgets('a listing with nothing to choose goes straight in',
      (tester) async {
    await pumpCardButton(tester, api(router(withChoices: false)));

    await tapCart(tester);

    expect(find.byType(BottomSheet), findsNothing);
    expect(CartStore.instance.items, hasLength(1));
    expect(find.text('Added to cart'), findsOneWidget);
  });

  testWidgets('a signed-out buyer is asked to sign in, as on the page',
      (tester) async {
    await pumpCardButton(tester, api(router()), signedIn: false);

    await tapCart(tester);

    expect(find.textContaining('Login Required'), findsOneWidget);
    expect(find.byType(BottomSheet), findsNothing);
    expect(CartStore.instance.items, isEmpty);
  });

  testWidgets('a seller cannot add their own listing from a card',
      (tester) async {
    // The viewer IS the seller.
    await pumpCardButton(tester, api(router(sellerId: 77), viewerId: 77));

    await tapCart(tester);

    expect(find.textContaining('cannot add your own listed items'),
        findsOneWidget);
    expect(CartStore.instance.items, isEmpty);
  });
}
