import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/delivery_dashboard_screens.dart';

void main() {
  testWidgets('MySpace opens on Overview with the web dashboard tabs',
      (tester) async {
    // Phase 2: the menu of links became the web's five-tab dashboard. Reaching
    // your listings is now a tab, not a row, so this asserts the tab bar and
    // the Overview content it opens on.
    await tester.pumpWidget(const MaterialApp(home: ExpatDashboardScreen()));
    await tester.pumpAndSettle();
    for (final tab in ['Overview', 'Selling', 'Buying', 'Saved', 'Requests']) {
      expect(find.text(tab), findsOneWidget, reason: 'missing the $tab tab');
    }
    expect(find.text('My Space'), findsOneWidget);
    // Selling is already one tap away in the shell and in this workspace, so
    // the overview now prioritises useful account metrics instead of a third
    // duplicate set of navigation actions.
    expect(find.text('Total listings'), findsOneWidget);
    expect(find.text('Active listings'), findsOneWidget);
    expect(find.text('Performance'), findsOneWidget);
  });

  testWidgets(
      'Buying tab carries an Orders/Payments toggle (web parity myOrdersSub)',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/orders') {
          return http.Response(jsonEncode([]), 200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 200,
            headers: {'content-type': 'application/json'});
      }),
    );
    // MyPaymentsScreen talks to the backend via its own PaymentsApi/http.Client,
    // not the shared ApiClient - mocked separately.
    final paymentsClient = MockClient((req) async {
      if (req.url.path == '/api/v1/payments/my') {
        return http.Response(jsonEncode([]), 200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 200,
          headers: {'content-type': 'application/json'});
    });
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(
        home: ExpatDashboardScreen(
            api: api, paymentsHttpClient: paymentsClient)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Buying'));
    await tester.pumpAndSettle();

    // Orders is the default sub-view.
    expect(find.text('Orders'), findsOneWidget);
    expect(find.text('Payments'), findsOneWidget);
    expect(
        find.text(
            'No orders yet.\nWhen you place an order it will appear here.'),
        findsOneWidget);

    await tester.tap(find.text('Payments'));
    await tester.pumpAndSettle();

    // My Payments' own empty state proves it is the screen that mounted -
    // not just a second AppBar title, this is genuinely a different body.
    expect(find.text('No payments yet'), findsOneWidget);
  });
}
