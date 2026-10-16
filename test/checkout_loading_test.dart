// After "Buy now", checkout's Delivery Address card holds a still outline
// while the profile and saved addresses load, then shows the finished form
// in one step — no empty fields filling in and a picker popping in below.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
  });
  tearDown(() async {
    AuthStore.instance = null;
    // ignore: discarded_futures
    CartStore.instance.reset();
  });

  testWidgets('the address card waits as one outline, then lands whole',
      (tester) async {
    final profileGate = Completer<void>();
    http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
        headers: {'content-type': 'application/json'});
    final api = ApiClient(client: MockClient((req) async {
      if (req.url.path.endsWith('/user-details')) {
        await profileGate.future;
        return ok({
          'firstName': 'Derick',
          'lastName': 'Ruganuza',
          'loggingEmail': 'derick@example.com',
          'whatsAppPhoneNumber': '+255767800110',
        });
      }
      if (req.url.path.endsWith('/get-addresses')) return ok([]);
      return http.Response('{}', 404);
    }));
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
    CartStore.instance.addDetail(
        productId: 615, sellerId: '128', title: 'Chair', price: 100000);
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(home: CheckoutFlowHarness(api: api)));
    await tester.pump();
    expect(find.byKey(const ValueKey('checkout-address-loading')), findsOneWidget);
    expect(find.byKey(const ValueKey('checkout-address-ready')), findsNothing);

    profileGate.complete();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('checkout-address-loading')), findsNothing);
    expect(find.byKey(const ValueKey('checkout-address-ready')), findsOneWidget);
    expect(find.text('Derick'), findsOneWidget,
        reason: 'the form arrives already filled in');
  });
}
