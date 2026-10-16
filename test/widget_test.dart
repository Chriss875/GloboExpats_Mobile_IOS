import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/home_screen.dart';
import 'package:globoexpats_mobile/screens/shell.dart';

const _emptyPage = {'content': [], 'totalElements': 0};

final _featuredPage = {
  'content': [
    {
      'productId': 101,
      'productName': 'Wooden bowls set',
      'productAskingPrice': 51000,
      'productCurrency': 'TZS',
      'productImages': [
        {'imageUrl': '/uploads/bowls.webp'}
      ],
      'averageRating': 4.5,
      'totalRatingsCount': 12,
    },
  ],
  'totalElements': 1,
};

/// Mock the sandbox backend for the endpoints the Home screen uses. Category
/// curation (`featured`/`homePosition`) is off by default - web parity
/// "nothing curated renders nothing" (see lib/domain/home_curation.dart).
MockClient _mockApiClient({bool curated = false}) {
  return MockClient((request) async {
    final path = request.url.path;
    if (path == '/api/v1/products/categories') {
      return http.Response(
        jsonEncode([
          {
            'categoryId': 1,
            'categoryName': 'Electronics',
            'slug': 'electronics',
            'imageUrl': null,
            'featured': curated,
            'subcategories': [
              {
                'subcategoryId': 10,
                'subcategoryName': 'Phones',
                'imageUrl': curated ? '/uploads/phones.webp' : null,
                'featured': curated,
                'homePosition': curated ? 0 : null,
              }
            ],
          },
          {
            'categoryId': 2,
            'categoryName': 'Clothing',
            'slug': 'clothing',
            'imageUrl': null,
            'subcategories': [],
          },
        ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    // Featured uses the seeded-shuffle filter endpoint (web parity
    // `getFeaturedListings`), not a plain GET /displayItem/featured.
    if (path == '/api/v1/displayItem/filter') {
      return http.Response(jsonEncode(_featuredPage), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path == '/api/v1/displayItem/newest' || path == '/api/v1/displayItem/top-picks') {
      return http.Response(jsonEncode(_emptyPage), 200,
          headers: {'content-type': 'application/json'});
    }
    return http.Response('{"error":"not found"}', 404);
  });
}

void main() {
  testWidgets('app shell shows the reference bottom navigation labels',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: AppShell(store: AuthStore(), api: ApiClient(client: _mockApiClient()))));
    await tester.pumpAndSettle();

    expect(find.text('Home'), findsOneWidget);
    // Community keeps the requests hub a tab (the web spends this slot on
    // Marketplace instead); the last slot matches the web's "Account", and
    // falls back to "Login" while signed out, as here.
    expect(find.text('Community'), findsOneWidget);
    expect(find.text('Sell'), findsOneWidget);
    expect(find.text('MySpace'), findsOneWidget);
    expect(find.text('Login'), findsOneWidget);
  });

  testWidgets(
      'home screen shows the hero carousel and featured listings; hides uncurated sections',
      (tester) async {
    final api = ApiClient(client: _mockApiClient());
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: HomeScreen(api: api))),
    );
    await tester.pumpAndSettle();

    // Web parity `home-promo.tsx`: headline + description, no eyebrow tagline
    // and no Buy/Sell CTA buttons on the phone-width hero (those are
    // desktop-only on web too).
    expect(find.text('Buy. Sell. Connect.'), findsOneWidget);
    expect(find.textContaining('Find quality goods'), findsOneWidget);
    expect(find.text("Tanzania's expat marketplace"), findsNothing);
    expect(find.text('Buy now'), findsNothing);
    expect(find.text('Sell for free'), findsNothing);

    // Neither category has curation data (no `featured`/`homePosition`), so
    // both curated sections hide entirely rather than falling back to a
    // bundled "show everything" default.
    expect(find.text('Most Popular Categories'), findsNothing);
    expect(find.text('Shop by Category'), findsNothing);

    // Featured is not curation-gated - it always shows once the API answers.
    await tester.scrollUntilVisible(find.text('Featured'), 300,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Featured'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Wooden bowls set'), 300,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Wooden bowls set'), findsOneWidget);
  });

  testWidgets('curated categories render the Most Popular rail and Shop by Category grid',
      (tester) async {
    final api = ApiClient(client: _mockApiClient(curated: true));
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: HomeScreen(api: api))),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Most Popular Categories'), 300,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Most Popular Categories'), findsOneWidget);
    expect(find.text('Phones'), findsWidgets); // rail tile + grid tile

    await tester.scrollUntilVisible(find.text('Shop by Category'), 300,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Shop by Category'), findsOneWidget);
    // "Electronics" appears twice once both sections are mounted: as the
    // rail tile's parent-category caption, and as the grid card's own title.
    expect(find.text('Electronics'), findsWidgets);
    expect(find.text('See more in Electronics'), findsOneWidget);
    // Clothing has no subcategories at all, so it never earns a card - same
    // "nothing curated renders nothing" rule, per-category.
    expect(find.text('Clothing'), findsNothing);
  });
}
