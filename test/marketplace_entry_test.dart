// Arriving in the marketplace from Home: a "Shop by Preference" tile opens
// with ALL its subcategories on and visible, "See more" keeps its order, and
// the filter sheet carries the web's category/subcategory filters.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/screens/cart_screen.dart';
import 'package:globoexpats_mobile/screens/catalog_screens.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

http.Response _json(Object b) => http.Response(jsonEncode(b), 200,
    headers: {'content-type': 'application/json'});

final _categories = [
  {
    'categoryId': 1,
    'categoryName': 'Electronics',
    'subcategories': [
      for (var i = 0; i < 12; i++)
        {'subcategoryId': 100 + i, 'subcategoryName': 'Gadget type $i'},
    ],
  },
  {
    'categoryId': 2,
    'categoryName': 'Food',
    'subcategories': [
      {'subcategoryId': 200, 'subcategoryName': 'Meat & Poultry'},
    ],
  },
];

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    ApiClient.invalidateReads();
  });

  ({ApiClient api, List<Uri> filters}) backend() {
    final filters = <Uri>[];
    final api = ApiClient(client: MockClient((req) async {
      final path = req.url.path;
      if (path == '/api/v1/products/categories') return _json(_categories);
      if (path.endsWith('/category-availability')) return _json([1, 2]);
      if (path.endsWith('/subcategory-availability')) {
        return _json([for (var i = 0; i < 12; i++) 100 + i, 200]);
      }
      if (path.endsWith('/displayItem/filter')) {
        filters.add(req.url);
        return _json({'content': [], 'totalElements': 0});
      }
      return _json([]);
    }));
    return (api: api, filters: filters);
  }

  test('"See more" orders survive the trip', () {
    expect(ProductSort.fromParam('trending'), ProductSort.trending);
    expect(ProductSort.fromParam('date-desc'), ProductSort.newest);
    expect(ProductSort.fromParam('price-asc'), ProductSort.priceAsc);
    expect(ProductSort.fromParam(null), ProductSort.relevance);
  });

  test('"Newest" really is newest first, like the web date-desc', () {
    Product p(int id, String? at) => Product.fromJson({
          'productId': id,
          'productName': 'P$id',
          'productAskingPrice': 1000,
          if (at != null) 'createdAtIso': at,
        });
    final shuffled = [
      p(1171, '2026-09-29T21:16:01Z'),
      p(1174, '2026-10-01T14:25:30Z'),
      p(1172, null),
      p(1173, '2026-09-30T06:32:44Z'),
    ];
    expect(sortProducts(shuffled, ProductSort.newest).map((e) => e.productId),
        [1174, 1173, 1172, 1171]);
  });

  testWidgets(
      'a preference tile shows its subcategories, highlighted and in view, '
      'and asks for all of them', (tester) async {
    final b = backend();
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    // Two subcategories, the second far along the rail — no category given.
    await tester.pumpWidget(MaterialApp(
        home: BrowseScreen(api: b.api, initialSubcategoryIds: const [101, 110])));
    await tester.pumpAndSettle();

    expect(find.text('Gadget type 1'), findsOneWidget,
        reason: 'the subcategory rail opens on the tile\'s category');
    expect(find.text('Gadget type 10'), findsOneWidget);

    // The first pick is scrolled into view, not left off the edge.
    final pill = tester.getRect(find.text('Gadget type 1'));
    expect(pill.left, greaterThanOrEqualTo(0));
    expect(pill.right, lessThanOrEqualTo(400));

    final sent = b.filters.last.queryParametersAll['subcategoryIds'];
    expect(sent, containsAll(['101', '110']),
        reason: 'every subcategory reaches the request, not just the last');
  });

  testWidgets('the filter sheet picks a category and several subcategories',
      (tester) async {
    final b = backend();
    tester.view.physicalSize = const Size(400, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: BrowseScreen(api: b.api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Open filters'));
    await tester.pumpAndSettle();
    expect(find.text('Product source'), findsOneWidget);
    await tester.tap(find.text('Shops'));
    await tester.tap(find.byKey(const ValueKey('filter-category-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('filter-subcategory-102')));
    await tester.tap(find.byKey(const ValueKey('filter-subcategory-103')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('filter-apply')));
    await tester.pumpAndSettle();

    final url = b.filters.last;
    expect(url.queryParametersAll['subcategoryIds'], ['102', '103']);
    expect(url.queryParameters['categoryIds'], '1');
    expect(url.queryParameters['productSource'], 'SHOPS');
  });

  testWidgets('the cart always has a way back, even with nothing under it',
      (tester) async {
    final router = GoRouter(initialLocation: '/cart', routes: [
      GoRoute(path: '/', builder: (_, __) => const Text('HOME')),
      GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
    ]);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('cart-back')), findsOneWidget);
    // The phone's back button goes home instead of closing the app.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('HOME'), findsOneWidget);
  });
}
