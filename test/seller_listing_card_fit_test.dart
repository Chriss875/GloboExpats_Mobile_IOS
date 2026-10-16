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

/// The listings grid needs a fixed width/height ratio, but the card's content
/// is a stack of fixed-height pieces plus optional extras. These pin the
/// worst case — every optional row present at once — at real phone widths, so
/// a card can never be given less room than it needs and clip.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Active + scheduled archive + unfinished delivery + a payout figure, which
  /// is every optional element the card can draw at the same time.
  Map<String, dynamic> loadedListing(int id) => {
        'productId': id,
        'productName':
            'Xiaomi TV Box S 4K Ultra HD Google TV Streaming Media Player',
        'productStatus': 'AVAILABLE',
        'productQuantity': 5,
        'productAskingPrice': 222000,
        'clickCount': 14,
        'sellerPayout': 195000,
        'createdAt': '2026-06-12T00:00:00Z',
        'archiveDate': '2026-11-23T00:00:00Z',
        'deliverySetupReady': false,
        'deliverySetupIssues': ['TRANSPORT_MODE_MISSING'],
      };

  Future<void> pumpAt(WidgetTester tester, Size screen) async {
    tester.view.physicalSize = screen;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/user-details')) {
          return _json({
            'userId': 7,
            'roles': [
              {'roleName': 'SELLER'}
            ],
            'products': [for (var i = 1; i <= 4; i++) loadedListing(i)],
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

  for (final device in const <({String name, Size size})>[
    (name: 'a small 360dp phone', size: Size(360, 780)),
    (name: 'a 390dp phone', size: Size(390, 844)),
    (name: 'a large 430dp phone', size: Size(430, 932)),
  ]) {
    testWidgets('a fully loaded listing card fits on ${device.name}',
        (tester) async {
      await pumpAt(tester, device.size);

      expect(find.byKey(const ValueKey('listing-archives-on')), findsWidgets);
      expect(find.text('You receive'), findsWidgets);
      // A clipped card reports a RenderFlex overflow through the harness.
      expect(tester.takeException(), isNull);
    });
  }
}
