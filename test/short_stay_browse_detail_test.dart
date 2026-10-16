// Short Stays on the phone, matching the web (2026-10): search them by dates,
// open a result with those dates already picked, see whether the place is
// free, the host's minimum stay, and a property's photo groups.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/domain/rentals.dart';
import 'package:globoexpats_mobile/domain/stay_listing.dart';
import 'package:globoexpats_mobile/screens/catalog_screens.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';
import 'package:globoexpats_mobile/widgets/stay_dates_scope.dart';

http.Response _json(Object b) => http.Response(jsonEncode(b), 200,
    headers: {'content-type': 'application/json'});

final _now = DateTime.now();
final _month = DateTime(_now.year, _now.month + 1, 1);
DateTime _d(int day) => DateTime(_month.year, _month.month, day);

MockClient _stayClient(
        {bool bookedToday = false, int minimumNights = 3, int? viewerId}) =>
    MockClient((req) async {
      final path = req.url.path;
      if (viewerId != null && path.endsWith('/user-details')) {
        return _json({'userId': viewerId, 'roles': const []});
      }
      if (path.endsWith('/itemDetails/470/rental-availability')) {
        return _json({
          'productId': 470,
          'bookedToday': bookedToday,
          'availableFrom': rentalDateToJson(_d(20)),
          'bookedRanges': const [],
        });
      }
      if (path.endsWith('/itemDetails/470')) {
        return _json({
          'productId': 470,
          'productName': 'Sea View Flat',
          'productAskingPrice': 110000,
          'productCurrency': 'TZS',
          'productQuantity': 1,
          'sellerId': 88,
          'sellerPayout': 98000,
          'categoryName': 'Real Estate',
          'transportRequirement': 'EXEMPT',
          'rentalConfiguration': {
            'enabled': true,
            'listingType': 'FOR_RENT',
            'ratePeriod': 'NIGHT',
            'shortStay': true,
            'minimumNights': minimumNights,
          },
          'productImages': [
            {'imageId': 1, 'imageUrl': '/a.jpg', 'groupName': 'Living room'},
            {'imageId': 2, 'imageUrl': '/b.jpg', 'groupName': 'Living room'},
            {'imageId': 3, 'imageUrl': '/c.jpg', 'groupName': 'Bedroom'},
            {'imageId': 4, 'imageUrl': '/d.jpg'},
          ],
        });
      }
      return http.Response('{}', 404);
    });

Future<void> _pumpDetail(WidgetTester tester, MockClient client,
    {StayDates dates = StayDates.none}) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
      home: ProductDetailScreen(
          productId: 470,
          api: ApiClient(client: client),
          initialStayDates: dates)));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  setUp(() {
    ApiClient.invalidateReads();
    CartStore.instance.clear();
    AuthStore.instance =
        AuthStore(initialToken: 'jwt-test', initialEmail: 'guest@test.tz');
  });
  tearDown(() {
    CartStore.instance.clear();
    AuthStore.instance = null;
  });

  group('the listing', () {
    testWidgets('says whether the place is free', (tester) async {
      await _pumpDetail(tester, _stayClient());
      expect(find.text('Available'), findsOneWidget);
    });

    testWidgets('says when a booked place is free again', (tester) async {
      await _pumpDetail(tester, _stayClient(bookedToday: true));
      final d = _d(20);
      expect(find.textContaining('Available from ${d.day} '), findsOneWidget);
      expect(find.textContaining('${d.year}'), findsWidgets);
    });

    testWidgets('a property’s photo groups jump to their first photo',
        (tester) async {
      await _pumpDetail(tester, _stayClient());
      expect(find.byKey(const ValueKey('product-photo-groups')), findsOneWidget);
      expect(find.text('Living room'), findsOneWidget);
      await tester.tap(find.text('Bedroom'));
      await tester.pumpAndSettle();
      expect(find.text('3 / 4'), findsOneWidget);
    });
  });

  testWidgets('the host sees Reserve dates on their own rental, not Book now',
      (tester) async {
    await _pumpDetail(tester, _stayClient(viewerId: 88));
    expect(find.text('Reserve dates'), findsOneWidget);
    expect(find.text('Book now'), findsNothing);
  });

  testWidgets('anyone else books it', (tester) async {
    await _pumpDetail(tester, _stayClient(viewerId: 5));
    expect(find.text('Book now'), findsOneWidget);
    expect(find.text('Reserve dates'), findsNothing);
  });

  group('booking', () {
    testWidgets('the host’s minimum stay is stated and enforced',
        (tester) async {
      await _pumpDetail(tester, _stayClient(),
          dates: StayDates(
              startDate: rentalDateToJson(_d(2)),
              endDate: rentalDateToJson(_d(4))));
      await tester.tap(find.text('Book now'));
      await tester.pumpAndSettle();

      expect(find.text('Minimum stay: 3 nights'), findsOneWidget);
      expect(find.text('Choose at least 3 nights.'), findsOneWidget,
          reason: 'two nights from the search are too short');
    });

    testWidgets('dates from a search are already picked', (tester) async {
      await _pumpDetail(tester, _stayClient(),
          dates: StayDates(
              startDate: rentalDateToJson(_d(2)),
              endDate: rentalDateToJson(_d(6))));
      await tester.tap(find.text('Book now'));
      await tester.pumpAndSettle();

      expect(find.text('4 nights selected.'), findsOneWidget);
      final book = find.descendant(
          of: find.byType(BottomSheet), matching: find.text('Book now'));
      await tester.tap(book);
      await tester.pump();
      final b = CartStore.instance.items.single.rentalBooking!;
      expect(b.listingType, 'SHORT_STAY');
      expect(b.startDate, _d(2));
    });
  });

  group('the Short Stays search', () {
    final taxonomy = [
      {
        'categoryId': 9,
        'categoryName': 'Real Estate',
        'slug': 'real-estate',
        'status': 'ACTIVE',
        'subcategories': [
          {
            'subcategoryId': 41,
            'subcategoryName': 'Short Stays',
            'slug': shortStaySubcategorySlug,
            'status': 'ACTIVE',
          },
          {
            'subcategoryId': 42,
            'subcategoryName': 'Houses for Rent',
            'slug': 'houses-for-rent',
            'status': 'ACTIVE',
          },
        ],
      }
    ];

    Future<List<Map<String, dynamic>>> pumpBrowse(WidgetTester tester,
        List<int> subcategories) async {
      tester.view.physicalSize = const Size(500, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final bodies = <Map<String, dynamic>>[];
      final api = ApiClient(client: MockClient((req) async {
        final path = req.url.path;
        if (path.contains('filter')) {
          bodies.add(jsonDecode(req.body) as Map<String, dynamic>);
          return _json({'content': [], 'totalElements': 0});
        }
        if (path.endsWith('/categories')) return _json(taxonomy);
        if (path.endsWith('subcategory-availability')) return _json([41, 42]);
        if (path.endsWith('category-availability')) return _json([9]);
        return _json([]);
      }));
      await tester.pumpWidget(MaterialApp(
          home: BrowseScreen(
              api: api, initialCategoryId: 9, initialSubcategoryIds: subcategories)));
      await tester.pumpAndSettle();
      return bodies;
    }

    Future<void> openFilters(WidgetTester tester) async {
      await tester.tap(find.byTooltip('Open filters'));
      await tester.pumpAndSettle();
    }

    testWidgets('dates are only offered for Short Stays', (tester) async {
      await pumpBrowse(tester, [42]);
      await openFilters(tester);
      expect(find.byKey(const ValueKey('filter-check-in')), findsNothing);
    });

    testWidgets('picked dates go to the search, and half a range is refused',
        (tester) async {
      final bodies = await pumpBrowse(tester, [41]);
      await openFilters(tester);

      await tester.tap(find.byKey(const ValueKey('filter-check-in')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('filter-apply')));
      await tester.pumpAndSettle();
      expect(find.text('Choose both check-in and checkout dates.'),
          findsOneWidget,
          reason: 'the sheet stays open with the reason');

      await tester.tap(find.byKey(const ValueKey('filter-checkout')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('filter-apply')));
      await tester.pumpAndSettle();

      final today = staySearchToday();
      final tomorrow = rentalDateToJson(
          DateTime.parse(today).add(const Duration(days: 1)));
      expect(bodies.last['rentalStartDate'], today);
      expect(bodies.last['rentalEndDate'], tomorrow);
      expect(bodies.last['priceSort'], isNull,
          reason: 'a dated search is not shuffled');
    });
  });

  testWidgets('a listing opened from a dated search carries the dates',
      (tester) async {
    late String path;
    await tester.pumpWidget(StayDatesScope(
      dates: const StayDates(startDate: '2026-11-02', endDate: '2026-11-05'),
      child: Builder(builder: (context) {
        path = StayDatesScope.productPath(context, 470);
        return const SizedBox();
      }),
    ));
    expect(path, '/product/470?checkIn=2026-11-02&checkOut=2026-11-05');
  });
}
