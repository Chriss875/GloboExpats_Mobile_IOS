import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/rentals.dart';

RentalBooking _book(RentalRatePeriod period, DateTime s, DateTime e) =>
    buildRentalBooking(
      RentalConfiguration(ratePeriod: period),
      s,
      e,
      sellerUnitRate: 50000,
      sellingUnitRate: 50000,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AU-016 buildRentalBooking (lib/rentals.ts port)', () {
    final jan1 = DateTime(2026, 1, 1);
    test('NIGHT: each night between dates is a unit', () {
      // Jan 1 -> Jan 4 = 3 nights
      expect(_book(RentalRatePeriod.night, jan1, DateTime(2026, 1, 4)).billableUnits, 3);
    });
    test('DAY: exclusive end date', () {
      expect(_book(RentalRatePeriod.day, jan1, DateTime(2026, 1, 4)).billableUnits, 3);
    });
    test('WEEK rounds up partial weeks', () {
      // 10 days = 2 weeks (ceil)
      expect(_book(RentalRatePeriod.week, jan1, DateTime(2026, 1, 11)).billableUnits, 2);
    });
    test('MONTH counts calendar months rounding up', () {
      // Jan 15 -> Feb 15 = 1 month; Jan 15 -> Mar 15 = 2. Anything shorter
      // than a month is refused (web minimum-stay rule, 2026-10).
      expect(() => _book(RentalRatePeriod.month, DateTime(2026, 1, 15), DateTime(2026, 2, 14)),
          throwsArgumentError);
      final oneMonth = _book(RentalRatePeriod.month, DateTime(2026, 1, 15), DateTime(2026, 2, 15));
      final twoMonths = _book(RentalRatePeriod.month, DateTime(2026, 1, 15), DateTime(2026, 3, 15));
      expect(oneMonth.billableUnits, 1);
      expect(twoMonths.billableUnits, 2);
    });
    test('totals = units × unit rate', () {
      final b = _book(RentalRatePeriod.night, jan1, DateTime(2026, 1, 4));
      expect(b.sellingTotal, 150000);
      expect(b.sellerTotal, 150000);
    });
    test('end before start throws for non-hourly periods', () {
      expect(() => _book(RentalRatePeriod.day, jan1, jan1), throwsArgumentError);
    });
    test('partial booking renders but is not complete (skeptic fix)', () {
      final p = RentalBooking.partial(
        configuration: RentalConfiguration(ratePeriod: RentalRatePeriod.night),
        startDate: DateTime(2026, 3, 10),
        endDate: null,
      );
      expect(p.isComplete, isFalse);
      expect(p.startDate, DateTime(2026, 3, 10));
      // r3 verifier fix: the UNPICKED slot stays empty in the panel — the
      // partial must not collapse both ends onto one date (that rendered
      // "0 days · total TSh 0" and hid the second picker).
      final endOnly = RentalBooking.partial(
        configuration: RentalConfiguration(ratePeriod: RentalRatePeriod.night),
        startDate: null,
        endDate: DateTime(2026, 3, 12),
      );
      expect(endOnly.startDate, isNull);
      expect(endOnly.endDate, DateTime(2026, 3, 12));
      // A complete booking IS complete.
      final full = buildRentalBooking(
        RentalConfiguration(ratePeriod: RentalRatePeriod.night),
        DateTime(2026, 3, 10),
        DateTime(2026, 3, 12),
        sellerUnitRate: 1000,
        sellingUnitRate: 1000,
      );
      expect(full.isComplete, isTrue);
    });

    test('booking signature distinguishes date ranges', () {
      final a = _book(RentalRatePeriod.day, jan1, DateTime(2026, 1, 2));
      final b = _book(RentalRatePeriod.day, jan1, DateTime(2026, 1, 5));
      expect(a.signature == b.signature, isFalse);
    });
    test('toJson round-trips the payload shape for proforma items', () {
      final b = _book(RentalRatePeriod.night, jan1, DateTime(2026, 1, 3));
      final j = b.toJson();
      expect(j['ratePeriod'], 'NIGHT');
      expect(j['startDate'], '2026-01-01');
      expect(j['endDate'], '2026-01-03');
      expect(j['billableUnits'], 2);
      expect(j['sellingTotal'], 100000);
    });
  });
  // The listing-page booking flow is covered in rental_booking_sheet_test.dart.
}
