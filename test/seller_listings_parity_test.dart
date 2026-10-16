import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/seller_listings_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) => http.Response(
    jsonEncode(body), status,
    headers: {'content-type': 'application/json'});

/// Opens the status select on the listings toolbar and picks [option].
/// Status is a dropdown on the web, not a chip rail, so the value has to be
/// chosen from the opened menu.
Future<void> selectStatus(WidgetTester tester, String option) async {
  await tester.tap(find.text('All statuses'));
  await tester.pumpAndSettle();
  await tester.tap(find.text(option).last);
  await tester.pumpAndSettle();
}

/// Phase 2, unit 2: the listing management the web dashboard has — a
/// "needs attention" group for listings whose delivery setup is unfinished,
/// and the four sort orders.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Map<String, dynamic> listing({
    required int id,
    required String name,
    int views = 0,
    String? createdAt,
    bool? deliverySetupReady,
    List<String>? issues,
    String? categoryName,
    String? coordinatesSource,
    String? transportModeSource,
  }) =>
      {
        'productId': id,
        'productName': name,
        'productStatus': 'AVAILABLE',
        'productQuantity': 1,
        'productAskingPrice': 1000,
        'clickCount': views,
        if (createdAt != null) 'createdAt': createdAt,
        if (categoryName != null) 'categoryName': categoryName,
        if (deliverySetupReady != null) 'deliverySetupReady': deliverySetupReady,
        if (issues != null) 'deliverySetupIssues': issues,
        if (coordinatesSource != null) 'coordinatesSource': coordinatesSource,
        if (transportModeSource != null)
          'transportModeSource': transportModeSource,
      };

  Future<void> pump(WidgetTester tester, List<Map<String, dynamic>> rows) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/user-details')) {
          return _json({
            'userId': 7,
            'roles': [
              {'roleName': 'SELLER'}
            ],
            'products': rows,
          });
        }
        return _json({});
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(
        MaterialApp(home: SellerListingsScreen(api: api, embedded: true)));
    await tester.pumpAndSettle();
  }

  tearDown(() => AuthStore.instance = null);

  testWidgets('an unfinished delivery setup lands in Needs attention',
      (tester) async {
    await pump(tester, [
      // Ready: nothing to fix.
      listing(id: 1, name: 'Sorted out', deliverySetupReady: true),
      // Explicitly not ready.
      listing(id: 2, name: 'Not ready', deliverySetupReady: false),
      // Ready flag absent, but the sources say the seller never pinned it.
      listing(
          id: 3,
          name: 'Never pinned',
          coordinatesSource: 'GEOCODED',
          transportModeSource: 'SELLER_SELECTED'),
      // Ready flag absent and no sources at all — nothing to judge on.
      listing(id: 4, name: 'Unknown'),
    ]);

    // The amber banner explains listings are hidden from buyers (LISTIN-12).
    expect(find.text('Delivery information needs attention'), findsOneWidget);
    await selectStatus(tester, 'Needs attention (2)');

    expect(find.text('Not ready'), findsOneWidget);
    expect(find.text('Never pinned'), findsOneWidget);
    expect(find.text('Sorted out'), findsNothing);
    expect(find.text('Unknown'), findsNothing);
  });

  testWidgets('a listing with recorded issues needs attention even when ready',
      (tester) async {
    await pump(tester, [
      listing(
          id: 1,
          name: 'Has issues',
          deliverySetupReady: true,
          issues: ['TRANSPORT_MODE_MISSING']),
    ]);

    await selectStatus(tester, 'Needs attention (1)');
    expect(find.text('Has issues'), findsOneWidget);
  });

  testWidgets('sorting reorders the rows', (tester) async {
    await pump(tester, [
      listing(
          id: 1, name: 'Older popular', views: 90, createdAt: '2026-01-01T00:00:00Z'),
      listing(
          id: 2, name: 'Newer quiet', views: 3, createdAt: '2026-06-01T00:00:00Z'),
    ]);

    // Cards sit in a two-column grid, so reading order is row-then-column
    // rather than a plain vertical comparison.
    bool comesFirst(String a, String b) {
      final pa = tester.getTopLeft(find.text(a));
      final pb = tester.getTopLeft(find.text(b));
      return pa.dy != pb.dy ? pa.dy < pb.dy : pa.dx < pb.dx;
    }

    // Newest first is the default.
    expect(comesFirst('Newer quiet', 'Older popular'), isTrue);

    await tester.tap(find.text('Newest'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Most Views').last);
    await tester.pumpAndSettle();
    expect(comesFirst('Older popular', 'Newer quiet'), isTrue);
  });

  testWidgets('the category picker narrows the list, and hides when there is only one',
      (tester) async {
    await pump(tester, [
      listing(id: 1, name: 'A phone', categoryName: 'Electronics'),
      listing(id: 2, name: 'A flat', categoryName: 'Real Estate'),
    ]);

    // Web parity: the category control reads "All (n)" and always shows.
    expect(find.text('All (2)'), findsOneWidget);
    await tester.tap(find.text('All (2)'));
    await tester.pumpAndSettle();
    // Categories carry per-category counts on the web (LISTIN-14).
    await tester.tap(find.text('Real Estate (1)').last);
    await tester.pumpAndSettle();

    expect(find.text('A flat'), findsOneWidget);
    expect(find.text('A phone'), findsNothing);
  });

  testWidgets('one category still offers the All option', (tester) async {
    await pump(tester, [
      listing(id: 1, name: 'A phone', categoryName: 'Electronics'),
      listing(id: 2, name: 'A laptop', categoryName: 'Electronics'),
    ]);

    expect(find.text('All (2)'), findsOneWidget);
  });

  test('listingNeedsAttention + listingRepairLabel port the web helpers', () {
    expect(listingNeedsAttention({'deliverySetupReady': false}), isTrue);
    expect(listingNeedsAttention({'deliverySetupReady': true}), isFalse);
    expect(
        listingNeedsAttention({
          'coordinatesSource': 'GEOCODED',
          'transportModeSource': 'SELLER_SELECTED'
        }),
        isTrue);
    expect(listingNeedsAttention({'deliverySetupIssues': ['TRANSPORT_MODE_MISSING']}),
        isTrue);

    expect(
        listingRepairLabel({'deliverySetupIssues': ['TRANSPORT_MODE_MISSING']}),
        'Select a mode of transport');
    expect(
        listingRepairLabel({'deliverySetupIssues': ['PICKUP_LOCATION_MISSING']}),
        'Confirm the pickup pin');
    expect(
        listingRepairLabel({
          'deliverySetupIssues': [
            'TRANSPORT_MODE_MISSING',
            'PICKUP_LOCATION_MISSING'
          ]
        }),
        'Fix pickup and transport details');
  });

  testWidgets('LISTIN-16: card shows You receive chip, Halal badge and View Details',
      (tester) async {
    await pump(tester, [
      {
        ...listing(id: 1, name: 'Halal honey', categoryName: 'Food'),
        'sellerPayout': 8000,
        'choiceConfiguration': {
          'hasChoices': true,
          'attributes': [
            {
              'definitionId': 1,
              'name': 'Halal status',
              'inputType': 'SELECT',
              'required': false,
              'visual': false,
              'allowDifferentPrices': false,
              'values': [
                {'id': 'h1', 'label': 'Halal', 'active': true}
              ]
            }
          ]
        },
      },
    ]);

    expect(find.text('You receive'), findsOneWidget);
    expect(find.textContaining('TSh 8,000'), findsOneWidget);
    expect(find.text('Halal'), findsOneWidget);

    // Web parity: the per-listing actions live behind the overflow control
    // floated over the picture, not a labelled "Status" button.
    await tester.tap(find.byIcon(Icons.more_horiz).first);
    await tester.pumpAndSettle();
    expect(find.text('View Details'), findsOneWidget);
    expect(find.text('Archive'), findsOneWidget);
  });

  testWidgets('LISTIN-12: attention banner, per-card overlay and repair CTA',
      (tester) async {
    await pump(tester, [
      listing(
          id: 1,
          name: 'Fix me',
          deliverySetupReady: false,
          issues: ['TRANSPORT_MODE_MISSING']),
    ]);

    expect(find.text('Delivery information needs attention'), findsOneWidget);
    expect(find.text('Hidden from buyers'), findsOneWidget);
    // The chip and the per-card overlay both carry this exact copy.
    expect(find.text('Needs attention'), findsWidgets);
    expect(find.text('Select a mode of transport - update now'), findsOneWidget);
  });

  testWidgets('LISTIN-13: Rejected filter shows the resubmission banner',
      (tester) async {
    await pump(tester, [
      {
        ...listing(id: 1, name: 'Flagged item'),
        'productStatus': 'UNAPPROVED',
      },
    ]);

    await selectStatus(tester, 'Rejected');

    expect(find.text('Rejected Listings'), findsOneWidget);
    expect(find.textContaining('flagged and removed from the Marketplace'),
        findsOneWidget);
  });

  testWidgets('LISTIN-21: an unverified user with no listings sees the verify gate',
      (tester) async {
    await pump(tester, const <Map<String, dynamic>>[]);

    expect(find.text('Verify your account to start selling'), findsOneWidget);
    expect(find.text('Get Verified'), findsOneWidget);
    expect(find.text('You have no listings yet.'), findsNothing);
  });
}
