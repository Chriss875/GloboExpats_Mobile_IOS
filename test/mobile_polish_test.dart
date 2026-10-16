import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/models/category.dart';
import 'package:globoexpats_mobile/widgets/home_preferences.dart';
import 'package:globoexpats_mobile/widgets/sign_in_prompt.dart';
import 'package:globoexpats_mobile/screens/catalog_screens.dart';

void main() {
  testWidgets('browse sends grouped subcategories to the API', (tester) async {
    final bodies = <Map<String, dynamic>>[];
    final api = ApiClient(client: MockClient((request) async {
      if (request.url.path.endsWith('/filter')) {
        bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
        return http.Response('{"content":[],"totalElements":0}', 200);
      }
      return http.Response('[]', 200);
    }));
    await tester.pumpWidget(MaterialApp(home: BrowseScreen(api: api, initialSubcategoryIds: const [10, 11])));
    await tester.pumpAndSettle();
    expect(bodies.single['subcategoryIds'], [10, 11]);
  });
  test('preference endpoint supports wrapped collections', () async {
    final api = ApiClient(client: MockClient((request) async {
      expect(request.url.path, '/api/v1/home/preference-collections');
      return http.Response(jsonEncode({'data': [{'id': 1, 'title': 'Travel'}]}), 200);
    }));
    expect((await api.fetchHomePreferences()).single['title'], 'Travel');
  });

  testWidgets('preference tile opens all valid grouped subcategories', (tester) async {
    final router = GoRouter(routes: [
      // The section lives in the home CustomScrollView, so give it a scroll
      // parent here too: tiles are sized by aspect ratio, and the 800px-wide
      // test surface makes them taller than an unscrollable 600px body.
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: SingleChildScrollView(child: HomePreferences(
        categories: Future.value(const [Category(categoryId: 1, categoryName: 'Tech', subcategories: [
          Subcategory(subcategoryId: 10, subcategoryName: 'Phones'), Subcategory(subcategoryId: 11, subcategoryName: 'Tablets')])]),
        collections: Future.value([{'title': 'Everyday essentials', 'tiles': [
          {'label': 'Phones & tablets', 'imageUrl': 'assets/images/home/globoexpats-listing-electronics.webp', 'subcategoryIds': [10, 11, 999]}]}]),
      )))),
      GoRoute(path: '/browse', builder: (_, state) => Text(state.uri.queryParameters['subcategory']!)),
    ]);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    expect(find.text('Shop by Preference'), findsOneWidget);
    await tester.tap(find.text('Phones & tablets'));
    await tester.pumpAndSettle();
    expect(find.text('10,11'), findsOneWidget);
    expect(tester.takeException(), isNull);
    router.dispose();
  });

  testWidgets('sign-in prompt preserves destination', (tester) async {
    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (_, __) => const Scaffold(body: SingleChildScrollView(child: SignInPrompt(returnUrl: '/orders')))),
      GoRoute(path: '/login', builder: (_, state) => Text(state.uri.queryParameters['returnUrl']!)),
    ]);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.tap(find.byKey(const ValueKey('sign-in-prompt-sign-in')));
    await tester.pumpAndSettle();
    expect(find.text('/orders'), findsOneWidget);
    router.dispose();
  });
}
