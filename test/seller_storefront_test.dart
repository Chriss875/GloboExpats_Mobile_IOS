import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/screens/seller_profile_screen.dart';
import 'package:globoexpats_mobile/widgets/share_kit/share_kit.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// The Share Kit paints photos it has decoded; tests skip the network.
class _NoImagesPlatform extends ShareKitPlatform {
  @override
  Future<ui.Image?> loadImage(String key) async => null;
}

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});

Map<String, dynamic> _summary({bool verified = true}) => {
      'userId': 7,
      'firstName': 'Anusiata',
      'lastName': 'Mlelwa',
      'position': 'Woodworker',
      'aboutMe': 'Carving since 2010.',
      if (verified) 'verificationStatus': 'VERIFIED',
      'averageRating': 4.6,
      'totalRatingsCount': 1,
      'joinedDate': '2023-06-15T00:00:00Z',
    };

Map<String, dynamic> _listing(int id, String name, double price,
        {String category = 'Furniture', String subcategory = 'Home & Garden'}) =>
    {
      'productId': id,
      'productName': name,
      'productAskingPrice': price,
      'productCurrency': 'TZS',
      'productQuantity': 2,
      'categoryName': category,
      'subcategoryName': subcategory,
    };

/// Drives the real storefront against a stub backend. A tall surface keeps the
/// whole page (header → reviews → showcase) built so taps need no scroll.
Future<void> pumpStorefront(WidgetTester tester, ApiClient api) async {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = const Size(1000, 10000);
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(home: SellerProfileScreen(sellerId: 7, api: api)));
  await tester.pumpAndSettle();
}

ApiClient _apiWith({
  Map<String, dynamic>? summary,
  List<Map<String, dynamic>> listings = const [],
  List<Map<String, dynamic>> ratings = const [],
  List<String>? paths,
}) {
  return ApiClient(
    client: MockClient((req) async {
      paths?.add('${req.method} ${req.url.path}');
      final path = req.url.path;
      if (path == '/api/v1/userManagement/seller-summary/7') {
        return _json(summary ?? _summary());
      }
      if (path == '/api/v1/displayItem/filter') {
        return _json({'content': listings, 'totalElements': listings.length});
      }
      if (path.startsWith('/api/v1/user-ratings/')) {
        return _json({'content': ratings});
      }
      return _json({}, 404);
    }),
  );
}

void main() {
  testWidgets(
      'storefront shows verified trust header, MASKED names, reviews and share',
      (tester) async {
    final api = _apiWith(
      listings: [
        _listing(1, 'Carved bowl', 25000),
      ],
      ratings: [
        {
          'ratingId': 1,
          'author': {'firstName': 'Baraka', 'lastName': 'Mpishi'},
          'stars': 5.0,
          'reviewText': 'Beautiful work.',
          'createdAt': '2025-03-05T10:00:00Z',
        }
      ],
    );
    await pumpStorefront(tester, api);

    // LISTIN-23: the public header name is masked, never the full legal name.
    expect(find.text('Anusiata M.'), findsOneWidget);
    expect(find.text('Anusiata Mlelwa'), findsNothing);

    // LISTIN-22: verified avatar badge + Verified pill + listings badge,
    // Member Since (from joinedDate) + Success Rating rows.
    expect(find.text('Verified'), findsOneWidget);
    expect(find.text('1 Listing'), findsOneWidget);
    expect(find.text('Member Since'), findsOneWidget);
    expect(find.text('2023'), findsOneWidget);
    expect(find.text('Success Rating'), findsOneWidget);
    expect(find.text('4.6'), findsNWidgets(2)); // header rating + success rating

    // LISTIN-22: profile photo/initials avatar & about copy.
    expect(find.text('About the seller'), findsOneWidget);
    expect(find.textContaining('Carving since 2010.'), findsOneWidget);

    // LISTIN-25/24: the showcase header carries the real product count, the
    // search field is present and the grid opens a real product.
    expect(find.text('Seller Showcase'), findsOneWidget);
    expect(find.text('1 Product'), findsOneWidget);
    expect(find.text("Search this seller's products"), findsOneWidget);
    expect(find.text('TSh 25,000'), findsOneWidget);

    // LISTIN-23: the review author is masked too (first name + last initial).
    expect(find.text('Baraka M.'), findsOneWidget);
    expect(find.text('Beautiful work.'), findsOneWidget);

    // LISTIN-26: the share sheet offers the Share Kit's shop pictures with
    // the tracked profile link in the caption.
    ShareKitPlatform.instance = _NoImagesPlatform();
    addTearDown(() => ShareKitPlatform.instance = const ShareKitPlatform());
    await tester.tap(find.byTooltip('Share profile'));
    await tester.pumpAndSettle();
    expect(find.text('Share seller profile'), findsOneWidget);
    expect(find.text('Share image'), findsOneWidget);
    expect(find.textContaining('globoexpats.com/seller/anusiata-mlelwa-p7'),
        findsWidgets);
  });

  testWidgets('showcase reveals the catalog 12 at a time as you scroll (LISTIN-25)',
      (tester) async {
    final listings = <Map<String, dynamic>>[
      for (var i = 1; i <= 15; i++) _listing(i, 'Item $i', 10000 + i * 100),
    ];
    final api = _apiWith(listings: listings);
    // A phone-sized screen: the first 12 run well past the bottom.
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(430, 900);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
        MaterialApp(home: SellerProfileScreen(sellerId: 7, api: api)));
    await tester.pumpAndSettle();

    // 12 are revealed first…
    expect(find.text('15 Products'), findsOneWidget);
    expect(find.text('Item 12', skipOffstage: false), findsOneWidget);
    expect(find.text('Item 13', skipOffstage: false), findsNothing);
    expect(find.text('Load more products'), findsNothing,
        reason: 'no button: scrolling reveals the rest');

    // …and scrolling to the end reveals the rest, no tap needed.
    await tester.scrollUntilVisible(find.text('Item 15'), 400,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Item 13', skipOffstage: false), findsOneWidget);
    expect(find.text('Item 15'), findsOneWidget);
  });

  testWidgets('showcase category filter narrows the grid (LISTIN-24)',
      (tester) async {
    final api = _apiWith(listings: [
      _listing(1, 'Carved bowl', 25000,
          category: 'Furniture', subcategory: 'Home & Garden'),
      _listing(2, 'Teak stool', 40000,
          category: 'Furniture', subcategory: 'Home & Garden'),
      _listing(3, 'Maasai painting', 80000,
          category: 'Art', subcategory: 'Paintings'),
    ]);
    await pumpStorefront(tester, api);

    expect(find.text('3 Products'), findsOneWidget);
    expect(find.text('Carved bowl'), findsOneWidget);
    expect(find.text('Maasai painting'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('showcase-category-filter')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Art').last);
    await tester.pumpAndSettle();

    expect(find.text('Carved bowl'), findsNothing);
    expect(find.text('Teak stool'), findsNothing);
    expect(find.text('Maasai painting'), findsOneWidget);

    // Active filter exposes Clear.
    expect(find.text('Clear search and filters'), findsOneWidget);
  });
}
