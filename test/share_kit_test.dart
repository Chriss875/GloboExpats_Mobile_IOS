// The Share Kit (web parity: components/share-kit/*, lib/product-share.ts,
// share-product-modal.tsx and share-seller-profile-modal.tsx).
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/domain/share_links.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';
import 'package:globoexpats_mobile/screens/seller_profile_screen.dart';
import 'package:globoexpats_mobile/widgets/share_kit/share_cards.dart';
import 'package:globoexpats_mobile/widgets/share_kit/share_kit.dart';
import 'package:globoexpats_mobile/widgets/shop_profile_card.dart';

class _FakePlatform extends ShareKitPlatform {
  final shared = <(Uint8List, String, String)>[];
  final saved = <String>[];
  final copied = <String>[];
  final texts = <String>[];

  @override
  Future<ui.Image?> loadImage(String key) async => null;

  @override
  Future<ShareImageOutcome> shareImage(
      Uint8List png, String filename, String caption) async {
    shared.add((png, filename, caption));
    return ShareImageOutcome.shared;
  }

  @override
  Future<void> saveImage(Uint8List png, String name) async => saved.add(name);

  @override
  Future<bool> shareText(String text) async {
    texts.add(text);
    return true;
  }

  @override
  Future<bool> copy(String text) async {
    copied.add(text);
    return true;
  }
}

http.Response _json(Object body) => http.Response(jsonEncode(body), 200,
    headers: {'content-type': 'application/json'});

Map<String, dynamic> _product() => {
      'productId': 101,
      'productName': 'Wooden bowls set',
      'productDescription': 'Five nesting bowls, hand carved.',
      'productAskingPrice': 51000,
      'productCurrency': 'TZS',
      'productCondition': 'LIKE_NEW',
      'productQuantity': 3,
      'productImages': [
        {'imageUrl': '/uploads/bowls.webp'}
      ],
      'productRegion': 'dar es salaam',
      'productCountry': 'Tanzania',
      'sellerName': 'Anusiata Mlelwa',
      'sellerUserId': 7,
      'profileImageUrl': '/uploads/anusiata.webp',
      'categoryName': 'Home',
    };

void main() {
  late _FakePlatform platform;
  setUp(() {
    platform = _FakePlatform();
    ShareKitPlatform.instance = platform;
  });
  tearDown(() {
    ShareKitPlatform.instance = const ShareKitPlatform();
    AuthStore.instance = null;
  });

  group('links and captions (lib/product-share.ts)', () {
    test('tracked links carry the Matomo campaign, channel and sharer', () {
      expect(
          buildTrackedShareUrl('/product/12', ShareChannel.qr, 7),
          'https://globoexpats.com/product/12'
          '?mtm_campaign=share&mtm_source=qr&mtm_content=7');
      expect(buildTrackedShareUrl('/seller/a-p7', ShareChannel.copy),
          'https://globoexpats.com/seller/a-p7?mtm_campaign=share&mtm_source=copy');
      expect(shareDisplayUrl('https://www.globoexpats.com/product/12/'),
          'globoexpats.com/product/12');
      expect(productSharePath(101, 'Wooden bowls set!'),
          '/product/wooden-bowls-set-101');
    });

    test('labels read like the listing form', () {
      expect(shareConditionLabel('LIKE_NEW'), 'Like New');
      expect(shareConditionLabel('brand_new'), 'Brand new');
      expect(sharePlaceLabel('dar es salaam'), 'Dar es Salaam');
      expect(shareInitials('Anusiata M.'), 'AM');
      expect(shareFileSlug('Wooden Bowls — Set'), 'wooden-bowls-set');
    });

    test('photo posters get the short caption, QR shares the details', () {
      expect(buildProductShareCaption(title: 'Bowls', link: 'L', details: false),
          'Check out this product on GloboExpats:\nL');
      expect(
          buildProductShareCaption(
              title: 'Bowls',
              link: 'L',
              price: 'TSh 51,000',
              condition: 'New',
              description: '  Five   bowls ',
              city: 'Dar es Salaam',
              country: 'dar es salaam'),
          'Bowls · TSh 51,000\nNew · Dar es Salaam\nFive bowls\n'
          'See the full listing on GloboExpats:\nL');
    });
  });

  Future<void> pumpProduct(WidgetTester tester, {int? viewerId}) async {
    tester.view.physicalSize = const Size(430, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = ApiClient(client: MockClient((req) async {
      if (req.url.path == '/api/v1/displayItem/itemDetails/101') {
        return _json(_product());
      }
      if (req.url.path.endsWith('/user-details') && viewerId != null) {
        return _json({'userId': viewerId, 'firstName': 'A'});
      }
      return http.Response('not found', 404);
    }));
    if (viewerId != null) {
      AuthStore.instance = AuthStore(
          api: api, initialToken: 'jwt-product-$viewerId', initialEmail: 'a@x');
    }
    await tester.pumpWidget(
        MaterialApp(home: ProductDetailScreen(productId: 101, api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Share'));
    await tester.pumpAndSettle();
  }

  String caption(WidgetTester tester) => tester
      .widget<SelectableText>(find.descendant(
          of: find.byKey(const ValueKey('share-kit-caption')),
          matching: find.byType(SelectableText)))
      .data!;

  testWidgets('a shopper gets the four product pictures and a tracked caption',
      (tester) async {
    await pumpProduct(tester);
    expect(find.text('Share Product'), findsOneWidget);
    for (final format in ['Portrait', 'Story', 'Photo', 'QR only']) {
      expect(find.text(format), findsOneWidget, reason: format);
    }
    expect(find.text('QR poster'), findsNothing,
        reason: 'the printable poster is for the listing owner');
    expect(find.text('Seller identity'), findsNothing);
    expect(find.text('Studio'), findsOneWidget);
    expect(find.text('Image size'), findsOneWidget);
    expect(
        caption(tester),
        'Check out this product on GloboExpats:\n'
        'https://globoexpats.com/product/wooden-bowls-set-101'
        '?mtm_campaign=share&mtm_source=native');

    // QR only: the caption carries the details; no template or photo tools.
    await tester.tap(find.byKey(const ValueKey('share-kit-format-qr')));
    await tester.pumpAndSettle();
    expect(caption(tester).split('\n').take(3).toList(), [
      'Wooden bowls set · TSh 51,000',
      'Like New · Dar es Salaam, Tanzania',
      'Five nesting bowls, hand carved.',
    ]);
    expect(find.text('Template'), findsNothing);
    expect(find.text('Image size'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('share-kit-copy')));
    await tester.pumpAndSettle();
    expect(platform.copied.single, contains('mtm_source=copy'));
    expect(find.text('Caption and link copied.'), findsOneWidget);
  });

  testWidgets('Share image hands the 1080px picture and caption to the phone',
      (tester) async {
    await pumpProduct(tester);
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const ValueKey('share-kit-share')));
      for (var i = 0; i < 100 && platform.shared.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    });
    await tester.pumpAndSettle();
    final (png, filename, text) = platform.shared.single;
    expect(filename, 'globoexpats-wooden-bowls-set-portrait.png');
    expect(text, contains('mtm_source=native'));
    final codec = await tester.runAsync(() => ui.instantiateImageCodec(png));
    final frame = await tester.runAsync(() => codec!.getNextFrame());
    expect(frame!.image.width, 1080);
    expect(frame.image.height, 1350);
    expect(platform.copied.single, text,
        reason: 'the caption is copied in case the app drops it');
    expect(find.textContaining('Image shared.'), findsOneWidget);
  });

  testWidgets('the listing owner also gets the QR poster, never a photo option',
      (tester) async {
    await pumpProduct(tester, viewerId: 7);
    expect(find.text('QR poster'), findsOneWidget);
    // Profile photos broke the posters' composition: no option at all.
    expect(find.text('Seller identity'), findsNothing);
    expect(find.text('Name and photo'), findsNothing);
    expect(caption(tester), contains('mtm_content=7'),
        reason: 'the sharer is credited on the link');
  });

  ApiClient sellerApi({int? viewer}) => ApiClient(client: MockClient((req) async {
        final path = req.url.path;
        if (path == '/api/v1/userManagement/seller-summary/7') {
          return _json({
            'userId': 7,
            'firstName': 'Anusiata',
            'lastName': 'Mlelwa',
            'averageRating': 4.6,
            'totalRatingsCount': 3,
            'location': 'Dar es Salaam',
          });
        }
        if (path == '/api/v1/displayItem/filter') {
          return _json({
            'content': [
              {
                'productId': 1,
                'productName': 'Carved bowl',
                'productAskingPrice': 25000,
                'productCurrency': 'TZS',
                'productQuantity': 1,
                'productImages': [
                  {'imageUrl': '/uploads/bowl.webp'}
                ],
              }
            ],
            'totalElements': 1,
          });
        }
        if (path.endsWith('/user-details') && viewer != null) {
          return _json({
            'userId': viewer,
            'firstName': 'Anusiata',
            'lastName': 'Mlelwa',
          });
        }
        if (path.startsWith('/api/v1/user-ratings/')) {
          return _json({'content': []});
        }
        return http.Response('{}', 404);
      }));

  Future<void> pumpSeller(WidgetTester tester, ApiClient api) async {
    tester.view.physicalSize = const Size(430, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
        MaterialApp(home: SellerProfileScreen(sellerId: 7, api: api)));
    await tester.pumpAndSettle();
  }

  testWidgets('a visitor shares a shop with the full kit and three layouts',
      (tester) async {
    await pumpSeller(tester, sellerApi());
    expect(find.text('Seller'), findsOneWidget);
    await tester.tap(find.byTooltip('Share profile'));
    await tester.pumpAndSettle();
    expect(find.text('Share seller profile'), findsOneWidget);
    for (final label in [
      'Shop', 'QR poster', 'QR only', // formats
      'Collage', 'Grid', 'Spotlight', // shop layouts
      'Studio', 'Flat blue', 'White', 'Minimal', // templates
    ]) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    // Signed out: the link carries no sharer.
    expect(
        caption(tester),
        endsWith('https://globoexpats.com/seller/anusiata-mlelwa-p7'
            '?mtm_campaign=share&mtm_source=native'));

    await tester.tap(find.byKey(const ValueKey('share-kit-layout-spotlight')));
    await tester.pumpAndSettle();
    final card = find.byKey(const ValueKey('share-kit-preview'));
    expect(
        tester.widget<ShareCard>(card).shopLayout, ShareShopLayout.spotlight);

    // Layouts are for the shop picture only.
    await tester.tap(find.byKey(const ValueKey('share-kit-format-poster')));
    await tester.pumpAndSettle();
    expect(find.text('Layout'), findsNothing);
    expect(find.text('Template'), findsOneWidget);
  });

  testWidgets('a signed-in visitor is credited on the shop links',
      (tester) async {
    final api = sellerApi(viewer: 9);
    AuthStore.instance = AuthStore(
        api: api, initialToken: 'jwt-visitor-9', initialEmail: 'v@x');
    await pumpSeller(tester, api);
    expect(find.text('Seller'), findsOneWidget,
        reason: 'someone else\'s shop, not "Your shop"');
    await tester.tap(find.byTooltip('Share profile'));
    await tester.pumpAndSettle();
    expect(caption(tester), endsWith('&mtm_content=9'));
  });

  testWidgets('a seller on their own shop gets the shop pictures',
      (tester) async {
    final api = sellerApi(viewer: 7);
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt-own-shop', initialEmail: 'a@x');
    await pumpSeller(tester, api);
    expect(find.text('Your shop'), findsOneWidget);
    await tester.tap(find.byTooltip('Share profile'));
    await tester.pumpAndSettle();
    for (final format in ['Shop', 'QR poster', 'QR only']) {
      expect(find.text(format), findsOneWidget, reason: format);
    }
    // The collage fills its tiles: nothing to resize or frame.
    expect(find.text('Image size'), findsNothing);
    expect(find.text('Seller identity'), findsNothing);
    expect(
        caption(tester),
        "Come take a look at Anusiata M.'s shop on GloboExpats! Browse the "
        "collection and find something you'll love.\n"
        'https://globoexpats.com/seller/anusiata-mlelwa-p7'
        '?mtm_campaign=share&mtm_source=native&mtm_content=7');
  });

  testWidgets('Account › Shop profile shows the storefront and shares it',
      (tester) async {
    tester.view.physicalSize = const Size(430, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = sellerApi(viewer: 7);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ListView(children: [
      ShopProfileCard(api: api, token: 'jwt-account-shop'),
    ]))));
    await tester.pumpAndSettle();
    expect(find.text('SHOP PROFILE'), findsOneWidget);
    expect(find.text('Anusiata M.'), findsOneWidget);
    expect(find.text('Dar es Salaam'), findsOneWidget);
    expect(find.text('Listing'), findsOneWidget);
    expect(find.text('4.6'), findsOneWidget);
    expect(find.text('3 reviews'), findsOneWidget);
    expect(find.byKey(const ValueKey('account-shop-view')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('account-shop-share')));
    await tester.pumpAndSettle();
    expect(find.text('Share seller profile'), findsOneWidget);
    expect(find.text('Shop'), findsOneWidget);
    expect(find.text('Come browse the shop'), findsOneWidget);
  });
}
