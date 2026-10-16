import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/seller_listings_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

/// "i just posted a product im a verified seller but when i go to my space
/// selling it says verify your account ... now it has accepted".
///
/// Two separate faults, and the "now it works" is the tell for both: the
/// Selling tab read the seller APPLICATION only and called any failure
/// "unverified", and the profile that carries the listings is cached for 45
/// seconds, so a seller who had just published saw the profile from before
/// the publish — no listing, and therefore the empty-state gate.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  http.Response json(Object body, [int status = 200]) =>
      http.Response(jsonEncode(body), status,
          headers: {'content-type': 'application/json'});

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    ApiClient.invalidateReads();
  });

  tearDown(() => AuthStore.instance = null);

  /// A verified account with no listings yet — the state that shows the gate.
  const verifiedAccount = {
    'userId': 1,
    'verificationStatus': {'isFullyVerified': true},
    'products': <Object>[],
  };

  Future<void> pumpSelling(WidgetTester tester, ApiClient api) async {
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(
        MaterialApp(home: SellerListingsScreen(api: api, embedded: true)));
    await tester.pumpAndSettle();
  }

  group('the Selling tab', () {
    testWidgets('trusts the account when there is no seller application',
        (tester) async {
      final api = ApiClient(client: MockClient((req) async {
        if (req.url.path.endsWith('/user-details')) return json(verifiedAccount);
        // No application on file — the shape the endpoint returns for an
        // account verified without one.
        return json(const <String, Object>{});
      }));

      await pumpSelling(tester, api);

      expect(find.text('Verify your account to start selling'), findsNothing,
          reason: 'the sell wizard lets this same account in');
    });

    testWidgets('does not call a seller unverified because a call failed',
        (tester) async {
      final api = ApiClient(client: MockClient((req) async {
        if (req.url.path.endsWith('/user-details')) return json(verifiedAccount);
        throw http.ClientException('connection timed out');
      }));

      await pumpSelling(tester, api);

      expect(find.text('Verify your account to start selling'), findsNothing,
          reason: 'a timeout is not the server saying "unverified"');
    });

    testWidgets('still gates an account that is genuinely not verified',
        (tester) async {
      final api = ApiClient(client: MockClient((req) async {
        if (req.url.path.endsWith('/user-details')) {
          return json({'userId': 1, 'products': <Object>[]});
        }
        return json({
          'application': {'reviewStatus': 'PENDING'}
        });
      }));

      await pumpSelling(tester, api);

      expect(find.text('Verify your account to start selling'), findsOneWidget);
    });
  });

  group('publishing a listing', () {
    test('drops the cached profile so the new listing is there at once',
        () async {
      var profileReads = 0;
      final api = ApiClient(client: MockClient((req) async {
        if (req.url.path.endsWith('/user-details')) {
          profileReads++;
          return json({
            'userId': 1,
            // The second read is the one that has the new listing.
            'products': profileReads == 1 ? <Object>[] : [
              {'productId': 9, 'productName': 'Kettle'}
            ],
          });
        }
        return json({'productId': 9});
      }));

      final before = await api.getUserDetails('jwt');
      expect((before['products'] as List), isEmpty);

      await api.createListingMultipart('jwt', const {'title': 'Kettle'});

      final after = await api.getUserDetails('jwt');
      expect((after['products'] as List), hasLength(1),
          reason: 'a 45-second cache showed the seller an empty Selling tab '
              'right after they published');
      expect(profileReads, 2);
    });
  });
}
