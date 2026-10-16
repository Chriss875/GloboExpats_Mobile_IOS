import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/seller_listings_screen.dart';

http.Response _json(Object body, [int status = 200]) => http.Response(
    jsonEncode(body), status,
    headers: {'content-type': 'application/json'});

Map<String, dynamic> _listing({
  required int id,
  required String name,
  String productStatus = 'AVAILABLE',
  String? archiveDate,
}) =>
    {
      'productId': id,
      'productName': name,
      'productStatus': productStatus,
      'productQuantity': 1,
      'productAskingPrice': 1000,
      if (archiveDate != null) 'archiveDate': archiveDate,
    };

Future<void> _pump(WidgetTester tester, List<Map<String, dynamic>> rows) async {
  final api = ApiClient(
    client: MockClient((req) async {
      if (req.url.path.endsWith('/user-details')) {
        return _json({
          'userId': 7,
          'roles': [
            {'roleName': 'SELLER'}
          ],
          'products': rows,
        });
      }
      return _json({});
    }),
  );
  AuthStore.instance =
      AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
  await tester.pumpWidget(
      MaterialApp(home: SellerListingsScreen(api: api, embedded: true)));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() => AuthStore.instance = null);

  testWidgets(
      'A-15: an ACTIVE listing with a scheduled archive date shows "Archives {date}"',
      (tester) async {
    await _pump(tester, [
      _listing(id: 1, name: 'Teak chair', archiveDate: '2026-03-12T10:00:00Z'),
    ]);

    expect(find.byKey(const ValueKey('listing-archives-on')), findsOneWidget);
    expect(find.text('Archives 12 Mar 2026'), findsOneWidget);
  });

  testWidgets('A-15: no footnote when the active listing has no archive date',
      (tester) async {
    await _pump(tester, [
      _listing(id: 2, name: 'Plain stool'),
    ]);

    expect(find.byKey(const ValueKey('listing-archives-on')), findsNothing);
    expect(find.textContaining('Archives'), findsNothing);
  });

  testWidgets(
      'A-15: an ARCHIVED listing never shows the scheduled-archive footnote',
      (tester) async {
    await _pump(tester, [
      _listing(
          id: 3,
          name: 'Old chest',
          productStatus: 'ARCHIVED',
          archiveDate: '2026-03-12T10:00:00Z'),
    ]);

    expect(find.byKey(const ValueKey('listing-archives-on')), findsNothing);
  });
}
