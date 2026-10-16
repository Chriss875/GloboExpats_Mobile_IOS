import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/widgets/product_card.dart';
import 'package:globoexpats_mobile/widgets/product_grid.dart';

/// "This verified iconic is not shown in mobile app, and in home the product
/// cards leave big space for some products" — reported from the phone with a
/// side-by-side against the web home.
///
/// Both come from the same block. The listing endpoints send no verification
/// field (checked against /displayItem/newest), so mobile's payload-driven
/// badge never rendered while the web's — whose predicate ends in `|| true` —
/// always does; and a one-line title left its card a line short, which the
/// bottom-pinned price row turned into one visible gap.
void main() {
  Product listing({required String name, double rating = 0, int ratings = 0}) =>
      Product(
        productId: name.hashCode,
        productName: name,
        productAskingPrice: 40000,
        sellerName: 'Donata Kimaro',
        placeName: 'Mwenge',
        averageRating: rating,
        totalRatingsCount: ratings,
      );

  Future<void> pumpCards(WidgetTester tester, List<Product> products) async {
    CartStore.instance.clear();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final p in products)
              SizedBox(width: 180, height: 330, child: ProductCard(p)),
          ],
        ),
      ),
    ));
    await tester.pump();
  }

  testWidgets('a card carries the trust badge even with no rating',
      (tester) async {
    await pumpCards(tester, [listing(name: 'Mpingo Wood Elephant')]);

    expect(find.text('Verified Seller'), findsOneWidget,
        reason: 'the web card shows this on every listing; mobile showed it '
            'on none, because the listing rows carry no verification field '
            'for it to read');
    expect(find.byIcon(Icons.verified_rounded), findsOneWidget);
  });

  testWidgets('a card without a rating keeps the same row structure',
      (tester) async {
    await pumpCards(tester, [
      listing(name: 'Mpingo Wood Elephant'),
      listing(name: 'Sunglasses', rating: 5, ratings: 1),
    ]);

    // Geometry, not rendered text: the test font is far wider than Lexend, so
    // only the block structure is stable across fonts. The trust badge and
    // the rating share one row, so a card missing BOTH used to be a row
    // shorter — and since the price is pinned to the bottom of a
    // fixed-height cell, that missing row showed up as a gap above the price.
    final locations = find.text('Mwenge');
    expect(locations, findsNWidgets(2));

    expect(tester.getRect(locations.at(0)).top,
        moreOrLessEquals(tester.getRect(locations.at(1)).top, epsilon: 1),
        reason: 'the unrated card dropped the whole verification/rating row, '
            'so everything below it sat a row higher than its neighbour');
  });

  testWidgets('the badge sits above the price, not in place of the rating',
      (tester) async {
    await pumpCards(tester, [listing(name: 'Sunglasses', rating: 5, ratings: 1)]);

    expect(find.text('Verified Seller'), findsOneWidget);
    expect(find.text('5.0'), findsOneWidget);
    expect(find.text(' (1)'), findsOneWidget);
  });

  group('the home grid', () {
    /// "the vertical distance btn location and price with cart section is
    /// very large" — the cell was a fixed 0.55 ratio, and because the price
    /// row is pinned to the bottom of the cell (web parity `mt-auto`), every
    /// point of unused height showed up as one gap in the middle of the card.
    /// The cell is now sized from the card's own content.
    Future<double> slack(WidgetTester tester, double textScale) async {
      tester.view.physicalSize = const Size(390 * 3, 844 * 3);
      tester.view.devicePixelRatio = 3.0;
      addTearDown(tester.view.reset);
      CartStore.instance.clear();

      await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: ProductGrid([
                listing(name: 'Mpingo Wood Elephant Mother and Calf - Size'),
                listing(name: 'Sunglasses', rating: 5, ratings: 1),
              ]),
            ),
          ),
        ),
      ));
      await tester.pump();

      final location = tester.getRect(find.text('Mwenge').first);
      final price = tester.getRect(find.textContaining('TSh').first);
      return price.top - location.bottom;
    }

    testWidgets('leaves a small gap above the price, not a band',
        (tester) async {
      final gap = await slack(tester, 1.0);
      expect(gap, lessThan(18),
          reason: 'the fixed 0.55 ratio left ~26pt of dead space here');
      expect(gap, greaterThan(4), reason: 'the rows still need to breathe');
    });

    testWidgets('still fits when the phone font is enlarged', (tester) async {
      final gap = await slack(tester, 1.3);
      expect(tester.takeException(), isNull,
          reason: 'sizing the cell to its content must not clip it at a '
              'larger text scale — the cell grows with the text');
      expect(gap, greaterThan(0));
    });
  });

  group('productCardHeight', () {
    /// Home's Featured / New Arrivals / Trending rails carry the COMPACT
    /// card, whose type is smaller — so the same fixed 0.55 ratio left them
    /// an even wider band above the price than the browse grid had.
    Future<double> gapIn(WidgetTester tester,
        {required bool compact, required double textScale}) async {
      tester.view.physicalSize = const Size(390 * 3, 844 * 3);
      tester.view.devicePixelRatio = 3.0;
      addTearDown(tester.view.reset);
      CartStore.instance.clear();

      final width = compact ? (390.0 - 36) / 2 : (390.0 - 34) / 2;
      await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
          child: Scaffold(
            body: Builder(builder: (context) {
              return Align(
                alignment: Alignment.topLeft,
                child: SizedBox(
                  width: width,
                  height: productCardHeight(context,
                      width: width, compact: compact),
                  child: ProductCard(
                      listing(name: 'Mpingo Wood Elephant Mother and Calf'),
                      compact: compact),
                ),
              );
            }),
          ),
        ),
      ));
      await tester.pump();

      return tester.getRect(find.textContaining('TSh')).top -
          tester.getRect(find.text('Mwenge')).bottom;
    }

    for (final compact in [true, false]) {
      for (final scale in [1.0, 1.3]) {
        testWidgets(
            'holds a ${compact ? 'compact' : 'regular'} card at ${scale}x '
            'with a small, even gap', (tester) async {
          final gap = await gapIn(tester, compact: compact, textScale: scale);
          expect(tester.takeException(), isNull,
              reason: 'the reserved height must never clip the card');
          expect(gap, inInclusiveRange(6, 18),
              reason: 'the rail used width / 0.55, which on the compact card '
                  'left roughly twice this much dead space');
        });
      }
    }
  });
}
