// The Account tab's shop card paints at once from what it last showed and
// refreshes in the background, instead of waiting on three lookups.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:globoexpats_mobile/widgets/shop_profile_card.dart';

http.Response _json(Object b) => http.Response(jsonEncode(b), 200,
    headers: {'content-type': 'application/json'});

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
  });

  Future<void> pumpCard(WidgetTester tester, ApiClient api, String token,
      {String? cacheKey = 'isack@example.com'}) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ListView(children: [
      ShopProfileCard(api: api, token: token, cacheKey: cacheKey),
    ]))));
  }

  ApiClient liveApi({List<String>? paths}) =>
      ApiClient(client: MockClient((req) async {
        paths?.add(req.url.path);
        final path = req.url.path;
        if (path.endsWith('/user-details')) {
          return _json({'userId': 7, 'firstName': 'Isack', 'lastName': 'Lugata'});
        }
        if (path.contains('seller-summary')) {
          return _json({
            'averageRating': 4.8,
            'totalRatingsCount': 12,
            'location': 'Dar es Salaam',
            'joinedDate': '2024-02-01T00:00:00Z',
          });
        }
        if (path == '/api/v1/displayItem/filter') {
          return _json({
            'content': [
              {
                'productId': 1,
                'productName': 'Mazda CX-5',
                'productAskingPrice': 42000000,
                'productCurrency': 'TZS',
                'productQuantity': 1,
                'productImages': [
                  {'imageUrl': '/uploads/cx5.webp'}
                ],
              }
            ],
            'totalElements': 1,
          });
        }
        return _json({});
      }));

  testWidgets('a first open shows the outline, then the shop, and saves it',
      (tester) async {
    await pumpCard(tester, liveApi(), 'jwt-first');
    expect(find.byKey(const ValueKey('account-shop-profile')), findsOneWidget,
        reason: 'the outline is there before any answer');
    expect(
        tester
            .widget<ButtonStyleButton>(
                find.byKey(const ValueKey('account-shop-share')))
            .onPressed,
        isNull,
        reason: 'Share waits for the shop');

    await tester.pumpAndSettle();
    expect(find.text('Isack L.'), findsOneWidget);
    expect(find.text('4.8'), findsOneWidget);
    expect(find.text('2024'), findsOneWidget);

    final saved = KvStore.instance
        .getJson('shop_profile_card:v1:isack@example.com')!;
    expect(saved['userId'], 7);
    expect(saved['listingCount'], 1);
    expect((saved['latest'] as List).single['image'], '/uploads/cx5.webp');
  });

  testWidgets('a remembered shop paints before the network answers',
      (tester) async {
    await KvStore.instance.setJson('shop_profile_card:v1:isack@example.com', {
      'userId': 7,
      'fullName': 'Isack Lugata',
      'verified': true,
      'rating': 4.8,
      'reviews': 12,
      'location': 'Dar es Salaam',
      'memberSince': '2024',
      'listingCount': 3,
      'latest': const [],
    });
    final gate = Completer<http.Response>();
    final paths = <String>[];
    final api = ApiClient(client: MockClient((req) {
      paths.add(req.url.path);
      return gate.future;
    }));
    await pumpCard(tester, api, 'jwt-remembered');
    await tester.pump();

    expect(find.text('Isack L.'), findsOneWidget);
    expect(find.text('Verified'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('Listings'), findsOneWidget);
    // With the id remembered, all three lookups are already in flight.
    expect(paths, containsAll(<String>[
      '/api/v1/userManagement/user-details',
      '/api/v1/userManagement/seller-summary/7',
      '/api/v1/displayItem/filter',
    ]));
    gate.complete(_json({}));
    await tester.pumpAndSettle();
  });

  testWidgets('no account and nothing remembered hides the card',
      (tester) async {
    final api = ApiClient(
        client: MockClient((_) async => http.Response('nope', 500)));
    await pumpCard(tester, api, 'jwt-broken', cacheKey: null);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('account-shop-profile')), findsNothing);
  });
}
