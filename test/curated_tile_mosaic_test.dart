import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/widgets/curated_tile_mosaic.dart';

/// 300px wide with the default 8px gap, so a square column is (300-8)/2 = 146
/// and a full-width 16:9 picture is 300 x 168.75.
Widget subject(int count) => MaterialApp(
      home: Align(
        alignment: Alignment.topLeft,
        child: SizedBox(
          width: 300,
          child: CuratedTileMosaic(
            tiles: List.generate(
              count,
              (index) => CuratedTile(
                imageUrl: null,
                label: 'tile-$index',
                onTap: () {},
              ),
            ),
          ),
        ),
      ),
    );

/// The picture boxes, in layout order.
Size picture(WidgetTester tester, int index) =>
    tester.getSize(find.byType(AspectRatio).at(index));

double pictureTop(WidgetTester tester, int index) =>
    tester.getTopLeft(find.byType(AspectRatio).at(index)).dy;

void main() {
  testWidgets('one tile is a single wide picture', (tester) async {
    await tester.pumpWidget(subject(1));
    expect(picture(tester, 0), const Size(300, 168.75));
    expect(find.text('tile-0'), findsOneWidget);
  });

  testWidgets('two tiles are stacked as wide landscape rows', (tester) async {
    await tester.pumpWidget(subject(2));
    expect(picture(tester, 0), const Size(300, 168.75));
    expect(picture(tester, 1), const Size(300, 168.75));
    expect(pictureTop(tester, 1), greaterThan(pictureTop(tester, 0)));
  });

  testWidgets('three tiles lead with one wide picture above two squares',
      (tester) async {
    await tester.pumpWidget(subject(3));
    // Web parity: the wide tile leads, it does not trail.
    expect(picture(tester, 0), const Size(300, 168.75));
    expect(picture(tester, 1), const Size(146, 146));
    expect(picture(tester, 2), const Size(146, 146));
    expect(pictureTop(tester, 1), greaterThan(pictureTop(tester, 0)));
    expect(pictureTop(tester, 2), equals(pictureTop(tester, 1)));
  });

  testWidgets('four tiles share an even two by two grid of squares',
      (tester) async {
    await tester.pumpWidget(subject(4));
    for (var index = 0; index < 4; index++) {
      expect(picture(tester, index), const Size(146, 146));
    }
    expect(pictureTop(tester, 1), equals(pictureTop(tester, 0)));
    expect(pictureTop(tester, 2), greaterThan(pictureTop(tester, 0)));
  });

  testWidgets('the mosaic is content-height, never stretched to its parent',
      (tester) async {
    await tester.pumpWidget(subject(4));
    // Two 146 squares + two 28px captions + two 4px gaps + the 8px row gap.
    expect(tester.getSize(find.byType(CuratedTileMosaic)).height,
        (146 + 4 + 28) * 2 + 8);
  });
}
