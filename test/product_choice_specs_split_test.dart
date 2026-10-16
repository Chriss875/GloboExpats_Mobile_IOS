import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// "things that are supposed to be in specs are in choose options, giving a
/// bad vibe" — reported from the phone.
///
/// The buy box rendered every configured attribute as a chip group, so an
/// attribute the seller pinned to one value ("Material: Teak") arrived as a
/// lone chip the buyer had to "choose". Web splits them by active-value count
/// (`isBuyerSelectableChoiceAttribute`, lib/product-choices.ts:175): more than
/// one active value is a decision, exactly one is a fact for the
/// Specifications tab (`ProductAttributeDetails`).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  http.Response json(Object body) => http.Response(jsonEncode(body), 200,
      headers: {'content-type': 'application/json'});

  Map<String, dynamic> value(String id, String label, {bool active = true}) =>
      {'id': id, 'label': label, 'active': active};

  /// One fixed attribute, one real choice, and one whose extra values the
  /// seller switched off — which makes it fixed too.
  Map<String, dynamic> detail() => {
        'productId': 101,
        'productName': 'Wooden bowls set',
        'productDescription': 'Hand carved bowls.',
        'productAskingPrice': 51000,
        'productQuantity': 3,
        'sellerId': 7,
        'productImages': [
          {'imageUrl': '/uploads/bowls.webp'}
        ],
        'choiceConfiguration': {
          'hasChoices': true,
          'attributes': [
            {
              'definitionId': 1,
              'name': 'Material',
              'required': false,
              'values': [value('teak', 'Teak')],
            },
            {
              'definitionId': 2,
              'name': 'Pack Size',
              'required': true,
              'values': [value('four', 'Set of 4'), value('six', 'Set of 6')],
            },
            {
              'definitionId': 3,
              'name': 'Finish',
              'required': false,
              'values': [
                value('matte', 'Matte'),
                value('gloss', 'Gloss', active: false),
              ],
            },
          ],
        },
      };

  ApiClient api() => ApiClient(client: MockClient((req) async {
        if (req.url.path.endsWith('/itemDetails/101')) return json(detail());
        if (req.url.path.endsWith('/user-details')) {
          return json({'userId': 99, 'roles': []});
        }
        return json({});
      }));

  Future<void> open(WidgetTester tester) async {
    CartStore.instance.clear();
    // The picker lives behind the buy button now, and opening it needs a
    // session (AU-018) exactly as adding to the cart always did.
    AuthStore.instance =
        AuthStore(api: api(), initialToken: 'jwt', initialEmail: 'a@b.com');
    addTearDown(() => AuthStore.instance = null);
    await tester.pumpWidget(
        MaterialApp(home: ProductDetailScreen(productId: 101, api: api())));
    await tester.pumpAndSettle();
  }

  testWidgets('only a real choice is offered as a chip', (tester) async {
    await open(tester);
    // The picker now lives behind the buy button (web
    // `product-actions.tsx` opens `ProductChoiceSelector`).
    await tester.tap(find.text('Buy now'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Pack Size', findRichText: true), findsWidgets,
        reason: 'the sheet names the attribute above its chips');
    expect(find.widgetWithText(ChoiceChip, 'Set of 4'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, 'Set of 6'), findsOneWidget);

    expect(find.widgetWithText(ChoiceChip, 'Teak'), findsNothing,
        reason: 'a single-value attribute is a spec, not a decision');
    expect(find.widgetWithText(ChoiceChip, 'Matte'), findsNothing,
        reason: 'the seller switched the second value off, so nothing is left '
            'to choose');
    expect(find.widgetWithText(ChoiceChip, 'Gloss'), findsNothing,
        reason: 'an inactive value must never be offered');
    // They are still recorded, as the sheet's read-only Features block.
    expect(find.text('Features'), findsOneWidget);
    expect(find.text('Teak'), findsOneWidget);
  });

  testWidgets('a product with no real choice shows no picker at all',
      (tester) async {
    CartStore.instance.clear();
    final fixedOnly = detail()
      ..['choiceConfiguration'] = {
        'hasChoices': true,
        'attributes': [
          {
            'definitionId': 1,
            'name': 'Material',
            'required': false,
            'values': [value('teak', 'Teak')],
          },
        ],
      };
    final client = ApiClient(client: MockClient((req) async {
      if (req.url.path.endsWith('/itemDetails/101')) return json(fixedOnly);
      if (req.url.path.endsWith('/user-details')) {
        return json({'userId': 99, 'roles': []});
      }
      return json({});
    }));

    AuthStore.instance =
        AuthStore(api: client, initialToken: 'jwt', initialEmail: 'a@b.com');
    addTearDown(() => AuthStore.instance = null);
    await tester.pumpWidget(
        MaterialApp(home: ProductDetailScreen(productId: 101, api: client)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Buy now'));
    await tester.pumpAndSettle();

    expect(find.byType(BottomSheet), findsNothing,
        reason: 'nothing to choose, so the web buys straight away');
    expect(CartStore.instance.items, hasLength(1));
  });

  testWidgets('the attributes show up under Specifications instead',
      (tester) async {
    await open(tester);

    await tester.scrollUntilVisible(find.text('Specs'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Specs'));
    await tester.pumpAndSettle();

    expect(find.text('Material'), findsOneWidget);
    expect(find.text('Teak'), findsOneWidget);
    expect(find.text('Finish'), findsOneWidget);
    expect(find.text('Matte'), findsOneWidget,
        reason: 'the only active value is the fact worth showing');
    expect(find.text('Gloss'), findsNothing);
    // The selectable one is listed too, flagged the way the web flags it.
    expect(find.text('Set of 4, Set of 6'), findsOneWidget);
    expect(find.text('Choose when purchasing'), findsOneWidget);
  });

  testWidgets('the cart line still records the fixed values', (tester) async {
    await open(tester);

    await tester.tap(find.text('Buy now'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'Set of 6'));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(
        of: find.byType(BottomSheet), matching: find.text('Add to cart')));
    await tester.pumpAndSettle();

    final line = CartStore.instance.items.single;
    final picked = {
      for (final c in line.selectedChoices) c.definitionId: c.valueId
    };
    expect(picked[2], 'six', reason: 'the buyer\'s pick');
    expect(picked[1], 'teak',
        reason: 'web parity buildSelectedChoiceSnapshot keeps fixed '
            'attributes on the line — they are part of what was bought');
    expect(picked[3], 'matte',
        reason: 'an attribute left with one active value resolves to it');
  });
}
