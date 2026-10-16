// A Halal listing's share picture carries the Halal mark on its photo, the
// same artwork as the app's product cards. It was missing from every share.
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/widgets/share_kit/share_cards.dart';
import 'package:globoexpats_mobile/widgets/share_kit/share_kit.dart';

ShareCardData _data({required bool halal}) => ShareCardData(
      kind: ShareCardKind.product,
      title: 'Beef mince',
      price: 'TSh 18,000',
      imageUrl: 'photo.webp',
      seller: const ShareCardSeller(name: 'Butchery'),
      displayUrl: 'globoexpats.com/product/1',
      qrUrl: 'https://globoexpats.com/product/1',
      halal: halal,
    );

void main() {
  testWidgets('the Halal mark sits on a Halal listing\'s photo, only there',
      (tester) async {
    final img = await tester.runAsync(() => createTestImage(width: 8, height: 8));
    final images = <String, ui.Image>{'photo.webp': img!, kShareHalalAsset: img};
    for (final design in [ShareDesign.square, ShareDesign.story, ShareDesign.sheet]) {
      for (final halal in [true, false]) {
        await tester.pumpWidget(MaterialApp(
          home: Center(
            child: SizedBox(
              width: 360,
              child: ShareCard(
                  design: design, data: _data(halal: halal), images: images),
            ),
          ),
        ));
        expect(find.byKey(const ValueKey('share-halal-mark')),
            halal ? findsOneWidget : findsNothing,
            reason: '$design halal=$halal');
      }
    }
  });

  testWidgets('the Halal artwork is loaded with the listing photo',
      (tester) async {
    tester.view.physicalSize = const Size(430, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final asked = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: ShareKitView(
          data: _data(halal: true),
          designs: const [ShareDesign.square],
          shareUrl: '/product/1',
          buildCaption: (link, _) => link,
          fileBase: 'beef',
          loadImage: (key) async {
            asked.add(key);
            return null;
          },
          ),
        ),
      ),
    ));
    await tester.pump();
    expect(asked, contains(kShareHalalAsset));
  });
}
