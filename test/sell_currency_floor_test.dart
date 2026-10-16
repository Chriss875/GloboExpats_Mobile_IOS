import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/currency.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';

/// "in money when i change currency example dollar it still use logic of the
/// tsh it tellss minimum price to not be less than 1000".
///
/// The platform floor is TSh 1,000. The seller types in whichever currency
/// they picked, so the floor can only be judged on the CONVERTED amount —
/// the old check compared the typed figure straight against 1000.
void main() {
  /// A form filled in far enough that step 3 turns on the price checks.
  SellFormState priced({required String currency, required double amount}) {
    final s = SellFormState()
      ..currency = currency
      ..price = amount
      ..sellerPayout = amount;
    return s;
  }

  group('the TSh 1,000 floor', () {
    test('reads a dollar price as the shillings it is worth', () {
      // $50 is about TSh 131,000. The seller was told it was under TSh 1,000.
      expect(meetsListingFloor(50, 'USD'), isTrue);
      expect(priced(currency: 'USD', amount: 50).validateStep(3),
          isNot(contains('at least')));
    });

    test('still catches an amount that is genuinely below it', () {
      // UGX 1,000 converts to about TSh 714 — over the raw number, under the
      // floor. The typed figure alone cannot tell these two cases apart.
      expect(meetsListingFloor(1000, 'UGX'), isFalse);
      expect(priced(currency: 'UGX', amount: 1000).validateStep(3),
          contains('at least'));
      expect(meetsListingFloor(0.10, 'USD'), isFalse);
    });

    test('is unchanged for a seller pricing in shillings', () {
      expect(meetsListingFloor(1000, 'TZS'), isTrue);
      expect(meetsListingFloor(999, 'TZS'), isFalse);
      expect(listingFloorLabel('TZS'), 'TSh 1,000');
    });

    test('quotes the floor in the currency being typed in', () {
      // "must be at least TSh 1,000" is not actionable while typing dollars.
      final label = listingFloorLabel('USD');
      expect(label, startsWith('TSh 1,000'));
      expect(label, contains(r'$ 0.38'));
    });
  });
}
