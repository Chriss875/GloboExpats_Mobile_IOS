import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/addresses_screen.dart';

MockClient _addrClient() => MockClient((request) async {
      Map<String, String> ok = {'content-type': 'application/json'};
      if (request.url.path == '/api/v1/get-addresses') {
        return http.Response(jsonEncode([
          {'addressId': 148, 'label': 'Home', 'street': '44 Pazi St', 'region': 'Dar es Salaam', 'country': 'Tanzania', 'default': true},
        ]), 200, headers: ok);
      }
      return http.Response('{}', 404);
    });

void main() {
  testWidgets('addresses screen lists a saved address', (tester) async {
    final api = ApiClient(client: _addrClient());
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: AddressesScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Addresses'), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);
    expect(find.textContaining('44 Pazi St'), findsOneWidget);
    expect(find.text('Default'), findsOneWidget);
  });

  testWidgets(
      'AU-060: edit keeps an existing pin in the PUT payload; delete; set-default',
      (tester) async {
    final calls = <String>[];
    final api = ApiClient(
      client: MockClient((request) async {
        final q = request.url.query.isEmpty ? '' : '?${request.url.query}';
        calls.add('${request.method} ${request.url.path}$q');
        if (request.url.path == '/api/v1/get-addresses') {
          return http.Response(jsonEncode([
            {'addressId': 148, 'label': 'Home', 'street': '44 Pazi St', 'region': 'Dar es Salaam', 'country': 'Tanzania', 'default': true},
            {
              'addressId': 150,
              'label': 'Office',
              'street': '1 Slipway Rd',
              'region': 'Dar es Salaam',
              'country': 'Tanzania',
              'default': false,
              'latitude': -6.77,
              'longitude': 39.21,
            },
          ]), 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/api/v1/update-address/150') {
          expect(jsonDecode(request.body)['latitude'], -6.77);
          expect(jsonDecode(request.body)['longitude'], 39.21);
          return http.Response('{}', 200);
        }
        if (request.url.path == '/api/v1/delete-address/150') return http.Response('', 204);
        if (request.url.path == '/api/v1/set-default-address') return http.Response('{}', 200);
        return http.Response('{}', 404);
      }),
    );
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: AddressesScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    // Edit flow on the OFFICE row (addressId 150) with prefilled fields.
    final officeCard = find.ancestor(
        of: find.textContaining('1 Slipway Rd'), matching: find.byType(Container)).first;
    await tester.tap(find.descendant(of: officeCard, matching: find.text('Edit')));
    await tester.pumpAndSettle();
    expect(find.text('Edit address'), findsOneWidget);
    // 'Office' appears three times: the row behind the sheet, the prefilled
    // label field inside it, and (coincidentally) the 'Office' quick-pick
    // suggestion chip. The prefill proves the sheet opened on that row.
    expect(find.text('Office'), findsNWidgets(3));
    // No dart-define API key in tests, so MapLocationPicker degrades to its
    // muted notice - proves the raw Latitude/Longitude entry fields are gone
    // for good, not just hidden behind the map. Web parity: with no maps key
    // at all, manual Street/City/Country fields are the fallback.
    expect(find.textContaining('Map location picker is unavailable'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Latitude'), findsNothing);
    expect(find.widgetWithText(TextFormField, 'Longitude'), findsNothing);
    expect(find.widgetWithText(TextFormField, 'Street or area *'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'City or region *'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Country *'), findsOneWidget);
    // Saving without touching location keeps the address's existing pin.
    await tester.ensureVisible(find.text('Update address'));
    await tester.tap(find.text('Update address'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(calls.where((c) => c.startsWith('PUT /api/v1/update-address/150')),
        isNotEmpty,
        reason: 'calls so far: $calls');

    // Set default on the non-default row -> POST ?addressId=150.
    await tester.tap(find.text('Set default'));
    await tester.pumpAndSettle();
    expect(calls.contains('POST /api/v1/set-default-address?addressId=150'), isTrue);

    // Delete with confirm on the Office row -> DELETE /delete-address/150.
    await tester.tap(find.byTooltip('Delete').at(1)); // second row = Office
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(calls.contains('DELETE /api/v1/delete-address/150'), isTrue);
  });

  testWidgets('a new address has no pin until the map picker sets one', (tester) async {
    final api = ApiClient(client: _addrClient());
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: AddressesScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add New'));
    await tester.pumpAndSettle();

    expect(find.text('Add address'), findsOneWidget);
    expect(find.textContaining('Map location picker is unavailable'), findsOneWidget);
  });

  testWidgets('an unnamed address falls back to its place name, not "Address"',
      (tester) async {
    final api = ApiClient(
      client: MockClient((request) async {
        if (request.url.path == '/api/v1/get-addresses') {
          return http.Response(
              jsonEncode([
                {
                  'addressId': 1,
                  'label': '',
                  'placeName': 'Mlimani City Shopping Mall',
                  'street': '66h9+3rp',
                  'region': 'Dar es Salaam',
                  'country': 'Tanzania',
                  'latitude': -6.77,
                  'longitude': 39.21,
                },
              ]),
              200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 404);
      }),
    );
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: AddressesScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    // Web parity: nickname -> placeName -> street. With no nickname the card
    // must name the place, never the generic 'Address' over a Plus Code.
    expect(find.text('Mlimani City Shopping Mall'), findsOneWidget);
    expect(find.text('Address'), findsNothing);
  });

  testWidgets(
      'ACCOUN-13/14: add with "Set as default address" chains set-default + location sync',
      (tester) async {
    final calls = <String>[];
    final api = ApiClient(
      client: MockClient((request) async {
        calls.add('${request.method} ${request.url.path}');
        if (request.url.path == '/api/v1/get-addresses') {
          return http.Response(jsonEncode([]), 200,
              headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/api/v1/add-address') {
          // The created row returns its new addressId, which the sheet needs
          // to promote it to default right after saving.
          return http.Response(
              jsonEncode({'addressId': 200, 'label': 'Shop'}), 200,
              headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/api/v1/set-default-address') {
          return http.Response('{}', 200);
        }
        if (request.url.path == '/api/v1/products/sync-location') {
          return http.Response('{}', 200);
        }
        return http.Response('{}', 404);
      }),
    );
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: AddressesScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add New'));
    await tester.pumpAndSettle();
    expect(find.text('Add address'), findsOneWidget);

    // No maps key in tests, so the manual street/city/country fallback shows.
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Preferred location name'), 'Shop');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Street or area *'), '1 Nyerere Rd');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'City or region *'), 'Dar es Salaam');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Country *'), 'Tanzania');

    // Tick "Set as default address", then save.
    await tester.ensureVisible(find.text('Set as default address'));
    await tester.tap(find.text('Set as default address'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Save address'));
    await tester.tap(find.text('Save address'), warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(calls.contains('POST /api/v1/add-address'), isTrue,
        reason: 'calls so far: $calls');
    // ACCOUN-13: the fresh address is promoted to default…
    expect(calls.contains('POST /api/v1/set-default-address'), isTrue,
        reason: 'calls so far: $calls');
    // …and the seller's product locations re-sync (ACCOUN-14).
    expect(calls.contains('POST /api/v1/products/sync-location'), isTrue,
        reason: 'calls so far: $calls');
  });
}
