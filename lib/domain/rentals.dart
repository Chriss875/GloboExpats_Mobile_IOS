/// Port of the reference `lib/rentals.ts` (web parity, AU-016): rental
/// configuration from the itemDetails payload and the booking object built
/// when a buyer picks dates on the product detail screen.
library;
import '../config.dart';

enum RentalRatePeriod { hour, night, day, week, month }

RentalRatePeriod? ratePeriodFromJson(String? raw) {
  switch ((raw ?? '').toUpperCase()) {
    case 'HOUR':
      return RentalRatePeriod.hour;
    case 'NIGHT':
      return RentalRatePeriod.night;
    case 'DAY':
      return RentalRatePeriod.day;
    case 'WEEK':
      return RentalRatePeriod.week;
    case 'MONTH':
      return RentalRatePeriod.month;
    default:
      return null;
  }
}

String ratePeriodLabel(RentalRatePeriod p) {
  switch (p) {
    case RentalRatePeriod.hour:
      return 'per hour';
    case RentalRatePeriod.night:
      return 'per night';
    case RentalRatePeriod.day:
      return 'per day';
    case RentalRatePeriod.week:
      return 'per week';
    case RentalRatePeriod.month:
      return 'per month';
  }
}

/// `rentalConfiguration` block from `/displayItem/itemDetails`.
class RentalConfiguration {
  final bool enabled;
  final String listingType; // FOR_RENT | SHORT_STAY | RENTAL
  final RentalRatePeriod ratePeriod;

  /// A short stay (web `shortStay`, backend V151): the purpose flag, separate
  /// from the rate period — a short stay can be priced by the week too.
  final bool shortStay;

  /// Minimum stay the host accepts, per rate period (web `minimumNights` /
  /// `minimumDays` / `minimumMonths`). Absent means 1.
  final int? minimumNights;
  final int? minimumDays;
  final int? minimumMonths;
  const RentalConfiguration({
    this.enabled = true,
    this.listingType = 'FOR_RENT',
    this.ratePeriod = RentalRatePeriod.day,
    this.shortStay = false,
    this.minimumNights,
    this.minimumDays,
    this.minimumMonths,
  });

  /// Web `isShortStayConfiguration`.
  bool get isShortStay =>
      shortStay ||
      listingType == 'SHORT_STAY' ||
      ratePeriod == RentalRatePeriod.night;

  /// The minimum-stay rule a buyer sees on the booking sheet, or null when
  /// the host accepts the shortest booking (web product-choice-selector).
  String? get minimumStayLabel {
    if (!AppConfig.propertyRentals) return null;
    if (ratePeriod == RentalRatePeriod.night ||
        (shortStay && ratePeriod == RentalRatePeriod.week)) {
      return 'Minimum stay: ${minimumNights ?? 1} nights';
    }
    if (ratePeriod == RentalRatePeriod.month) {
      final m = minimumMonths ?? 1;
      return 'Minimum stay: $m ${m == 1 ? 'month' : 'months'}';
    }
    if (ratePeriod == RentalRatePeriod.day && (minimumDays ?? 1) > 1) {
      return 'Minimum stay: $minimumDays days';
    }
    return null;
  }

  static RentalConfiguration? fromJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final period = ratePeriodFromJson(json['ratePeriod']?.toString());
    if (period == null) return null;
    // Absence of `enabled` in compact DTOs still means the listing is rental
    // (the web treats presence of rentalConfiguration as rental).
    int? count(String key) {
      final v = json[key];
      final n = v is num ? v : num.tryParse('${v ?? ''}');
      return n == null ? null : n.toInt();
    }

    return RentalConfiguration(
      enabled: json['enabled'] as bool? ?? true,
      listingType: (json['listingType'] ?? 'FOR_RENT').toString(),
      ratePeriod: period,
      shortStay: json['shortStay'] == true,
      minimumNights: count('minimumNights'),
      minimumDays: count('minimumDays'),
      minimumMonths: count('minimumMonths'),
    );
  }
}

/// A booking for a short stay (web `isShortStayBooking`): the backend marks it
/// SHORT_STAY, and nightly bookings made before that flag count too.
bool isShortStayBookingJson(Map<String, dynamic>? booking) =>
    booking != null &&
    ('${booking['listingType'] ?? ''}'.toUpperCase() == 'SHORT_STAY' ||
        '${booking['ratePeriod'] ?? ''}'.toUpperCase() == 'NIGHT');

/// A checkout made only of short stays (web `isShortStayCheckout`): it asks
/// for guest details instead of a delivery address. Empty is never one.
bool isShortStayCheckout(Iterable<Map<String, dynamic>?> bookings) {
  final list = bookings.toList();
  return list.isNotEmpty && list.every(isShortStayBookingJson);
}

/// The booking carried into the cart line id signature and the proforma
/// payload (`items[].rentalBooking`).
class RentalBooking {
  final String listingType;
  final String ratePeriod;
  /// Nullable for the HALF-PICKED placeholder (one slot empty). A complete
  /// booking (isComplete) always has both.
  final DateTime? startDate;
  final DateTime? endDate;
  final String? pickupTime;
  final String? returnTime;
  final int billableUnits;
  final double sellerUnitRate;
  final double sellingUnitRate;
  final double sellerTotal;
  final double sellingTotal;
  const RentalBooking({
    required this.listingType,
    required this.ratePeriod,
    required this.startDate,
    required this.endDate,
    this.pickupTime,
    this.returnTime,
    required this.billableUnits,
    required this.sellerUnitRate,
    required this.sellingUnitRate,
    required this.sellerTotal,
    required this.sellingTotal,
  });

  Map<String, dynamic> toJson() => {
        'listingType': listingType,
        'ratePeriod': ratePeriod,
        'startDate': _fmtDate(startDate!),
        'endDate': _fmtDate(endDate!),
        if (pickupTime != null) 'pickupTime': pickupTime,
        if (returnTime != null) 'returnTime': returnTime,
        'billableUnits': billableUnits,
        'sellerUnitRate': sellerUnitRate,
        'sellingUnitRate': sellingUnitRate,
        'sellerTotal': sellerTotal,
        'sellingTotal': sellingTotal,
      };

  /// Restore a booking persisted by [toJson] (cart snapshots, client cart
  /// persistence). Dates use the yyyy-MM-dd wire format, times are free text.
  factory RentalBooking.fromJson(Map<String, dynamic> j) {
    final start = parseRentalDate(j['startDate']);
    final end = parseRentalDate(j['endDate']);
    final rate = (j['ratePeriod'] ?? 'DAY').toString();
    final period = ratePeriodFromJson(rate) ?? RentalRatePeriod.day;
    // Older cart JSON may predate the billableUnits fields; recompute nothing
    // here — carry what was stored (a complete booking always has them).
    return RentalBooking(
      listingType: (j['listingType'] ?? 'FOR_RENT').toString(),
      ratePeriod: period.name.toUpperCase(),
      startDate: start,
      endDate: end,
      pickupTime: j['pickupTime'] as String?,
      returnTime: j['returnTime'] as String?,
      billableUnits: (j['billableUnits'] as num?)?.toInt() ?? 0,
      sellerUnitRate: (j['sellerUnitRate'] as num?)?.toDouble() ?? 0,
      sellingUnitRate: (j['sellingUnitRate'] as num?)?.toDouble() ?? 0,
      sellerTotal: (j['sellerTotal'] as num?)?.toDouble() ?? 0,
      sellingTotal: (j['sellingTotal'] as num?)?.toDouble() ?? 0,
    );
  }

  /// Cart-line identity component (web `rentalBookingSignature`): two bookings
  /// with different ranges are separate cart lines.
  String get signature => '$startDate|$endDate|$pickupTime|$returnTime';

  /// AU-016 skeptic fix: a HALF-picked range (only start OR only end chosen).
  /// Renders the picked date in its slot and keeps the OTHER slot null so the
  /// second picker pass can fill it (r3 verifier bug: collapsing a half-pick
  /// to start==end+1 made the panel show two identical dates, "0 days", and
  /// lose the pending end). [isComplete] still gates cart/checkout.
  factory RentalBooking.partial({
    required RentalConfiguration configuration,
    required DateTime? startDate,
    required DateTime? endDate,
  }) {
    return RentalBooking._pending(
      configuration: configuration,
      startDate: startDate,
      endDate: endDate,
    );
  }

  bool get isComplete => billableUnits > 0;

  /// Web `isShortStayBooking`.
  bool get isShortStay =>
      listingType.toUpperCase() == 'SHORT_STAY' ||
      ratePeriod.toUpperCase() == 'NIGHT';

  /// Half-picked placeholder: one slot real, the other null. Never serialized
  /// (isComplete=false blocks toJson consumers upstream in cart/checkout).
  factory RentalBooking._pending({
    required RentalConfiguration configuration,
    required DateTime? startDate,
    required DateTime? endDate,
  }) {
    return RentalBooking(
      listingType:
          configuration.shortStay ? 'SHORT_STAY' : configuration.listingType,
      ratePeriod: configuration.ratePeriod.name.toUpperCase(),
      startDate: startDate,
      endDate: endDate,
      billableUnits: 0,
      sellerUnitRate: 0,
      sellingUnitRate: 0,
      sellerTotal: 0,
      sellingTotal: 0,
    );
  }

  static String _fmtDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

/// Billable hours for an HOUR-rate rental, from the real elapsed time between
/// pickup and return (web `calculateHourlyUnits`).
///
/// This used to be `sameDay ? 1 : days * 24`, which ignored both times: a
/// 9:00 AM to 5:00 PM hire billed 1 hour instead of 8, and an overnight hire
/// billed a flat 24 regardless of when it started or ended. Price maths is a
/// critical area, so it now mirrors the reference exactly, including refusing
/// to guess when the times are missing.
int _hourlyUnits(int days, String? pickupTime, String? returnTime) {
  if (pickupTime == null || returnTime == null) {
    throw ArgumentError('Pickup and return times are required for hourly rentals.');
  }
  final elapsedMinutes =
      days * 1440 + _parseTimeMinutes(returnTime) - _parseTimeMinutes(pickupTime);
  if (elapsedMinutes <= 0) {
    throw ArgumentError('The rental return time must be after the pickup time.');
  }
  return (elapsedMinutes / 60).ceil();
}

/// Parses `h:mm AM/PM`, the format the choice attributes carry.
int _parseTimeMinutes(String value) {
  final match =
      RegExp(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', caseSensitive: false).firstMatch(value.trim());
  if (match == null) {
    throw ArgumentError('Choose valid pickup and return times.');
  }
  final hour = int.parse(match.group(1)!);
  final minute = int.parse(match.group(2)!);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    throw ArgumentError('Choose valid pickup and return times.');
  }
  final isPm = match.group(3)!.toUpperCase() == 'PM';
  return ((hour % 12) + (isPm ? 12 : 0)) * 60 + minute;
}

int _daysBetween(DateTime start, DateTime end) {
  final a = DateTime(start.year, start.month, start.day);
  final b = DateTime(end.year, end.month, end.day);
  return b.difference(a).inDays;
}

/// Calendar-month count like the web `countCalendarMonths` (lib/rentals.ts
/// 259-275): a cursor-walk over anniversaries, each step clamping to the end
/// of its month. So Jan 31 → Mar 30 walks Jan31 → Feb28 → Mar28 → Apr28 = 3
/// months, because the Feb anniversary clamps to Feb 28 and the next is Mar 28.
///
/// The old arithmetic formula (`months = Δy*12 + Δm`, +1 when `end.day >
/// start.day`) undercounted ranges starting on day 29-31, e.g. it counted
/// Jan 31 → Mar 30 as 2 months instead of 3 — a money divergence for monthly
/// rentals. The web's calendar walk is the reference, so this mirrors it.
int _countCalendarMonths(DateTime start, DateTime end) {
  var count = 0;
  var cursor = DateTime(start.year, start.month, start.day);
  final endDate = DateTime(end.year, end.month, end.day);
  while (cursor.isBefore(endDate)) {
    cursor = _addOneCalendarMonth(cursor);
    count += 1;
  }
  return count < 1 ? 1 : count;
}

/// `addOneCalendarMonth` (web lib/rentals.ts 269-275): the anniversary one
/// month later, with the day clamped to the target month's length, so
/// Jan 31 → Feb 28 (or 29 in a leap year), never Mar 3.
/// Web `addCalendarMonths`: the same day [months] later, clamped to the
/// target month's length.
DateTime _addCalendarMonths(DateTime value, int months) {
  final target = DateTime(value.year, value.month + months, 1);
  final lastDay = DateTime(target.year, target.month + 1, 0).day;
  return DateTime(
      target.year, target.month, value.day < lastDay ? value.day : lastDay);
}

DateTime _addOneCalendarMonth(DateTime value) {
  final lastDay = DateTime(value.year, value.month + 2, 0).day;
  return DateTime(
      value.year, value.month + 1, value.day < lastDay ? value.day : lastDay);
}

/// Throws [ArgumentError] when the range is invalid for the rate period
/// (mirrors the reference's thrown message so callers can surface it).
RentalBooking buildRentalBooking(
  RentalConfiguration configuration,
  DateTime startDate,
  DateTime endDate, {
  required double sellerUnitRate,
  required double sellingUnitRate,
  String? pickupTime,
  String? returnTime,
}) {
  final hourly = configuration.ratePeriod == RentalRatePeriod.hour;
  final days = _daysBetween(startDate, endDate);
  if ((!hourly && days <= 0) || (hourly && days < 0)) {
    throw ArgumentError('The rental end date must be after the start date.');
  }
  // The host's minimum stay (web buildRentalBooking; the backend checks the
  // same rule when the invoice is made). Only once the backend knows it.
  final p = configuration.ratePeriod;
  final minimums = AppConfig.propertyRentals;
  if (minimums &&
      (p == RentalRatePeriod.night ||
          (configuration.shortStay && p == RentalRatePeriod.week)) &&
      days < (configuration.minimumNights ?? 1)) {
    throw ArgumentError(
        'Choose at least ${configuration.minimumNights ?? 1} nights.');
  }
  if (minimums &&
      p == RentalRatePeriod.day &&
      days < (configuration.minimumDays ?? 1)) {
    throw ArgumentError('Choose at least ${configuration.minimumDays ?? 1} days.');
  }
  if (minimums && p == RentalRatePeriod.month) {
    final months = configuration.minimumMonths ?? 1;
    if (endDate.isBefore(_addCalendarMonths(startDate, months))) {
      throw ArgumentError(
          'Choose at least $months ${months == 1 ? 'month' : 'months'}.');
    }
  }

  final billableUnits = hourly
      ? _hourlyUnits(days, pickupTime, returnTime)
      : configuration.ratePeriod == RentalRatePeriod.week
          ? (days / 7).ceil()
          : configuration.ratePeriod == RentalRatePeriod.month
              ? _countCalendarMonths(startDate, endDate)
              : days;

  return RentalBooking(
    listingType:
        configuration.shortStay ? 'SHORT_STAY' : configuration.listingType,
    ratePeriod: configuration.ratePeriod.name.toUpperCase(),
    startDate: startDate,
    endDate: endDate,
    pickupTime: pickupTime,
    returnTime: returnTime,
    billableUnits: billableUnits,
    sellerUnitRate: sellerUnitRate,
    sellingUnitRate: sellingUnitRate,
    sellerTotal: sellerUnitRate * billableUnits,
    sellingTotal: sellingUnitRate * billableUnits,
  );
}

// ---------------------------------------------------------------------------
// Category-driven rental detection (web `isRentalListingCategory` /
// `getDefaultRentalConfiguration`).
//
// This is how a listing becomes a rental in the first place: the seller never
// ticks "this is a rental", the chosen subcategory decides it and supplies the
// rate period. Without this the mobile sell wizard cannot create a rental at
// all — which is why short stays had no mobile surface.
// ---------------------------------------------------------------------------

const _monthlyRentalSubcategories = {
  'apartments-for-rent',
  'houses-for-rent',
  'rooms-shared-housing',
};

const _dailyVehicleRentalSubcategories = {
  'cars-for-rent',
  'suvs-4x4-for-rent',
  'vans-minibuses-for-rent',
};

/// The short-stay subcategory: nightly rates and a booking calendar.
const shortStaySubcategorySlug = 'short-stays-holiday-rentals';

bool isRentalListingCategory(String? categorySlug, String? subcategorySlug) {
  if (subcategorySlug == null || subcategorySlug.isEmpty) return false;
  return categorySlug == 'real-estate' ||
      (categorySlug == 'vehicle-supplies' &&
          _dailyVehicleRentalSubcategories.contains(subcategorySlug));
}

/// The rate period a subcategory implies, or null when it is an ordinary sale.
///
/// Short stays keep `listingType: FOR_RENT` and carry the separate
/// `shortStay` purpose flag (web 2026-10); a booking made on one is sent as
/// `SHORT_STAY`.
RentalConfiguration? getDefaultRentalConfiguration(
  String? categorySlug,
  String? subcategorySlug,
) {
  if (subcategorySlug == null || subcategorySlug.isEmpty) return null;
  if (categorySlug == 'vehicle-supplies' &&
      _dailyVehicleRentalSubcategories.contains(subcategorySlug)) {
    return const RentalConfiguration(
        listingType: 'FOR_RENT', ratePeriod: RentalRatePeriod.day);
  }
  if (categorySlug != 'real-estate') return null;
  if (subcategorySlug == shortStaySubcategorySlug) {
    return const RentalConfiguration(
        listingType: 'FOR_RENT',
        ratePeriod: RentalRatePeriod.night,
        shortStay: true,
        minimumNights: 1);
  }
  if (_monthlyRentalSubcategories.contains(subcategorySlug)) {
    return const RentalConfiguration(
        listingType: 'FOR_RENT', ratePeriod: RentalRatePeriod.month);
  }
  return null;
}

/// An explicit rental configuration, for a seller overriding the default.
RentalConfiguration rentalConfigurationForType({
  RentalRatePeriod ratePeriod = RentalRatePeriod.month,
}) =>
    RentalConfiguration(listingType: 'FOR_RENT', ratePeriod: ratePeriod);

// ---------------------------------------------------------------------------
// Dates on the wire
// ---------------------------------------------------------------------------

/// A backend `LocalDate` reaches us either as `"2026-01-15"` or as Jackson's
/// `[2026, 1, 15]` — the reference handles both (`RentalDateValue`), so this
/// does too. Returns null for anything that is not a usable date.
DateTime? parseRentalDate(dynamic value) {
  List<int>? parts;
  if (value is String) {
    final split = value.split('-');
    if (split.length >= 3) {
      final parsed = split.take(3).map(int.tryParse).toList();
      if (!parsed.contains(null)) parts = parsed.cast<int>();
    }
  } else if (value is List) {
    final parsed =
        value.take(3).map((v) => v is num ? v.toInt() : null).toList();
    if (parsed.length >= 3 && !parsed.contains(null)) parts = parsed.cast<int>();
  }
  if (parts == null || parts.any((p) => p <= 0)) return null;
  return DateTime(parts[0], parts[1], parts[2]);
}

/// `dd/MM/yyyy`, matching the reference's `formatRentalDate`.
String formatRentalDate(DateTime value) =>
    '${value.day.toString().padLeft(2, '0')}/'
    '${value.month.toString().padLeft(2, '0')}/'
    '${value.year}';

/// Wire format for request bodies and cart lines (`yyyy-MM-dd`).
String rentalDateToJson(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-'
    '${value.month.toString().padLeft(2, '0')}-'
    '${value.day.toString().padLeft(2, '0')}';

/// Nights shown on a calendar for a booking. An HOUR rental is inclusive of
/// its single day; everything else counts the nights between the dates.
int rentalCalendarDayCount({
  required DateTime startDate,
  required DateTime endDate,
  required RentalRatePeriod ratePeriod,
}) {
  final elapsed = _daysBetween(startDate, endDate);
  final days = elapsed < 0 ? 0 : elapsed;
  if (ratePeriod == RentalRatePeriod.hour) return days + 1;
  return days < 1 ? 1 : days;
}

// ---------------------------------------------------------------------------
// Availability and owner-set blocks
// ---------------------------------------------------------------------------

/// A half-open range: `endDate` is the checkout day, not a booked night.
class RentalDateRange {
  final DateTime startDate;
  final DateTime endDate;
  const RentalDateRange({required this.startDate, required this.endDate});

  static RentalDateRange? fromJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final start = parseRentalDate(json['startDate']);
    final end = parseRentalDate(json['endDate']);
    if (start == null || end == null) return null;
    return RentalDateRange(startDate: start, endDate: end);
  }

  /// True when [day] falls inside this range (start inclusive, end exclusive).
  bool covers(DateTime day) {
    final d = DateTime(day.year, day.month, day.day);
    return !d.isBefore(startDate) && d.isBefore(endDate);
  }
}

/// `GET /displayItem/itemDetails/{id}/rental-availability`.
class RentalAvailability {
  final int productId;
  final bool bookedToday;
  final DateTime? availableFrom;
  final List<RentalDateRange> bookedRanges;
  const RentalAvailability({
    required this.productId,
    this.bookedToday = false,
    this.availableFrom,
    this.bookedRanges = const [],
  });

  static RentalAvailability fromJson(Map<String, dynamic> json) {
    final ranges = json['bookedRanges'];
    return RentalAvailability(
      productId: (json['productId'] as num?)?.toInt() ?? 0,
      bookedToday: json['bookedToday'] as bool? ?? false,
      availableFrom: parseRentalDate(json['availableFrom']),
      bookedRanges: ranges is List
          ? ranges
              .whereType<Map<String, dynamic>>()
              .map(RentalDateRange.fromJson)
              .whereType<RentalDateRange>()
              .toList()
          : const [],
    );
  }
}

/// A date range the owner has closed off, from `/products/{id}/rental-blocks`.
class RentalCalendarBlock {
  final int rentalCalendarBlockId;
  final int productId;
  final DateTime startDate;
  final DateTime endDate;
  const RentalCalendarBlock({
    required this.rentalCalendarBlockId,
    required this.productId,
    required this.startDate,
    required this.endDate,
  });

  static RentalCalendarBlock? fromJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final start = parseRentalDate(json['startDate']);
    final end = parseRentalDate(json['endDate']);
    if (start == null || end == null) return null;
    return RentalCalendarBlock(
      rentalCalendarBlockId:
          (json['rentalCalendarBlockId'] as num?)?.toInt() ?? 0,
      productId: (json['productId'] as num?)?.toInt() ?? 0,
      startDate: start,
      endDate: end,
    );
  }

  RentalDateRange get range =>
      RentalDateRange(startDate: startDate, endDate: endDate);
}

/// True when the half-open range [start, end) touches any of [ranges].
///
/// Used to refuse a booking over dates that are already taken, or that the
/// owner has closed, before anything reaches the cart.
bool rentalRangeOverlaps(
  DateTime start,
  DateTime end,
  Iterable<RentalDateRange> ranges,
) {
  final from = DateTime(start.year, start.month, start.day);
  final to = DateTime(end.year, end.month, end.day);
  for (final range in ranges) {
    if (from.isBefore(range.endDate) && range.startDate.isBefore(to)) {
      return true;
    }
  }
  return false;
}
