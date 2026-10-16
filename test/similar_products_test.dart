import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/similar_products.dart';
import 'package:globoexpats_mobile/models/product.dart';

Product _p(int id, String name, {String? desc, String? cat, int qty = 5}) =>
    Product(
      productId: id,
      productName: name,
      productAskingPrice: 1000,
      productDescription: desc,
      categoryName: cat,
      productQuantity: qty,
    );

void main() {
  group('rankSimilarProducts (AU-052)', () {
    test('excludes the current product and out-of-stock items', () {
      final current = _p(1, 'iPhone 14 Pro');
      final candidates = [
        current,
        _p(2, 'iPhone 14 Pro Max'),
        _p(3, 'Samsung Galaxy', qty: 0),
      ];
      final out = rankSimilarProducts(current: current, candidates: candidates);
      expect(out.map((p) => p.productId), isNot(contains(1)));
      expect(out.map((p) => p.productId), isNot(contains(3)));
      expect(out.first.productId, 2);
    });

    test('name-token overlap dominates category which dominates description',
        () {
      final current = _p(1, 'Toyota Fielder Station Wagon',
          desc: 'clean unit for family use', cat: 'Vehicles');
      final sameNameDiffCat = _p(2, 'Toyota Fielder Spare Wheel',
          cat: 'Spare Parts');
      final sameCatOnly = _p(3, 'Honda Fit', cat: 'Vehicles');
      final descOnly = _p(
          4, 'Completely Different Gadget',
          desc: 'clean unit for family use extra words here now');
      final out = rankSimilarProducts(
          current: current,
          candidates: [descOnly, sameCatOnly, sameNameDiffCat]);
      // name overlap (1000s) beats category (+100) beats description (x1)
      expect(out[0].productId, sameNameDiffCat.productId);
      expect(out[1].productId, sameCatOnly.productId);
      expect(out[2].productId, descOnly.productId);
    });

    test('zero-signal falls back to candidate order, capped at limit 4', () {
      final current = _p(1, 'Xyzzy Quux Blorp');
      final candidates =
          List.generate(6, (i) => _p(10 + i, 'Item number ${i}th'));
      final out = rankSimilarProducts(current: current, candidates: candidates);
      expect(out.length, 4);
      expect(out.map((p) => p.productId).toList(), [10, 11, 12, 13]);
    });
  });
}
