import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/payout_details_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('AU-060: payout details lists real rows with primary badge',
      (tester) async {
    final paths = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        paths.add(req.url.path);
        if (req.url.path == '/api/v1/userManagement/payout-details') {
          return _json([
            {
              'id': 5,
              'configured': true,
              'primary': true,
              'payoutMethod': 'MOBILE_MONEY',
              'providerName': 'M-PESA',
              'accountName': 'Mobile Test',
              'accountNumber': '+255712000111',
            },
          ]);
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: PayoutDetailsScreen(api: api)));
    await tester.pumpAndSettle();

    expect(paths, contains('/api/v1/userManagement/payout-details'));
    expect(find.text('Mobile money'), findsOneWidget);
    expect(find.textContaining('Mobile Test'), findsOneWidget);
    // Web parity: the primary row's pill reads 'Default' (seller-payout-row),
    // and the primary-first sort keeps it the only row here.
    expect(find.text('Default'), findsOneWidget);
    expect(find.text('Primary'), findsNothing);
    AuthStore.instance = null;
  });

  testWidgets('AU-060: add sheet PUTs the payout payload', (tester) async {
    http.Request? captured;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/userManagement/payout-details') {
          if (req.method == 'PUT') {
            captured = req;
            return _json({'id': 6}, 200);
          }
          return _json([]);
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: PayoutDetailsScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    // A NEW method defaults to BANK_ACCOUNT (web lib/payout-details.ts
    // defaultMethod) — the bank field labels are what a fresh add shows.
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Bank name'), 'NMB Bank');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Account holder name'), 'Neema O.');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Account number'), '12345678901');
    await tester.ensureVisible(find.text('Save payout method'));
    await tester.pump();
    await tester.tap(find.text('Save payout method'), warnIfMissed: false);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(captured, isNotNull);
    expect(captured!.method, 'PUT');
    final body = jsonDecode(captured!.body) as Map<String, dynamic>;
    expect(body['payoutMethod'], 'BANK_ACCOUNT');
    expect(body['providerName'], 'NMB Bank');
    expect(body['accountName'], 'Neema O.');
    expect(body['accountNumber'], '12345678901');
    AuthStore.instance = null;
  });

  testWidgets('AU-005 skeptic r12: fetch failure shows friendly copy, never a raw exception',
      (tester) async {
    // BROKEN finding reproduced offline: the error branch interpolated
    // ${snap.error} and leaked "ClientException: Failed to fetch, uri=…".
    final api = ApiClient(
      client: MockClient((req) async =>
          throw http.ClientException('Failed to fetch', req.url)),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: PayoutDetailsScreen(api: api)));
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.textContaining('Could not load payout details'), findsOneWidget);
    expect(find.textContaining('ClientException'), findsNothing,
        reason: 'raw exception type must not reach user-facing copy');
    expect(find.textContaining('uri='), findsNothing,
        reason: 'internal URI must not reach user-facing copy');
    AuthStore.instance = null;
  });
}
