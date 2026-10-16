import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';

/// Phase 1, unit 2: the sell wizard can now create a rental — and therefore a
/// short stay — which it previously could not. `SellFormState` already carried
/// a `rentalConfiguration` and shipped it in the payload, but nothing ever
/// enabled it: `setRental` had no callers, so every mobile listing went out as
/// an ordinary sale.
void main() {
  SellFormState shortStay() {
    final state = SellFormState()
      ..setCategory(id: 1, name: 'Real Estate', slug: 'real-estate')
      ..setSubcategory(45, slug: 'short-stays-holiday-rentals');
    return state;
  }

  group('the subcategory decides it is a rental', () {
    test('a short stay becomes a nightly rental', () {
      final state = shortStay();

      expect(state.isRental, isTrue);
      expect(state.rentalConfiguration.ratePeriod, 'NIGHT');
      // The reference keeps FOR_RENT for short stays; the nightly period is
      // what distinguishes them.
      expect(state.rentalConfiguration.listingType, 'FOR_RENT');
    });

    test('a house is monthly and a hire car is daily', () {
      final house = SellFormState()
        ..setCategory(id: 1, name: 'Real Estate', slug: 'real-estate')
        ..setSubcategory(39, slug: 'houses-for-rent');
      expect(house.rentalConfiguration.ratePeriod, 'MONTH');

      final car = SellFormState()
        ..setCategory(id: 2, name: 'Vehicle & Supplies', slug: 'vehicle-supplies')
        ..setSubcategory(151, slug: 'cars-for-rent');
      expect(car.rentalConfiguration.ratePeriod, 'DAY');
    });

    test('an ordinary subcategory stays a sale', () {
      final state = SellFormState()
        ..setCategory(id: 3, name: 'Electronics', slug: 'electronics')
        ..setSubcategory(1, slug: 'mobile-phones');

      expect(state.isRental, isFalse);
      // Web sends `rentalConfiguration: null` for a sale rather than omitting
      // the key, and the backend DTO field is nullable — the key must exist.
      final json = state.buildProductJson();
      expect(json.containsKey('rentalConfiguration'), isTrue);
      expect(json['rentalConfiguration'], isNull);
    });

    test('moving off a rental subcategory clears the rental', () {
      final state = shortStay();
      expect(state.isRental, isTrue);

      state.setSubcategory(2, slug: 'land-plots');
      expect(state.isRental, isFalse);
    });

    test('changing category clears a rental picked under the old one', () {
      final state = shortStay();
      state.setCategory(id: 3, name: 'Electronics', slug: 'electronics');

      expect(state.isRental, isFalse);
      expect(state.subcategoryId, isNull);
    });
  });

  group('what a rental listing implies', () {
    test('it is single-unit and never ships through platform logistics', () {
      final state = SellFormState()
        ..setQuantity(7)
        ..setCategory(id: 1, name: 'Real Estate', slug: 'real-estate')
        ..setSubcategory(45, slug: 'short-stays-holiday-rentals');

      expect(state.quantity, 1);
      expect(state.transportMode, isNull);
      expect(state.buildProductJson()['productQuantity'], 1);
    });

    test('the payload carries the rental configuration', () {
      final json = shortStay().buildProductJson();
      final config = json['rentalConfiguration'] as Map<String, dynamic>;

      expect(config['enabled'], isTrue);
      expect(config['listingType'], 'FOR_RENT');
      expect(config['ratePeriod'], 'NIGHT');
    });

    test('the seller can correct the rate period', () {
      final state = shortStay()..setRatePeriod('WEEK');
      expect(state.rentalConfiguration.ratePeriod, 'WEEK');
      expect(state.rentalConfiguration.enabled, isTrue);

      // …but not on a listing that is not a rental at all.
      final sale = SellFormState()
        ..setCategory(id: 3, name: 'Electronics', slug: 'electronics')
        ..setSubcategory(1, slug: 'mobile-phones')
        ..setRatePeriod('WEEK');
      expect(sale.isRental, isFalse);
    });
  });

  test('a restored draft is still a rental', () {
    final draft = shortStay().toDraftJson();

    final restored = SellFormState()..restoreFromDraft(draft);
    expect(restored.subcategorySlug, 'short-stays-holiday-rentals');
    expect(restored.isRental, isTrue);
    expect(restored.rentalConfiguration.ratePeriod, 'NIGHT');
  });
}
