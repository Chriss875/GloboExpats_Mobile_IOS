import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/edit_listing_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _productId = 665;

/// Base itemDetails payload the tests load the editor with. Two tests extend
/// it (adding a USED condition + photo, or flipping it to a DAY-rate rental).
Map<String, dynamic> _baseDetail() => {
      'productId': _productId,
      'productName': 'AU053 Edit Fixture',
      // SPECIFICATIONS round-trip: prose must load WITHOUT the block.
      'productDescription':
          'Hand carved bowl.\n\n--- SPECIFICATIONS ---\nMaterial: Teak\nSize: 30cm',
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

MockClient _client({
  required Map<String, dynamic> detail,
  Map<String, dynamic>? lastBody,
  List<String>? paths,
}) {
  return MockClient((request) async {
    paths?.add('${request.method} ${request.url.path}');
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
    if (request.method == 'PATCH' &&
        request.url.path == '/api/v1/products/update/$_productId') {
      // MockClient delivers a plain http.Request (the multipart stream already
      // finalized), so recover the `product` JSON field from the body string.
      final map = _multipartJsonField(request, 'product');
      if (map != null && lastBody != null) {
        lastBody.clear();
        lastBody.addAll(map);
      }
      return http.Response(jsonEncode({'ok': true}), 200);
    }
    return http.Response('not found', 404);
  });
}

/// Extracts the value of the multipart field [fieldName] from a finalized
/// [http.Request] body and JSON-decodes it. Returns null when absent.
///
/// The capture is anchored on the request's own boundary token (parsed from
/// `content-type`), NOT on a regex over `--`, because the JSON payload itself
/// can legally contain `--` (e.g. a `--- SPECIFICATIONS ---` description) and
/// a naive non-greedy match would truncate at the first one.
Map<String, dynamic>? _multipartJsonField(http.Request request, String fieldName) {
  final contentType = request.headers['content-type'] ?? '';
  final boundaryMatch = RegExp('boundary=([^;]+)').firstMatch(contentType);
  if (boundaryMatch == null) return null;
  final boundary = boundaryMatch.group(1)!.trim().replaceAll('"', '');
  final text = utf8
      .decode(request.bodyBytes, allowMalformed: true)
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n');
  final marker = 'name="$fieldName"\n\n';
  final start = text.indexOf(marker);
  if (start < 0) return null;
  final bodyStart = start + marker.length;
  final end = text.indexOf('\n--$boundary', bodyStart);
  if (end < 0) return null;
  final decoded = jsonDecode(text.substring(bodyStart, end));
  return decoded is Map<String, dynamic> ? decoded : null;
}

/// The edit form is one long scroll; a 1000x2800 surface keeps every field
/// built (no lazy-dispose) so tests can assert/type anywhere without dragging.
void _useTallSurface(WidgetTester tester) {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = const Size(1000, 2800);
  addTearDown(tester.view.reset);
}

/// Pumps the editor behind a host route so a successful save can pop without
/// leaving the Navigator empty.
Future<void> _pumpEdit(WidgetTester tester, ApiClient api) async {
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

  testWidgets('AU-053: prefills every field from itemDetails; SPECIFICATIONS parsed out',
      (tester) async {
    _useTallSurface(tester);
    await tester.pumpWidget(MaterialApp(
        home: EditListingScreen(
            listingId: _productId,
            api: ApiClient(client: _client(detail: _baseDetail())))));
    await tester.pumpAndSettle();

    expect(find.text('Edit listing'), findsOneWidget);
    expect(_controllerOf(tester, 'Item title *'), 'AU053 Edit Fixture');
    expect(_controllerOf(tester, 'Final buyer price (TSh)'), '25000');
    expect(_controllerOf(tester, 'Description *'), 'Hand carved bowl.');
    // Payout floor-rounded to 1000s from sellerPayout 21977.777.
    expect(_controllerOf(tester, 'You receive (TSh)'), '21000');

    await tester.dragUntilVisible(
        find.byKey(const ValueKey('edit-save-btn')),
        find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();

    expect(_controllerOf(tester, 'Pickup street address *'), 'Msasani');
    expect(_controllerOf(tester, 'WhatsApp number'), '+255700000001');
    // Map pin readout reflects loaded coordinates.
    expect(find.textContaining('Map pin set'), findsOneWidget);
    // WhatsApp locked with hard validation copy.
    expect(find.text('WhatsApp number cannot be changed from the edit listing page'),
        findsWidgets);
  });

  testWidgets('AU-053: promotional price <= asking price is BLOCKED on edit (inverse rule)',
      (tester) async {
    _useTallSurface(tester);
    await tester.pumpWidget(MaterialApp(
        home: EditListingScreen(
            listingId: _productId,
            api: ApiClient(client: _client(detail: _baseDetail())))));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const ValueKey('edit-original')), '20000'); // below asking
    await tester.pump();
    // Web parity (LISTIN-32): entering an inverted promo fires the explanatory
    // toast while typing — not just the inline field error.
    expect(find.textContaining('Promotional price must be higher'), findsOneWidget,
        reason: 'Web edit warns on promotional-price inversion with a toast');

    // Let the toast expire so it no longer overlays the Save button.
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('edit-save-btn')));
    await tester.pumpAndSettle();

    expect(find.text('Promotional price must be HIGHER than the final asking price.'),
        findsOneWidget,
        reason: 'Edit enforces originalPrice > askingPrice — inverse of create');
  });

  testWidgets('PAYLOAD: sale save round-trips SPECIFICATIONS, transport + fee bands, choice config',
      (tester) async {
    _useTallSurface(tester);
    final lastBody = <String, dynamic>{};
    final paths = <String>[];
    final detail = _baseDetail()
      ..['productCondition'] = 'USED'
      ..['productImages'] = [
        {'imageId': 101, 'imageUrl': 'http://localhost/img1.jpg'}
      ]
      ..['productDescription'] =
          'Hand carved bowl.\n\n--- SPECIFICATIONS ---\nMaterial: Teak\nSize: 30cm\nItem Age: 3 years'
      ..['choiceConfiguration'] = {
        'hasChoices': true,
        'attributes': [
          {
            'definitionId': 1,
            'name': 'Pack Size',
            'required': true,
            'values': [
              {'id': 'a', 'label': 'Small', 'active': true}
            ],
          }
        ],
      };

    await _pumpEdit(
        tester,
        ApiClient(client: _client(detail: detail, lastBody: lastBody, paths: paths)));

    await tester.dragUntilVisible(find.byKey(const ValueKey('edit-save-btn')),
        find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('edit-save-btn')));
    await tester.pumpAndSettle();

    expect(paths, contains('PATCH /api/v1/products/update/$_productId'),
        reason: 'save must reach the update PATCH');
    expect(lastBody, isNotEmpty, reason: 'save must reach the update PATCH');
    // Transport + legacy fee fields (web parity: BODA bands always re-sent).
    expect(lastBody['transportRequirement'], 'REQUIRED');
    expect(lastBody['deliveryTransportMode'], 'BODA');
    expect(lastBody['sameRegionDeliveryFeeMin'], 3000);
    expect(lastBody['sameRegionDeliveryFeeMax'], 17000);
    expect(lastBody['outsideRegionDeliveryFeeMin'], 17000);
    expect(lastBody['outsideRegionDeliveryFeeMax'], 62000);
    // SPECIFICATIONS re-emitted, INCLUDING the Item Age row pulled back out of
    // the parsed block into its own field (condition USED => re-appended).
    expect(lastBody['productDescription'],
        'Hand carved bowl.\n\n--- SPECIFICATIONS ---\nMaterial: Teak\nSize: 30cm\nItem Age: 3 years');
    // Raw choiceConfiguration round-trips untouched (no choice editor on edit).
    expect(lastBody['choiceConfiguration'],
        {'hasChoices': true, 'attributes': [
          {
            'definitionId': 1,
            'name': 'Pack Size',
            'required': true,
            'values': [
              {'id': 'a', 'label': 'Small', 'active': true}
            ],
          }
        ]});
    // Non-rental always sends the disabled rentalConfiguration default (so the
    // backend never keeps a stale rental block) + quantity untouched.
    expect(lastBody['rentalConfiguration'],
        {'enabled': false, 'listingType': 'FOR_RENT', 'ratePeriod': 'MONTH'});
    expect(lastBody['productQuantity'], 3);
    // Unchanged payout keeps the loaded value, not the floor shown in the box.
    expect((lastBody['sellerPayout'] as num).toDouble(), closeTo(21977.777, 0.001));
    expect((lastBody['latitude'] as num).toDouble(), closeTo(-6.8, 0.0001));
    expect((lastBody['longitude'] as num).toDouble(), closeTo(39.28, 0.0001));
  });

  testWidgets('PAYLOAD: rental save forces EXEMPT transport, quantity 1, zeroed fees, keeps rate period',
      (tester) async {
    _useTallSurface(tester);
    final lastBody = <String, dynamic>{};
    final detail = _baseDetail()
      ..['productName'] = 'Kayak AU053'
      ..['productDescription'] = 'Kayak.\n\n--- SPECIFICATIONS ---\nBrand: Pelican'
      ..['productCondition'] = null
      ..['productQuantity'] = 1
      ..['deliveryTransportMode'] = null
      ..['transportRequirement'] = 'EXEMPT'
      ..['productImages'] = [
        {'imageId': 102, 'imageUrl': 'http://localhost/kayak.jpg'}
      ]
      ..['rentalConfiguration'] = {
        'enabled': true,
        'listingType': 'FOR_RENT',
        'ratePeriod': 'DAY',
      };

    await _pumpEdit(
        tester, ApiClient(client: _client(detail: detail, lastBody: lastBody)));

    await tester.dragUntilVisible(find.byKey(const ValueKey('edit-save-btn')),
        find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('edit-save-btn')));
    await tester.pumpAndSettle();

    expect(lastBody, isNotEmpty);
    expect(lastBody['transportRequirement'], 'EXEMPT');
    expect(lastBody['deliveryTransportMode'], isNull);
    // Rentals are always quantity 1 with no production lead time.
    expect(lastBody['productQuantity'], 1);
    expect(lastBody['requiresProductionTime'], false);
    expect(lastBody['productionTimeDays'], isNull);
    // Fee bands zeroed when there is no vehicle.
    expect(lastBody['sameRegionDeliveryFeeMin'], 0);
    expect(lastBody['sameRegionDeliveryFeeMax'], 0);
    expect(lastBody['outsideRegionDeliveryFeeMin'], 0);
    expect(lastBody['outsideRegionDeliveryFeeMax'], 0);
    // The rental block survives verbatim (SELLWI-05 payload omission fix).
    expect(lastBody['rentalConfiguration'],
        {'enabled': true, 'listingType': 'FOR_RENT', 'ratePeriod': 'DAY'});
    expect(lastBody['productDescription'],
        'Kayak.\n\n--- SPECIFICATIONS ---\nBrand: Pelican');
  });
}

// The label is painted inside the field's InputDecorator; find the label
// widget then read the nearest ancestor TextFormField's controller.
String _controllerOf(WidgetTester tester, String labelText) {
  final labels = find.descendant(
      of: find.byType(TextFormField), matching: find.text(labelText));
  if (labels.evaluate().isEmpty) return '';
  final ancestor = find.ancestor(
      of: labels.first, matching: find.byType(TextFormField));
  if (ancestor.evaluate().isEmpty) return '';
  return tester.widget<TextFormField>(ancestor.first).controller?.text ?? '';
}
