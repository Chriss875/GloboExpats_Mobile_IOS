// Short stays on the web (2026-10, uncommitted web + backend V151-V153):
// minimum stays, a SHORT_STAY booking, guest/host booking stages, and the
// location + dates search. Ports of lib/rentals.ts, lib/stay-search.ts,
// lib/property-listing.ts and lib/rental-order-presentation.ts.
import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/product_choices.dart';
import 'package:globoexpats_mobile/domain/rentals.dart';
import 'package:globoexpats_mobile/domain/stay_listing.dart';
import 'package:globoexpats_mobile/models/order.dart';

void main() {
  group('minimum stays', () {
    const stay = RentalConfiguration(
        ratePeriod: RentalRatePeriod.night, shortStay: true, minimumNights: 3);

    test('a stay shorter than the host allows is refused', () {
      expect(
          () => buildRentalBooking(
              stay, DateTime(2026, 11, 1), DateTime(2026, 11, 3),
              sellerUnitRate: 50000, sellingUnitRate: 60000),
          throwsA(isA<ArgumentError>().having(
              (e) => e.message, 'message', 'Choose at least 3 nights.')));
    });

    test('a long-enough stay is booked as SHORT_STAY', () {
      final b = buildRentalBooking(
          stay, DateTime(2026, 11, 1), DateTime(2026, 11, 4),
          sellerUnitRate: 50000, sellingUnitRate: 60000);
      expect(b.listingType, 'SHORT_STAY');
      expect(b.billableUnits, 3);
      expect(b.sellingTotal, 180000);
      expect(b.isShortStay, isTrue);
    });

    test('monthly lets count calendar months', () {
      const monthly = RentalConfiguration(
          ratePeriod: RentalRatePeriod.month, minimumMonths: 2);
      expect(
          () => buildRentalBooking(
              monthly, DateTime(2026, 1, 31), DateTime(2026, 3, 30),
              sellerUnitRate: 1, sellingUnitRate: 1),
          throwsA(isA<ArgumentError>()),
          reason: 'Jan 31 + 2 months is Mar 31');
      expect(
          buildRentalBooking(monthly, DateTime(2026, 1, 31), DateTime(2026, 3, 31),
                  sellerUnitRate: 1, sellingUnitRate: 1)
              .listingType,
          'FOR_RENT');
    });

    test('the booking sheet says the rule', () {
      expect(stay.minimumStayLabel, 'Minimum stay: 3 nights');
      expect(
          const RentalConfiguration(ratePeriod: RentalRatePeriod.day)
              .minimumStayLabel,
          isNull,
          reason: 'a one-day minimum is not worth saying');
    });

    test('the listing payload carries the rule', () {
      final c = RentalConfiguration.fromJson({
        'ratePeriod': 'WEEK',
        'shortStay': true,
        'minimumNights': '5',
      })!;
      expect(c.isShortStay, isTrue);
      expect(c.minimumNights, 5);
      expect(getDefaultRentalConfiguration(
              'real-estate', shortStaySubcategorySlug)!
          .shortStay, isTrue);
    });
  });

  test('only an all-stay checkout is a stay checkout', () {
    final stay = {'listingType': 'SHORT_STAY', 'ratePeriod': 'NIGHT'};
    final car = {'listingType': 'FOR_RENT', 'ratePeriod': 'DAY'};
    expect(isShortStayCheckout([stay]), isTrue);
    expect(isShortStayCheckout([stay, car]), isFalse);
    expect(isShortStayCheckout([stay, null]), isFalse,
        reason: 'a product line keeps the delivery address');
    expect(isShortStayCheckout(const []), isFalse);
  });

  group('booking stages', () {
    RentalPresentation stayOf() => RentalPresentation(RentalKind.property, {
          'listingType': 'SHORT_STAY',
          'ratePeriod': 'NIGHT',
          'startDate': '2026-11-01',
          'endDate': '2026-11-04',
          'pickupTime': '2:00 PM',
          'returnTime': '10:00 AM',
        });

    test('a stay reads in guest and host terms', () {
      final r = stayOf();
      expect(r.isShortStay, isTrue);
      expect(r.orderNoun, 'Booking');
      expect(r.startStepLabel, 'Check-in');
      expect(r.stageLabel('PAID'), 'Awaiting host confirmation');
      expect(r.stageLabel('PENDING'), 'Payment under review');
      expect(r.stageLabel('COMPLETED'), 'Stay completed');
    });

    test('check-in and checkout follow the clock in Dar es Salaam', () {
      final r = stayOf();
      // 2:00 PM EAT on 1 Nov = 11:00 UTC.
      expect(r.startAt, DateTime.utc(2026, 11, 1, 11));
      expect(r.stageLabel('AWAITING_PICKUP', now: DateTime.utc(2026, 11, 1, 10)),
          'Check-in scheduled');
      expect(r.stageLabel('AWAITING_PICKUP', now: DateTime.utc(2026, 11, 1, 12)),
          'Awaiting check-in confirmation');
      expect(r.stageLabel('PICKED_UP', now: DateTime.utc(2026, 11, 2)),
          'Stay in progress');
      expect(r.stageLabel('PICKED_UP', now: DateTime.utc(2026, 11, 4, 8)),
          'Completing stay',
          reason: 'past 10:00 AM EAT checkout');
    });

    test('a car hire keeps its own words', () {
      final r = RentalPresentation(RentalKind.vehicle,
          {'ratePeriod': 'NIGHT', 'startDate': '2026-11-01'});
      expect(r.isShortStay, isFalse, reason: 'vehicles are never stays');
      expect(r.startStepLabel, 'Rental pickup');
      expect(r.stageLabel('AWAITING_SELLER_CONFIRMATION'),
          'Awaiting rental confirmation');
    });

    test('the order carries the host phone and the property pin', () {
      final o = Order.fromJson({
        'orderId': 'o-1',
        'sellerPhone': '+255700000001',
        'rentalHandoffCodeAttempts': 3,
        'sellerPickupPlaceName': 'Sea View Flat',
        'sellerPickupCity': 'Dar es Salaam',
        'sellerPickupLatitude': -6.8,
        'sellerPickupLongitude': 39.28,
      });
      expect(o.sellerPhone, '+255700000001');
      expect(o.rentalHandoffCodeAttempts, 3);
      expect(o.rentalLocation!.label, 'Sea View Flat · Dar es Salaam');
      expect(o.rentalLocation!.mapUrl, contains('query=-6.8,39.28'));
    });
  });

  group('stay search', () {
    final now = DateTime.utc(2026, 10, 9, 22); // 10 Oct in Dar es Salaam

    test('today is the operating zone’s date', () {
      expect(staySearchToday(now), '2026-10-10');
    });

    test('dates are optional, but both, future and in order', () {
      expect(validateStayDates(StayDates.none, now: now), isNull);
      expect(
          validateStayDates(const StayDates(startDate: '2026-10-12'), now: now),
          'Choose both check-in and checkout dates.');
      expect(
          validateStayDates(
              const StayDates(startDate: '2026-10-09', endDate: '2026-10-12'),
              now: now),
          'Check-in cannot be in the past.');
      expect(
          validateStayDates(
              const StayDates(startDate: '2026-10-12', endDate: '2026-10-12'),
              now: now),
          'Checkout must be after check-in.');
      expect(
          validateStayDates(
              const StayDates(startDate: '2026-02-30', endDate: '2026-03-02'),
              now: now),
          'Choose valid dates.');
    });

    test('a link with bad dates reads as no dates', () {
      expect(readStayDates({'checkIn': '2026-10-12'}, now: now), StayDates.none);
      expect(
          readStayDates({'checkIn': '2026-10-12', 'checkOut': '2026-10-15'},
                  now: now)
              .query,
          {'checkIn': '2026-10-12', 'checkOut': '2026-10-15'});
    });
  });

  group('listing a property', () {
    ProductChoiceAttribute attr(String name, List<String> labels) =>
        ProductChoiceAttribute(
          definitionId: name.length,
          name: name,
          inputType: AttributeInputType.values.first,
          required: false,
          visual: false,
          allowDifferentPrices: false,
          values: [
            for (final l in labels) ProductChoiceValue(id: l, label: l),
          ],
        );

    test('a short stay must state each detail exactly once', () {
      final config = ProductChoiceConfiguration(hasChoices: true, attributes: [
        attr('Property Type', ['Villa']),
        attr('Bedrooms', ['2']),
        attr('Bathrooms', ['1', '2']),
        attr('Number of allowed Guests', ['4 Guests']),
        attr('Check-in time', ['2:00 PM']),
      ]);
      expect(missingStayDetails(config, shortStaySubcategorySlug),
          ['Bathrooms', 'Checkout time']);
    });

    test('an apartment needs no property type, a room no bedrooms', () {
      expect(stayDetailsForSubcategory('apartments-for-rent'),
          isNot(contains('Property Type')));
      expect(stayDetailsForSubcategory('rooms-shared-housing'),
          isNot(contains('Bedrooms')));
    });

    test('guest count and times are for stays only', () {
      expect(
          hiddenPropertyDetailKeys(
              const RentalConfiguration(ratePeriod: RentalRatePeriod.month)),
          contains('Check-in time'));
      expect(
          hiddenPropertyDetailKeys(const RentalConfiguration(
              ratePeriod: RentalRatePeriod.night, shortStay: true)),
          isEmpty);
      expect(stayCountOptions('Number of allowed Guests').first, '1 Guest');
      expect(stayCountOptions('Bedrooms').last, '10+');
    });
  });
}
