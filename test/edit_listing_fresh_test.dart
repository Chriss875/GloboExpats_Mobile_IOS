// The listing editor against a real itemDetails payload (live product 1174,
// still PENDING review): it opens filled in and grouped into sections, a
// listing that will not load says so with a Retry instead of showing an
// empty form, and a session the server rejects still gets the listing.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/edit_listing_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

void main() {
  final fixture =
      File('test/fixtures/item_details_fresh_listing.json').readAsStringSync();
  http.Response ok(String b) => http.Response(b, 200,
      headers: {'content-type': 'application/json; charset=utf-8'});
  final categories = jsonEncode([
    {
      'categoryId': 15,
      'categoryName': 'Food & Groceries',
      'subcategories': [
        {'subcategoryId': 140, 'subcategoryName': 'Organic & Specialty Foods'}
      ],
    }
  ]);

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    ApiClient.invalidateReads();
  });
  tearDown(() => AuthStore.instance = null);

  Future<void> pump(WidgetTester tester, ApiClient api) async {
    tester.view.physicalSize = const Size(430, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 's@x.com');
    await tester.pumpWidget(
        MaterialApp(home: EditListingScreen(listingId: 1174, api: api)));
    await tester.pumpAndSettle();
  }

  testWidgets('a fresh listing opens filled in, in sections, with a save bar',
      (tester) async {
    final api = ApiClient(client: MockClient((req) async {
      final p = req.url.path;
      if (p.endsWith('/itemDetails/1174')) return ok(fixture);
      if (p == '/api/v1/products/categories') return ok(categories);
      return ok('[]');
    }));
    await pump(tester, api);

    expect(find.text('Editing your listing'), findsOneWidget);
    expect(find.text('Natural Cocoa Powder'), findsNWidgets(2),
        reason: 'the title field and the header both show it');
    expect(find.text('Photos'), findsOneWidget);
    expect(find.text('About the item'), findsOneWidget);
    expect(find.text('Add at least one photo.'), findsNothing);
    expect(find.byKey(const ValueKey('edit-save-btn')), findsOneWidget);
    expect(find.byKey(const ValueKey('edit-save-status')), findsOneWidget);
  });

  testWidgets('a listing that will not load says why, never an empty form',
      (tester) async {
    var fail = true;
    final api = ApiClient(client: MockClient((req) async {
      final p = req.url.path;
      if (p.endsWith('/itemDetails/1174')) {
        return fail ? http.Response('oops', 500) : ok(fixture);
      }
      if (p == '/api/v1/products/categories') return ok(categories);
      return ok('[]');
    }));
    await pump(tester, api);

    expect(find.byKey(const ValueKey('edit-load-failed')), findsOneWidget);
    expect(find.text('Add at least one photo.'), findsNothing);
    expect(find.byKey(const ValueKey('edit-save-btn')), findsNothing,
        reason: 'nothing loaded, so there is nothing to save over');

    fail = false;
    await tester.tap(find.byKey(const ValueKey('edit-load-retry')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('edit-load-failed')), findsNothing);
    expect(find.text('Natural Cocoa Powder'), findsNWidgets(2));
  });

  testWidgets('a rejected session still opens the listing', (tester) async {
    final api = ApiClient(client: MockClient((req) async {
      final p = req.url.path;
      if (p.endsWith('/itemDetails/1174')) {
        return req.headers['Authorization'] == null
            ? ok(fixture)
            : http.Response('{"message":"expired"}', 401);
      }
      if (p == '/api/v1/products/categories') return ok(categories);
      return ok('[]');
    }));
    await pump(tester, api);
    expect(find.byKey(const ValueKey('edit-load-failed')), findsNothing);
    expect(find.text('Natural Cocoa Powder'), findsNWidgets(2));
  });

  testWidgets('categories failing to load do not sink the editor',
      (tester) async {
    final api = ApiClient(client: MockClient((req) async {
      final p = req.url.path;
      if (p.endsWith('/itemDetails/1174')) return ok(fixture);
      if (p == '/api/v1/products/categories') return http.Response('x', 503);
      return ok('[]');
    }));
    await pump(tester, api);
    expect(tester.takeException(), isNull);
    expect(find.byKey(const ValueKey('edit-load-failed')), findsNothing);
    expect(find.text('Natural Cocoa Powder'), findsNWidgets(2));
  });
}
