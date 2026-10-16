import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/delivery_dashboard_screens.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) => http.Response(
    jsonEncode(body), status,
    headers: {'content-type': 'application/json'});

/// Web parity: nothing on My Space is sticky. These pin that the greeting and
/// the Selling chrome travel with the listings instead of eating the screen.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Map<String, dynamic> listing(int id) => {
        'productId': id,
        'productName': 'Listing number $id',
        'productStatus': 'AVAILABLE',
        'productQuantity': 3,
        'productAskingPrice': 120000,
        'clickCount': id,
      };

  Map<String, dynamic> transporter(int id) => {
        'id': id,
        'fullName': 'Transporter number $id',
        'vehicleType': 'Pickup',
        'plateNumber': 'T $id ABC',
        'available': true,
      };

  Future<void> pumpDashboard(WidgetTester tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/user-details')) {
          return _json({
            'userId': 7,
            'firstName': 'Globo',
            'lastName': 'Expat',
            'isVerified': true,
            'roles': [
              {'roleName': 'SELLER'}
            ],
            'products': [for (var i = 1; i <= 12; i++) listing(i)],
          });
        }
        if (req.url.path.endsWith('/transporters')) {
          return _json([for (var i = 1; i <= 12; i++) transporter(i)]);
        }
        return _json({});
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(
        home: ExpatDashboardScreen(api: api, initialTab: 'selling')));
    await tester.pumpAndSettle();
  }

  tearDown(() => AuthStore.instance = null);

  testWidgets('the Selling chrome sits inside the scroll view, not above it',
      (tester) async {
    await pumpDashboard(tester);

    // "Selling" is both the top tab and the section heading, hence findsWidgets.
    expect(find.text('Selling'), findsWidgets);
    expect(find.text('Listings'), findsWidgets);
    expect(find.text('All statuses'), findsOneWidget);
    final toolbarTop = tester.getTopLeft(find.text('All statuses')).dy;

    await tester.drag(find.text('All statuses'), const Offset(0, -220));
    await tester.pumpAndSettle();

    // Having scrolled, the toolbar has moved up rather than staying pinned.
    expect(tester.getTopLeft(find.text('All statuses')).dy,
        lessThan(toolbarTop));
  });

  /// The nearest enclosing Scrollable's element — identity tells us two
  /// widgets are in the *same* scroll view rather than in sibling ones.
  Element enclosingScrollable(WidgetTester tester, Finder f) => tester.element(
      find.ancestor(of: f, matching: find.byType(Scrollable)).first);

  /// Regression: only Listings hosted the Selling chrome inside its own scroll
  /// view; Orders, Payments (now the wallet) and Transporters rendered it in a sibling Column
  /// above an Expanded panel, so the heading and sub-tabs stayed pinned.
  for (final (tab, bodyText) in const [
    ('Orders', 'No orders yet.\nWhen you place an order it will appear here.'),
    // Web merged the seller's Payments into the Virtual wallet.
    ('Virtual wallet',
        'Money from your sales: what is unsettled, what is settled, and how each amount is worked out.'),
    ('Transporters', 'People available for your order deliveries.'),
  ]) {
    testWidgets('the Selling chrome scrolls with the $tab panel',
        (tester) async {
      await pumpDashboard(tester);

      await tester.tap(find.text(tab).last);
      await tester.pumpAndSettle();

      expect(find.text(bodyText), findsOneWidget);
      // 'New' is the section heading's action button, i.e. part of the header.
      expect(
        identical(enclosingScrollable(tester, find.text('New')),
            enclosingScrollable(tester, find.text(bodyText))),
        isTrue,
        reason: 'the $tab panel must share its scroll view with the header',
      );
    });
  }

  testWidgets('the Transporters list drags its header up with it',
      (tester) async {
    await pumpDashboard(tester);

    await tester.tap(find.text('Transporters').last);
    await tester.pumpAndSettle();

    final headerTop = tester.getTopLeft(find.text('New')).dy;
    await tester.drag(find.text('Transporter number 1'), const Offset(0, -220));
    await tester.pumpAndSettle();

    final header = find.text('New');
    if (header.evaluate().isNotEmpty) {
      expect(tester.getTopLeft(header).dy, lessThan(headerTop));
    }
  });

  testWidgets('the welcome greeting scrolls away with the content',
      (tester) async {
    await pumpDashboard(tester);

    expect(find.textContaining('Welcome back'), findsOneWidget);
    final greetingTop = tester.getTopLeft(find.textContaining('Welcome back')).dy;

    await tester.drag(find.text('All statuses'), const Offset(0, -260));
    await tester.pumpAndSettle();

    // Either it scrolled up out of the way, or it left the tree entirely.
    final greeting = find.textContaining('Welcome back');
    if (greeting.evaluate().isNotEmpty) {
      expect(tester.getTopLeft(greeting).dy, lessThan(greetingTop));
    }
  });
}
