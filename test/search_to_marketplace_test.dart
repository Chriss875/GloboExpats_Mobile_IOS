import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/screens/catalog_screens.dart';
import 'package:globoexpats_mobile/widgets/globo_app_bar.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:go_router/go_router.dart';

/// Every way into product search now lands on the marketplace with the term
/// applied, rather than on a parallel results page: the header field, the
/// "Most Popular Categories" tiles and the "Shop by Category" mosaic.
/// (Web parity: `search-bar.tsx` pushes `/browse?q=`, and
/// `buildQuickSubcategoryBrowseHref` pushes `/browse?...&subcategory=`.)
void main() {
  http.Response jsonOk(Object body) => http.Response(jsonEncode(body), 200,
      headers: {'content-type': 'application/json'});

  group('the header search field', () {
    testWidgets('submits to /browse with the term, not to /search',
        (tester) async {
      final pushed = <String>[];
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => Scaffold(
              appBar: GloboAppBar(
                api: ApiClient(client: MockClient((_) async => jsonOk({}))),
                extendedSearch: true,
              ),
            ),
          ),
          GoRoute(
            path: '/browse',
            builder: (context, state) {
              pushed.add(state.uri.toString());
              return const Scaffold(body: Text('marketplace'));
            },
          ),
          GoRoute(
            path: '/search',
            builder: (context, state) {
              pushed.add(state.uri.toString());
              return const Scaffold(body: Text('search screen'));
            },
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(SearchBar), 'blender');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      expect(pushed, ['/browse?q=blender']);
      expect(find.text('marketplace'), findsOneWidget);
    });

    testWidgets('offers a clear button once there is text', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          appBar: GloboAppBar(
            api: ApiClient(client: MockClient((_) async => jsonOk({}))),
            extendedSearch: true,
          ),
        ),
      ));
      await tester.pump();
      final clear = find.byKey(const ValueKey('home-search-clear'));
      expect(clear, findsNothing);

      await tester.enterText(find.byType(SearchBar), 'blender');
      await tester.pump();
      expect(clear, findsOneWidget);

      await tester.tap(clear);
      await tester.pump();
      expect(find.text('blender'), findsNothing);
      expect(clear, findsNothing);
    });

    testWidgets('is short enough not to read as a second app bar',
        (tester) async {
      // The row used to be 54px: the trailing IconButton's 48px minimum tap
      // target set the height on its own and the declared minHeight never
      // applied. Guarding the declared size keeps that from creeping back.
      const bar = GloboAppBar(extendedSearch: true);
      const plain = GloboAppBar();
      expect(bar.preferredSize.height - plain.preferredSize.height,
          lessThanOrEqualTo(46));
    });
  });

  group('the marketplace', () {
    testWidgets('applies ?q= to the product request', (tester) async {
      final searchTerms = <Object?>[];
      final api = ApiClient(client: MockClient((req) async {
        if (req.url.path.contains('filter')) {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          searchTerms.add(body['searchTerm']);
          return jsonOk({'content': [], 'totalElements': 0});
        }
        return jsonOk([]);
      }));

      await tester.pumpWidget(MaterialApp(
          home: BrowseScreen(api: api, initialQuery: 'blender')));
      await tester.pumpAndSettle();

      expect(searchTerms, isNotEmpty,
          reason: 'the list must have asked the backend for something');
      expect(searchTerms.first, 'blender',
          reason: 'the term used to be dropped: _PagedList hardcoded '
              'searchTerm: null, so /browse?q= showed an unfiltered list');
    });

    testWidgets('opens with the search panel showing the term it applied',
        (tester) async {
      final api = ApiClient(client: MockClient((req) async {
        if (req.url.path.contains('filter')) {
          return jsonOk({'content': [], 'totalElements': 0});
        }
        return jsonOk([]);
      }));

      await tester.pumpWidget(MaterialApp(
          home: BrowseScreen(api: api, initialQuery: 'blender')));
      await tester.pumpAndSettle();

      expect(find.widgetWithText(TextField, 'blender'), findsOneWidget);
    });

    testWidgets('an empty ?q= leaves the term off the request',
        (tester) async {
      final searchTerms = <Object?>[];
      final api = ApiClient(client: MockClient((req) async {
        if (req.url.path.contains('filter')) {
          searchTerms
              .add((jsonDecode(req.body) as Map<String, dynamic>)['searchTerm']);
          return jsonOk({'content': [], 'totalElements': 0});
        }
        return jsonOk([]);
      }));

      await tester.pumpWidget(MaterialApp(home: BrowseScreen(api: api)));
      await tester.pumpAndSettle();

      expect(searchTerms.first, anyOf(isNull, ''));
    });
  });
}
