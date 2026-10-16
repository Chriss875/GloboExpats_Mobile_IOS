import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/admin_orders_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Map<String, dynamic> _order(String num, String status) => {
      'orderId': 'o-$num',
      'orderNumber': num,
      'status': status,
      'paymentStatus': 'PAID',
      'orderType': 'buying',
      'totalAmount': 42000,
      'currency': 'TZS',
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('AU-065: admin orders console group chips filter server-side',
      (tester) async {
    final urls = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        urls.add(req.url.toString());
        if (req.url.path == '/api/v1/admin/orders') {
          final group = req.url.queryParameters['group'] ?? 'all';
          final rows = group == 'overdue'
              ? [_order('ORD-9', 'IN_TRANSIT')]
              : [_order('ORD-1', 'PAID'), _order('ORD-2', 'AWAITING_PAYMENT')];
          return _json(rows);
        }
        return _json({});
      }),
    );
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    AuthStore.instance = auth;

    await tester.pumpWidget(MaterialApp(home: AdminOrdersScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    expect(find.text('ORD-1'), findsOneWidget);
    // Switch to Overdue -> refetch with group=overdue.
    await tester.tap(find.text('Overdue'));
    await tester.pumpAndSettle();
    expect(urls.where((u) => u.contains('group=overdue')), isNotEmpty);
    expect(find.text('ORD-9'), findsOneWidget);
    AuthStore.instance = null;
  });
}
