import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/screens/home_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// The home category tiles ARE taxonomy nodes, so tapping one selects that
/// subcategory in the marketplace. They used to push a SearchScreen keyed on
/// the tile's LABEL, which is a text search that merely resembles the
/// taxonomy — "Phones" would also match a listing titled "Phone case".
///
/// Web parity: `buildQuickSubcategoryBrowseHref` (quick-subcategories.ts) and
/// `home-category-grid.tsx` both href to `/browse?...&subcategory=<id>`.
void main() {
  const emptyPage = {'content': [], 'totalElements': 0};

  MockClient backend() => MockClient((request) async {
        final path = request.url.path;
        http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
            headers: {'content-type': 'application/json'});
        if (path == '/api/v1/products/categories') {
          return ok([
            {
              'categoryId': 1,
              'categoryName': 'Electronics',
              'slug': 'electronics',
              'imageUrl': null,
              'featured': true,
              'subcategories': [
                {
                  'subcategoryId': 10,
                  'subcategoryName': 'Phones',
                  'imageUrl': '/uploads/phones.webp',
                  'featured': true,
                  'homePosition': 0,
                }
              ],
            },
          ]);
        }
        return ok(emptyPage);
      });

  Future<List<String>> tapTile(WidgetTester tester, String label) async {
    final visited = <String>[];
    final api = ApiClient(client: backend());
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(path: '/', builder: (_, __) => Scaffold(body: HomeScreen(api: api))),
        GoRoute(
          path: '/browse',
          builder: (context, state) {
            visited.add(state.uri.toString());
            return const Scaffold(body: Text('marketplace'));
          },
        ),
        GoRoute(
          path: '/search',
          builder: (context, state) {
            visited.add(state.uri.toString());
            return const Scaffold(body: Text('search screen'));
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    // Not `.first` here: scrollUntilVisible probes the finder while nothing
    // matches yet, and a first-match finder throws on an empty result.
    await tester.scrollUntilVisible(find.text(label), 300,
        scrollable: find.byType(Scrollable).first);
    // Tap the tile itself: the label sits under the scrim gradient, so the
    // text's own rect is not reliably the InkWell's hit area.
    final tile = find
        .ancestor(of: find.text(label).first, matching: find.byType(InkWell))
        .first;
    // scrollUntilVisible stops as soon as the finder MATCHES, which can still
    // leave the tile hanging off the bottom of the test surface — and it only
    // has to move a little for that to happen (the dev build's hero glow made
    // the hero taller, and the tap started missing).
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();
    return visited;
  }

  testWidgets('a Most Popular Categories tile opens the scoped marketplace',
      (tester) async {
    // Both halves of the path: the subcategory scopes the list, and the
    // parent category makes the taxonomy rail show where you landed instead
    // of sitting on "All categories" over a filtered result.
    expect(await tapTile(tester, 'Phones'),
        ['/browse?category=1&subcategory=10']);
  });

  testWidgets('the home screen carries no floating WhatsApp button',
      (tester) async {
    final api = ApiClient(client: backend());
    await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: HomeScreen(api: api))));
    await tester.pumpAndSettle();

    expect(find.byType(FloatingActionButton), findsNothing,
        reason: 'the WhatsApp FAB sat over the bottom-right product card at '
            'every scroll position');
    expect(find.byTooltip('WhatsApp support'), findsNothing);
  });
}
