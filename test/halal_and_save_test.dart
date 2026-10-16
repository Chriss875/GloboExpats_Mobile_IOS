// Product cards carry the web's Halal badge (for listings whose choices mark
// them Halal) and the save heart, in both the grid and the list layout.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:globoexpats_mobile/widgets/product_card.dart';
import 'package:globoexpats_mobile/widgets/product_grid.dart';

Map<String, dynamic> _choices(String attribute, String value,
        {bool active = true, bool hasChoices = true}) =>
    {
      'hasChoices': hasChoices,
      'attributes': [
        {
          'name': attribute,
          'values': [
            {'id': 'v1', 'label': value, 'active': active},
          ],
        }
      ],
    };

Product _product(int id, {Map<String, dynamic>? choices}) => Product.fromJson({
      'productId': id,
      'productName': 'Beef T-Bone $id',
      'productAskingPrice': 24000,
      'productCurrency': 'TZS',
      'productQuantity': 3,
      'sellerName': 'Prime Choice',
      if (choices != null) 'choiceConfiguration': choices,
    });

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
  });

  group('the list payload marks a listing Halal like the web', () {
    test('an active "Halal" value under Halal or Halal status', () {
      expect(_product(1, choices: _choices('Halal', 'Halal')).isHalal, isTrue);
      expect(_product(2, choices: _choices('halal_status', 'HALAL')).isHalal,
          isTrue);
    });

    test('anything else is not', () {
      expect(_product(3).isHalal, isFalse);
      expect(_product(4, choices: _choices('Halal', 'Halal', active: false))
          .isHalal, isFalse);
      expect(_product(5, choices: _choices('Halal', 'Non-halal')).isHalal,
          isFalse);
      expect(_product(6, choices: _choices('Cut', 'Halal')).isHalal, isFalse);
      expect(
          _product(7, choices: _choices('Halal', 'Halal', hasChoices: false))
              .isHalal,
          isFalse);
    });
  });

  Future<void> pump(WidgetTester tester, Widget child) async {
    tester.view.physicalSize = const Size(430, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
    await tester.pump();
  }

  testWidgets('a grid card shows the Halal badge and the heart',
      (tester) async {
    await pump(
        tester,
        SizedBox(
          width: 200,
          height: 340,
          child: ProductCard(_product(1, choices: _choices('Halal', 'Halal'))),
        ));
    expect(find.byKey(const ValueKey('halal-badge')), findsOneWidget);
    expect(find.byType(ProductSaveButton), findsOneWidget);
  });

  testWidgets('list rows keep both, and only Halal listings get the badge',
      (tester) async {
    await pump(
        tester,
        SingleChildScrollView(
          child: ProductListRows([
            _product(1, choices: _choices('Halal', 'Halal')),
            _product(2),
          ]),
        ));
    expect(find.byKey(const ValueKey('halal-badge')), findsOneWidget);
    expect(find.byType(ProductSaveButton), findsNWidgets(2));
    expect(find.bySemanticsLabel('Save to wishlist'), findsNWidgets(2));
  });

  testWidgets('saving while signed out asks the shopper to log in',
      (tester) async {
    await pump(
        tester,
        SingleChildScrollView(child: ProductListRows([_product(1)])));
    await tester.tap(find.byType(ProductSaveButton));
    await tester.pump();
    expect(find.text('Log in to save items to your wishlist.'), findsOneWidget);
  });
}
