// A cart line saved without its seller or photo (older builds' card button)
// showed a nameless "Seller" group and an empty picture. The cart now fills
// what is missing from the live listing it already reads on open.
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/cart/seller_grouping.dart';
import 'package:globoexpats_mobile/models/product_detail.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  setUp(() => CartStore.instance.clear());
  tearDown(() => CartStore.instance.clear());

  test('fills the seller and photo, never the price or quantity', () {
    CartStore.instance.addDetail(
      productId: 510,
      title: 'Cudy 4G LTE N300 Wi-Fi Router',
      price: 174000,
      quantity: 2,
      choices: const [SelectedChoice(definitionId: 100, valueId: 'v-10')],
    );
    final before = CartStore.instance.items.single;
    expect(before.sellerName, isNull);
    expect(groupCartItemsBySeller(CartStore.instance.items).single.sellerName,
        'Seller');

    CartStore.instance.backfillFromListing(510,
        sellerId: '3',
        sellerName: 'Globo Expats',
        imageUrl: 'uploads/router.webp',
        location: 'Dar es Salaam');

    final after = CartStore.instance.items.single;
    expect(after.sellerName, 'Globo Expats');
    expect(after.sellerId, '3');
    expect(after.imageUrl, 'uploads/router.webp');
    expect(after.price, 174000);
    expect(after.quantity, 2);
    expect(after.lineId, before.lineId);
    expect(after.selectedChoices.single.valueId, 'v-10');
    expect(groupCartItemsBySeller(CartStore.instance.items).single.sellerName,
        'Globo Expats');
  });

  test('keeps what a line already has', () {
    CartStore.instance.addDetail(
      productId: 7,
      title: 'Lamp',
      price: 1000,
      sellerName: 'Original Seller',
      imageUrl: 'uploads/lamp.webp',
    );
    CartStore.instance.backfillFromListing(7,
        sellerName: 'Someone Else', imageUrl: 'uploads/other.webp');
    final line = CartStore.instance.items.single;
    expect(line.sellerName, 'Original Seller');
    expect(line.imageUrl, 'uploads/lamp.webp');
  });

  test('the verified flag survives a save and reload', () {
    final item = CartItem(
        productId: 1, title: 't', price: 1, isVerified: true);
    expect(CartItem.fromJson(item.toJson()).isVerified, isTrue);
  });
}
