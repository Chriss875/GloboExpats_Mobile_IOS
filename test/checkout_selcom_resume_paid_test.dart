// A buyer approves in the Selcom App, Android closes GloboExpats in the
// background (low memory), and the payment reopens later: the money is in,
// so it must land on "Payment successful", not on the payment page or an
// "already submitted" dead end.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
  });

  Future<void> pumpResume(WidgetTester tester,
      {required String proformaStatus, required String selcomStatus}) async {
    tester.view.physicalSize = const Size(420, 950);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final api = ApiClient(client: MockClient((req) async {
      final path = req.url.path;
      http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
          headers: {'content-type': 'application/json'});
      if (path == '/api/v1/proformas/pf-9') {
        return ok({
          'proformaId': 'pf-9',
          'proformaNumber': 'PF-2026-000900',
          'status': proformaStatus,
          'currency': 'TZS',
          'grandTotal': 145000.0,
          'sellerGroups': const [],
        });
      }
      if (path.endsWith('/pay/selcom/status')) {
        return ok({'proformaId': 'pf-9', 'paymentStatus': selcomStatus});
      }
      if (path.endsWith('/user-details')) {
        return ok({'firstName': 'Derick', 'loggingEmail': 'd@example.com'});
      }
      if (path.endsWith('/get-addresses')) return ok(const []);
      return http.Response('{}', 404);
    }));
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'd@x.com');
    addTearDown(() => AuthStore.instance = null);
    await tester.pumpWidget(MaterialApp(
        home: CheckoutScreen(api: api, proformaId: 'pf-9')));
    await tester.pumpAndSettle();
  }

  testWidgets('a Selcom-paid invoice reopens on the success result',
      (tester) async {
    await pumpResume(tester,
        proformaStatus: 'PAYMENT_SUBMITTED', selcomStatus: 'COMPLETED');
    expect(find.byKey(const ValueKey('payment-result-success')),
        findsOneWidget);
    expect(find.text('Payment successful'), findsOneWidget);
    expect(find.text('TZS 145,000'), findsOneWidget);
  });

  testWidgets('a receipt under review keeps its own message', (tester) async {
    // Paid by bank transfer, not Selcom: Selcom has no order for it.
    await pumpResume(tester,
        proformaStatus: 'PAYMENT_SUBMITTED', selcomStatus: 'PENDING');
    expect(find.byKey(const ValueKey('payment-result-success')), findsNothing);
    expect(find.textContaining('already been submitted'), findsOneWidget);
  });
}
