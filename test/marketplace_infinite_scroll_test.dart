// The marketplace (/browse) keeps loading as the shopper scrolls — no
// button — and recovers from a failed page with a Retry row.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/screens/catalog_screens.dart';

http.Response _json(Object b) => http.Response(jsonEncode(b), 200,
    headers: {'content-type': 'application/json'});

Map<String, dynamic> _product(int id) => {
      'productId': id,
      'productName': 'Item $id',
      'productAskingPrice': 1000 + id,
      'productCurrency': 'TZS',
      'productQuantity': 1,
    };

void main() {
  setUp(ApiClient.invalidateReads);
  tearDown(ApiClient.invalidateReads);

  Future<List<int>> pumpBrowse(WidgetTester tester,
      {int total = 60, Set<int> failPages = const {}}) async {
    final pages = <int>[];
    final api = ApiClient(client: MockClient((req) async {
      final path = req.url.path;
      if (path.contains('filter')) {
        final page = int.parse(req.url.queryParameters['page'] ?? '0');
        pages.add(page);
        if (failPages.contains(page)) {
          failPages = {...failPages}..remove(page);
          return http.Response('boom', 500);
        }
        final from = page * 24;
        final to = (from + 24).clamp(0, total);
        return _json({
          'content': [for (var i = from; i < to; i++) _product(i + 1)],
          'totalElements': total,
        });
      }
      return _json([]);
    }));
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 900);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: BrowseScreen(api: api)));
    await tester.pumpAndSettle();
    return pages;
  }

  Finder scrollable() => find
      .descendant(
          of: find.byType(CustomScrollView), matching: find.byType(Scrollable))
      .first;

  testWidgets('scrolling down loads the next pages by itself', (tester) async {
    final pages = await pumpBrowse(tester);
    expect(pages, [0]);
    expect(find.text('Load more'), findsNothing);

    await tester.scrollUntilVisible(find.text('Item 30'), 600,
        scrollable: scrollable());
    await tester.pumpAndSettle();
    expect(pages, containsAllInOrder([0, 1]));

    await tester.scrollUntilVisible(find.text('Item 60'), 600,
        scrollable: scrollable());
    await tester.pumpAndSettle();
    expect(pages, [0, 1, 2], reason: 'stops once the catalogue is complete');
  });

  testWidgets('a failed page offers Retry instead of hammering the server',
      (tester) async {
    final pages = await pumpBrowse(tester, failPages: {1});
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('browse-load-more-retry')), 600,
        scrollable: scrollable());
    await tester.pumpAndSettle();
    expect(pages.where((p) => p == 1), hasLength(1));

    await tester.tap(find.byKey(const ValueKey('browse-load-more-retry')));
    await tester.pumpAndSettle();
    expect(pages.where((p) => p == 1), hasLength(2));
    expect(find.text('Item 25', skipOffstage: false), findsOneWidget);
  });
}
