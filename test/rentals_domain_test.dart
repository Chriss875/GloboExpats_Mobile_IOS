import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/rentals.dart';

/// Phase 1, unit 1: the half of `lib/rentals.ts` that had no Dart port —
/// category-driven rental detection, wire dates, availability and blocks — plus
/// the hourly billing maths, which the mobile app had been getting wrong.
void main() {
  group('hourly billing (price maths — critical area)', () {
    const hourly = RentalConfiguration(ratePeriod: RentalRatePeriod.hour);
    final jan1 = DateTime(2026, 1, 1);

    RentalBooking book(DateTime end, {String? pickup, String? ret}) =>
        buildRentalBooking(hourly, jan1, end,
            sellerUnitRate: 1000,
            sellingUnitRate: 1200,
            pickupTime: pickup,
            returnTime: ret);

    test('bills the real elapsed hours, not a flat day', () {
      // 9:00 AM to 5:00 PM on one day is 8 hours. This used to bill 1.
      final b = book(jan1, pickup: '9:00 AM', ret: '5:00 PM');
      expect(b.billableUnits, 8);
      expect(b.sellerTotal, 8000);
      expect(b.sellingTotal, 9600);
    });

    test('counts hours across a day boundary', () {
      // 10:00 PM to 6:00 AM the next morning is 8 hours, not 24.
      final b = book(DateTime(2026, 1, 2), pickup: '10:00 PM', ret: '6:00 AM');
      expect(b.billableUnits, 8);
    });

    test('rounds a part hour up', () {
      final b = book(jan1, pickup: '9:00 AM', ret: '10:30 AM');
      expect(b.billableUnits, 2);
    });

    test('refuses to guess when the times are missing', () {
      expect(() => book(jan1), throwsA(isA<ArgumentError>()));
    });

    test('refuses a return that is not after the pickup', () {
      expect(() => book(jan1, pickup: '5:00 PM', ret: '9:00 AM'),
          throwsA(isA<ArgumentError>()));
    });

    test('refuses times it cannot read', () {
      expect(() => book(jan1, pickup: '17:00', ret: '18:00'),
          throwsA(isA<ArgumentError>()));
    });
  });

  group('monthly billing uses the web calendar cursor-walk', () {
    RentalBooking book(DateTime start, DateTime end) =>
        buildRentalBooking(const RentalConfiguration(ratePeriod: RentalRatePeriod.month),
            start, end, sellerUnitRate: 1, sellingUnitRate: 1);

    test('the web case: Jan 31 -> Mar 1 is 2 months (clamped anniversary)', () {
      // Mirrors web tests/rentals.test.ts 'rounds partial weeks and calendar
      // months up'. The Feb anniversary of the 31st clamps to Feb 28.
      expect(book(DateTime(2026, 1, 31), DateTime(2026, 3, 1)).billableUnits, 2);
    });

    test('month-end start that crosses two month-ends bills 3 (BIZLOG-01)', () {
      // The old arithmetic formula counted Jan 31 -> Mar 30 as 2 months; the
      // web cursor-walk (Jan31 -> Feb28 -> Mar28 -> Apr28) counts 3.
      expect(book(DateTime(2026, 1, 31), DateTime(2026, 3, 30)).billableUnits, 3);
      expect(book(DateTime(2026, 1, 30), DateTime(2026, 3, 30)).billableUnits, 3);
    });

    test('mid-month ranges are unchanged by the walk', () {
      // Under a full month is refused since the web's minimum-stay rule
      // (2026-10): the shortest monthly let is one calendar month.
      expect(() => book(DateTime(2026, 1, 15), DateTime(2026, 2, 14)),
          throwsArgumentError);
      expect(book(DateTime(2026, 1, 15), DateTime(2026, 2, 15)).billableUnits, 1);
      expect(book(DateTime(2026, 1, 15), DateTime(2026, 3, 15)).billableUnits, 2);
    });

    test('a leap-year February anniversary clamps to the 29th', () {
      // 2024 is a leap year: Jan 31 -> Feb 29 -> Mar 29 -> Apr 29 = 3.
      expect(book(DateTime(2024, 1, 31), DateTime(2024, 4, 1)).billableUnits, 3);
      // Same range in a common year (Feb 28) still bills 3: Feb28 -> Mar28 -> Apr28.
      expect(book(DateTime(2026, 1, 31), DateTime(2026, 4, 1)).billableUnits, 3);
    });

    test('end exactly on the start-day anniversary matches the web walk', () {
      // Jan 31 -> Feb 28 (common year) is one clamped anniversary, not two.
      expect(book(DateTime(2026, 1, 31), DateTime(2026, 2, 28)).billableUnits, 1);
      // Jan 31 -> Mar 31 bills 3 on the web too: Jan31 -> Feb28 -> Mar28, and
      // Mar 28 is still before Mar 31 so the walk steps on to Apr 28. The
      // arithmetic formula (2) undercounts because the Feb anniversary clamps
      // to the 28th; parity means matching the cursor walk.
      expect(book(DateTime(2026, 1, 31), DateTime(2026, 3, 31)).billableUnits, 3);
    });
  });

  group('rental detection by subcategory', () {
    test('short stays are nightly', () {
      final config = getDefaultRentalConfiguration(
          'real-estate', shortStaySubcategorySlug);
      expect(config, isNotNull);
      expect(config!.ratePeriod, RentalRatePeriod.night);
      // The reference keeps FOR_RENT: the rate period is what makes it a
      // short stay, not a separate listing type.
      expect(config.listingType, 'FOR_RENT');
    });

    test('homes are monthly and hire cars are daily', () {
      expect(
          getDefaultRentalConfiguration('real-estate', 'houses-for-rent')!
              .ratePeriod,
          RentalRatePeriod.month);
      expect(
          getDefaultRentalConfiguration('vehicle-supplies', 'cars-for-rent')!
              .ratePeriod,
          RentalRatePeriod.day);
    });

    test('ordinary sales get no rental configuration', () {
      expect(getDefaultRentalConfiguration('electronics', 'mobile-phones'),
          isNull);
      expect(getDefaultRentalConfiguration('vehicle-supplies', 'cars'), isNull);
      expect(getDefaultRentalConfiguration('real-estate', null), isNull);
    });

    test('isRentalListingCategory covers property and hire vehicles only', () {
      expect(isRentalListingCategory('real-estate', 'houses-for-rent'), isTrue);
      expect(isRentalListingCategory('vehicle-supplies', 'cars-for-rent'), isTrue);
      expect(isRentalListingCategory('vehicle-supplies', 'cars'), isFalse);
      expect(isRentalListingCategory('electronics', 'mobile-phones'), isFalse);
      expect(isRentalListingCategory('real-estate', null), isFalse);
    });
  });

  group('dates on the wire', () {
    test('reads an ISO string and a Jackson array alike', () {
      expect(parseRentalDate('2026-01-15'), DateTime(2026, 1, 15));
      expect(parseRentalDate([2026, 1, 15]), DateTime(2026, 1, 15));
    });

    test('returns null rather than a wrong date for junk', () {
      expect(parseRentalDate(null), isNull);
      expect(parseRentalDate('not-a-date'), isNull);
      expect(parseRentalDate([2026, 1]), isNull);
      expect(parseRentalDate([2026, 0, 15]), isNull);
    });

    test('formats for display and for the wire', () {
      expect(formatRentalDate(DateTime(2026, 1, 5)), '05/01/2026');
      expect(rentalDateToJson(DateTime(2026, 1, 5)), '2026-01-05');
    });

    test('calendar day count is nights, and inclusive for hourly', () {
      expect(
          rentalCalendarDayCount(
              startDate: DateTime(2026, 1, 1),
              endDate: DateTime(2026, 1, 4),
              ratePeriod: RentalRatePeriod.night),
          3);
      expect(
          rentalCalendarDayCount(
              startDate: DateTime(2026, 1, 1),
              endDate: DateTime(2026, 1, 1),
              ratePeriod: RentalRatePeriod.hour),
          1);
      // A same-day non-hourly range still shows as one night, never zero.
      expect(
          rentalCalendarDayCount(
              startDate: DateTime(2026, 1, 1),
              endDate: DateTime(2026, 1, 1),
              ratePeriod: RentalRatePeriod.night),
          1);
    });
  });

  group('availability and owner blocks', () {
    test('parses an availability payload with array dates', () {
      final availability = RentalAvailability.fromJson({
        'productId': 42,
        'bookedToday': true,
        'availableFrom': [2026, 2, 1],
        'bookedRanges': [
          {'startDate': '2026-01-10', 'endDate': '2026-01-14'},
          {'startDate': 'rubbish', 'endDate': '2026-01-20'},
        ],
      });

      expect(availability.productId, 42);
      expect(availability.bookedToday, isTrue);
      expect(availability.availableFrom, DateTime(2026, 2, 1));
      // The unreadable range is dropped rather than poisoning the calendar.
      expect(availability.bookedRanges, hasLength(1));
      expect(availability.bookedRanges.first.startDate, DateTime(2026, 1, 10));
    });

    test('a booked range covers its nights but not the checkout day', () {
      final range = RentalDateRange(
          startDate: DateTime(2026, 1, 10), endDate: DateTime(2026, 1, 14));
      expect(range.covers(DateTime(2026, 1, 10)), isTrue);
      expect(range.covers(DateTime(2026, 1, 13)), isTrue);
      expect(range.covers(DateTime(2026, 1, 14)), isFalse);
      expect(range.covers(DateTime(2026, 1, 9)), isFalse);
    });

    test('parses an owner block', () {
      final block = RentalCalendarBlock.fromJson({
        'rentalCalendarBlockId': 7,
        'productId': 42,
        'startDate': [2026, 3, 1],
        'endDate': [2026, 3, 5],
      });
      expect(block, isNotNull);
      expect(block!.rentalCalendarBlockId, 7);
      expect(block.range.covers(DateTime(2026, 3, 4)), isTrue);
      expect(RentalCalendarBlock.fromJson({'productId': 42}), isNull);
    });

    test('overlap catches every way two ranges can collide', () {
      final taken = [
        RentalDateRange(
            startDate: DateTime(2026, 1, 10), endDate: DateTime(2026, 1, 14)),
      ];
      bool clash(int fromDay, int toDay) => rentalRangeOverlaps(
          DateTime(2026, 1, fromDay), DateTime(2026, 1, toDay), taken);

      expect(clash(8, 11), isTrue, reason: 'overlaps the start');
      expect(clash(11, 13), isTrue, reason: 'sits inside');
      expect(clash(13, 16), isTrue, reason: 'overlaps the end');
      expect(clash(8, 20), isTrue, reason: 'swallows it');
      expect(clash(5, 10), isFalse, reason: 'ends as the booking starts');
      expect(clash(14, 18), isFalse, reason: 'starts on the checkout day');
    });
  });
}
