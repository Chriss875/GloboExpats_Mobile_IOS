import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/admin_dashboard.dart';

MockClient _adminClient() => MockClient((request) async {
      Map<String, String> ok = {'content-type': 'application/json'};
      if (request.url.path == '/api/v1/admin/stats') {
        return http.Response(jsonEncode({
          'totalUsers': 142,
          'totalOrders': 10,
          'totalProducts': 560,
          'totalRatings': 11,
          'totalRevenue': 401000.0,
        }), 200, headers: ok);
      }
      if (request.url.path == '/api/v1/admin/orders/trend') {
        return http.Response(jsonEncode({
          'series': [
            {'date': '2026-06-01', 'placed': 2, 'ongoing': 0, 'completed': 2, 'overdue': 0, 'cancelled': 0},
            {'date': '2026-06-02', 'placed': 1, 'ongoing': 0, 'completed': 0, 'overdue': 0, 'cancelled': 0},
          ]
        }), 200, headers: ok);
      }
      if (request.url.path == '/api/v1/admin/proformas/trend') {
        return http.Response(jsonEncode({
          'series': [
            {'date': '2026-07-22', 'placed': 1, 'verified': 0, 'pending': 0, 'overdue': 0, 'rejected': 0, 'expired': 0},
          ]
        }), 200, headers: ok);
      }
      if (request.url.path.contains('search-analytics')) {
        return http.Response(jsonEncode({'content': []}), 200, headers: ok);
      }
      return http.Response('{}', 404);
    });

void main() {
  testWidgets('admin dashboard renders KPI cards and trend charts',
      (tester) async {
    final api = ApiClient(client: _adminClient());
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: AdminDashboard(auth: auth, api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Admin'), findsWidgets);
    expect(find.text('Users', findRichText: true), findsWidgets);
    expect(find.text('Orders', skipOffstage: true), findsWidgets);
    expect(find.text('Products', skipOffstage: true), findsOneWidget);
    expect(find.text('Revenue', skipOffstage: true), findsOneWidget);
    expect(find.text('Sales trend', skipOffstage: true), findsOneWidget);
    expect(find.text('Proforma trend', skipOffstage: true), findsOneWidget);
    expect(find.text('Top Buyers by Clicks', skipOffstage: true), findsOneWidget);
    expect(find.text('142'), findsOneWidget); // totalUsers stat
    expect(find.text('TSh 401,000', skipOffstage: true), findsOneWidget);
  });
}
