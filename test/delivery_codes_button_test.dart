// Once an order is dispatched, the buyer's delivery code shows where the
// other important steps do: the reminder strip under the top bar ("Show
// code") and, on the order's card, in the next-step button's place. Not in
// the top bar itself.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/domain/pending_actions.dart';
import 'package:globoexpats_mobile/models/order.dart';
import 'package:globoexpats_mobile/screens/orders_screen.dart';
import 'package:globoexpats_mobile/screens/shell.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:globoexpats_mobile/widgets/globo_app_bar.dart';

Map<String, dynamic> _orderJson(String id,
        {String status = 'IN_TRANSIT',
        String? code = '482913',
        String type = 'buying'}) =>
    {
      'orderId': id,
      'orderNumber': 'GE-$id',
      'status': status,
      'orderType': type,
      'sellerName': 'Prime Choice',
      'totalAmount': 54000,
      'currency': 'TZS',
      'createdAt': '2026-09-01T00:00:00Z',
      if (code != null) 'deliveryCode': code,
      'items': [
        {'productId': 1, 'productName': 'Beef T-Bone', 'quantity': 1, 'price': 24000},
        {'productId': 2, 'productName': 'Chicken', 'quantity': 1, 'price': 30000},
      ],
    };

Order _order(String id,
        {String status = 'IN_TRANSIT', String? code = '482913', String type = 'buying'}) =>
    Order.fromJson(_orderJson(id, status: status, code: code, type: type));

ApiClient _api(List<Map<String, dynamic>> orders) => ApiClient(
      client: MockClient((request) async {
        final path = request.url.path;
        if (path == '/api/v1/userManagement/user-details') {
          return http.Response(jsonEncode({'userId': 7}), 200,
              headers: {'content-type': 'application/json'});
        }
        if (path == '/api/v1/orders') {
          return http.Response(jsonEncode(orders), 200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 200,
            headers: {'content-type': 'application/json'});
      }),
    );

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    ApiClient.invalidateReads();
    AuthStore.instance = AuthStore(initialToken: 'jwt', initialEmail: 'a@b.com');
    PendingActionsStore.instance.clear();
    PendingActionsStore.instance.clearSnoozes();
  });
  tearDown(() {
    PendingActionsStore.instance.clear();
    PendingActionsStore.instance.clearSnoozes();
    AuthStore.instance = null;
  });

  test("only the buyer's dispatched orders with a code are collected", () {
    PendingActionsStore.instance.replace(orders: [
      _order('1'),
      _order('2', status: 'PAID'),
      _order('3', code: null),
      _order('4', type: 'selling'),
      _order('5', status: 'DELIVERED', code: '111111'),
      _order('6', code: '907154'),
    ], payments: const []);
    final codes = PendingActionsStore.instance.deliveryCodes;
    expect(codes.map((c) => c.orderId), ['1', '6']);
    expect(codes.first.itemsLabel, 'Beef T-Bone + 1 more');
    expect(PendingActionsStore.instance.deliveryCodeFor('6')?.code, '907154');
  });

  testWidgets('the top bar carries no delivery-code button', (tester) async {
    PendingActionsStore.instance
        .replace(orders: [_order('1')], payments: const []);
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(appBar: GloboAppBar(), body: SizedBox())));
    await tester.pump();
    expect(find.byTooltip('Delivery code'), findsNothing);
    expect(find.byIcon(Icons.pin_outlined), findsNothing);
  });

  testWidgets('the strip under the top bar shows the code in place',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: AppShell(
        store: AuthStore(initialToken: 'jwt', initialEmail: 'a@b.com'),
        api: _api([_orderJson('1')]),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Delivery arriving: GE-1'), findsOneWidget);
    await tester.tap(find.text('Show code'));
    await tester.pumpAndSettle();

    expect(find.text('Your delivery code'), findsOneWidget);
    expect(find.text('482913'), findsOneWidget);
    expect(find.text('Order GE-1'), findsOneWidget);
  });

  testWidgets("the order card shows the code where its button would be",
      (tester) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final auth = AuthStore(initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(
        home: OrdersScreen(auth: auth, api: _api([_orderJson('1')]))));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('order-card-delivery-code-1')),
        findsOneWidget);
    expect(find.text('482913'), findsOneWidget);
    expect(find.text('View delivery code'), findsNothing,
        reason: 'the code replaces the button');

    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') {
        copied = (call.arguments as Map)['text'] as String?;
      }
      return null;
    });
    await tester.tap(
        find.byKey(const ValueKey('order-card-delivery-code-copy-1')));
    await tester.pump();
    expect(copied, '482913');
    expect(find.text('Delivery code copied'), findsOneWidget);
  });
}
