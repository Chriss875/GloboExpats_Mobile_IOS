import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/edit_listing_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _productId = 665;

Map<String, dynamic> _baseDetail() => {
      'productId': _productId,
      'productName': 'AU053 Edit Fixture',
      'productDescription': 'Hand carved bowl.',
      'productAskingPrice': 25000,
      'sellerPayout': 21977.777,
      'categoryId': 2,
      'subcategoryId': 12,
      'productQuantity': 3,
      'productRegion': 'Dar es Salaam',
      'productCountry': 'Tanzania',
      'productStreet': 'Msasani',
      'whatsappNumber': '+255700000001',
      'latitude': -6.8,
      'longitude': 39.28,
      'deliveryTransportMode': 'BODA',
      'transportRequirement': 'REQUIRED',
      'currency': 'TZS',
    };

MockClient _client({required Map<String, dynamic> detail}) {
  return MockClient((request) async {
    if (request.url.path == '/api/v1/displayItem/itemDetails/$_productId') {
      return http.Response(jsonEncode(detail), 200,
          headers: {'content-type': 'application/json'});
    }
    if (request.url.path == '/api/v1/products/categories') {
      return http.Response(
        jsonEncode([
          {
            'categoryId': 2,
            'categoryName': 'Furniture',
            'slug': 'furniture',
            'commissionRate': 0.10,
            'subcategories': [
              {
                'subcategoryId': 12,
                'subcategoryName': 'Home & Garden',
                'slug': 'home-garden',
              },
            ],
          }
        ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    return http.Response('not found', 404);
  });
}

void _useTallSurface(WidgetTester tester) {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = const Size(1000, 2800);
  addTearDown(tester.view.reset);
}

/// Pumps the editor behind a host route so back navigation / a confirmed
/// Discard can pop without leaving the Navigator empty.
Future<void> _pumpEdit(WidgetTester tester, ApiClient api) async {
  _useTallSurface(tester);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Builder(
        builder: (context) => Center(
          child: TextButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => EditListingScreen(
                    listingId: _productId, api: api))),
            child: const Text('open-edit'),
          ),
        ),
      ),
    ),
  ));
  await tester.tap(find.text('open-edit'));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  setUp(() {
    AuthStore.instance =
        AuthStore(initialToken: 'jwt', initialEmail: 'seller@gmail.com');
  });
  tearDown(() => AuthStore.instance = null);

  test('A-16: /edit-listing/:id route is wrapped in SellerVerificationGate',
      () {
    // The wrap is route wiring (app_router.dart) — the only meaningful guard
    // is that the builder keeps SellerVerificationGate around EditListingScreen.
    // Web truth: app/edit-listing/[id]/page.tsx:150 <RouteGuard requireAuth
    // requireVerification="sell" ...>.
    final src = File('lib/app_router.dart').readAsStringSync();
    final marker = src.indexOf("path: '/edit-listing/:id'");
    expect(marker, greaterThanOrEqualTo(0),
        reason: 'edit-listing deep link must exist');
    final seg = src.substring(marker, marker + 800);
    final gate = seg.indexOf('SellerVerificationGate(');
    final editor = seg.indexOf('EditListingScreen(');
    expect(gate, greaterThanOrEqualTo(0),
        reason: '/edit-listing/:id must be gated');
    expect(editor, greaterThan(gate),
        reason: 'SellerVerificationGate must wrap EditListingScreen');
  });

  testWidgets('A-17: an untouched editor leaves without a prompt',
      (tester) async {
    await _pumpEdit(
        tester, ApiClient(client: _client(detail: _baseDetail())));
    expect(find.text('Edit listing'), findsOneWidget);

    // An untouched editor backs straight out with no prompt.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('open-edit'), findsOneWidget);
    expect(find.text('Discard your changes?'), findsNothing);
  });

  testWidgets(
      'A-17: unsaved edits trip the PopScope guard — Keep editing stays, Discard leaves',
      (tester) async {
    await _pumpEdit(
        tester, ApiClient(client: _client(detail: _baseDetail())));
    expect(find.text('Edit listing'), findsOneWidget);

    // Make an unsaved change.
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Item title *'), 'Renamed bowl');
    await tester.pump();
    expect(
        find.descendant(
            of: find.byType(TextFormField),
            matching: find.text('Renamed bowl')),
        findsOneWidget,
        reason: 'the edit must land in the title field');
    expect(find.text('You have unsaved changes'), findsOneWidget,
        reason: 'the save bar says there is something to save');

    // System back is intercepted by PopScope -> the discard prompt appears.
    final ps = tester.widget<PopScope<Object?>>(
        find.byType(PopScope<Object?>).first);
    expect(ps.canPop, isFalse,
        reason: 'an unsaved change must arm the PopScope guard');
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Edit listing'), findsOneWidget,
        reason: 'the editor must NOT pop while there are unsaved changes');
    expect(find.text('Discard your changes?'), findsOneWidget);

    // "Keep editing" dismisses the prompt and stays on the editor.
    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(find.text('Discard your changes?'), findsNothing);
    expect(find.text('Edit listing'), findsOneWidget);

    // System back again, this time confirm Discard -> host route returns.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Discard your changes?'), findsOneWidget);
    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();

    expect(find.text('Edit listing'), findsNothing);
    expect(find.text('open-edit'), findsOneWidget);
  });
}
