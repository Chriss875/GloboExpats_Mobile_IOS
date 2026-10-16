import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "there is this internet product that has unique feature after clicking buy
/// but u kept it in the product details ... it appears after buy button is
/// clicked then it proceed to actual buy page from there".
///
/// Web parity `components/product-actions.tsx`: when a listing has something
/// for the buyer to choose, Add to cart / Buy now open
/// `ProductChoiceSelector` — a sheet holding the fixed attributes as
/// "Features", the selectable ones, and the quantity — and the sheet's own
/// buttons finish the purchase. Mobile had the picker inline on the product
/// page, which is what pushed the router's two optional internet packages in
/// front of everyone who opened that listing.
void main() {
  Map<String, dynamic> router({bool requiredChoice = false}) => {
        'productId': 501,
        'productName': 'Cudy 4G LTE N300 Wi-Fi Universal Router',
        'productAskingPrice': 285000,
        'productQuantity': 30,
        'sellerId': 77,
        'sellerName': 'Globo Expats',
        // The payload nests these under `choiceConfiguration.attributes`.
        'choiceConfiguration': {
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
              'required': requiredChoice,
              'values': [
                {'id': 'v-none', 'label': 'None', 'active': true},
                {'id': 'v-10', 'label': '10Mbps', 'active': true},
                {'id': 'v-20', 'label': '20Mbps', 'active': true},
              ],
            },
          ],
        },
      };

  ApiClient api(Map<String, dynamic> detail) =>
      ApiClient(client: MockClient((req) async {
        final path = req.url.path;
        http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
            headers: {'content-type': 'application/json'});
        if (path.contains('/displayItem/itemDetails/')) return ok(detail);
        if (path.contains('displayItem')) return ok({'content': []});
        return ok({});
      }));

  Future<void> pumpProduct(WidgetTester tester,
      {Map<String, dynamic>? detail, bool signedIn = true}) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final client = api(detail ?? router());
    AuthStore.instance = signedIn
        ? AuthStore(api: client, initialToken: 'jwt', initialEmail: 'b@x.com')
        : null;
    await tester.pumpWidget(
        MaterialApp(home: ProductDetailScreen(productId: 501, api: client)));
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

  group('the product page', () {
    testWidgets('does not put the options in front of the listing',
        (tester) async {
      await pumpProduct(tester);

      // The whole point of the report: these belong behind the button.
      expect(find.text('10Mbps'), findsNothing);
      expect(find.text('Choose options'), findsNothing);
      expect(find.text('One Month Internet Package - Vodacom'), findsNothing,
          reason: 'the picker moved into the sheet');
    });
  });

  group('the options sheet', () {
    testWidgets('opens on Buy now instead of buying straight away',
        (tester) async {
      await pumpProduct(tester);
      await tester.tap(find.text('Buy now'));
      await tester.pumpAndSettle();

      // Web's sheet: Features, the selectable groups, quantity, two actions.
      expect(find.text('Features'), findsOneWidget);
      expect(find.text('Vodacom and Yas SIM Cards'), findsOneWidget,
          reason: 'a single-value attribute is a feature, not a choice');
      expect(find.text('One Month Internet Package - Vodacom (optional)'),
          findsOneWidget);
      expect(find.text('10Mbps'), findsOneWidget);
      // The page keeps its own stepper, as the web does; this asserts the
      // sheet's.
      expect(
          find.descendant(
              of: find.byType(BottomSheet),
              matching: find.text('30 available')),
          findsOneWidget);

      // Nothing was bought by opening it.
      expect(CartStore.instance.items, isEmpty);
    });

    testWidgets('its Buy now carries the pick to the cart and to checkout',
        (tester) async {
      await pumpProduct(tester);
      await tester.tap(find.text('Buy now'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('20Mbps'));
      await tester.pumpAndSettle();
      // The sheet's own action, not the page's.
      await tester.tap(find.descendant(
          of: find.byType(BottomSheet), matching: find.text('Buy now')));
      await tester.pumpAndSettle();

      expect(CartStore.instance.items, hasLength(1));
      final line = CartStore.instance.items.first;
      expect(
          line.selectedChoices
              .any((c) => c.definitionId == 2 && c.valueId == 'v-20'),
          isTrue,
          reason: 'the package the buyer picked has to reach the order');
      expect(
          line.selectedChoices
              .any((c) => c.definitionId == 1 && c.valueId == 'v-sim'),
          isTrue,
          reason: 'fixed attributes still travel, as web '
              'buildSelectedChoiceSnapshot includes them');
      expect(find.text('Checkout'), findsWidgets,
          reason: 'Buy now proceeds to the buy page from the sheet');
    });

    testWidgets('its Add to cart stays on the listing', (tester) async {
      await pumpProduct(tester);
      await tester.tap(find.text('Buy now'));
      await tester.pumpAndSettle();

      await tester.tap(find.descendant(
          of: find.byType(BottomSheet), matching: find.text('Add to cart')));
      await tester.pumpAndSettle();

      expect(CartStore.instance.items, hasLength(1));
      expect(find.text('Added to cart'), findsOneWidget);
      expect(find.text('Checkout'), findsNothing);
    });

    testWidgets('a required choice blocks both actions until it is made',
        (tester) async {
      await pumpProduct(tester, detail: router(requiredChoice: true));
      await tester.tap(find.text('Buy now'));
      await tester.pumpAndSettle();

      expect(find.text('Select all required choices to continue.'),
          findsOneWidget);
      final buy = tester.widget<FilledButton>(find.descendant(
          of: find.byType(BottomSheet), matching: find.byType(FilledButton)));
      expect(buy.onPressed, isNull);

      await tester.tap(find.text('10Mbps'));
      await tester.pumpAndSettle();
      expect(
          find.text('Select all required choices to continue.'), findsNothing);
    });

    testWidgets('a signed-out buyer is told to log in, not shown the sheet',
        (tester) async {
      await pumpProduct(tester, signedIn: false);
      await tester.tap(find.text('Buy now'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Login Required'), findsOneWidget);
      expect(find.text('Features'), findsNothing,
          reason: 'the web runs its guards before opening the selector');
    });
  });
}
