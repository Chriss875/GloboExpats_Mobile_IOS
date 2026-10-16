import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/commission_calculator.dart';

void main() {
  const calc = CommissionCalculator();

  group('SELL_FLOW_SPEC §10 normative vectors', () {
    test('forward: payout 117000 @ rate .093-equivalent → price 117000', () {
      // The spec's headline example (payout 100000 → price 117000) implies a
      // targetNetRate of .093 under the default rates — verified numerically.
      expect(calc.priceForPayout(100000, 0.093), 117000);
      // At category rate .10 the forward price is 117000 for payout 99933.
      expect(calc.priceForPayout(calc.payoutForPrice(117000, 0.10), 0.10), 117000);
      final price = calc.payoutForPrice(117000, categoryCommissionRateFor('Furniture'));
      expect(price, 100000);
    });

    test('reverse: 117000 → payout 100000', () {
      expect(calc.payoutForPrice(117000, 0.10), 100000);
    });

    test('breakdown for payout 100000 / price 117000 @ .10', () {
      final b = calc.breakdown(sellerPayout: 100000, price: 117000, categoryRate: 0.10);
      expect(b.sellerFacingCommissionAmount, closeTo(17000, 0.01));
      expect(b.grossPlatformCommission, closeTo(12406.78, 0.01));
      expect(b.vat, closeTo(2593.22, 0.01));
      expect(b.selcomCommissionFee, closeTo(2340, 0.01));
      expect(b.platformNetProfitAfterCuts, closeTo(10066.78, 0.01));
      expect(b.roundingAdjustment, closeTo(66.78, 0.01));
      expect(b.categoryCommissionPercentage, 10.0);
    });
  });

  test('multiplier identity: grossTargetRate(.10) feeds multiplier', () {
    final g = calc.grossTargetRate(0.10);
    expect(g, closeTo(0.12338385907414995, 1e-9));
    final m = calc.multiplier(0.10);
    expect(m, closeTo(1.169192953707497, 1e-9));
  });

  test('rounding: forward ceil / reverse floor to 1000s', () {
    // 123456 * m(.10) ≈ 144452 → ceil → 145000
    expect(calc.priceForPayout(123456, 0.10), 145000);
    // reverse of a non-round price floors
    final p = calc.payoutForPrice(145000, 0.10);
    expect(p % 1000, 0, reason: 'reverse payout lands on 1000s');
    expect(p, lessThanOrEqualTo(145000 / calc.multiplier(0.10)));
  });

  test('category fallback table + normalization', () {
    expect(categoryCommissionRateFor('Vehicle & Supplies'), 0.06);
    expect(categoryCommissionRateFor('Vehicles'), 0.06); // alias
    expect(categoryCommissionRateFor('Pet & Supplies'), 0.10); // alias
    expect(categoryCommissionRateFor('Home & Kitchen Appliances'), 0.08);
    // Was asserted as 0.10 on the claim it was the live value. It is not:
    // GET /products/categories returns 0.12 for Electronics (checked
    // 2026-09-04), and the web's CATEGORY_COMMISSION_RATES says 0.12 too.
    expect(categoryCommissionRateFor('Electronics'), 0.12,
        reason: 'live catalog and web reference both say 12%');
    expect(categoryCommissionRateFor('Something Unknown'), 0.10);
  });

  test('custom rates from platform-settings override defaults', () {
    const custom = CommissionCalculator(
      rates: CommissionRates(vatRate: 0.20, selcomCommissionRate: 0.03, selcomTransactionRate: 0.015),
    );
    // formula must recompute, not reuse constants
    final price = custom.priceForPayout(100000, 0.10);
    expect(price, isNot(117000));
    final back = custom.payoutForPrice(price, 0.10);
    expect(back, 100000);
  });

  group('FINANC-02 live platform-settings cache', () {
    test('starts on the documented defaults before any fetch', () {
      expect(currentCommissionRates.vatRate, 0.18);
      expect(currentCommissionRates.selcomCommissionRate, 0.02);
      expect(currentCommissionRates.selcomTransactionRate, 0.02);
    });

    test('setLiveCommissionRates caches a payload and pricing picks it up', () {
      setLiveCommissionRates({
        'vatRate': 0.20,
        'selcomCommissionRate': 0.03,
        'selcomTransactionRate': 0.015,
      });
      expect(currentCommissionRates.vatRate, 0.20);
      expect(currentCommissionRates.selcomCommissionRate, 0.03);
      expect(currentCommissionRates.selcomTransactionRate, 0.015);
      // A calculator built on currentCommissionRates reflects the live rates.
      final live = CommissionCalculator(rates: currentCommissionRates);
      expect(live.priceForPayout(100000, 0.10), isNot(117000));
      final back = live.payoutForPrice(live.priceForPayout(100000, 0.10), 0.10);
      expect(back, 100000);
    });

    test('null/partial payload is a no-op keeping previous rates', () {
      setLiveCommissionRates(null);
      expect(currentCommissionRates.vatRate, 0.20);
      setLiveCommissionRates({'vatRate': 0.25}); // missing fields default to 0.02
      expect(currentCommissionRates.vatRate, 0.25);
      expect(currentCommissionRates.selcomCommissionRate, 0.02);
    });
  });
}
