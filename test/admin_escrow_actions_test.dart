import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/admin_orders_screen.dart';

/// AU-043: admin escrow inline actions — Release payout shows only for HELD
/// + delivered/completed rows; Issue refund only for REFUND_PENDING; backend
/// guard errors (NO_REFUND_DUE, ORDER_NOT_DELIVERED, ORDER_REFUNDED) surface
/// verbatim. All shapes mirror sandbox-probed payloads (e2e/API_MAP.md #4).

http.Response _json(Object body, [int status = 200]) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

MockClient _client() => MockClient((request) async {
      if (request.url.path == '/api/v1/admin/orders') {
        return _json([
          {
            'orderId': 'ro-1',
            'orderNumber': 'ORD-R1',
            'status': 'DELIVERED',
            'paymentStatus': 'PAID',
            'payoutStatus': 'HELD',
            'totalAmount': 90000,
            'currency': 'TZS',
            'orderType': 'buying',
          },
          {
            'orderId': 'ro-2',
            'orderNumber': 'ORD-R2',
            'status': 'CANCELLED',
            'refundStatus': 'REFUND_PENDING',
            'totalAmount': 72000,
            'currency': 'TZS',
            'orderType': 'buying',
          },
        ]);
      }
      if (request.url.path == '/api/v1/admin/orders/ro-2/refund') {
        // Double-refund guard, verbatim sandbox body.
        return _json({'success': false, 'message': 'NO_REFUND_DUE'}, 409);
      }
      return _json({});
    });

void main() {
  testWidgets('AU-043: escrow badges + guarded inline actions; NO_REFUND_DUE surfaces',
      (tester) async {
    final api = ApiClient(client: _client());
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    AuthStore.instance = auth;
    await tester.pumpWidget(MaterialApp(home: AdminOrdersScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    // Row-state-derived badges.
    expect(find.text('Escrow held'), findsOneWidget);
    expect(find.text('Refund due'), findsOneWidget);
    expect(find.text('Released'), findsNothing);

    // Guarded actions appear per row.
    expect(find.text('Release payout'), findsOneWidget);
    expect(find.text('Issue refund'), findsOneWidget);

    // Tapping Issue refund hits the backend; its real NO_REFUND_DUE 409 body
    // must surface — never faked as success.
    await tester.tap(find.text('Issue refund'));
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.textContaining('NO_REFUND_DUE'), findsWidgets,
        reason: 'backend guard error shown to the admin, not swallowed');
  });
}
