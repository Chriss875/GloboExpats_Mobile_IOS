import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/commission_calculator.dart';

/// Phase 3, unit 3 (money): the category commission fallbacks, pinned to the
/// live catalog and to the web's `CATEGORY_COMMISSION_RATES`.
///
/// The fallback only fires when a Category row omits `commissionRate`, but the
/// backend trusts whatever this client computes, so a wrong rate here quietly
/// mis-prices a listing. It already had: Electronics sat at 0.10 against 0.12
/// live and on the web.
void main() {
  /// Every rate on `apidev` as of 2026-09-04. Re-check this against
  /// `GET /api/v1/products/categories` when the catalog changes.
  const liveRates = <String, double>{
    'Electronics': 0.12,
    'Food & Groceries': 0.10,
    'Art & Crafts': 0.12,
    'Beauty & Personal Care': 0.12,
    'Books & Media': 0.10,
    'Clothing': 0.12,
    'Decorations': 0.12,
    'Furniture': 0.10,
    'Garden & Outdoors': 0.10,
    'Home & Kitchen Appliances': 0.08,
    'Other': 0.10,
    'Pet & Supplies': 0.10,
    'Real Estate': 0.08,
    'Sports & Games': 0.10,
    'Vehicle & Supplies': 0.06,
  };

  group('category commission fallbacks match the live catalog', () {
    liveRates.forEach((category, rate) {
      test('$category is $rate', () {
        expect(categoryCommissionRateFor(category), rate);
      });
    });
  });

  group('name normalisation', () {
    test('is case and punctuation insensitive', () {
      expect(categoryCommissionRateFor('ELECTRONICS'), 0.12);
      expect(categoryCommissionRateFor('vehicle & supplies'), 0.06);
      expect(categoryCommissionRateFor('Vehicle and Supplies'), 0.06);
      expect(categoryCommissionRateFor('  Real   Estate  '), 0.08);
    });

    test('accepts the aliases the catalog has used', () {
      expect(categoryCommissionRateFor('Vehicles'), 0.06);
      expect(categoryCommissionRateFor('Pet Supplies'), 0.10);
      expect(categoryCommissionRateFor('Others'), 0.10);
    });

    test('an unknown category falls back to 10%', () {
      expect(categoryCommissionRateFor('Spaceships'), 0.10);
      expect(categoryCommissionRateFor(''), 0.10);
    });

    test('an ampersand without surrounding spaces normalizes like the web', () {
      // Web does `.replace(/&/g,'and')` with no added spaces, so 'A&B' ->
      // 'aandb' (no table key -> 0.10 default). Mobile used to insert a space
      // ('a and b'), which could hit the wrong fallback key (BIZLOG-15).
      expect(normalizeCategoryName('Art&Crafts'), 'artandcrafts');
      expect(categoryCommissionRateFor('Art&Crafts'), 0.10);
      expect(categoryCommissionRateFor('A&B'), 0.10);
      // Space-separated ampersands still reach their table rows.
      expect(categoryCommissionRateFor('Art & Crafts'), 0.12);
      expect(categoryCommissionRateFor('Food & Groceries'), 0.10);
    });
  });

  group('the rate reaches the price', () {
    // A wrong fallback is only dangerous because it moves the buyer price, so
    // pin that the 0.10 → 0.12 correction actually changes what a buyer pays.
    const calculator = CommissionCalculator();

    test('Electronics now prices off 12%, not 10%', () {
      final atTwelve = calculator.priceForPayout(100000, 0.12);
      final atTen = calculator.priceForPayout(100000, 0.10);
      expect(atTwelve, greaterThan(atTen));
      expect(calculator.priceForPayout(100000, categoryCommissionRateFor('Electronics')),
          atTwelve);
    });
  });
}
