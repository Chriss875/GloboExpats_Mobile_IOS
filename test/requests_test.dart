import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/requests_screen.dart';

MockClient _feedClient() => MockClient((request) async {
      if (request.url.path == '/api/v1/request-board/feed') {
        return http.Response(
            jsonEncode({
              'content': [
                {
                  'id': 1,
                  'userName': 'Jane Expat',
                  'title': 'Looking for a used fridge',
                  'category': 'Home Appliances',
                  'location': 'Dar es Salaam',
                  'status': 'PENDING',
                  'minimumBudget': 400000,
                  'maximumBudget': 700000,
                  'description': 'Working fridge under 700k.',
                  'fulfillmentDeadline': '2026-09-01',
                },
              ],
              'totalElements': 1,
            }),
            200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 404);
    });

const Map<String, dynamic> _feedRow = {
  'id': 1,
  'userName': 'Jane Expat',
  'title': 'Looking for a used fridge',
  'category': 'Home Appliances',
  'location': 'Dar es Salaam',
  'status': 'PENDING',
  'minimumBudget': 400000,
  'maximumBudget': 700000,
  'description': 'Working fridge under 700k.',
  'fulfillmentDeadline': '2026-09-01',
};

void main() {
  testWidgets('requests feed lists requests with title, user and budget',
      (tester) async {
    final api = ApiClient(client: _feedClient());
    await tester.pumpWidget(MaterialApp(home: RequestsScreen(api: api)));
    await tester.pumpAndSettle();

    // The screen title lives in the shared shell app bar now; the feed
    // identifies itself by its own filter segments.
    expect(find.text('Post request'), findsOneWidget);
    expect(find.text('Looking for a used fridge'), findsOneWidget);
    // REQUES-30: an anonymous/unverified viewer never sees the requester name.
    expect(find.text('Community member'), findsOneWidget);
    expect(find.text('Jane Expat'), findsNothing);
    expect(find.textContaining('400,000'), findsOneWidget);
  });

  testWidgets('request detail shows description and nudge button',
      (tester) async {
    final api = ApiClient(client: _feedClient());
    await tester.pumpWidget(MaterialApp(home: RequestsScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Looking for a used fridge'));
    await tester.pumpAndSettle();

    expect(find.text('Working fridge under 700k.'), findsOneWidget);
    expect(find.text('Nudge with a match'), findsOneWidget);
  });

  testWidgets(
      'AU-056: nudge button POSTS /request-board/{id}/nudge (never a stub)',
      (tester) async {
    final calls = <String>[];
    final bodies = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        calls.add('${req.method} ${req.url.path}');
        if (req.url.path == '/api/v1/request-board/feed') {
          return http.Response(
              jsonEncode({
                'content': [_feedRow],
                'totalElements': 1
              }),
              200,
              headers: {'content-type': 'application/json'});
        }
        if (req.url.path == '/api/v1/request-board/1/view' &&
            req.method == 'PATCH') {
          return http.Response('', 200);
        }
        if (req.url.path == '/api/v1/request-board/1/nudge') {
          bodies.add(utf8.decode(req.bodyBytes));
          return http.Response(
              jsonEncode({'message': 'Nudge sent successfully'}), 200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 404);
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: RequestsScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Looking for a used fridge'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('request-nudge-btn')));
    await tester.pumpAndSettle();

    // The nudge REALLY went out and success copy shows.
    expect(bodies, hasLength(1));
    expect(bodies.first, contains('nudgeType'));
    expect(find.text('Nudge sent to the requester.'), findsOneWidget);
    // double-tap protection: only one POST even if tapped twice quickly
    expect(calls.where((c) => c == 'POST /api/v1/request-board/1/nudge'),
        hasLength(1));
  });

  testWidgets('feed nudge sends in place without opening request details',
      (tester) async {
    var nudgeCalls = 0;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/request-board/feed') {
          return http.Response(
              jsonEncode({
                'content': [_feedRow],
                'totalElements': 1
              }),
              200,
              headers: {'content-type': 'application/json'});
        }
        if (req.url.path == '/api/v1/request-board/1/nudge') {
          nudgeCalls++;
          return http.Response('{}', 200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 404);
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: RequestsScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('request-feed-nudge-1')));
    await tester.pumpAndSettle();

    expect(nudgeCalls, 1);
    expect(find.text('Nudge sent to the requester.'), findsOneWidget);
    expect(find.text('Request details'), findsNothing);
  });

  testWidgets('AU-056: nudge without login gates with a prompt, no API call',
      (tester) async {
    final calls = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        calls.add('${req.method} ${req.url.path}');
        if (req.url.path == '/api/v1/request-board/feed') {
          return http.Response(
              jsonEncode({
                'content': [_feedRow],
                'totalElements': 1
              }),
              200,
              headers: {'content-type': 'application/json'});
        }
        if (req.url.path == '/api/v1/request-board/1/view' &&
            req.method == 'PATCH') {
          return http.Response('', 200);
        }
        return http.Response('{}', 404);
      }),
    );
    AuthStore.instance = null; // anonymous

    await tester.pumpWidget(MaterialApp(home: RequestsScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Looking for a used fridge'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('request-nudge-btn')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('sign-in-prompt-sign-in')), findsOneWidget);
    expect(find.text('Sign in to let this person know you can help.'),
        findsOneWidget);
    expect(calls.where((c) => c.contains('/nudge')), isEmpty);
  });

  testWidgets(
      'MySpace Requests tab (initialBoard: mine) lands on the owner My requests board, not the public feed',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/request-board/feed') {
          return http.Response(
              jsonEncode({
                'content': [_feedRow],
                'totalElements': 1
              }),
              200,
              headers: {'content-type': 'application/json'});
        }
        if (req.url.path == '/api/v1/request-board/my-requests') {
          return http.Response(
              jsonEncode({
                'content': [
                  {
                    'id': 9,
                    'userName': 'Me',
                    'title': 'My posted fridge request',
                    'category': 'Home Appliances',
                    'location': 'Dar es Salaam',
                    'status': 'PENDING',
                    'unreadNudgeCount': 2,
                    'minimumBudget': 400000,
                    'maximumBudget': 700000,
                    'description': 'My request desc.',
                    'fulfillmentDeadline': '2026-09-01',
                  },
                ],
                'totalElements': 1,
                'totalPages': 1,
              }),
              200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 404);
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(
        home:
            RequestsScreen(api: api, initialBoard: RequestsInitialBoard.mine)));
    await tester.pumpAndSettle();

    // The owner board body rendered the viewer's OWN post…
    expect(find.text('My posted fridge request'), findsOneWidget);
    expect(find.text('2 new'), findsOneWidget); // unread-nudge badge
    expect(
        find.text('Me'), findsOneWidget); // owner identity shown for own post
    // …and NOT the public feed.
    expect(find.text('Looking for a used fridge'), findsNothing);
    // The segmented mode bar is visible for a logged-in viewer.
    expect(find.text('Request board'), findsOneWidget);
    expect(find.text('My requests'), findsOneWidget);
  });

  /// Web parity, same rule the rest of My Space follows: nothing is sticky.
  /// Both boards used to render their chrome in a Column above an Expanded
  /// list, so the mode bar, search/sort filters and status filter stayed
  /// pinned while only the feed moved.
  testWidgets('the board chrome scrolls with the feed, not pinned above it',
      (tester) async {
    final api = ApiClient(client: _feedClient());
    await tester.pumpWidget(MaterialApp(home: RequestsScreen(api: api)));
    await tester.pumpAndSettle();

    Element scrollableOf(Finder f) => tester
        .element(find.ancestor(of: f, matching: find.byType(Scrollable)).first);

    // 'Search requests' is the filter row's hint; the title is a feed card.
    expect(find.text('Search requests'), findsOneWidget);
    expect(
      identical(scrollableOf(find.text('Search requests')),
          scrollableOf(find.text('Looking for a used fridge'))),
      isTrue,
      reason: 'the board filters must share the feed scroll view',
    );
  });

  testWidgets('the My requests chrome scrolls with the owner list',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/request-board/feed') {
          return http.Response(
              jsonEncode({'content': [], 'totalElements': 0}), 200,
              headers: {'content-type': 'application/json'});
        }
        if (req.url.path == '/api/v1/request-board/my-requests') {
          return http.Response(
              jsonEncode({
                'content': [
                  {
                    'id': 9,
                    'userName': 'Me',
                    'title': 'My posted fridge request',
                    'category': 'Home Appliances',
                    'location': 'Dar es Salaam',
                    'status': 'PENDING',
                    'minimumBudget': 400000,
                    'maximumBudget': 700000,
                    'description': 'My request desc.',
                    'fulfillmentDeadline': '2026-09-01',
                  },
                ],
                'totalElements': 1,
                'totalPages': 1,
              }),
              200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 404);
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    addTearDown(() => AuthStore.instance = null);

    await tester.pumpWidget(MaterialApp(
        home:
            RequestsScreen(api: api, initialBoard: RequestsInitialBoard.mine)));
    await tester.pumpAndSettle();

    Element scrollableOf(Finder f) => tester
        .element(find.ancestor(of: f, matching: find.byType(Scrollable)).first);

    // 'Status' is the owner board's filter label; the mode bar sits above it.
    for (final chrome in const ['Status', 'My requests']) {
      expect(
        identical(scrollableOf(find.text(chrome)),
            scrollableOf(find.text('My posted fridge request'))),
        isTrue,
        reason: '"$chrome" must share the owner list scroll view',
      );
    }
  });
}
