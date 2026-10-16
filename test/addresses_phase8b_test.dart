import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/addresses_screen.dart';

Map<String, dynamic> _address(int id) => {
      'addressId': id,
      'label': 'Address $id',
      'street': 'Street $id',
      'region': 'Dar es Salaam',
      'country': 'Tanzania',
      'default': id == 1,
    };

MockClient _addrClient(List<Map<String, dynamic>> rows) =>
    MockClient((request) async {
      if (request.url.path == '/api/v1/get-addresses') {
        return http.Response(jsonEncode(rows), 200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 404);
    });

AuthStore _authFor(ApiClient api) =>
    AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

void _useTallSurface(WidgetTester tester) {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = const Size(1000, 6000);
  addTearDown(tester.view.reset);
}

/// The Profile Information screen embeds AddressBookSection inside a scroll
/// parent; mirror that host here so embedded tests scroll like production.
Future<void> _pumpEmbedded(
    WidgetTester tester, ApiClient api, AuthStore auth) async {
  _useTallSurface(tester);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: ListView(
        children: [
          AddressBookSection(auth: auth, api: api, embedded: true),
        ],
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
      'A-21: the standalone address book empty state shows the "Add Your First Address" CTA',
      (tester) async {
    final api = ApiClient(client: _addrClient([]));
    await tester.pumpWidget(
        MaterialApp(home: AddressesScreen(auth: _authFor(api), api: api)));
    await tester.pumpAndSettle();

    expect(find.text('No addresses saved'), findsOneWidget);
    expect(find.text('Add your delivery address to check out faster'),
        findsOneWidget);
    expect(find.byKey(const ValueKey('address-empty-add')), findsOneWidget);
    expect(find.text('Add Your First Address'), findsOneWidget);
  });

  testWidgets(
      'A-21: the Profile-embedded address book shows its own dashed empty state',
      (tester) async {
    final api = ApiClient(client: _addrClient([]));
    await _pumpEmbedded(tester, api, _authFor(api));

    expect(find.text('No shipping addresses saved'), findsOneWidget);
    expect(find.byKey(const ValueKey('address-empty-add-embedded')),
        findsOneWidget);
    expect(find.text('Add Address'), findsOneWidget);
    // The standalone page CTA never leaks into the embedded variant.
    expect(find.byKey(const ValueKey('address-empty-add')), findsNothing);
    expect(find.text('Add Your First Address'), findsNothing);
  });

  testWidgets(
      'A-21: the embedded book pages 5 per page with a prev/dot/next pager',
      (tester) async {
    final rows = [for (var i = 1; i <= 11; i++) _address(i)];
    final api = ApiClient(client: _addrClient(rows));
    await _pumpEmbedded(tester, api, _authFor(api));

    // Page 0 shows the first 5 rows only.
    expect(find.text('Address 1'), findsOneWidget);
    expect(find.text('Address 5'), findsOneWidget);
    expect(find.text('Address 6'), findsNothing);
    expect(find.byKey(const ValueKey('addr-page-0')), findsOneWidget);

    // Next page -> rows 6..10; the pager is still active.
    await tester.tap(find.byKey(const ValueKey('addr-next-page')));
    await tester.pumpAndSettle();
    expect(find.text('Address 1'), findsNothing);
    expect(find.text('Address 6'), findsOneWidget);
    expect(find.text('Address 10'), findsOneWidget);
    expect(find.text('Address 11'), findsNothing);

    // Last page -> row 11 only, next disabled.
    await tester.tap(find.byKey(const ValueKey('addr-next-page')));
    await tester.pumpAndSettle();
    expect(find.text('Address 11'), findsOneWidget);
    expect(find.text('Address 10'), findsNothing);
    final nextBtn = tester.widget<IconButton>(
        find.byKey(const ValueKey('addr-next-page')));
    expect(nextBtn.onPressed, isNull,
        reason: 'next is disabled on the final page');

    // Dot pill jumps straight to page 0.
    await tester.tap(find.byKey(const ValueKey('addr-page-0')));
    await tester.pumpAndSettle();
    expect(find.text('Address 1'), findsOneWidget);
    expect(find.text('Address 6'), findsNothing);
  });
}
