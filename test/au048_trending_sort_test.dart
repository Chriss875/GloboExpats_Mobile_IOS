import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/screens/catalog_screens.dart';

/// AU-048: the sort menu must expose every reference option
/// (lib/marketplace-sort.ts) and Trending must order by click/view count
/// descending (reference browse/page.tsx `case 'trending'`).
void main() {
  Product p(int id, {double price = 100, int clicks = 0, double rating = 0}) =>
      Product(
        productId: id,
        productName: 'P$id',
        productAskingPrice: price,
        averageRating: rating,
        clickCount: clicks,
      );

  test('Product parses clickCount from the filter endpoint payload', () {
    final p = Product.fromJson({
      'productId': 9,
      'productName': 'Clicky',
      'productAskingPrice': 5000,
      'clickCount': 42,
    });
    expect(p.clickCount, 42);
    // Missing field (legacy endpoints) defaults to 0 without throwing.
    final legacy = Product.fromJson({'productId': 10, 'productName': 'Old'});
    expect(legacy.clickCount, 0);
  });

  test('sort menu exposes all six reference options incl. Trending', () {
    expect(ProductSort.values.map((s) => s.label).toList(), [
      'Relevance',
      'Price: Low to High',
      'Price: High to Low',
      'Newest',
      'Highest Rating',
      'Trending',
    ]);
  });

  test('Trending orders by clickCount descending', () {
    final list = [
      p(1, clicks: 3),
      p(2, clicks: 99),
      p(3, clicks: 7),
      p(4), // no clicks -> last
    ];
    final sorted = sortProducts(list, ProductSort.trending);
    expect(sorted.map((e) => e.productId).toList(), [2, 3, 1, 4]);
  });

  test('Highest Rating still orders by rating descending (renamed label)', () {
    final list = [p(1, rating: 2), p(2, rating: 5), p(3, rating: 4)];
    final sorted = sortProducts(list, ProductSort.rating);
    expect(sorted.map((e) => e.productId).toList(), [2, 3, 1]);
  });
}
