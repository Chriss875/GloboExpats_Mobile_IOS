import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/domain/saved_address.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "This part is flowing out the borders" — the saved-address field on
/// checkout step 1, and "the UI for the Buyer could be slightly improved as
/// well to match that in the Desktop App".
///
/// Two separate defects behind one screenshot:
///   * the picker was a `DropdownButtonFormField` with the default
///     `isExpanded: false`, so the button sizes itself to the intrinsic width
///     of its widest entry and a long address paints straight through the
///     field's border (release builds draw no overflow stripes, which is why
///     it only showed up on the phone);
///   * the buyer's DEFAULT address was never the one preselected, because the
///     backend publishes the flag as `default` (Lombok `isDefault()` on a
///     primitive boolean) and only the web's own computed `Address` ever
///     carries `isDefault`.
///
/// Web parity: `app/checkout/checkout-content.tsx:2459` for the card, and
/// `components/location/saved-address-select.tsx` for the two-line entry.
void main() {
  /// Long enough that the old intrinsic-width button could not fit it.
  const longStreet = 'Mwananyamala A — ndotonadai street, plot 114 block F';

  Future<http.Response> Function(http.Request) mock(
          {List<Map<String, dynamic>>? addresses}) =>
      (req) async {
        http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
            headers: {'content-type': 'application/json'});
        if (req.url.path.endsWith('/user-details')) {
          return ok({
            'firstName': 'Derick',
            'lastName': 'Ruganuza',
            'loggingEmail': 'derick@example.com',
            'whatsAppPhoneNumber': '+255767800110',
          });
        }
        if (req.url.path.endsWith('/get-addresses')) {
          return ok(addresses ??
              [
                {
                  'addressId': 9,
                  'label': 'Home',
                  'street': longStreet,
                  'region': 'Dar es Salaam',
                  'country': 'Tanzania',
                  'latitude': -6.77,
                  'longitude': 39.27,
                  'default': true,
                },
              ]);
        }
        if (req.url.path == '/api/v1/checkout/delivery-quote') {
          return ok({'deliveryTotal': 4000.0, 'currency': 'TZS'});
        }
        return http.Response('{}', 404);
      };

  Future<void> pumpStepOne(WidgetTester tester,
      {List<Map<String, dynamic>>? addresses}) async {
    // A real phone width: the overflow is a width problem, so the surface
    // size is part of the assertion, not scenery.
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final api = ApiClient(client: MockClient(mock(addresses: addresses)));
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
    CartStore.instance.addDetail(
        productId: 615,
        sellerId: '128',
        sellerName: 'Kevin Shellukindo',
        title: 'Chair',
        price: 100000);

    await tester.pumpWidget(MaterialApp(home: CheckoutFlowHarness(api: api)));
    await tester.pumpAndSettle();
  }

  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  tearDown(() async {
    AuthStore.instance = null;
    // ignore: discarded_futures
    CartStore.instance.reset();
  });

  group('the saved-address field', () {
    testWidgets('keeps a long address inside its border', (tester) async {
      await pumpStepOne(tester);

      final field = find.byType(DropdownButtonFormField<String>);
      expect(field, findsOneWidget);
      await tester.ensureVisible(field);
      await tester.pumpAndSettle();

      final fieldBox = tester.getRect(field);
      // The closed field shows exactly one line — the label — and it has to
      // be painted within the field, ellipsised, not spilling past it.
      final label = find.descendant(
          of: field, matching: find.textContaining('Home', findRichText: true));
      expect(label, findsOneWidget);

      expect(tester.getRect(label).right, lessThanOrEqualTo(fieldBox.right),
          reason: 'the selected address must be clipped to the field, not '
              'painted through its border');
      expect(tester.takeException(), isNull,
          reason: 'an overflowing dropdown reports a layout error in debug '
              'and paints outside the border in release');
    });

    testWidgets('offers the web two-line entry when opened', (tester) async {
      await pumpStepOne(tester);
      final field = find.byType(DropdownButtonFormField<String>);
      await tester.ensureVisible(field);
      await tester.pumpAndSettle();
      await tester.tap(field);
      await tester.pumpAndSettle();

      // Web `SavedAddressSelectContent`: nickname on top, then
      // "street, region, country • Default".
      expect(find.textContaining('Dar es Salaam, Tanzania • Default'),
          findsOneWidget);
    });

    testWidgets('preselects the default address, not the first one',
        (tester) async {
      await pumpStepOne(tester, addresses: [
        {
          'addressId': 10,
          'label': 'Work',
          'street': 'Mlimani Tower',
          'region': 'Dar es Salaam',
          'country': 'Tanzania',
          'latitude': -6.78,
          'longitude': 39.28,
          'default': false,
        },
        {
          'addressId': 9,
          'label': 'Home',
          'street': longStreet,
          'region': 'Dar es Salaam',
          'country': 'Tanzania',
          'latitude': -6.77,
          'longitude': 39.27,
          // The key the backend actually sends (AddressResponseDTO).
          'default': true,
        },
      ]);

      final field = tester.widget<DropdownButtonFormField<String>>(
          find.byType(DropdownButtonFormField<String>));
      expect(field.initialValue, '9',
          reason: "reading `isDefault` never matched the backend's `default`, "
              'so checkout always shipped to whichever address happened to be '
              'first in the list');
    });
  });

  group('the step reads like the desktop one', () {
    testWidgets('names the section and says what it is for', (tester) async {
      await pumpStepOne(tester);

      expect(find.text('Delivery Address'), findsOneWidget);
      expect(find.text('Where should we deliver your items?'), findsOneWidget);
      expect(find.text('Select From Saved Addresses'), findsOneWidget);
      expect(find.text('Review quantities before delivery.'), findsOneWidget);
    });
  });

  group('how a saved address reads', () {
    test('the backend key for the default flag is `default`', () {
      expect(savedAddressIsDefault({'default': true}), isTrue,
          reason: 'AddressResponseDTO serialises isDefault() as `default`');
      expect(savedAddressIsDefault({'isDefault': true}), isTrue,
          reason: "the web's computed Address shape still has to work");
      expect(savedAddressIsDefault({'default': false}), isFalse);
      expect(savedAddressIsDefault(const {}), isFalse);
    });

    test('nickname wins, then the place name, then the street', () {
      expect(
          savedAddressPrimaryLabel(
              {'label': 'Home', 'placeName': 'Mlimani City', 'street': 'A St'}),
          'Home');
      expect(
          savedAddressPrimaryLabel(
              {'placeName': 'Mlimani City', 'street': 'A St'}),
          'Mlimani City',
          reason: 'a pin with no nickname must still read as a place');
      expect(savedAddressPrimaryLabel({'street': 'A St'}), 'A St');
      expect(savedAddressPrimaryLabel(const {}), 'Address');
    });

    test('the second line carries the detail, not a repeat of the first', () {
      expect(
          savedAddressSecondaryLabel({
            'label': 'Home',
            'street': 'Coco Beach Road',
            'region': 'Dar es Salaam',
            'country': 'Tanzania',
            'default': true,
          }),
          'Coco Beach Road, Dar es Salaam, Tanzania • Default');
      expect(
          savedAddressSecondaryLabel({
            'street': 'Coco Beach Road',
            'region': 'Dar es Salaam',
            'country': 'Tanzania',
          }),
          'Dar es Salaam, Tanzania',
          reason: 'the street is already the primary line here');
    });
  });
}
