import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/domain/selcom_payment.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Web ffc0bae, `hooks/use-proforma.ts` RESUME_TIMEOUT_MS: reopening an
/// invoice must never leave the buyer on "Loading your invoice" for good. A
/// stalled read gives way to the retry screen after 12 seconds, and that
/// screen offers "Retry payment".
void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
  });

  tearDown(() => AuthStore.instance = null);

  testWidgets('a stalled invoice read gives way to Retry payment',
      (tester) async {
    tester.view.physicalSize = const Size(420, 950);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    var reads = 0;
    final stalled = Completer<http.Response>();
    final api = ApiClient(client: MockClient((req) async {
      if (req.url.path == '/api/v1/proformas/pf-1') {
        reads++;
        // The first read never answers; the retry does.
        if (reads == 1) return stalled.future;
        return http.Response(
            jsonEncode({
              'proformaId': 'pf-1',
              'proformaNumber': 'PF-2026-000777',
              'status': 'PENDING_PAYMENT',
              'grandTotal': 104000.0,
              'currency': 'TZS',
              'expiresAt': '2026-08-25T07:00:00Z',
              'sellerGroups': const [],
            }),
            200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 200,
          headers: {'content-type': 'application/json'});
    }));
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');

    await tester.pumpWidget(MaterialApp(
        home: CheckoutScreen(
            api: api,
            proformaId: 'pf-1',
            nowUtc: DateTime.utc(2026, 8, 25, 6, 0))));
    await tester.pump();
    expect(find.text('Loading your invoice…'), findsOneWidget);

    // Past the 12s cap — well inside the shared client's own deadline, which
    // is what used to decide how long the spinner stayed.
    await tester.pump(proformaResumeTimeout + const Duration(seconds: 1));
    await tester.pump();

    expect(find.text('Loading your invoice…'), findsNothing);
    expect(find.text(proformaResumeTimeoutMessage), findsOneWidget);
    expect(find.text('Retry payment'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('resume-retry')));
    await tester.pumpAndSettle();

    expect(reads, 2, reason: 'Retry payment reads the invoice again');
    expect(find.text('Complete Your Payment'), findsOneWidget,
        reason: 'a payable invoice lands on the Payment step');

    stalled.complete(http.Response('{}', 500));
  });
}
