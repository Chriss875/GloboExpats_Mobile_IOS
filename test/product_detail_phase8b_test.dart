import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/screens/product_detail_screen.dart';
import 'package:globoexpats_mobile/widgets/app_image.dart';
import 'package:globoexpats_mobile/widgets/share_kit/share_kit.dart';

/// The Share Kit paints photos it has decoded; tests skip the network.
class _NoImagesPlatform extends ShareKitPlatform {
  @override
  Future<ui.Image?> loadImage(String key) async => null;
}

http.Response _json(Object body) => http.Response(jsonEncode(body), 200,
    headers: {'content-type': 'application/json'});

MockClient _client({
  String name = 'Wooden bowls set',
  List<String> images = const [],
}) {
  return MockClient((request) async {
    if (request.url.path == '/api/v1/displayItem/itemDetails/101') {
      return _json({
        'productId': 101,
        'productName': name,
        'productDescription': 'Five nesting bowls, hand carved.',
        'productAskingPrice': 51000,
        'productCurrency': 'TZS',
        'productCondition': 'New',
        'productQuantity': 3,
        if (images.isNotEmpty)
          'productImages': [
            for (final u in images) {'imageUrl': u}
          ],
        'productRegion': 'dar es salaam',
        'placeName': '44 Pazi St',
        'sellerName': 'Anusiata Mlelwa',
        'sellerOrganization': 'Anusiata Crafts',
        'productRating': 4.5,
        'totalRatingsCount': 12,
        'sameRegionDeliveryFeeMin': 3000,
        'sameRegionDeliveryFeeMax': 17000,
        'subcategoryName': 'Kitchen & Dining',
      });
    }
    return http.Response('not found', 404);
  });
}

Future<void> _pumpProduct(WidgetTester tester, ApiClient api) async {
  await tester.pumpWidget(
      MaterialApp(home: ProductDetailScreen(productId: 101, api: api)));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('A-18: Share opens the Share Kit with the tracked link',
      (tester) async {
    final clipboardCalls = <MethodCall>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        clipboardCalls.add(call);
        return null;
      },
    );
    ShareKitPlatform.instance = _NoImagesPlatform();
    addTearDown(() {
      ShareKitPlatform.instance = const ShareKitPlatform();
      tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null);
    });

    await _pumpProduct(tester,
        ApiClient(client: _client(images: const ['/uploads/bowls.webp'])));

    await tester.tap(find.byTooltip('Share'));
    await tester.pumpAndSettle();

    // Web ShareProductModal: title, the product name, the picture formats.
    expect(find.text('Share Product'), findsOneWidget);
    expect(find.text('Portrait'), findsOneWidget);
    expect(find.text('QR only'), findsOneWidget);

    // Copy link writes the caption + the channel-tracked product link.
    await tester.ensureVisible(find.byKey(const ValueKey('share-kit-copy')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('share-kit-copy')));
    await tester.pumpAndSettle();
    final setData = clipboardCalls
        .where((c) => c.method == 'Clipboard.setData')
        .toList();
    expect(setData, isNotEmpty, reason: 'copy must write to the clipboard');
    final arg = (setData.first.arguments as Map).cast<String, dynamic>();
    expect(
        arg['text'],
        'Check out this product on GloboExpats:\n'
        'https://globoexpats.com/product/wooden-bowls-set-101'
        '?mtm_campaign=share&mtm_source=copy');
    expect(find.text('Caption and link copied.'), findsOneWidget);
  });

  testWidgets(
      'A-19: tapping a carousel photo opens the fullscreen preview with a page counter',
      (tester) async {
    await _pumpProduct(tester,
        ApiClient(client: _client(images: const [
      '/uploads/bowls.webp',
      '/uploads/second.webp',
    ])));

    expect(find.byType(AppImage), findsWidgets);
    await tester.tap(find.byType(AppImage).first);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('fullscreen-image-preview')),
        findsOneWidget);
    expect(find.byKey(const ValueKey('fullscreen-image-counter')),
        findsOneWidget);
    expect(find.text('1 / 2'), findsOneWidget);

    // Dismissible via the close button (no pinch-zoom on the viewer).
    await tester.tap(find.byKey(const ValueKey('fullscreen-preview-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('fullscreen-image-preview')),
        findsNothing);
  });
}
