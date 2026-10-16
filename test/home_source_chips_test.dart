import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/domain/product_source.dart';
import 'package:globoexpats_mobile/screens/home_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// "These icons are not functioning well in the live Server. They bring
/// results/products that are different from the desktop version" — reported
/// of the All / Community / Shops chips on Home.
///
/// They were a client-side guess: mobile fetched a page of listings and then
/// sorted them itself on sellerType / vendorId / sellerOrganization. The web
/// sends the choice to the backend (`productSource=COMMUNITY|SHOPS`,
/// lib/product-source.ts), so the two could never agree — the heuristic is
/// not the backend's rule, and filtering after the fetch only ever sees the
/// items already on the page.
void main() {
  http.Response jsonOk(Object body) => http.Response(jsonEncode(body), 200,
      headers: {'content-type': 'application/json'});

  Map<String, dynamic> product(int id, String name) => {
        'productId': id,
        'productName': name,
        'productAskingPrice': 40000,
        'sellerName': 'Globo Expats',
      };

  /// Records every display request the screen makes, keyed by endpoint.
  ({ApiClient api, List<Uri> requests}) harness() {
    final requests = <Uri>[];
    final api = ApiClient(client: MockClient((req) async {
      final path = req.url.path;
      if (path.contains('displayItem')) {
        requests.add(req.url);
        final source = req.url.queryParameters['productSource'];
        return jsonOk({
          'content': [
            product(source == 'SHOPS' ? 2 : 1,
                source == null ? 'Everything' : 'Only $source'),
          ],
          'totalElements': 1,
        });
      }
      return jsonOk(path.endsWith('/categories') ? [] : {});
    }));
    return (api: api, requests: requests);
  }

  testWidgets('a source chip re-asks the backend instead of filtering locally',
      (tester) async {
    final h = harness();
    await tester.pumpWidget(MaterialApp(home: HomeScreen(api: h.api)));
    await tester.pumpAndSettle();

    expect(
        h.requests.any((u) => u.queryParameters.containsKey('productSource')),
        isFalse,
        reason: '"All" sends no source at all, like the web');

    // A plain finder, not `.first`: scrollUntilVisible evaluates the finder
    // before the target exists, and `.first` throws on an empty match.
    await tester.scrollUntilVisible(find.text('Shops'), 250,
        scrollable: find
            .descendant(
                of: find.byType(CustomScrollView),
                matching: find.byType(Scrollable))
            .first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Shops').first);
    await tester.pumpAndSettle();

    final sourced = h.requests
        .where((u) => u.queryParameters['productSource'] == 'SHOPS')
        .toList();
    expect(sourced, isNotEmpty,
        reason: 'the chip has to reach the server — a page already fetched '
            'cannot answer "show me every shop listing"');
  });

  testWidgets('switching back to All drops the parameter', (tester) async {
    final h = harness();
    await tester.pumpWidget(MaterialApp(home: HomeScreen(api: h.api)));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Community'), 250,
        scrollable: find
            .descendant(
                of: find.byType(CustomScrollView),
                matching: find.byType(Scrollable))
            .first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Community').first);
    await tester.pumpAndSettle();
    expect(
        h.requests.any((u) => u.queryParameters['productSource'] == 'COMMUNITY'),
        isTrue);

    final before = h.requests.length;
    await tester.tap(find.text('All').first);
    await tester.pumpAndSettle();

    expect(h.requests.length, before,
        reason: 'going back to All reuses the request the page already made');
  });

  group('product source', () {
    test('only the two real sources travel to the API', () {
      expect(apiProductSource('community'), 'COMMUNITY');
      expect(apiProductSource('shops'), 'SHOPS');
      expect(apiProductSource('all'), isNull);
      expect(apiProductSource(null), isNull);
      expect(apiProductSource('nonsense'), isNull);
    });

    test('empty copy names the source that came back empty', () {
      expect(productSourceEmptyMessage('shops'), contains('shop listings'));
      expect(
          productSourceEmptyMessage('community'), contains('community listings'));
    });
  });
}
