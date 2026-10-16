// "when someone logs in the popup doesn't appear — is that true?" The real
// shell, signed out, then a real login through AuthStore: the setup sheet
// must open on its own for an account that is still missing details — even
// one that tapped "I'll do this later" before.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/domain/account_setup.dart';
import 'package:globoexpats_mobile/screens/shell.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:globoexpats_mobile/widgets/account_setup.dart';

http.Response _json(Object b, [int s = 200]) => http.Response(jsonEncode(b), s,
    headers: {'content-type': 'application/json'});

MockClient _backend({required bool complete}) => MockClient((req) async {
      final p = req.url.path;
      if (p == '/api/v1/auth/login') return _json({'token': 'fresh-jwt'});
      if (p.endsWith('/user-details')) {
        return _json({
          'userId': 7,
          'firstName': 'Isack',
          if (complete) 'whatsAppPhoneNumber': '+255712345678',
          'roles': <Object>[],
        });
      }
      if (p.contains('get-addresses') || p.endsWith('/addresses')) {
        return _json(complete
            ? [
                {
                  'addressId': 1,
                  'street': 'Haile Selassie Rd',
                  'region': 'Dar es Salaam',
                  'country': 'Tanzania',
                  'latitude': -6.77,
                  'longitude': 39.27,
                }
              ]
            : <Object>[]);
      }
      if (p.endsWith('/working-schedule')) return _json({'message': 'no'}, 403);
      if (p == '/api/v1/products/categories') return _json(<Object>[]);
      return _json({'content': <Object>[], 'totalElements': 0});
    });

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    ApiClient.invalidateReads();
    AccountSetup.instance.clear();
    AccountSetupNudge.debugReset();
    AccountSetupNudge.debugEnabled = true;
    AuthStore.instance = null;
    CartStore.instance.clear();
  });
  tearDown(() {
    AccountSetupNudge.debugEnabled = null;
    AuthStore.instance = null;
  });

  Future<AuthStore> pumpSignedOut(WidgetTester tester,
      {required bool complete}) async {
    tester.view.physicalSize = const Size(430, 932);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = ApiClient(client: _backend(complete: complete));
    final store = AuthStore(api: api);
    await tester.pumpWidget(MaterialApp(
        home: AppShell(store: store, api: api, location: Uri.parse('/'))));
    await tester.pumpAndSettle();
    return store;
  }

  testWidgets('logging in opens the setup sheet when details are missing',
      (tester) async {
    final store = await pumpSignedOut(tester, complete: false);
    expect(find.byKey(const ValueKey('account-setup-welcome')), findsNothing);

    // Even an account that put it off earlier is reminded on a new login.
    await KvStore.instance.setString('account_setup_snoozed_until:isack@x.com',
        '${DateTime.now().add(const Duration(days: 2)).millisecondsSinceEpoch}');
    expect(await store.login(email: 'isack@x.com', password: 'pw'), isTrue);
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('account-setup-welcome')), findsOneWidget);
    expect(find.text('WhatsApp number'), findsOneWidget);
  });

  testWidgets('a complete account logs in without a popup', (tester) async {
    final store = await pumpSignedOut(tester, complete: true);
    expect(await store.login(email: 'done@x.com', password: 'pw'), isTrue);
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('account-setup-welcome')), findsNothing);
  });

  testWidgets('logging out and back in reminds again, without restarting',
      (tester) async {
    final store = await pumpSignedOut(tester, complete: false);
    await store.login(email: 'again@x.com', password: 'pw');
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('account-setup-welcome-later')));
    await tester.pumpAndSettle();

    await store.logout();
    await tester.pumpAndSettle();
    await store.login(email: 'again@x.com', password: 'pw');
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('account-setup-welcome')), findsOneWidget);
  });

  testWidgets('a login that lands on Sell is reminded after leaving it',
      (tester) async {
    tester.view.physicalSize = const Size(430, 932);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = ApiClient(client: _backend(complete: false));
    final store = AuthStore(api: api);
    Widget shell(String at) => MaterialApp(
        home: AppShell(store: store, api: api, location: Uri.parse(at)));
    await tester.pumpWidget(shell('/sell'));
    await tester.pumpAndSettle();
    await store.login(email: 'seller@x.com', password: 'pw');
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('account-setup-welcome')), findsNothing,
        reason: 'never over the sell flow');

    await tester.pumpWidget(shell('/'));
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('account-setup-welcome')), findsOneWidget);
  });
}
