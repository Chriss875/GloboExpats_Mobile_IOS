// AU-015 — choice_priced_variants (widget proof, sandbox fixture 593).
// Fixture mirrors the sandbox: Volume attribute, default '120 ml',
// '500 ml' priceOverridden=true sellerPayoutAdjustment=18000.
// Web reference parity (product-actions.tsx + product-choice-selector.tsx):
// selectable choices gate add-to-cart/buy-now through a selector dialog and
// a priced pick recomputes the displayed price; the pick rides the cart line
// (two variants = two lines). The mobile build renders choices INLINE (no
// dialog yet) — these tests pin the inline behavior that IS implemented.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';

http.Response _json(Object b) =>
    http.Response(jsonEncode(b), 200, headers: {'content-type': 'application/json'});

MockClient _client593({double? askingPrice}) => MockClient((req) async {
      if (req.url.path.startsWith('/api/v1/displayItem/itemDetails')) {
        return _json({
          'productId': 593,
          'productName': '100% PURE COCONUT OIL(ORGANIC) 120mls',
          'productPrice': askingPrice ?? 8000,
          'productAskingPrice': askingPrice ?? 8000,
          'productCurrency': 'TZS',
          'productQuantity': 10,
          'sellerName': 'ludovick severine',
          'categoryName': 'Skin Care',
          'productImages': [],
          'choiceConfiguration': {
            'hasChoices': true,
            'attributes': [
              {
                'definitionId': 13,
                'name': 'Volume',
                'inputType': 'NUMBER_UNIT',
                'required': true,
                'visual': true,
                'allowDifferentPrices': true,
                'defaultValueId': '120-ml-31a31480',
                'values': [
                  {
                    'id': '120-ml-31a31480',
                    'label': '120 ml',
                    'priceOverridden': false,
                    'sellerPayoutAdjustment': 0.0,
                    'active': true,
                  },
                  {
                    'id': '500-ml-4d79dc25',
                    'label': '500 ml',
                    'priceOverridden': true,
                    'sellerPayoutAdjustment': 18000.0,
                    'active': true,
                  },
                ],
              },
            ],
          },
        });
      }
      return http.Response('{}', 404);
    });

ChoiceChip _chip(WidgetTester tester, String label) =>
    tester.widget<ChoiceChip>(
        find.byWidgetPredicate((w) => w is ChoiceChip && (w.label as Text).data == label));

/// Opens the listing AND its options sheet: the chips moved behind the buy
/// button (web `product-actions.tsx` opens `ProductChoiceSelector`), so every
/// selection test starts by opening it.
Future<void> _pumpDetail(WidgetTester tester, ApiClient api) async {
  await tester.pumpWidget(
      MaterialApp(home: ProductDetailScreen(productId: 593, api: api)));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Buy now'));
  await tester.pumpAndSettle();
}

/// The sheet's own "Add to cart", not the page dock's.
Finder get _sheetAddToCart => find.descendant(
    of: find.byType(BottomSheet), matching: find.text('Add to cart'));

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

  testWidgets('AU-015: selector section renders with the default preselected',
      (tester) async {
    await _pumpDetail(tester, ApiClient(client: _client593()));

    expect(find.textContaining('Volume', findRichText: true), findsWidgets);
    expect(_chip(tester, '120 ml').selected, isTrue,
        reason: 'defaultValueId (120 ml) must be preselected');
    expect(_chip(tester, '500 ml').selected, isFalse);
  });

  testWidgets('AU-015: tapping a value moves the selection to it',
      (tester) async {
    await _pumpDetail(tester, ApiClient(client: _client593()));

    await tester.tap(find.byWidgetPredicate(
        (w) => w is ChoiceChip && (w.label as Text).data == '500 ml'));
    await tester.pumpAndSettle();

    expect(_chip(tester, '500 ml').selected, isTrue);
    expect(_chip(tester, '120 ml').selected, isFalse);
  });

  testWidgets('AU-015: two variants produce TWO distinct cart lines',
      (tester) async {
    final api = ApiClient(client: _client593());
    await _pumpDetail(tester, api);

    // add the default variant (120 ml preselected)
    await tester.tap(_sheetAddToCart);
    await tester.pumpAndSettle();

    // switch to 500 ml and add again, through the sheet each time
    await tester.tap(find.text('Buy now'));
    await tester.pumpAndSettle();
    await tester.tap(find.byWidgetPredicate(
        (w) => w is ChoiceChip && (w.label as Text).data == '500 ml'));
    await tester.pumpAndSettle();
    await tester.tap(_sheetAddToCart);
    await tester.pumpAndSettle();

    expect(CartStore.instance.count, 2,
        reason: 'two different variant selections must be separate lines');
    final lines = CartStore.instance.items.toList();
    expect(lines.map((l) => l.lineId).toSet().length, 2,
        reason: 'line ids must differ by choice value');
    for (final l in lines) {
      expect(l.lineId, contains('d13:'),
          reason: 'line id carries definitionId:value signature');
    }
    expect(lines.any((l) => l.lineId.contains('120-ml-31a31480')), isTrue);
    expect(lines.any((l) => l.lineId.contains('500-ml-4d79dc25')), isTrue);
  });

  testWidgets('AU-015: a priced pick reprices the sheet and the cart line',
      (tester) async {
    // Web product-choice-selector `unitSellingPrice`: the listing's implied
    // payout (8,000 reversed = 6,000 at the Others/defaults rates) plus the
    // 18,000 adjustment, forwarded again and rounded up = 29,000.
    await _pumpDetail(tester, ApiClient(client: _client593()));
    final sheetPrice = find.descendant(
        of: find.byType(BottomSheet),
        matching: find.text('TSh 8,000', findRichText: true));
    expect(sheetPrice, findsOneWidget);

    await tester.tap(find.byWidgetPredicate(
        (w) => w is ChoiceChip && (w.label as Text).data == '500 ml'));
    await tester.pumpAndSettle();

    expect(
        find.descendant(
            of: find.byType(BottomSheet),
            matching: find.text('TSh 29,000', findRichText: true)),
        findsOneWidget);

    await tester.tap(_sheetAddToCart);
    await tester.pumpAndSettle();
    final line = CartStore.instance.items.single;
    expect(line.lineId, contains('500-ml-4d79dc25'));
    expect(line.price, 29000,
        reason: 'the cart line must carry the repriced unit, as on the web');
  });

  testWidgets('AU-015: the default variant keeps the listing price',
      (tester) async {
    await _pumpDetail(tester, ApiClient(client: _client593()));
    await tester.tap(_sheetAddToCart);
    await tester.pumpAndSettle();
    expect(CartStore.instance.items.single.price, 8000);
  });
}
