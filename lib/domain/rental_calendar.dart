/// The buyer's rental date picking rules — web parity with
/// `components/product-choices/rental-date-range-calendar.tsx`.
///
/// Kept apart from the widget so every rule (booked nights, the checkout
/// boundary, week/month lengths, same-day hourly hires) is testable on its
/// own. All dates are calendar days: time of day is ignored.
library;

import 'rentals.dart';

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);
DateTime _addDays(DateTime d, int n) => DateTime(d.year, d.month, d.day + n);

/// A night that someone else already holds (start inclusive, end exclusive).
bool isBookedDay(DateTime day, List<RentalDateRange> ranges) =>
    ranges.any((r) => r.covers(day));

/// True when [start, end) — or [start, end] with [includeEnd] — touches a
/// booked night (web `rangeContainsBookedDate`).
bool rangeHasBookedDay(
    DateTime start, DateTime end, List<RentalDateRange> ranges,
    {bool includeEnd = false}) {
  final from = _day(start);
  final to = includeEnd ? _addDays(end, 1) : _day(end);
  return ranges.any((r) => r.startDate.isBefore(to) && r.endDate.isAfter(from));
}

/// The anniversary one month on, clamped to the target month's last day
/// (web `addOneIsoMonth`): Jan 31 → Feb 28.
DateTime addOneRentalMonth(DateTime value) {
  final lastDay = DateTime(value.year, value.month + 2, 0).day;
  return DateTime(
      value.year, value.month + 1, value.day < lastDay ? value.day : lastDay);
}

/// Week and month rentals are chosen as a start date plus a length.
bool isAdjustablePeriod(RentalRatePeriod p) =>
    p == RentalRatePeriod.week || p == RentalRatePeriod.month;

/// Checkout date after [count] weeks or months (web `endDateForPeriods`).
DateTime? endDateForPeriods(
    DateTime start, RentalRatePeriod period, int count) {
  if (count < 1 || !isAdjustablePeriod(period)) return null;
  if (period == RentalRatePeriod.week) return _addDays(start, count * 7);
  var cursor = _day(start);
  for (var i = 0; i < count; i++) {
    cursor = addOneRentalMonth(cursor);
  }
  return cursor;
}

/// How many weeks or months the picked range spans (web
/// `countSelectedPeriods`), never less than one.
int countSelectedPeriods(
    DateTime? start, DateTime? end, RentalRatePeriod period) {
  if (start == null || end == null || !end.isAfter(start)) return 1;
  if (period == RentalRatePeriod.week) {
    final days = _day(end).difference(_day(start)).inDays;
    final weeks = (days / 7).ceil();
    return weeks < 1 ? 1 : weeks;
  }
  var count = 0;
  var cursor = _day(start);
  final to = _day(end);
  while (cursor.isBefore(to) && count < 1200) {
    cursor = addOneRentalMonth(cursor);
    count += 1;
  }
  return count < 1 ? 1 : count;
}

/// Whether one more week/month would still avoid booked nights.
bool canUsePeriodCount(DateTime start, RentalRatePeriod period, int count,
    List<RentalDateRange> ranges) {
  final end = endDateForPeriods(start, period, count);
  return end != null && !rangeHasBookedDay(start, end, ranges);
}

enum RentalSelectionStep { checkIn, checkout, done }

/// The picker's state: the two dates and which one the next tap sets.
class RentalDateSelection {
  const RentalDateSelection({this.start, this.end, this.step});

  final DateTime? start;
  final DateTime? end;

  /// Null means "derive from the dates", like the web's effect that resets
  /// the step whenever the dates change.
  final RentalSelectionStep? step;

  RentalSelectionStep get effectiveStep =>
      step ??
      (start == null
          ? RentalSelectionStep.checkIn
          : end == null
              ? RentalSelectionStep.checkout
              : RentalSelectionStep.done);

  RentalDateSelection withStep(RentalSelectionStep step) =>
      RentalDateSelection(start: start, end: end, step: step);

  static const empty = RentalDateSelection();
}

/// A day the buyer cannot tap (web `unavailable`): in the past, or booked —
/// except that a booked night may be the checkout day of a free range,
/// because checkout is not a night spent.
bool isUnavailableDay(
  DateTime day, {
  required DateTime today,
  required RentalDateSelection selection,
  required List<RentalDateRange> ranges,
  required bool allowSameDay,
}) {
  final d = _day(day);
  if (d.isBefore(_day(today))) return true;
  if (!isBookedDay(d, ranges)) return false;
  final start = selection.start;
  final validCheckoutBoundary = !allowSameDay &&
      start != null &&
      selection.end == null &&
      d.isAfter(start) &&
      !rangeHasBookedDay(start, d, ranges);
  return !validCheckoutBoundary;
}

/// The next state after the buyer taps [date] (web `chooseDate`).
RentalDateSelection chooseRentalDate(
  RentalDateSelection current,
  DateTime date, {
  required DateTime today,
  required List<RentalDateRange> ranges,
  required RentalRatePeriod period,
  required bool allowSameDay,
}) {
  final day = _day(date);
  if (day.isBefore(_day(today))) return current;
  final booked = isBookedDay(day, ranges);
  final start = current.start;
  final end = current.end;
  final step = current.effectiveStep;

  if (step == RentalSelectionStep.checkIn ||
      start == null ||
      (end != null && step == RentalSelectionStep.done)) {
    if (booked) return current;
    final automatic = isAdjustablePeriod(period)
        ? endDateForPeriods(day, period, 1)
        : null;
    if (automatic != null &&
        !rangeHasBookedDay(day, automatic, ranges, includeEnd: allowSameDay)) {
      return RentalDateSelection(start: day, end: automatic);
    }
    return RentalDateSelection(start: day);
  }
  if (allowSameDay && day == start) {
    return RentalDateSelection(start: start, end: day);
  }
  if (!day.isAfter(start)) {
    if (booked) return current;
    return RentalDateSelection(start: day);
  }
  if (rangeHasBookedDay(start, day, ranges, includeEnd: allowSameDay)) {
    return current;
  }
  return RentalDateSelection(start: start, end: day);
}

/// Change a week/month rental's length, keeping the start (web
/// `updatePeriodCount`). Refuses a length that runs into booked nights.
RentalDateSelection setRentalPeriodCount(
  RentalDateSelection current,
  int count, {
  required RentalRatePeriod period,
  required List<RentalDateRange> ranges,
}) {
  final start = current.start;
  if (start == null || count < 1 || !isAdjustablePeriod(period)) {
    return current;
  }
  final end = endDateForPeriods(start, period, count);
  if (end == null || rangeHasBookedDay(start, end, ranges)) return current;
  return RentalDateSelection(start: start, end: end);
}
