import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/insights_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('AU-063: interval chips refetch trend with interval param',
      (tester) async {
    final urls = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        urls.add(req.url.toString());
        if (req.url.path == '/api/v1/admin/orders/trend') {
          return _json({'series': [
            {'date': '2026-08-01', 'placed': 2, 'completed': 1},
            {'date': '2026-08-02', 'placed': 5, 'completed': 3},
          ]});
        }
        if (req.url.path == '/api/v1/admin/proformas/trend') {
          return _json({'series': [
            {'date': '2026-08-01', 'placed': 4, 'verified': 2},
          ]});
        }
        if (req.url.path == '/api/v1/admin/stats') return _json({'users': 12});
        return _json({});
      }),
    );
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    AuthStore.instance = auth;

    await tester.pumpWidget(MaterialApp(home: InsightsScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    // Initial load uses the default day interval.
    expect(urls.where((u) => u.contains('interval=day')), isNotEmpty);

    // Switching to Weekly refetches both trends with interval=week.
    await tester.tap(find.text('Weekly'));
    await tester.pumpAndSettle();
    expect(urls.where((u) => u.contains('interval=week')).length, greaterThanOrEqualTo(2));
    expect(find.text('Sales'), findsOneWidget);
    AuthStore.instance = null;
  });
}
