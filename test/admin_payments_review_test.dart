import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/admin_payments_review_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _queueRow = {
  'proformaId': 'pf-1',
  'proformaNumber': 'PF-2026-000042',
  'buyerName': 'Test Buyer',
  'buyerEmail': 'b@x.com',
  'paymentMethodType': 'MOBILE_MONEY',
  'status': 'PAYMENT_SUBMITTED',
  'grandTotal': 630000.0,
  'currency': 'TZS',
  'overdue': false,
  'transactionReferences': ['TX-1'],
  'orderIds': ['o-9'],
  'receipts': [
    {
      'receiptId': 'rc-1',
      'fileName': 'proof.png',
      'contentType': 'image/png',
      'amount': 630000.0,
      'status': 'SUBMITTED',
      'rejectionReasonCode': null,
    },
  ],
};

const _stats = {'pending': 1, 'verified': 4};

http.Response _json(Object body, [int status = 200]) => http.Response(
      jsonEncode(body), status,
      headers: {'content-type': 'application/json'},
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
  });

  testWidgets('queue renders rows; VERIFY then CONFIRM hit the real endpoints '
      'with contract methods', (tester) async {
    final calls = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        calls.add('${req.method} ${req.url.path}');
        if (req.url.path == '/api/v1/admin/payments') {
          return _json({'content': [_queueRow]});
        }
        if (req.url.path == '/api/v1/admin/proformas/stats') {
          return _json(_stats);
        }
        if (req.url.path == '/api/v1/admin/receipts/rc-1/verify') {
          return _json({});
        }
        if (req.url.path == '/api/v1/admin/proformas/pf-1/confirm-payment') {
          return _json({'proformaId': 'pf-1', 'status': 'CONFIRMED'});
        }
        return _json({}, 404);
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(
        home: AdminPaymentsReviewScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.textContaining('PF-2026-000042'), findsOneWidget);
    expect(find.textContaining('TSh'), findsWidgets);

    // VERIFY the SUBMITTED receipt first (web reviewability gate).
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    // Then CONFIRM payment.
    await tester.tap(find.text('Confirm payment'));
    await tester.pumpAndSettle();

    expect(calls, contains('POST /api/v1/admin/receipts/rc-1/verify'));
    expect(calls, contains('POST /api/v1/admin/proformas/pf-1/confirm-payment'));
    // No verb guessing: never a PATCH to a POST-only endpoint.
    expect(calls.where((c) => c.startsWith('PATCH /api/v1/admin/receipts')),
        isEmpty);
    expect(calls.where((c) => c.contains('confirm-payment') && c.startsWith('PATCH')),
        isEmpty);
  });

  testWidgets('REJECT opens the reason dialog and posts reasonCode',
      (tester) async {
    final bodies = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/admin/payments') {
          return _json({'content': [_queueRow]});
        }
        if (req.url.path == '/api/v1/admin/proformas/stats') return _json(_stats);
        if (req.url.path == '/api/v1/admin/receipts/rc-1/reject') {
          bodies.add(utf8.decode(req.bodyBytes));
          return _json({});
        }
        return _json({}, 404);
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(
        home: AdminPaymentsReviewScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Reject'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('amount mismatch'));
    await tester.pumpAndSettle();

    expect(bodies, hasLength(1));
    expect(bodies.first, contains('AMOUNT_MISMATCH'));
  });

  test('bulk approve posts proformaIds array', () async {
    final bodies = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/admin/proformas/bulk-approve') {
          bodies.add(utf8.decode(req.bodyBytes));
          return _json([{}, {}]);
        }
        return _json({}, 404);
      }),
    );
    await api.adminBulkApprove('jwt', ['p1', 'p2']);
    expect(bodies.single, contains('"p1"'));
    expect(bodies.single, contains('"p2"'));
  });

  testWidgets('empty queue hides the list entirely (no scaffolding)',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/admin/payments') {
          return _json({'content': []});
        }
        if (req.url.path == '/api/v1/admin/proformas/stats') return _json({});
        return _json({}, 404);
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(
        home: AdminPaymentsReviewScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Nothing in this queue.'), findsOneWidget);
    expect(byTypeCardFinder(tester), findsNothing);
  });
}

Finder byTypeCardFinder(WidgetTester tester) =>
    find.byType(Card);
