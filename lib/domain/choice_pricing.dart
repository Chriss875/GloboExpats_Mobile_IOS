/// Buyer price for a listing once choices (and rental dates) are picked —
/// web parity with the pricing block of
/// `components/product-choices/product-choice-selector.tsx`.
///
/// Price maths is a critical area: this only re-expresses the web's
/// `unitSellingPrice` / rental `sellerUnitRate` through the existing port of
/// `lib/commission.ts`, with the listing's own rate snapshot.
library;

import '../models/product_detail.dart';
import 'commission_calculator.dart';

/// Sum of the seller-payout adjustments of the values that will be recorded
/// on the line (web `getSelectedSellerPayoutAdjustment`).
double selectedSellerPayoutAdjustment(
    ProductDetail d, List<SelectedChoice> choices) {
  var total = 0.0;
  for (final choice in choices) {
    for (final attribute in d.choiceAttributes) {
      if (attribute.definitionId != choice.definitionId) continue;
      for (final value in attribute.activeValues) {
        if (value.id == choice.valueId) total += value.sellerPayoutAdjustment;
      }
    }
  }
  return total;
}

CommissionCalculator _calculatorFor(ProductDetail d) {
  final defaults = currentCommissionRates;
  return CommissionCalculator(
    rates: CommissionRates(
      vatRate: d.vatRate ?? defaults.vatRate,
      selcomCommissionRate:
          d.selcomCommissionRate ?? defaults.selcomCommissionRate,
      selcomTransactionRate:
          d.selcomTransactionRate ?? defaults.selcomTransactionRate,
    ),
  );
}

/// Web `categoryCommissionRate`: the listing's snapshot percentage when it
/// has one, else the category fallback table.
double _targetNetRate(ProductDetail d) {
  final percentage = d.categoryCommissionPercentage;
  if (percentage != null && percentage.isFinite) {
    return percentage < 0 ? 0 : percentage / 100;
  }
  return categoryCommissionRateFor(d.categoryName ?? 'Others');
}

/// What the seller receives at the listing's base price.
double _baseSellerPayout(ProductDetail d) {
  final stored = d.sellerPayout;
  if (stored != null && stored > 0) return stored;
  return _calculatorFor(d)
      .payoutForPrice(d.productAskingPrice, _targetNetRate(d));
}

/// Price the buyer pays for one unit with [adjustment] applied. No
/// adjustment means the listing price, untouched.
double unitSellingPriceFor(ProductDetail d, double adjustment) {
  if (adjustment == 0) return d.productAskingPrice;
  return _calculatorFor(d)
      .priceForPayout(_baseSellerPayout(d) + adjustment, _targetNetRate(d));
}

/// The seller's rate per rental period (web `sellerUnitRate`): the stored
/// payout plus the adjustment, or the payout implied by the selling rate.
double sellerUnitRateFor(
    ProductDetail d, double adjustment, double unitSellingPrice) {
  final stored = d.sellerPayout;
  if (stored != null && stored > 0) return stored + adjustment;
  return _calculatorFor(d)
      .payoutForPrice(unitSellingPrice, _targetNetRate(d));
}
