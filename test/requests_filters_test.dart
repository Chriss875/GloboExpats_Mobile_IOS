import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/requests_screen.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});

Map<String, dynamic> _row({
  required int id,
  required String title,
  required String userName,
  String? category,
  String? location,
  int views = 0,
  int nudges = 0,
  String? createdAt,
}) =>
    {
      'id': id,
      'userName': userName,
      'title': title,
      if (category != null) 'category': category,
      if (location != null) 'location': location,
      'status': 'PENDING',
      'viewCount': views,
      'nudgeCount': nudges,
      if (createdAt != null) 'createdAt': createdAt,
    };

/// Routes a public-board harness: `/feed`, the filter-option endpoints and the
/// seller-verification probe. Records the most recent feed query string.
MockClient _hubMock({
  Map<String, String>? capturedQuery,
  List<String>? feedRequests,
  bool verified = false,
  List<Map<String, dynamic>>? feedRows,
  List<Map<String, dynamic>>? categories,
  List<String>? neighbourhoods,
}) {
  return MockClient((req) async {
    final p = req.url.path;
    if (p == '/api/v1/request-board/feed') {
      feedRequests?.add('feed');
      if (capturedQuery != null) {
        capturedQuery
          ..clear()
          ..addAll(req.url.queryParameters);
      }
      return _json({
        'content': feedRows ?? <Map<String, dynamic>>[],
        'totalElements': feedRows?.length ?? 0,
      });
    }
    if (p == '/api/v1/products/categories') {
      return _json(categories ?? const <Map<String, dynamic>>[]);
    }
    if (p == '/api/v1/displayItem/neighbourhoods') {
      return _json(neighbourhoods ?? const <String>[]);
    }
    if (p == '/api/v1/seller-verification/current') {
      return _json({
        'application': {
          'reviewStatus': verified ? 'VERIFIED' : 'PENDING',
        },
      });
    }
    if (p == '/api/v1/request-board/1/view') return http.Response('', 200);
    return _json({}, 404);
  });
}

Future<void> _pumpBoard(WidgetTester tester, ApiClient api) async {
  await tester.pumpWidget(MaterialApp(home: RequestsScreen(api: api)));
  await tester.pumpAndSettle();
}

/// REQUES-30 (E17): a requester's name is masked to 'Community member' for
/// anonymous viewers; a verified seller sees the *masked* public name.
void main() {
  testWidgets('REQUES-30: anonymous feed masks the requester name',
      (tester) async {
    AuthStore.instance = null;
    final api = ApiClient(
      client: _hubMock(feedRows: [
        _row(id: 1, title: 'Fridge needed', userName: 'Jane Expat'),
      ]),
    );
    await _pumpBoard(tester, api);

    expect(find.text('Fridge needed'), findsOneWidget);
    expect(find.text('Community member'), findsOneWidget);
    expect(find.text('Jane Expat'), findsNothing);
  });

  testWidgets('REQUES-30: verified seller sees the masked public name',
      (tester) async {
    final api = ApiClient(
      client: _hubMock(verified: true, feedRows: [
        _row(id: 1, title: 'Fridge needed', userName: 'Jane Expat'),
      ]),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await _pumpBoard(tester, api);

    expect(find.text('Fridge needed'), findsOneWidget);
    // Web getPublicName('Jane Expat') → 'Jane E.' — never the raw name.
    expect(find.text('Jane E.'), findsOneWidget);
    expect(find.text('Community member'), findsNothing);
    expect(find.text('Jane Expat'), findsNothing);
    AuthStore.instance = null;
  });

  testWidgets('REQUES-28: category + neighbourhood filters drive the feed query',
      (tester) async {
    AuthStore.instance = null;
    final query = <String, String>{};
    final api = ApiClient(
      client: _hubMock(
        capturedQuery: query,
        feedRows: [
          _row(
              id: 1,
              title: 'Fridge needed',
              userName: 'Jane Expat',
              category: 'Home Appliances',
              location: 'Kinondoni'),
          _row(
              id: 2,
              title: 'Sofa wanted',
              userName: 'Jon Doe',
              category: 'Home Appliances',
              location: 'Kinondoni'),
        ],
        categories: [
          {'categoryId': 1, 'categoryName': 'Home Appliances'},
          {'categoryId': 2, 'categoryName': 'Furniture'},
        ],
        neighbourhoods: ['Kinondoni', 'Mikocheni'],
      ),
    );
    await _pumpBoard(tester, api);

    // The option controls live behind the filter button now (mobile's
    // stand-in for the web sidebar) — open it, then check they resolved.
    await tester.tap(find.byTooltip('Filter requests'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('req-category')), findsOneWidget);
    expect(find.byKey(const ValueKey('req-location')), findsOneWidget);

    // Pick a category that no card chips repeat (avoids ambiguous finders).
    await tester.tap(find.byKey(const ValueKey('req-category')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Furniture').last);
    await tester.pumpAndSettle();
    expect(query['category'], 'Furniture');

    // Pick a neighbourhood.
    await tester.tap(find.byKey(const ValueKey('req-location')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mikocheni').last);
    await tester.pumpAndSettle();
    expect(query['location'], 'Mikocheni');

    // Web 'Clear all' resets the sidebar filters and refetches without them.
    await tester.tap(find.byKey(const ValueKey('clear-request-filters')));
    await tester.pumpAndSettle();
    expect(query.containsKey('category'), isFalse);
    expect(query.containsKey('location'), isFalse);
  });

  testWidgets('REQUES-27: sort control reorders the loaded feed client-side',
      (tester) async {
    AuthStore.instance = null;
    final feedRequests = <String>[];
    final api = ApiClient(
      client: _hubMock(
        feedRequests: feedRequests,
        feedRows: [
          _row(
              id: 1,
              title: 'Alpha request',
              userName: 'Jane Expat',
              views: 1,
              nudges: 3,
              createdAt: '2026-01-01T09:00:00Z'),
          _row(
              id: 2,
              title: 'Bravo request',
              userName: 'Jon Doe',
              views: 9,
              nudges: 1,
              createdAt: '2026-03-01T09:00:00Z'),
          _row(
              id: 3,
              title: 'Charlie request',
              userName: 'Sam Poe',
              views: 5,
              nudges: 2,
              createdAt: '2026-02-01T09:00:00Z'),
        ],
      ),
    );

    // A tall surface so the three cards are all on screen for dy comparison.
    tester.view.physicalSize = const Size(900, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await _pumpBoard(tester, api);

    double dy(String title) => tester.getTopLeft(find.text(title)).dy;

    // Backend order (relevance) is preserved by default.
    expect(dy('Alpha request') < dy('Bravo request'), isTrue);
    expect(dy('Bravo request') < dy('Charlie request'), isTrue);
    final feedsBefore = feedRequests.length;

    await tester.tap(find.byKey(const ValueKey('req-sort')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Most viewed').last);
    await tester.pumpAndSettle();

    // Most viewed: Bravo(9) → Charlie(5) → Alpha(1).
    expect(dy('Bravo request') < dy('Charlie request'), isTrue);
    expect(dy('Charlie request') < dy('Alpha request'), isTrue);
    // Sort is a client-side view toggle — no extra feed fetch.
    expect(feedRequests.length, feedsBefore);

    // Most nudged: Alpha(3) → Charlie(2) → Bravo(1).
    await tester.tap(find.byKey(const ValueKey('req-sort')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Most nudged').last);
    await tester.pumpAndSettle();
    expect(dy('Alpha request') < dy('Charlie request'), isTrue);
    expect(dy('Charlie request') < dy('Bravo request'), isTrue);
    expect(feedRequests.length, feedsBefore);
  });
}
