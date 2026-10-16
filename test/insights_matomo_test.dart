import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/insights_screen.dart';

/// AU-063: the Matomo web-analytics console on Insights. Without a configured
/// token (the test default) the whole section stays hidden; the client's
/// matomoQuery returns null on any failure and blocks render blank — the
/// documented analytics exception. Trend cards still refetch per interval.

http.Response _json(Object body, [int status = 200]) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

MockClient _client() => MockClient((request) async {
      if (request.url.path == '/api/v1/admin/orders/trend') return _json([]);
      if (request.url.path == '/api/v1/admin/proformas/trend') return _json([]);
      if (request.url.path == '/api/v1/admin/stats') return _json({'totalOrders': 11});
      // Any matomo attempt against the sandbox backend must NOT happen —
      // the client talks to the configured matomo host directly.
      return _json({}, 404);
    });

void main() {
  testWidgets('AU-063: interval chips refetch trends; matomo hidden without token',
      (tester) async {
    final api = ApiClient(client: _client());
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: InsightsScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Sales'), findsOneWidget);
    // No MATOMO_TOKEN dart-define in tests → the console is absent entirely.
    expect(find.text('Web analytics (Matomo)'), findsNothing);
    expect(find.byKey(const ValueKey('open-matomo')), findsNothing);
  });
}
