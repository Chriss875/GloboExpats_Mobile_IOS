import 'package:flutter/foundation.dart' show Uint8List;
import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/currency.dart';
import 'package:globoexpats_mobile/domain/listing_submit_utils.dart';
import 'package:globoexpats_mobile/domain/product_choices.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';

SellFormState _ready() {
  final s = SellFormState();
  s.setCategory(id: 1, name: 'Electronics', commissionRate: 0.10);
  s.title = 'Phone';
  s.setDescription('A phone');
  s.addImage('a.webp', Uint8List(4));
  s.setLocationFromAddress(
    addressId: 1, region: 'Dar', country: 'Tanzania', streetName: 'St',
    lat: -6.7892, lng: 39.2887,
  );
  return s;
}

void main() {
  group('production time (web parity ProductionTimeSelector)', () {
    test('a non-whole or out-of-range value blocks Step 2', () {
      final s = _ready()..setRequiresProductionTime(true);
      expect(s.validateStep(2), contains('whole number between 1 and 365'));
      s.setProductionTimeDays('0');
      expect(s.validateStep(2), contains('whole number between 1 and 365'));
      s.setProductionTimeDays('366');
      expect(s.validateStep(2), contains('whole number between 1 and 365'));
      s.setProductionTimeDays('5');
      expect(s.validateStep(2), isNull);
    });

    test('turning the switch off clears the day count so it cannot ride along', () {
      final s = _ready()
        ..setRequiresProductionTime(true)
        ..setProductionTimeDays('5')
        ..setRequiresProductionTime(false);
      expect(s.productionTimeDays, '');
      s.setPricingAmount(100000, forward: true);
      final j = s.buildProductJson();
      expect(j['requiresProductionTime'], isFalse);
      expect(j['productionTimeDays'], isNull);
    });

    test('a rental never carries a prep period even if one was set', () {
      final s = _ready()
        ..setRequiresProductionTime(true)
        ..setProductionTimeDays('5')
        ..setRental(const RentalConfiguration(
            enabled: true, listingType: 'FOR_RENT', ratePeriod: 'DAY'));
      s.setPricingAmount(100000, forward: true);
      final j = s.buildProductJson();
      expect(j['requiresProductionTime'], isFalse);
      expect(j['productionTimeDays'], isNull);
    });
  });

  group('item age (web parity appendItemAgeToDescription)', () {
    test('is hidden until a non-new condition is configured', () {
      final s = _ready();
      expect(s.showItemAge, isFalse);
      s.setChoiceConfiguration(const ProductChoiceConfiguration(hasChoices: true, attributes: [
        ProductChoiceAttribute(
          definitionId: 1, name: 'Condition', inputType: AttributeInputType.buttons,
          required: false, visual: false,
          values: [ProductChoiceValue(id: 'new', label: 'New')],
        ),
      ]));
      expect(s.showItemAge, isFalse, reason: 'a brand-new item has no age to report');
      s.setChoiceConfiguration(const ProductChoiceConfiguration(hasChoices: true, attributes: [
        ProductChoiceAttribute(
          definitionId: 1, name: 'Condition', inputType: AttributeInputType.buttons,
          required: false, visual: false,
          values: [ProductChoiceValue(id: 'used', label: 'Good')],
        ),
      ]));
      expect(s.showItemAge, isTrue);
    });

    test('folds into the description under a SPECIFICATIONS block, not its own field', () {
      final s = _ready()
        ..setChoiceConfiguration(const ProductChoiceConfiguration(hasChoices: true, attributes: [
          ProductChoiceAttribute(
            definitionId: 1, name: 'Condition', inputType: AttributeInputType.buttons,
            required: false, visual: false,
            values: [ProductChoiceValue(id: 'used', label: 'Good')],
          ),
        ]))
        ..setItemAge('2 years');
      s.setPricingAmount(100000, forward: true);
      final j = s.buildProductJson();
      expect(j['productDescription'], contains('--- SPECIFICATIONS ---'));
      expect(j['productDescription'], contains('Item Age: 2 years'));
      expect(j.containsKey('itemAge'), isFalse);
    });

    test('a new item never gets an age line even if one was typed', () {
      expect(appendItemAgeToDescription('d', '2 years', 'New'), 'd');
      expect(isNewProductCondition('new'), isTrue);
      expect(isNewProductCondition('Like New'), isFalse);
    });
  });

  group('currency (web parity handleCurrencyChange / askingPriceInTZS)', () {
    test('switching re-denominates what is already typed', () {
      final s = _ready()..setPricingAmount(100000, forward: true);
      final tzsPrice = s.price;
      s.setCurrency('USD');
      // 1 TZS = 0.00038 USD
      expect(s.price, closeTo(tzsPrice * 0.00038, 0.01));
      expect(s.currency, 'USD');
    });

    test('the payload always stores TZS regardless of the typed currency', () {
      final tzs = _ready()..setPricingAmount(100000, forward: true);
      final tzsJson = tzs.buildProductJson();

      final usd = _ready()..setPricingAmount(100000, forward: true);
      usd.setCurrency('USD'); // same underlying value, typed in USD
      final usdJson = usd.buildProductJson();

      expect(usdJson['currency'], 'TZS');
      // Round-tripping through a currency must not move the stored amount.
      expect((usdJson['sellerPayout'] as double),
          closeTo(tzsJson['sellerPayout'] as double, 1));
      expect((usdJson['askingPrice'] as double),
          closeTo(tzsJson['askingPrice'] as double, 1));
    });

    test('commission is derived from the TZS amounts, not the typed currency', () {
      // Deriving commission in USD then converting would collapse to pennies
      // and round to nothing - this pins the order of operations.
      final s = _ready()..setPricingAmount(100000, forward: true);
      s.setCurrency('USD');
      final j = s.buildProductJson();
      expect(j['sellerFacingCommissionAmount'] as double, greaterThan(1000));
    });

    test('formatMoney uses each currency symbol and decimals', () {
      expect(formatMoney(1234, 'TZS'), 'TSh 1,234');
      expect(formatMoney(1234.5, 'USD'), '\$ 1,234.50');
    });
  });
}
