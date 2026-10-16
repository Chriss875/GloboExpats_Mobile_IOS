import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/domain/product_choices.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';
import 'package:globoexpats_mobile/screens/sell/product_choice_editor.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

/// The backend contract, confirmed by reading
/// ProductAttributeDefinitionController/AttributeDefinitionDTO directly (not
/// assumed from the TS types alone): `GET
/// /api/v1/product-attributes/subcategories/{id}` returns a bare JSON array.
final _colorDefinition = {
  'attributeDefinitionId': 1,
  'name': 'Color',
  'slug': 'color',
  'inputType': 'COLOR',
  'required': false,
  'allowCustomValues': true,
  'visual': true,
  'allowDifferentPrices': true,
  'status': 'ACTIVE',
  'predefinedValues': [
    {'value': 'red', 'label': 'Red', 'colorHex': '#EF4444'},
    {'value': 'blue', 'label': 'Blue', 'colorHex': '#3B82F6'},
  ],
  'subcategoryIds': [10],
};

// A rebuild is what actually surfaces a mutation to `state` on screen (same
// contract the real wizard relies on: SellFormState is a plain mutable
// model, not itself listened to - the parent's setState-on-change is what
// makes an edit visible), so the harness must trigger one on every
// `onChanged`, exactly like `_SellWizardScreenState._changed()` does.
/// A real, decodable 1x1 transparent PNG - `Image.memory` in the value-row's
/// photo picker actually decodes the bytes, so garbage bytes throw.
final _tinyPng = Uint8List.fromList([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
  0x42, 0x60, 0x82,
]);

Widget _harness(SellFormState state, ApiClient api) => MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: StatefulBuilder(
            builder: (context, setState) => ProductChoiceEditor(
              state: state,
              onChanged: () => setState(() {}),
              api: api,
            ),
          ),
        ),
      ),
    );

void main() {
  testWidgets('no subcategory yet: shows the placeholder, never fetches', (tester) async {
    var called = false;
    final api = ApiClient(client: MockClient((req) async {
      called = true;
      return _json([]);
    }));
    final state = SellFormState();

    await tester.pumpWidget(_harness(state, api));
    await tester.pumpAndSettle();

    expect(find.textContaining('Choose a subcategory first'), findsOneWidget);
    expect(called, isFalse);
  });

  testWidgets('auto-enables recommended attributes for a subcategory that has them',
      (tester) async {
    final api = ApiClient(client: MockClient((req) async {
      expect(req.url.path, '/api/v1/product-attributes/subcategories/10');
      return _json([_colorDefinition]);
    }));
    final state = SellFormState()..setSubcategory(10, slug: 'phones');

    await tester.pumpWidget(_harness(state, api));
    await tester.pumpAndSettle();

    // SELLWI-12 web parity (product-choice-editor.tsx:84-92 defaultEnabled):
    // when the subcategory has recommended attributes and the configuration is
    // still empty, choices auto-enable - no master-switch tap required.
    expect(state.choiceConfiguration.hasChoices, isTrue);
    expect(find.text('Color'), findsOneWidget);
    expect(find.text('Red'), findsOneWidget);
    expect(find.text('Blue'), findsOneWidget);

    // The master switch still turns the whole feature off for the listing.
    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();
    expect(state.choiceConfiguration.hasChoices, isFalse);
    expect(find.text('Color'), findsNothing);
  });

  testWidgets('selecting a predefined value adds it to the configuration; a second makes it a buyer choice',
      (tester) async {
    final api = ApiClient(client: MockClient((req) async => _json([_colorDefinition])));
    final state = SellFormState()..setSubcategory(10, slug: 'phones');

    await tester.pumpWidget(_harness(state, api));
    await tester.pumpAndSettle();
    // Choices auto-enable (SELLWI-12), so Red/Blue chips are already visible.

    await tester.tap(find.text('Red'));
    await tester.pumpAndSettle();

    expect(state.choiceConfiguration.attributes, hasLength(1));
    var attr = state.choiceConfiguration.attributes.single;
    expect(attr.values.map((v) => v.label), ['Red']);
    expect(find.text('Fixed detail'), findsOneWidget);

    await tester.tap(find.text('Blue'));
    await tester.pumpAndSettle();

    attr = state.choiceConfiguration.attributes.single;
    expect(attr.values.map((v) => v.label), ['Red', 'Blue']);
    expect(find.text('Buyer choice'), findsOneWidget);
  });

  testWidgets(
      'turning on per-value pricing prices every option relative to the base payout, and the '
      'nonpositive-price validation catches an unpriced option',
      (tester) async {
    final api = ApiClient(client: MockClient((req) async => _json([_colorDefinition])));
    final state = SellFormState()
      ..setSubcategory(10, slug: 'phones')
      ..setPricingAmount(20000, forward: true)
      ..setDescription('A great phone')
      ..addImage('a.png', _tinyPng);

    await tester.pumpWidget(_harness(state, api));
    await tester.pumpAndSettle();
    // Choices auto-enable (SELLWI-12), so Red/Blue chips are already visible.
    await tester.tap(find.text('Red'));
    await tester.tap(find.text('Blue'));
    await tester.pumpAndSettle();

    // Second switch on the page is the attribute's "different prices" toggle
    // (the first is the master feature switch, which is already on).
    await tester.tap(find.byType(Switch).at(1));
    await tester.pumpAndSettle();

    final attr = state.choiceConfiguration.attributes.single;
    expect(attr.allowDifferentPrices, isTrue);
    expect(attr.defaultValueId, isNotNull);
    final nonDefault = attr.values.firstWhere((v) => v.id != attr.defaultValueId);
    // Non-default options start at TZS 0 until the seller edits them - this
    // is exactly the "nonpositive priced choice" case the Step-2 Next
    // validation must catch (web parity `getNonPositivePricedChoices`).
    expect(getChoiceSellerPayout(state.sellerPayout, nonDefault), 0);
    final err = state.validateStep(2);
    expect(err, contains('Enter an amount greater than zero for every available priced choice'));
  });

  testWidgets('a visual attribute lets the seller attach one of the listing photos to a value',
      (tester) async {
    final api = ApiClient(client: MockClient((req) async => _json([_colorDefinition])));
    final state = SellFormState()..setSubcategory(10, slug: 'phones');
    state.addImage('a.png', _tinyPng);

    await tester.pumpWidget(_harness(state, api));
    await tester.pumpAndSettle();
    // Choices auto-enable (SELLWI-12), so the Red chip is already visible.
    await tester.tap(find.text('Red'));
    await tester.pumpAndSettle();

    // Tap the one available photo thumbnail under the newly-added value.
    final valueId = state.choiceConfiguration.attributes.single.values.single.id;
    await tester.tap(find.byKey(ValueKey('choice-value-$valueId-image-0')));
    await tester.pumpAndSettle();

    final attr = state.choiceConfiguration.attributes.single;
    expect(attr.values.single.imageIndex, 0);
  });
}
