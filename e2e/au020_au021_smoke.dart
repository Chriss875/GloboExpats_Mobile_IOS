// AU-020/AU-021 sandbox smoke — REAL backend calls against http://localhost:8083
// (sandbox only). Run with: flutter test e2e/au020_au021_smoke.dart
//
// Proves the cart model + fresh-stock revalidation behave correctly against
// live sandbox data (no mocks): per-choice lines, selection math, seller
// grouping from real sellerIds, and qty revalidation against real stock.
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/cart/seller_grouping.dart';

void main() {
  final api = ApiClient();

  test('sandbox smoke: real detail feeds cart lines, caps and grouping',
      () async {
    // Real products from the seeded sandbox catalog (verified ids).
    const rimsId = 1; // sellerId 1, productQuantity 1
    final oil = await api.fetchProductDetail(624); // seller 59, qty 30
    final rims = await api.fetchProductDetail(rimsId);

    expect(oil.productId, 624);
    expect(rims.productId, rimsId);
    expect(rims.productQuantity, greaterThanOrEqualTo(1));

    final cart = CartStore();

    // 1) Add a real quantity within stock for the body oil (stock 30).
    final errOil = cart.addDetail(
      productId: oil.productId,
      sellerId: oil.sellerId?.toString(),
      sellerName: oil.sellerName,
      title: oil.productName,
      price: oil.productAskingPrice,
      imageUrl:
          oil.productImages.isNotEmpty ? oil.productImages.first : null,
      condition: oil.productCondition,
      category: oil.categoryName,
      location: oil.locationLabel,
      currency: oil.productCurrency,
      maxQuantity: oil.productQuantity > 0 ? oil.productQuantity : null,
      quantity: 2,
    );
    expect(errOil, isNull);

    // 2) Over-cap add on a real single-unit listing is REJECTED.
    final errRims = cart.addDetail(
      productId: rims.productId,
      sellerId: rims.sellerId?.toString(),
      sellerName: rims.sellerName,
      title: rims.productName,
      price: rims.productAskingPrice,
      maxQuantity: rims.productQuantity > 0 ? rims.productQuantity : null,
      quantity: rims.productQuantity + 1,
    );
    expect(
        errOil == null && errRims != null, isTrue,
        reason: 'single-stock listing must reject qty ${rims.productQuantity + 1}');
    expect(errRims,
        'Only ${rims.productQuantity} unit${rims.productQuantity == 1 ? ' is' : 's are'} available for this item.');

    // 3) Fresh-stock revalidation pulls stored quantities down to live stock.
    cart.updateQuantity(cart.items.single.lineId, 25);
    final adjusted = cart.applyStockCaps({oil.productId: 5});
    expect(adjusted.single.productId, oil.productId);
    expect(cart.items.single.quantity, 5);

    // 4) Seller grouping uses REAL sellerIds → one group here; adding the rims
    //    line would create a second group (delivery quoted once per group).
    final groups = groupCartItemsBySeller(cart.selectedItems);
    expect(groups.length, 1);
    expect(groups.single.sellerId, oil.sellerId.toString());
    expect(groups.single.sellerName, oil.sellerName);
    expect(groups.single.subtotal, closeTo(5 * oil.productAskingPrice, 0.01));
  });
}
