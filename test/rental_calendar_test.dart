// Rules of the buyer's rental calendar — web parity with the helpers in
// components/product-choices/rental-date-range-calendar.tsx.
import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/rental_calendar.dart';
import 'package:globoexpats_mobile/domain/rentals.dart';

void main() {
  final today = DateTime(2026, 9, 27);
  // Nights of Oct 10 and Oct 11 are taken; Oct 12 is free again.
  final booked = [
    RentalDateRange(
        startDate: DateTime(2026, 10, 10), endDate: DateTime(2026, 10, 12)),
  ];

  RentalDateSelection pick(RentalDateSelection s, DateTime d,
          {RentalRatePeriod period = RentalRatePeriod.night}) =>
      chooseRentalDate(s, d,
          today: today,
          ranges: booked,
          period: period,
          allowSameDay: period == RentalRatePeriod.hour);

  group('chooseRentalDate', () {
    test('first tap is check-in, second is checkout', () {
      var s = pick(RentalDateSelection.empty, DateTime(2026, 10, 1));
      expect(s.start, DateTime(2026, 10, 1));
      expect(s.end, isNull);
      expect(s.effectiveStep, RentalSelectionStep.checkout);
      s = pick(s, DateTime(2026, 10, 4));
      expect(s.end, DateTime(2026, 10, 4));
      expect(s.effectiveStep, RentalSelectionStep.done);
    });

    test('past days and booked nights cannot start a stay', () {
      expect(pick(RentalDateSelection.empty, DateTime(2026, 9, 26)).start,
          isNull);
      expect(pick(RentalDateSelection.empty, DateTime(2026, 10, 10)).start,
          isNull);
      // Today is bookable.
      expect(pick(RentalDateSelection.empty, today).start, today);
    });

    test('a checkout over booked nights is refused', () {
      final s = pick(RentalDateSelection.empty, DateTime(2026, 10, 8));
      expect(pick(s, DateTime(2026, 10, 13)).end, isNull);
    });

    test('the first booked day can be the checkout day', () {
      final s = pick(RentalDateSelection.empty, DateTime(2026, 10, 8));
      expect(pick(s, DateTime(2026, 10, 10)).end, DateTime(2026, 10, 10));
      expect(
          isUnavailableDay(DateTime(2026, 10, 10),
              today: today,
              selection: s,
              ranges: booked,
              allowSameDay: false),
          isFalse);
      // …but not before a check-in is chosen.
      expect(
          isUnavailableDay(DateTime(2026, 10, 10),
              today: today,
              selection: RentalDateSelection.empty,
              ranges: booked,
              allowSameDay: false),
          isTrue);
    });

    test('an earlier tap while choosing checkout moves the check-in', () {
      final s = pick(RentalDateSelection.empty, DateTime(2026, 10, 5));
      final moved = pick(s, DateTime(2026, 10, 3));
      expect(moved.start, DateTime(2026, 10, 3));
      expect(moved.end, isNull);
    });

    test('a tap after a complete range starts a new one', () {
      var s = pick(RentalDateSelection.empty, DateTime(2026, 10, 1));
      s = pick(s, DateTime(2026, 10, 3));
      s = pick(s, DateTime(2026, 10, 20));
      expect(s.start, DateTime(2026, 10, 20));
      expect(s.end, isNull);
    });

    test('the checkout summary lets the buyer move only the checkout', () {
      var s = pick(RentalDateSelection.empty, DateTime(2026, 10, 1));
      s = pick(s, DateTime(2026, 10, 3));
      s = pick(s.withStep(RentalSelectionStep.checkout), DateTime(2026, 10, 6));
      expect(s.start, DateTime(2026, 10, 1));
      expect(s.end, DateTime(2026, 10, 6));
    });

    test('hourly hires may return the same day', () {
      final s = pick(RentalDateSelection.empty, DateTime(2026, 10, 2),
          period: RentalRatePeriod.hour);
      final same =
          pick(s, DateTime(2026, 10, 2), period: RentalRatePeriod.hour);
      expect(same.end, DateTime(2026, 10, 2));
    });
  });

  group('week and month lengths', () {
    test('a monthly start fills a one-month checkout automatically', () {
      final s = pick(RentalDateSelection.empty, DateTime(2026, 11, 1),
          period: RentalRatePeriod.month);
      expect(s.end, DateTime(2026, 12, 1));
    });

    test('month ends clamp like the web (Jan 31 → Feb 28)', () {
      expect(endDateForPeriods(DateTime(2027, 1, 31), RentalRatePeriod.month, 1),
          DateTime(2027, 2, 28));
      expect(countSelectedPeriods(DateTime(2027, 1, 31), DateTime(2027, 2, 28),
              RentalRatePeriod.month),
          1);
    });

    test('an automatic end that hits booked nights waits for a checkout tap',
        () {
      final s = pick(RentalDateSelection.empty, DateTime(2026, 10, 5),
          period: RentalRatePeriod.week);
      expect(s.end, isNull);
    });

    test('adding a week that runs into booked nights is refused', () {
      final start = DateTime(2026, 10, 1);
      var s = pick(RentalDateSelection.empty, start,
          period: RentalRatePeriod.week);
      expect(s.end, DateTime(2026, 10, 8));
      expect(canUsePeriodCount(start, RentalRatePeriod.week, 2, booked),
          isFalse);
      s = setRentalPeriodCount(s, 2,
          period: RentalRatePeriod.week, ranges: booked);
      expect(s.end, DateTime(2026, 10, 8));
      expect(countSelectedPeriods(s.start, s.end, RentalRatePeriod.week), 1);
    });
  });
}
