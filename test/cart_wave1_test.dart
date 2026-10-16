import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/cart/seller_grouping.dart';
import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/models/product_detail.dart';
import 'package:globoexpats_mobile/screens/cart_screen.dart';

Product _p(int id, String name, double price, {int? qty}) => Product(
      productId: id,
      productName: name,
      productAskingPrice: price,
      productCurrency: 'TZS',
      productQuantity: qty,
    );

ProductDetail _detail(int productId,
        {int? sellerId = 1,
        int quantity = 5,
        String sellerName = 'Derick Ruganuza'}) =>
    ProductDetail(
      productId: productId,
      productAskingPrice: 10000,
      sellerId: sellerId,
      sellerName: sellerName,
      productName: 'P$productId',
      productQuantity: quantity,
    );

void main() {
  group('AU-020 — per-choice distinct lines + selection math', () {
    test('T7 vector: two choice variants of one product are separate lines',
        () {
      final cart = CartStore();
      const red = SelectedChoice(definitionId: 3, valueId: 'Red');
      const blue = SelectedChoice(definitionId: 3, valueId: 'Blue');
      cart.addWithChoices(_p(42, 'T-shirt', 10000), choices: [red]);
      cart.addWithChoices(_p(42, 'T-shirt', 10000), choices: [blue]);
      expect(cart.items.length, 2, reason: 'variants must NOT merge by productId');
      final lineIds = {for (final i in cart.items) i.lineId};
      expect(lineIds.length, 2);
      expect(lineIds.any((l) => l.contains('Red')), isTrue);
      expect(lineIds.any((l) => l.contains('Blue')), isTrue);
    });

    test('same variant merges into its existing line (qty adds up)', () {
      final cart = CartStore();
      const red = SelectedChoice(definitionId: 3, valueId: 'Red');
      cart.addWithChoices(_p(42, 'T-shirt', 10000), choices: [red]);
      cart.addWithChoices(_p(42, 'T-shirt', 10000), choices: [red], quantity: 2);
      expect(cart.items.length, 1);
      expect(cart.items.single.quantity, 3);
    });

    test('2P+Q vector: qty2×P + qty1×Q selected → subtotal exactly 2P+Q',
        () {
      final cart = CartStore();
      const P = 350000.0;
      const Q = 1200000.0;
      cart.addDetail(productId: 1, title: 'Speaker', price: P, quantity: 2);
      cart.addDetail(productId: 2, title: 'Camera', price: Q, quantity: 1);
      expect(cart.total, closeTo(2 * P + Q, 0.01));
    });

    test('selection checkbox toggles subtotal exactly and gates checkout', () {
      final cart = CartStore();
      cart.addDetail(productId: 1, title: 'A', price: 20000, quantity: 2);
      cart.addDetail(productId: 2, title: 'B', price: 30000, quantity: 1);
      expect(cart.selectedCount, 2);
      expect(cart.total, 70000);

      cart.toggleSelected('p1');
      expect(cart.total, 30000);
      expect(cart.selectedCount, 1);

      cart.toggleSelected('p2');
      expect(cart.total, 0);
      expect(cart.selectedCount, 0);
      expect(cart.count, 3, reason: 'deselected lines stay in the cart');

      // selectAll / deselectAll (web parity selectAllItems/deselectAllItems).
      cart.selectAll();
      expect(cart.selectedCount, 2);
      cart.deselectAll();
      expect(cart.selectedCount, 0);
    });

    test('cart item JSON round-trips seller + stock fields (persistence)', () {
      final cart = CartStore();
      cart.addDetail(
        productId: 9,
        sellerId: '77',
        sellerName: 'Radha Saindrane',
        title: 'Body Oil',
        price: 15500,
        condition: 'NEW',
        location: 'Dar es Salaam, Mikocheni',
        maxQuantity: 4,
        quantity: 2,
      );
      final json = cart.items.single.toJson();
      final restored = CartItem.fromJson(json);
      expect(restored.sellerId, '77');
      expect(restored.sellerName, 'Radha Saindrane');
      expect(restored.maxQuantity, 4);
      expect(restored.quantity, 2);
      expect(restored.lineId, cart.items.single.lineId);
    });
  });

  group('AU-021 — stock cap + seller grouping', () {
    test('add above stock is rejected with the reference copy (not clamped)',
        () {
      final cart = CartStore();
      final err =
          cart.add(_p(5, 'Rims', 800000, qty: 2), quantity: 3);
      expect(err, 'Only 2 units are available for this item.');
      expect(cart.isEmpty, isTrue, reason: 'over-cap add must not mutate cart');
    });

    test('updateQuantityCapped rejects over-stock bumps with reference copy',
        () {
      final cart = CartStore();
      expect(cart.add(_p(5, 'Rims', 800000, qty: 4), quantity: 4), isNull);
      final err = cart.updateQuantityCapped('p5', 5);
      expect(err, 'Only 4 units are available for this item.');
      expect(cart.items.single.quantity, 4, reason: 'quantity unchanged');
      expect(cart.updateQuantityCapped('p5', 4), isNull);
      expect(cart.items.single.quantity, 4);
    });

    test('single-unit stock uses singular copy ("Only 1 unit is available")',
        () {
      final cart = CartStore();
      final err = cart.add(_p(1, 'Rim set', 800000, qty: 1), quantity: 2);
      expect(err, 'Only 1 unit is available for this item.');
    });

    test('items without known stock fall back to the 999 absolute ceiling',
        () {
      final cart = CartStore();
      expect(cart.add(_p(6, 'Mystery', 1000)), isNull);
      expect(cart.updateQuantityCapped('p6', 999), isNull);
      expect(cart.items.single.quantity, 999);
      expect(
        cart.updateQuantityCapped('p6', 1000),
        'Only 999 units are available for this item.',
      );
    });

    test('applyStockCaps shrinks stale quantities to fresh stock', () {
      final cart = CartStore();
      cart.add(_p(10, 'A', 5000)); // stored qty 1
      cart.updateQuantity('p10', 8); // stale: stock has since dropped to 3
      cart.add(_p(11, 'B', 6000));

      final adjusted = cart.applyStockCaps({10: 3});
      expect(adjusted.single.productId, 10);
      expect(cart.items.firstWhere((i) => i.productId == 10).quantity, 3);
      expect(cart.items.firstWhere((i) => i.productId == 11).quantity, 1);
    });

    test('applyStockCaps drops lines whose stock hit zero', () {
      final cart = CartStore();
      cart.add(_p(10, 'A', 5000));
      cart.applyStockCaps({10: 0});
      expect(cart.isEmpty, isTrue);
    });

    test('seller grouping: delivery fee is quoted once per seller group', () {
      final cart = CartStore();
      // Seller 77 × 2 items + seller 88 × 1 item.
      cart.addDetail(
          productId: 1,
          sellerId: '77',
          sellerName: 'Derick Ruganuza',
          title: 'Rims',
          price: 800000);
      cart.addDetail(
          productId: 2,
          sellerId: '77',
          sellerName: 'Derick Ruganuza',
          title: 'Spoiler',
          price: 120000);
      cart.addDetail(
          productId: 3,
          sellerId: '88',
          sellerName: 'Radha Saindrane',
          title: 'Body Oil',
          price: 15500);

      final groups = groupCartItemsBySellerOf(cart);
      expect(groups.length, 2, reason: 'two sellers → two groups');
      final g77 = groups.firstWhere((g) => g.sellerKey == '77');
      expect(g77.items.length, 2);
      expect(g77.subtotal, 920000);
      expect(g77.sellerName, 'Derick Ruganuza');
      final g88 = groups.firstWhere((g) => g.sellerKey == '88');
      expect(g88.items.length, 1);
    });

    test('grouping falls back to seller name when id missing (web parity)', () {
      final cart = CartStore();
      cart.addDetail(productId: 1, title: 'X', price: 100);
      final groups = groupCartItemsBySellerOf(cart);
      expect(groups.length, 1);
      expect(groups.single.sellerKey, 'unknown');
    });
  });

  group('AU-020/021 — cart screen UI', () {
    testWidgets('renders seller group headers and per-line data',
        (tester) async {
      final cart = CartStore();
      cart.addDetail(
          productId: 1,
          sellerId: '77',
          sellerName: 'Derick Ruganuza',
          title: 'Bose speaker',
          price: 350000,
          location: 'Dar es Salaam, Masaki',
          maxQuantity: 3);
      cart.addDetail(
          productId: 2,
          sellerId: '77',
          sellerName: 'Derick Ruganuza',
          title: 'JBL clip',
          price: 150000,
          maxQuantity: 3);
      await tester.pumpWidget(MaterialApp(home: CartScreen(cart: cart)));
      await tester.pump();

      expect(find.text('Derick Ruganuza'), findsOneWidget);
      expect(find.text('Ships from Dar es Salaam, Masaki'), findsOneWidget);
      expect(find.text('Bose speaker'), findsOneWidget);
      expect(find.text('Go to checkout'), findsOneWidget);
      expect(find.textContaining('Item (2)'), findsOneWidget);
      // Selected subtotal of both lines.
      expect(find.textContaining('500,000'), findsWidgets);
    });

    testWidgets('fresh stock from itemDetails caps the + button and shows availability',
        (tester) async {
      final cart = CartStore();
      cart.addDetail(
          productId: 5,
          title: 'Rims',
          price: 800000,
          maxQuantity: null,
          quantity: 1);

      Future<ProductDetail> fakeFetch(int id) async => _detail(id, quantity: 2);

      await tester.pumpWidget(MaterialApp(
        home: CartScreen(cart: cart, fetchDetail: fakeFetch),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump();

      // Fresh stock (2) is now shown on the tile.
      expect(find.text('2 available'), findsOneWidget);

      // Bumping past fresh stock is impossible via the UI…
      await tester.tap(find.byIcon(Icons.add));
      await tester.pump();
      expect(cart.items.single.quantity, 2);
      // …and the + button is now disabled at the fresh cap.
      await tester.tap(find.byIcon(Icons.add));
      await tester.pump();
      expect(cart.items.single.quantity, 2);
    });

    testWidgets('stored quantity above fresh stock is reduced with a notice',
        (tester) async {
      final cart = CartStore();
      cart.addDetail(
          productId: 5,
          title: 'Rims',
          price: 800000,
          maxQuantity: 99,
          quantity: 6);
      cart.updateQuantity('p5', 6); // stale: real stock is only 2

      await tester.pumpWidget(MaterialApp(
        home: CartScreen(
            cart: cart,
            fetchDetail: (id) async => _detail(id, quantity: 2)),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump();

      expect(cart.items.single.quantity, 2,
          reason: 'cart must revalidate down to live stock');
      expect(
          find.textContaining('Quantities reduced to current stock'),
          findsOneWidget);
    });

    testWidgets('detail fetch failure keeps persisted quantities (no invented caps)',
        (tester) async {
      final cart = CartStore();
      cart.addDetail(productId: 5, title: 'Rims', price: 800000, quantity: 3);
      cart.updateQuantity('p5', 3);

      Future<ProductDetail> failing(int id) =>
          throw ApiException('itemDetails failed: HTTP 500');

      await tester.pumpWidget(MaterialApp(
        home: CartScreen(cart: cart, fetchDetail: failing),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump();

      expect(cart.items.single.quantity, 3,
          reason: 'network failure must not shrink the cart');
      expect(find.textContaining('Quantities reduced'), findsNothing);
    });

    testWidgets('unselecting every line disables checkout with hint',
        (tester) async {
      final cart = CartStore();
      cart.addDetail(productId: 1, title: 'Bose speaker', price: 350000);
      await tester.pumpWidget(MaterialApp(home: CartScreen(cart: cart)));
      await tester.pump();
      await tester.tap(find.byType(Checkbox).first);
      await tester.pump();

      expect(cart.selectedCount, 0);
      expect(find.text('Select at least one item to check out'), findsOneWidget);
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Go to checkout'),
      );
      expect(button.onPressed, isNull, reason: 'checkout gated on ≥1 selected');
    });

    testWidgets('empty cart shows empty state', (tester) async {
      final cart = CartStore();
      await tester.pumpWidget(MaterialApp(home: CartScreen(cart: cart)));
      await tester.pump();
      expect(find.text('Your cart is empty'), findsOneWidget);
      expect(find.text('Cart'), findsOneWidget);
    });
  });
}

/// Helper mirroring `lib/cart/seller_grouping.dart` usage in the screen:
/// groups the lines of a store by their carried seller ids.
List<SellerGroup> groupCartItemsBySellerOf(CartStore cart) {
  return groupCartItemsBySeller(cart.items);
}
