import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/domain/delivery_windows.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/services/directions_service.dart';
import 'package:globoexpats_mobile/services/geocoding_service.dart'
    show Coordinates;
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Checkout step 2 (Review), brought in line with the desktop app:
///
///   * the delivery-route map, which mobile did not have at all;
///   * the seller's pickup place/address, which mobile printed in the seller
///     header before payment;
///   * the seller's working-hours notice, moved down to the times it
///     constrains;
///   * the seller-availability picker, which mobile rendered as a flat list of
///     rows while the desktop groups it by day — web
///     `components/checkout/availability-window-picker.tsx`.
///
/// The harness clock is 2026-08-25 06:00Z = 09:00 EAT.
void main() {
  final nowUtc = DateTime.utc(2026, 8, 25, 6, 0);

  Map<String, dynamic> window(
          String date, String slot, int fromHour, int toHour) =>
      {
        'key': '$date-$slot',
        'date': date,
        'slot': slot,
        'startsAt':
            '${date}T${(fromHour - 3).toString().padLeft(2, '0')}:00:00Z',
        'endsAt': '${date}T${(toHour - 3).toString().padLeft(2, '0')}:00:00Z',
      };

  /// Today and tomorrow in EAT for the harness clock.
  const today = '2026-08-25';
  const tomorrow = '2026-08-26';

  Future<http.Response> Function(http.Request) mock({
    List<Map<String, dynamic>>? windows,
    List<Map<String, dynamic>>? notices,
    Map<String, dynamic>? productDetail,
  }) =>
      (req) async {
        http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
            headers: {'content-type': 'application/json'});
        final path = req.url.path;
        if (path.endsWith('/user-details')) {
          return ok({
            'firstName': 'Derick',
            'lastName': 'Ruganuza',
            'loggingEmail': 'derick@example.com',
            'whatsAppPhoneNumber': '+255767800110',
          });
        }
        if (path.endsWith('/get-addresses')) {
          return ok([
            {
              'addressId': 9,
              'label': 'Home',
              'street': 'Ndotonadai Street',
              'region': 'Dar es Salaam',
              'country': 'Tanzania',
              'latitude': -6.77,
              'longitude': 39.27,
              'default': true,
            },
          ]);
        }
        if (path == '/api/v1/checkout/delivery-quote') {
          return ok({
            'deliveryTotal': 4000.0,
            'currency': 'TZS',
            'sellerGroups': [
              {
                'sellerId': 128,
                'sellerName': 'Globo Expats',
                'consolidatedDeliveryFee': 4000.0,
              }
            ],
          });
        }
        if (path.contains('availability-windows/summary')) {
          return ok({
            'windows': windows ??
                [
                  window(today, 'MORNING', 10, 12),
                  window(today, 'AFTERNOON', 12, 16),
                  window(tomorrow, 'MORNING', 10, 12),
                  window(tomorrow, 'AFTERNOON', 12, 16),
                ],
            'sellerNotices': notices ?? const [],
          });
        }
        if (path.contains('/displayItem/itemDetails/')) {
          return ok(productDetail ??
              {
                'productId': 615,
                'productName': 'The Diary of a CEO',
                'productAskingPrice': 35000,
                'sellerName': 'Globo Expats',
                'latitude': -6.80,
                'longitude': 39.25,
              });
        }
        return http.Response('{}', 404);
      };

  /// Mounts checkout and advances it from Shipping to Review.
  Future<void> pumpReview(
    WidgetTester tester, {
    List<Map<String, dynamic>>? windows,
    List<Map<String, dynamic>>? notices,
    Map<String, dynamic>? productDetail,
  }) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final api = ApiClient(
        client: MockClient(mock(
            windows: windows, notices: notices, productDetail: productDetail)));
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
    CartStore.instance.addDetail(
      productId: 615,
      sellerId: '128',
      sellerName: 'Globo Expats',
      title: 'The Diary of a CEO',
      price: 35000,
      location: 'Divine Destiny Bookstore, dar es salaam, tanzania',
      transportRequirement: 'REQUIRED',
      deliveryTransportMode: 'BODA',
    );

    await tester.pumpWidget(MaterialApp(home: CheckoutFlowHarness(api: api)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Continue to review'), 300,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue to review'));
    await tester.pumpAndSettle();
  }

  /// Scrolls the review list until [finder] exists, then returns its rect.
  Future<Rect> reveal(WidgetTester tester, Finder finder) async {
    await tester.scrollUntilVisible(finder, 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    return tester.getRect(finder.first);
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
    DirectionsService.resetCache();
  });

  group('the seller group header', () {
    testWidgets('names the seller without publishing their pickup address',
        (tester) async {
      await pumpReview(tester);

      expect(find.text('Globo Expats'), findsWidgets,
          reason: 'the buyer still has to see who they are buying from');
      expect(
          find.textContaining('Divine Destiny Bookstore', findRichText: true),
          findsNothing,
          reason: "the seller's pickup place and address are not the buyer's "
              'business before payment');
    });
  });

  group('the delivery-window section', () {
    testWidgets('keeps the desktop heading and note on the live path',
        (tester) async {
      await pumpReview(tester);

      // These lived in the fallback branch only, so the live server — which
      // does return availability windows — showed a bare list of times.
      await reveal(tester, find.text('When should we deliver?'));
      expect(find.text('Select every time window that works for you.'),
          findsOneWidget);
      expect(find.text('Choose one or more'), findsOneWidget);

      await reveal(tester, find.text('Refresh available times'));
      expect(
          find.textContaining(
              'Delivery follows the available windows shown above'),
          findsOneWidget);
    });

    testWidgets('groups the server windows into day columns', (tester) async {
      await pumpReview(tester);

      final todayHeader = await reveal(tester, find.text('Today'));
      final tomorrowHeader = tester.getRect(find.text('Tomorrow').first);

      expect(tomorrowHeader.center.dx, greaterThan(todayHeader.center.dx),
          reason: 'the two days sit side by side, as two columns');
      expect((tomorrowHeader.top - todayHeader.top).abs(), lessThan(1.0),
          reason: 'the day headers are on one row');

      // The slot name and its hours are separate lines on a tile, not one
      // run-on label like "25 Aug Morning (10:00–12:00)".
      expect(find.text('Morning'), findsNWidgets(2));
      expect(find.text('10:00–12:00 EAT'), findsNWidgets(2));
      expect(
          find.textContaining(
              'Adjusted for seller working hours, closures and production time'),
          findsOneWidget);
    });

    testWidgets('a window whose end has passed cannot be picked',
        (tester) async {
      // 09:00 EAT: this one ended at 08:00.
      await pumpReview(tester, windows: [
        window(today, 'MORNING', 7, 8),
        window(tomorrow, 'MORNING', 10, 12),
      ]);

      await reveal(tester, find.text('Time passed'));
      final tile = find.byKey(const ValueKey('availability-$today-MORNING'));
      expect(tile, findsOneWidget,
          reason: 'a past window keeps its slot in the grid (A-11)');
      final expired = tester.widget<Checkbox>(
          find.descendant(of: tile, matching: find.byType(Checkbox)));
      expect(expired.onChanged, isNull);
      expect(tester.widget<InkWell>(tile).onTap, isNull,
          reason: 'the whole card is the tap target, so it has to be dead too');
    });

    testWidgets("the seller's working-hours notice sits with the times",
        (tester) async {
      await pumpReview(tester, notices: [
        {
          'sellerId': 128,
          'openNow': false,
          'reopensAt': '2026-08-26T06:00:00Z',
          'timezone': 'Africa/Dar_es_Salaam',
        }
      ]);

      // Measured in ONE frame: positions taken across separate scrolls say
      // nothing about order.
      await reveal(tester, find.text('When should we deliver?'));
      final header = tester.getRect(find.text('When should we deliver?'));
      final notice =
          tester.getRect(find.textContaining('is outside working hours').first);
      final firstDay = tester.getRect(find.text('Tomorrow').first);

      // It used to live in the seller card, hundreds of pixels above this
      // heading — far enough that it is not even built at this scroll offset.
      expect(notice.top, greaterThan(header.top),
          reason: 'the notice belongs under the delivery-window heading');
      expect(notice.top, lessThan(firstDay.top),
          reason: 'and above the times it constrains');
    });
  });

  group('the delivery route', () {
    testWidgets('shows the journey the delivery fee pays for', (tester) async {
      await pumpReview(tester);

      // No Directions key in tests, so this is the web's marker-only
      // fallback: both pins framed, titled "Delivery locations".
      await reveal(tester, find.text('Delivery locations'));
      expect(find.text('S = seller pickup · B = your delivery point'),
          findsOneWidget);
      expect(find.text('Globo Expats'), findsWidgets,
          reason: 'the legend names the seller whose route is drawn');
    });

    testWidgets('stays away when the listing has no pin', (tester) async {
      await pumpReview(tester, productDetail: {
        'productId': 615,
        'productName': 'The Diary of a CEO',
        'productAskingPrice': 35000,
        'sellerName': 'Globo Expats',
      });

      expect(find.text('Delivery locations'), findsNothing);
      expect(find.text('Delivery route'), findsNothing);
    });
  });

  group('window labels', () {
    DeliveryWindow at(String date, DeliverySlot slot) =>
        parseSellerAvailabilityWindows([
          {'date': date, 'slot': slot.name}
        ]).first;

    test('the day header reads Today / Tomorrow / a real date', () {
      expect(availabilityDayLabel(at(today, DeliverySlot.MORNING), nowUtc),
          'Today');
      expect(availabilityDayLabel(at(tomorrow, DeliverySlot.MORNING), nowUtc),
          'Tomorrow');
      expect(
          availabilityDayLabel(at('2026-08-29', DeliverySlot.MORNING), nowUtc),
          'Sat, 29 Aug');
    });

    test('the time label follows a server override, not the slot default', () {
      final overridden = parseSellerAvailabilityWindows([
        {
          'date': today,
          'slot': 'MORNING',
          'startsAt': '2026-08-25T05:30:00Z',
          'endsAt': '2026-08-25T08:15:00Z',
        }
      ]).first;
      expect(availabilityTimeLabel(overridden), '08:30–11:15 EAT',
          reason: 'a seller who opens at 08:30 must not be advertised as '
              'opening at the slot default of 10:00');
      expect(availabilityTimeLabel(at(today, DeliverySlot.AFTERNOON)),
          '12:00–16:00 EAT');
    });
  });

  group('the encoded route', () {
    test('builds the Routes API v2 request contract', () {
      final body = routesRequestBody(
        const Coordinates(-6.7924, 39.2083),
        const Coordinates(-6.7690, 39.2290),
      );
      expect(body['travelMode'], 'DRIVE');
      expect(body['polylineQuality'], 'OVERVIEW');
      expect(
        (((body['origin'] as Map)['location'] as Map)['latLng']
            as Map)['latitude'],
        -6.7924,
      );
    });

    test('reads an encoded polyline from a Routes API v2 response', () {
      expect(
        encodedRouteFromResponse({
          'routes': [
            {
              'polyline': {'encodedPolyline': r'_p~iF~ps|U'}
            }
          ]
        }),
        r'_p~iF~ps|U',
      );
      expect(encodedRouteFromResponse({'routes': []}), isNull);
    });

    test("decodes Google's documented example", () {
      final points = decodePolyline(r'_p~iF~ps|U_ulLnnqC_mqNvxq`@');
      expect(points.length, 3);
      expect(points[0].latitude, closeTo(38.5, 1e-5));
      expect(points[0].longitude, closeTo(-120.2, 1e-5));
      expect(points[2].latitude, closeTo(43.252, 1e-5));
      expect(points[2].longitude, closeTo(-126.453, 1e-5));
    });

    test('an empty or malformed string draws nothing rather than throwing', () {
      expect(decodePolyline(''), isEmpty);
      expect(() => decodePolyline('~~~'), returnsNormally);
    });

    test('the camera box pads a single pin into a real area', () {
      final bounds = boundsOf(decodePolyline(r'_p~iF~ps|U'));
      expect(bounds, isNotNull);
      expect(
          bounds!.northEast.latitude, greaterThan(bounds.southWest.latitude));
      expect(
          bounds.northEast.longitude, greaterThan(bounds.southWest.longitude));
      expect(boundsOf(const []), isNull);
    });
  });
}
