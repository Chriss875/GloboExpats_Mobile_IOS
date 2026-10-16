import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/models/product_detail.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

/// AU-013: hidden-listing guard + product click tracking on detail open.
/// Mirrors web /product/[id]: `deliverySetupReady=false` (and not public-ready)
/// renders "Product not found" unless the viewer is the owner or an admin, and
/// POST /api/v1/products/{id}/clicks fires once per open.

const _hiddenJson = {
  'productId': 630,
  'productName': 'au-013 hidden fixture',
  'productAskingPrice': 5000,
  'productCurrency': 'TZS',
  'productQuantity': 2,
  'sellerId': 142,
  'sellerUserId': 142,
  'deliverySetupReady': false,
  'deliverySetupIssues': ['PICKUP_LOCATION_MISSING', 'TRANSPORT_MODE_MISSING'],
  // No coordinates / transport mode → NOT public-ready even without the flag.
};

const _publicJson = {
  'productId': 101,
  'productName': 'Millionaire Expat',
  'productAskingPrice': 40000,
  'productCurrency': 'TZS',
  'productQuantity': 1,
  'sellerId': 3,
  'sellerUserId': 3,
  'deliverySetupReady': false,
  'deliverySetupGrandfathered': true, // grandfathered → public-ready
  'latitude': -6.77,
  'longitude': 39.23,
  'clickCount': 1624,
};

const _adminUserDetails = {
  'userId': 142,
  'loggingEmail': 'mobile.test.20260820@gmail.com',
  'roles': [
    {'roleId': 1, 'roleName': 'ADMIN'},
    {'roleId': 2, 'roleName': 'BUYER'},
    {'roleId': 3, 'roleName': 'SELLER'},
  ],
  'products': [_hiddenJson],
};

const _buyerUserDetails = {
  'userId': 7,
  'loggingEmail': 'buyer@example.com',
  'roles': [
    {'roleId': 2, 'roleName': 'BUYER'},
  ],
  'products': [],
};

http.Response _json(Object body, [int status = 200]) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

Future<void> _initKv() async {
  SharedPreferences.setMockInitialValues(<String, Object>{});
  await KvStore.instance.load();
}

Widget _host(ProductDetailScreen screen) =>
    MaterialApp(home: Scaffold(body: screen));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await _initKv();
    AuthStore.instance = null; // anonymous unless a test logs in
  });

  group('ProductDetail public-ready predicate (model parity with image-utils)',
      () {
    test('grandfathered listing is public despite deliverySetupReady=false',
        () {
      final d = ProductDetail.fromJson(Map<String, dynamic>.from(_publicJson));
      expect(d.requiresPrivilegedViewer, isFalse);
    });

    test('missing logistics fields means owner/admin-only', () {
      final d = ProductDetail.fromJson(Map<String, dynamic>.from(_hiddenJson));
      expect(d.requiresPrivilegedViewer, isTrue);
    });

    test('absent delivery flag in compact DTOs is treated as ready', () {
      final d = ProductDetail.fromJson(const {
        'productId': 5,
        'productName': 'compact dto',
        'productQuantity': 1,
      });
      expect(d.deliverySetupReady, isNull);
      expect(d.requiresPrivilegedViewer, isFalse);
    });

    test(
        'explicitly not-ready WITH a full pin + seller-selected mode stays public',
        () {
      // Web parity: typeof deliverySetupReady === 'boolean' wins over heuristics.
      final d = ProductDetail.fromJson(const {
        'productId': 9,
        'productName': 'ready flag false but complete',
        'deliverySetupReady': false,
        'latitude': -6.8,
        'longitude': 39.28,
        'deliveryTransportMode': 'CAR',
        'transportModeSource': 'SELLER_SELECTED',
        'coordinatesSource': 'PINNED',
      });
      expect(d.publiclyDeliveryReady, isFalse);
      expect(d.requiresPrivilegedViewer, isTrue);
    });
  });

  group('AU-013 click tracking', () {
    testWidgets('POST /products/{id}/clicks fires on open and stats render',
        (tester) async {
      var clicks = 0;
      final client = MockClient((req) async {
        if (req.url.path == '/api/v1/displayItem/itemDetails/101') {
          return _json(_publicJson);
        }
        if (req.method == 'POST' &&
            req.url.path == '/api/v1/products/101/clicks') {
          clicks += 1;
          expect(req.headers['X-Anonymous-Id'], startsWith('anon:'),
              reason: 'anonymous viewers send the stable anon id');
          return _json({
            'productId': 101,
            'productTotalClickCount': 1624 + clicks,
          });
        }
        if (req.url.path == '/api/v1/products/101/clicks/total') {
          return _json({'productId': 101, 'totalClickCount': 1626});
        }
        if (req.url.path == '/api/v1/products/101/clicks/unique') {
          return _json({'productId': 101, 'uniqueViewCount': 4});
        }
        return _json({}, 404);
      });
      final api = ApiClient(client: client);

      await tester
          .pumpWidget(_host(ProductDetailScreen(productId: 101, api: api)));
      await tester.pump(); // resolve detail future
      await tester.pumpAndSettle();

      expect(clicks, 1, reason: 'exactly one click POST per open');
      // Web parity "N total views" line shows the refreshed aggregate.
      expect(find.text('1626 total views'), findsOneWidget);

      // The persisted anon id is stable across opens (web ge_anon_id).
      expect(KvStore.instance.getString(ApiClient.kAnonIdKey),
          startsWith('anon:'));
    });

    testWidgets('authenticated open sends Bearer token, not X-Anonymous-Id',
        (tester) async {
      final seen = <String?, int>{};
      final client = MockClient((req) async {
        if (req.url.path == '/api/v1/displayItem/itemDetails/101') {
          return _json(_publicJson);
        }
        if (req.url.path == '/api/v1/products/101/clicks' &&
            req.method == 'POST') {
          seen[req.headers['Authorization']] =
              (seen[req.headers['Authorization']] ?? 0) + 1;
          return _json({'productTotalClickCount': 1700});
        }
        if (req.url.path.endsWith('/clicks/total')) {
          return _json({'totalClickCount': 1700});
        }
        if (req.url.path.endsWith('/clicks/unique')) {
          return _json({'uniqueViewCount': 2});
        }
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json(_adminUserDetails);
        }
        if (req.url.path == '/api/v1/products/101/clicks/analytics') {
          // The admin's per-viewer breakdown the panel renders.
          return _json({
            'productId': 101,
            'viewers': [
              {
                'userId': 7,
                'anonymous': false,
                'fullName': 'Buyer Seven',
                'totalViews': 2
              },
            ],
          });
        }
        return _json({}, 404);
      });
      final api = ApiClient(client: client);
      AuthStore.instance = AuthStore(
          api: api, initialToken: 'jwt-token', initialEmail: 'a@b.com');

      await tester
          .pumpWidget(_host(ProductDetailScreen(productId: 101, api: api)));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(seen['Bearer jwt-token'], 1,
          reason: 'logged-in viewers are tracked under their JWT');
      // Admin also loads the per-viewer analytics panel.
      expect(find.text('Who viewed this listing'), findsOneWidget);
    });
  });

  group('AU-013 hidden-listing guard', () {
    testWidgets('anonymous viewer gets Product not found — no commerce UI',
        (tester) async {
      final client = MockClient((req) async {
        if (req.url.path == '/api/v1/displayItem/itemDetails/630') {
          return _json(_hiddenJson);
        }
        return _json({}, 404);
      });
      final api = ApiClient(client: client);

      await tester
          .pumpWidget(_host(ProductDetailScreen(productId: 630, api: api)));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(find.text('Error: Product not found'), findsOneWidget);
      expect(find.text('Back to Browse'), findsOneWidget);
      // Dead commerce buttons must never render on a hidden listing.
      expect(find.text('Add to cart'), findsNothing);
      expect(find.text('Buy now'), findsNothing);
      expect(find.text('au-013 hidden fixture'), findsNothing);
    });

    testWidgets('signed-in non-owner buyer ALSO gets Product not found',
        (tester) async {
      final client = MockClient((req) async {
        if (req.url.path == '/api/v1/displayItem/itemDetails/630') {
          return _json(_hiddenJson);
        }
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json(_buyerUserDetails);
        }
        return _json({}, 404);
      });
      final api = ApiClient(client: client);
      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');

      await tester
          .pumpWidget(_host(ProductDetailScreen(productId: 630, api: api)));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(find.text('Error: Product not found'), findsOneWidget);
      expect(find.textContaining('Add to cart'), findsNothing);
    });

    testWidgets('the OWNER can still inspect their own hidden listing',
        (tester) async {
      final client = MockClient((req) async {
        if (req.url.path == '/api/v1/displayItem/itemDetails/630') {
          return _json(_hiddenJson);
        }
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json(_adminUserDetails); // userId 142 == sellerUserId
        }
        if (req.url.path == '/api/v1/products/630/clicks') {
          return _json({'productTotalClickCount': 109});
        }
        if (req.url.path.endsWith('/clicks/total')) {
          return _json({'totalClickCount': 109});
        }
        if (req.url.path.endsWith('/clicks/unique')) {
          return _json({'uniqueViewCount': 2});
        }
        if (req.url.path == '/api/v1/products/630/clicks/analytics') {
          return _json({
            'productId': 630,
            'viewers': [
              {
                'userId': 7,
                'anonymous': false,
                'fullName': 'Buyer Seven',
                'totalViews': 3
              },
            ],
          });
        }
        return _json({}, 404);
      });
      final api = ApiClient(client: client);
      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

      await tester
          .pumpWidget(_host(ProductDetailScreen(productId: 630, api: api)));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(find.text('au-013 hidden fixture'), findsOneWidget,
          reason: 'owner fallback keeps the repair path alive');
      expect(find.byTooltip('Add to cart'), findsOneWidget);
      // Owner sees the aggregate viewers panel.
      expect(find.text('Who viewed this listing'), findsOneWidget);
    });

    testWidgets('a 404 detail falls back to the user listings when owned',
        (tester) async {
      final client = MockClient((req) async {
        if (req.url.path == '/api/v1/displayItem/itemDetails/630') {
          return _json({}, 404); // backend hides it entirely from this viewer
        }
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json(_adminUserDetails);
        }
        if (req.url.path == '/api/v1/products/630/clicks') {
          return _json({'productTotalClickCount': 110});
        }
        if (req.url.path.endsWith('/clicks/total')) {
          return _json({'totalClickCount': 110});
        }
        if (req.url.path.endsWith('/clicks/unique')) {
          return _json({'uniqueViewCount': 1});
        }
        if (req.url.path == '/api/v1/products/630/clicks/analytics') {
          return _json({'viewers': []});
        }
        return _json({}, 404);
      });
      final api = ApiClient(client: client);
      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

      await tester
          .pumpWidget(_host(ProductDetailScreen(productId: 630, api: api)));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(find.text('au-013 hidden fixture'), findsOneWidget,
          reason: 'web parity: unlisted items remain visible to their owner');
    });

    testWidgets('public listings render normally for anonymous viewers',
        (tester) async {
      final client = MockClient((req) async {
        if (req.url.path == '/api/v1/displayItem/itemDetails/101') {
          return _json(_publicJson);
        }
        if (req.url.path == '/api/v1/products/101/clicks') {
          return _json({'productTotalClickCount': 1625});
        }
        if (req.url.path.endsWith('/clicks/total')) {
          return _json({'totalClickCount': 1625});
        }
        if (req.url.path.endsWith('/clicks/unique')) {
          return _json({'uniqueViewCount': 3});
        }
        return _json({}, 404);
      });
      final api = ApiClient(client: client);

      await tester
          .pumpWidget(_host(ProductDetailScreen(productId: 101, api: api)));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(find.text('Millionaire Expat'), findsOneWidget);
      expect(find.text('Error: Product not found'), findsNothing);
    });
  });

  group('AU-013 click-stats parsing', () {
    test('total endpoint maps totalClickCount', () {
      final s = ProductClickStats.fromTotalJson({'totalClickCount': 42});
      expect(s.total, 42);
    });

    test('unique endpoint maps uniqueViewCount', () {
      final s = ProductClickStats.fromUniqueJson({'uniqueViewCount': 7});
      expect(s.unique, 7);
    });

    test('malformed bodies yield zeros, never invented counts', () {
      expect(ProductClickStats.fromTotalJson('oops').total, 0);
      expect(ProductClickStats.fromUniqueJson(null).unique, 0);
    });

    test('analytics parses named viewers', () {
      final a = ProductClickAnalytics.fromJson({
        'viewers': [
          {
            'userId': 142,
            'anonymous': false,
            'fullName': 'Test Mobile',
            'totalViews': 2
          },
          {'anonymous': true, 'anonymousId': 'anon:x', 'totalViews': 5},
        ],
      });
      expect(a.viewers.length, 2);
      expect(a.viewers.first.fullName, 'Test Mobile');
      expect(a.viewers.last.anonymous, isTrue);
    });
  });
}
