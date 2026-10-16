import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/sell/sell_wizard_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});

/// A 1x1 transparent PNG - real image_picker/Image.memory decode both need
/// actual valid bytes, not garbage.
final _tinyPng = <int>[
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
  0x00,
  0x00,
  0x00,
  0x0D,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1F,
  0x15,
  0xC4,
  0x89,
  0x00,
  0x00,
  0x00,
  0x0A,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9C,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01,
  0x0D,
  0x0A,
  0x2D,
  0xB4,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4E,
  0x44,
  0xAE,
  0x42,
  0x60,
  0x82,
];

/// Stands in for the real platform channel `image_picker` needs (unavailable
/// under `flutter test`) so `_pickImages`'s `ImagePicker().pickMultiImage()`
/// call resolves instead of throwing `MissingPluginException` - the thing
/// that made Step 2 -> Step 3 unreachable in any prior automated test.
class _FakeImagePicker extends ImagePickerPlatform {
  @override
  Future<List<XFile>> getMultiImageWithOptions({
    MultiImagePickerOptions options = const MultiImagePickerOptions(),
  }) async =>
      [
        XFile.fromData(Uint8List.fromList(_tinyPng),
            name: 'a.png', mimeType: 'image/png')
      ];
}

const _colorDefinition = {
  'attributeDefinitionId': 1,
  'name': 'Color',
  'slug': 'color',
  'inputType': 'COLOR',
  'required': false,
  'allowCustomValues': true,
  'visual': true,
  'allowDifferentPrices': false,
  'status': 'ACTIVE',
  'predefinedValues': [
    {'value': 'red', 'label': 'Red', 'colorHex': '#EF4444'},
  ],
  'subcategoryIds': [10],
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  ImagePickerPlatform.instance = _FakeImagePicker();

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    KvStore.instance.remove('sell_form_draft');
  });

  testWidgets(
      'the real wizard reaches the Pricing step and the transport grid responds to a tap '
      '(reproduces "stuck at price section / choosing transport")',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        final path = req.url.path;
        if (path == '/api/v1/products/categories') {
          return _json([
            {
              'categoryId': 1,
              'categoryName': 'Electronics',
              'subcategories': [
                {'subcategoryId': 10, 'subcategoryName': 'Phones'},
              ],
            },
          ]);
        }
        if (path == '/api/v1/get-addresses') {
          return _json([
            {
              'addressId': 5,
              'label': 'Home',
              'street': '44 Coco Beach Rd',
              'region': 'Dar es Salaam',
              'country': 'Tanzania',
              'latitude': -6.7892,
              'longitude': 39.2887,
              'placeName': 'Coco Beach Plaza',
            },
          ]);
        }
        if (path == '/api/v1/userManagement/user-details') {
          return _json({'userId': 1, 'whatsAppPhoneNumber': '+255700000000'});
        }
        if (path == '/api/v1/product-attributes/subcategories/10') {
          return _json([_colorDefinition]);
        }
        return _json({});
      }),
    );
    final auth =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    AuthStore.instance = auth;

    await tester
        .pumpWidget(MaterialApp(home: SellWizardScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    // ---- Step 1: Details -----------------------------------------------
    await tester.enterText(
        // The label moved above the field (web parity), so the placeholder
        // is what identifies it now.
        find.widgetWithText(TextFormField, 'e.g., MacBook Pro 14″ M2'),
        'iPhone 12');
    await tester.pumpAndSettle();

    // Each label now sits above its field, so step 1 is taller than the
    // viewport: scroll a field into view before tapping it.
    Future<void> tapField(Finder finder) async {
      await tester.ensureVisible(finder);
      await tester.pumpAndSettle();
      await tester.tap(finder);
      await tester.pumpAndSettle();
    }

    await tapField(find.byType(DropdownButtonFormField<int?>).first);
    await tester.tap(find.text('Electronics').last);
    await tester.pumpAndSettle();

    await tapField(find.byType(DropdownButtonFormField<int?>).at(1));
    await tester.tap(find.text('Phones').last);
    await tester.pumpAndSettle();

    // The pickup address is the web's saved-address dropdown now, not a
    // radio list; the default one is preselected for us.
    expect(find.byType(DropdownButtonFormField<int>), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.ensureVisible(find.text('Continue'));
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    // ---- Step 2: Photos & Description -----------------------------------
    expect(find.text('Description *'), findsOneWidget,
        reason: 'must have landed on step 2');
    await tester.ensureVisible(find.byKey(const ValueKey('sell-add-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('sell-add-photo')));
    await tester.pumpAndSettle();
    expect(find.text('Choose from gallery'), findsOneWidget);
    await tester.tap(find.text('Choose from gallery'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull,
        reason: 'image_picker call must not throw');

    await tester.enterText(
        find.widgetWithText(TextFormField, 'Description *'), 'Great phone');
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Continue'));
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    // ---- Step 3: Pricing --------------------------------------------------
    expect(find.text('Set your price'), findsOneWidget,
        reason: 'must have landed on step 3');
    await tester.enterText(
        find.byKey(const ValueKey('sell-payout-input')), '100000');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull,
        reason: 'entering a price must not throw');

    // The transport grid must actually be there and tappable.
    expect(find.text('Boda'), findsOneWidget);
    expect(find.text('Semi Truck'), findsOneWidget);
    await tester.ensureVisible(find.text('Car'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Car'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull,
        reason: 'choosing a transport card must not throw');
    // The mode's fee-band banner (a plain Text) only renders once
    // `state.transportMode` is actually set - proof the tap took effect.
    expect(find.textContaining('CAR:'), findsOneWidget);

    // Regression: the old step-3 callback returned null instead of advancing,
    // leaving sellers permanently stuck on Pricing.
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Ready to Publish!'), findsOneWidget,
        reason: 'Pricing Continue must open the Review step');

    // Flush the 3s debounced draft-autosave Timer so it doesn't outlive the
    // test (AutomatedTestWidgetsFlutterBinding fails on a pending Timer).
    await tester.pump(const Duration(seconds: 4));
    AuthStore.instance = null;
  });
}
