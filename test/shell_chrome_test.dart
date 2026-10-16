import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/screens/shell.dart';
import 'package:globoexpats_mobile/widgets/brand_logo.dart';
import 'package:globoexpats_mobile/widgets/globo_app_bar.dart';

/// Every public read answers empty so the shell can settle without a network.
MockClient _emptyBackend() => MockClient((request) async {
      if (request.url.path == '/api/v1/products/categories') {
        return http.Response('[]', 200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{"content":[],"totalElements":0}', 200,
          headers: {'content-type': 'application/json'});
    });

/// [location] is what gates the home-only extended search row, so the bare
/// shell has to state which route it stands in for.
Widget _shell({String location = '/'}) => MaterialApp(
      home: AppShell(
        store: AuthStore(),
        api: ApiClient(client: _emptyBackend()),
        location: Uri.parse(location),
      ),
    );

void main() {
  setUp(() {
    // Signed out: the unread-count fetch short-circuits, so no request and no
    // pending work while the chrome renders.
    AuthStore.instance = null;
    CartStore.instance.clear();
  });

  testWidgets('bottom navigation matches the five-item mobile web pattern',
      (tester) async {
    await tester.pumpWidget(_shell());
    await tester.pumpAndSettle();

    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Community'), findsOneWidget);
    expect(find.text('Sell'), findsOneWidget);
    expect(find.text('MySpace'), findsOneWidget);
    // Signed-out Profile uses the web navigation's Login fallback label.
    expect(find.text('Login'), findsOneWidget);
  });

  testWidgets(
      'home chrome extends into a search row and shows signed-out login',
      (tester) async {
    await tester.pumpWidget(_shell());
    await tester.pumpAndSettle();

    expect(find.byType(GloboAppBar), findsOneWidget);
    // Two-tone wordmark: "Globo" + "expats" are separate spans of one
    // Text.rich, so there is no single Text widget carrying the whole name.
    expect(find.byType(GloboExpatsWordmark), findsOneWidget);
    // Home's search now lives in the app bar itself (extendedSearch), not in
    // a separate field further down the scrolling body.
    expect(find.byType(SearchBar), findsOneWidget);
    expect(find.byTooltip('Search'), findsOneWidget);
    expect(find.byTooltip('Cart'), findsOneWidget);
    expect(find.byTooltip('Notifications'), findsNothing);
    expect(find.text('Login'), findsOneWidget);
  });

  testWidgets('the cart action shows a live count once items are added',
      (tester) async {
    await tester.pumpWidget(_shell());
    await tester.pumpAndSettle();

    // Nothing in the cart: no bubble.
    expect(find.text('2'), findsNothing);

    CartStore.instance.add(
      Product(
        productId: 1,
        productName: 'Bose speaker',
        productAskingPrice: 350000,
        productCurrency: 'TZS',
      ),
      quantity: 2,
    );
    await tester.pump();

    expect(find.text('2'), findsOneWidget);
  });

  test('the URL decides the selected tab', () {
    expect(AppShellWithRouter.tabForLocation('/'), 0);
    expect(AppShellWithRouter.tabForLocation('/browse'), 0);
    expect(AppShellWithRouter.tabForLocation('/requests'), 1);
    expect(AppShellWithRouter.tabForLocation('/sell'), 2);
    expect(AppShellWithRouter.tabForLocation('/expat/dashboard'), 3);
    expect(AppShellWithRouter.tabForLocation('/orders'), 3);
    expect(AppShellWithRouter.tabForLocation('/orders/o-1'), 3);
    expect(AppShellWithRouter.tabForLocation('/account'), 4);
  });
}
