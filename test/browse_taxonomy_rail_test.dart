import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/domain/marketplace_taxonomy.dart';
import 'package:globoexpats_mobile/models/category.dart';
import 'package:globoexpats_mobile/screens/catalog_screens.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// The browse taxonomy rails (`MarketplaceTaxonomyStrips`).
///
/// Two defects, both visible on a phone and neither caught by anything that
/// existed: tapping a subcategory pill highlighted it without reloading the
/// products, and the rail advertised every subcategory in the admin tree
/// including the ones holding nothing.
void main() {
  setUp(ApiClient.invalidateReads);
  tearDown(ApiClient.invalidateReads);

  http.Response jsonOk(Object body) => http.Response(jsonEncode(body), 200,
      headers: {'content-type': 'application/json'});

  Map<String, dynamic> subcategory(int id, String name) => {
        'subcategoryId': id,
        'subcategoryName': name,
        'status': 'ACTIVE',
      };

  final taxonomy = [
    {
      'categoryId': 1,
      'categoryName': 'Food & Groceries',
      'status': 'ACTIVE',
      'subcategories': [
        subcategory(11, 'Baby Food'),
        subcategory(12, 'Bread & Bakery'),
        subcategory(13, 'Frozen Foods'),
      ],
    },
    {
      'categoryId': 2,
      'categoryName': 'Electronics',
      'status': 'ACTIVE',
      'subcategories': [subcategory(21, 'Mobile Phones')],
    },
  ];

  /// A browse screen wired to a backend that stocks only subcategory 12 (and
  /// therefore only category 1), recording every product request's filter.
  ({Widget widget, List<Object?> requestedSubcategories}) harness({
    List<int> stockedCategories = const [1],
    List<int> stockedSubcategories = const [12],
    bool availabilityFails = false,
  }) {
    final requested = <Object?>[];
    final api = ApiClient(client: MockClient((req) async {
      final path = req.url.path;
      if (path.contains('filter')) {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        requested.add(body['subcategoryIds']);
        return jsonOk({'content': [], 'totalElements': 0});
      }
      if (path.endsWith('/categories')) return jsonOk(taxonomy);
      // Order matters: 'subcategory-availability' also ends with
      // 'category-availability'.
      if (path.endsWith('subcategory-availability')) {
        return availabilityFails
            ? http.Response('boom', 500)
            : jsonOk(stockedSubcategories);
      }
      if (path.endsWith('category-availability')) {
        return availabilityFails
            ? http.Response('boom', 500)
            : jsonOk(stockedCategories);
      }
      return jsonOk([]);
    }));
    return (
      widget: MaterialApp(home: BrowseScreen(api: api, initialCategoryId: 1)),
      requestedSubcategories: requested,
    );
  }

  testWidgets('tapping a subcategory reloads the products with that filter',
      (tester) async {
    final h = harness(stockedSubcategories: const [11, 12, 13]);
    await tester.pumpWidget(h.widget);
    await tester.pumpAndSettle();

    final before = h.requestedSubcategories.length;
    await tester.tap(find.text('Bread & Bakery'));
    await tester.pumpAndSettle();

    expect(h.requestedSubcategories.length, greaterThan(before),
        reason: 'the pill mutated the live BrowseFilter in place, so the '
            'results list compared the filter against itself and never '
            'refetched — the rail highlighted a subcategory the products '
            'below it were not filtered by');
    expect(h.requestedSubcategories.last, [12]);
  });

  testWidgets('tapping the selected subcategory again clears the filter',
      (tester) async {
    final h = harness(stockedSubcategories: const [11, 12, 13]);
    await tester.pumpWidget(h.widget);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Bread & Bakery'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bread & Bakery'));
    await tester.pumpAndSettle();

    expect(h.requestedSubcategories.last, isNull);
  });

  testWidgets('the rail lists only subcategories that have listings',
      (tester) async {
    final h = harness();
    await tester.pumpWidget(h.widget);
    await tester.pumpAndSettle();

    expect(find.text('Bread & Bakery'), findsOneWidget);
    expect(find.text('Baby Food'), findsNothing,
        reason: 'an empty subcategory can only ever land on "No products '
            'found", which reads as a broken filter');
    expect(find.text('Frozen Foods'), findsNothing);
  });

  testWidgets('the category rail drops categories with nothing in them',
      (tester) async {
    final h = harness();
    await tester.pumpWidget(h.widget);
    await tester.pumpAndSettle();

    expect(find.text('Food & Groceries'), findsOneWidget);
    expect(find.text('Electronics'), findsNothing);
  });

  testWidgets('a failed availability call leaves the full tree, not an empty rail',
      (tester) async {
    final h = harness(availabilityFails: true);
    await tester.pumpWidget(h.widget);
    await tester.pumpAndSettle();

    expect(find.text('Baby Food'), findsOneWidget);
    expect(find.text('Electronics'), findsOneWidget);
  });

  group('selectAvailableCategories', () {
    final tree = [
      Category(
        categoryId: 1,
        categoryName: 'Food',
        subcategories: const [
          Subcategory(subcategoryId: 11, subcategoryName: 'Baby Food'),
          Subcategory(subcategoryId: 12, subcategoryName: 'Bakery'),
        ],
      ),
      Category(
        categoryId: 2,
        categoryName: 'Retired',
        status: 'INACTIVE',
        subcategories: const [
          Subcategory(subcategoryId: 21, subcategoryName: 'Old'),
        ],
      ),
    ];

    test('keeps a stocked category but drops its empty subcategories', () {
      final result = selectAvailableCategories(tree, [1], [12]);
      expect(result.map((c) => c.categoryId), [1]);
      expect(result.single.subcategories.map((s) => s.subcategoryId), [12]);
    });

    test('drops an inactive category even when it is listed as available', () {
      expect(selectAvailableCategories(tree, [1, 2], [12, 21]).length, 1);
    });

    test('drops an inactive subcategory the availability list still names', () {
      final withRetired = [
        tree.first.withSubcategories(const [
          Subcategory(
              subcategoryId: 11,
              subcategoryName: 'Baby Food',
              status: 'INACTIVE'),
        ]),
      ];
      expect(selectAvailableCategories(withRetired, [1], [11]).single
          .subcategories, isEmpty);
    });
  });
}
