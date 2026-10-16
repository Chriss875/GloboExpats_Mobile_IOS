import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/admin_sublist_screens.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('AU-065: messages screen reads /contact/all (not /admin/notifications)',
      (tester) async {
    final paths = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        paths.add(req.url.path);
        if (req.url.path == '/api/v1/contact/all') {
          return _json([
            {
              'id': 1,
              'name': 'Neema O.',
              'email': 'neema@test.local',
              'reason': 'SELLING',
              'subject': 'How do payouts work?',
              'message': 'I sold an item — when is the payout released?',
              'whatsAppPhoneNumber': '+255693749306',
              'isRead': false,
              'createdAt': '2026-08-23T10:00:00Z',
            },
          ]);
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: AdminMessagesScreen(api: api)));
    await tester.pumpAndSettle();

    expect(paths, contains('/api/v1/contact/all'));
    expect(paths, isNot(contains('/api/v1/admin/notifications')));
    expect(find.text('How do payouts work?'), findsOneWidget);
    expect(find.textContaining('Neema O.'), findsOneWidget);
    AuthStore.instance = null;
  });

  testWidgets('AU-065: expanding an unread row marks it read', (tester) async {
    var readCalled = false;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/contact/all') {
          return _json([
            {'id': 2, 'name': 'Baraka', 'email': 'b@t.local', 'subject': 'Hi', 'message': 'Hello there', 'isRead': false},
          ]);
        }
        if (req.url.path == '/api/v1/contact/2/read') {
          readCalled = true;
          return http.Response('', 204);
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: AdminMessagesScreen(api: api)));
    await tester.pumpAndSettle();
    expect(readCalled, isFalse);

    await tester.tap(find.text('Hi'));
    await tester.pumpAndSettle();
    expect(readCalled, isTrue, reason: 'expansion marks the message read');
    expect(find.textContaining('Hello there'), findsOneWidget);
    AuthStore.instance = null;
  });

  testWidgets('AU-065: delete action hits DELETE /contact/{id}', (tester) async {
    final paths = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        paths.add('${req.method} ${req.url.path}');
        if (req.url.path == '/api/v1/contact/all') {
          return _json([
            {'id': 3, 'name': 'Spam', 'email': 's@t.local', 'subject': 'Buy now', 'message': 'spam msg', 'isRead': true},
          ]);
        }
        if (req.method == 'DELETE' && req.url.path == '/api/v1/contact/3') {
          return http.Response('', 204);
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: AdminMessagesScreen(api: api)));
    await tester.pumpAndSettle();
    // The delete IconButton lives inside the collapsed ExpansionTile trailing
    // row — expand first so it is on-screen and tappable.
    await tester.tap(find.text('Buy now'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Delete'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(paths.contains('DELETE /api/v1/contact/3'), isTrue);
    AuthStore.instance = null;
  });
}
