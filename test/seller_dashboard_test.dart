import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/delivery_dashboard_screens.dart';
import 'package:globoexpats_mobile/screens/seller_listings_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('AU-054: dashboard renders real stats from user-details + orders',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/user-details')) {
          return _json({
            'userId': 7,
            'roles': [
              {'roleName': 'SELLER'}
            ],
            'products': [
              {'productId': 1, 'productName': 'A', 'productStatus': 'AVAILABLE', 'productQuantity': 5, 'clickCount': 4},
              {'productId': 2, 'productName': 'B', 'productStatus': 'AVAILABLE', 'productQuantity': 5, 'clickCount': 6},
              {'productId': 3, 'productName': 'C', 'productStatus': 'ARCHIVED', 'productQuantity': 5, 'clickCount': 0},
            ],
          });
        }
        if (req.url.path == '/api/v1/orders') {
          return _json([
            {'orderId': 'o1', 'orderNumber': 'ORD-1', 'status': 'PAID', 'paymentStatus': 'PAID', 'orderType': 'selling', 'totalAmount': 50000, 'currency': 'TZS'},
            {'orderId': 'o2', 'orderNumber': 'ORD-2', 'status': 'PENDING_PAYMENT', 'orderType': 'buying', 'totalAmount': 10000, 'currency': 'TZS'},
          ]);
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: ExpatDashboardScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('3'), findsOneWidget); // listings (2 active + 1 archived)
    expect(find.text('2'), findsOneWidget); // active (web active+booked keys only)
    expect(find.text('10'), findsOneWidget); // views 4+6
    expect(find.text('1'), findsOneWidget); // selling orders
    expect(find.textContaining('TSh 50000'), findsOneWidget);
    // dead-tile bug gone: Edit tile must NOT exist
    expect(find.text('Edit listing'), findsNothing);
    // Phase 2: listings are a tab now, selling orders stayed a link.
    expect(find.text('Selling'), findsOneWidget);
    expect(find.text('Selling orders'), findsOneWidget);
    AuthStore.instance = null;
  });

  testWidgets('AU-054: My Listings renders rows with derived status keys + filter tabs',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/user-details')) {
          return _json({
            'userId': 7,
            'products': [
              {'productId': 1, 'productName': 'Active item', 'productStatus': 'AVAILABLE', 'productQuantity': 5, 'productAskingPrice': 12000, 'clickCount': 3},
              {'productId': 2, 'productName': 'Archived item', 'productStatus': 'ARCHIVED', 'productQuantity': 5, 'productAskingPrice': 9000, 'clickCount': 0},
              {'productId': 3, 'productName': 'Empty item', 'productStatus': 'AVAILABLE', 'availabilityStatus': 'OUT_OF_STOCK', 'productQuantity': 0, 'productAskingPrice': 7000, 'clickCount': 0},
            ],
          });
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: SellerListingsScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Active item'), findsOneWidget);
    expect(find.text('Archived item'), findsOneWidget);
    // Reference labels: approval=ARCHIVED -> 'Archived'; availability
    // OUT_OF_STOCK -> 'Out of Stock'; active with qty -> 'Available'.
    expect(find.text('Pending approval'), findsNothing);
    // The badge over the picture is uppercased, as on the web card.
    expect(find.text('OUT OF STOCK'), findsWidgets);
    expect(find.text('AVAILABLE'), findsWidgets);
    expect(find.textContaining('TSh 12,000'), findsOneWidget);
    expect(find.textContaining('5 in stock'), findsWidgets); // two rows have qty 5

    // Status is a select on the toolbar (web parity), so choosing Archived
    // means opening it and picking the option.
    await tester.tap(find.text('All statuses'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archived').last);
    await tester.pumpAndSettle();
    expect(find.text('Archived item'), findsOneWidget);
    expect(find.text('Active item'), findsNothing);

    // Back to every status, where each card's overflow menu is reachable.
    await tester.tap(find.text('Archived').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('All statuses').last);
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.more_horiz), findsWidgets);
    AuthStore.instance = null;
  });
}
