/// Short stays on the web (2026-10): searching them by location and dates,
/// and the property details a host must give. Ports of the web's
/// `lib/stay-search.ts` and `lib/property-listing.ts`.
library;

import 'product_choices.dart';
import 'rentals.dart';
import 'time_utils.dart';

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/// Check-in and checkout as `yyyy-MM-dd`; both empty means "any dates".
/// Checkout is exclusive (the morning the guest leaves).
class StayDates {
  final String startDate;
  final String endDate;
  const StayDates({this.startDate = '', this.endDate = ''});

  static const none = StayDates();

  bool get isSet => startDate.isNotEmpty && endDate.isNotEmpty;

  /// `?checkIn=…&checkOut=…` on a listing link (web `stayDatesQuery`), so
  /// opening a result keeps the dates and prefills the booking.
  Map<String, String> get query =>
      isSet ? {'checkIn': startDate, 'checkOut': endDate} : const {};

  @override
  bool operator ==(Object other) =>
      other is StayDates &&
      other.startDate == startDate &&
      other.endDate == endDate;

  @override
  int get hashCode => Object.hash(startDate, endDate);
}

/// Today's calendar date in the operating zone (web `staySearchToday`).
String staySearchToday([DateTime? now]) =>
    rentalDateToJson((now ?? DateTime.now()).toUtc().add(TimeUtils.eatOffset));

final _isoDate = RegExp(r'^\d{4}-\d{2}-\d{2}$');

bool _realDate(String value) {
  if (!_isoDate.hasMatch(value)) return false;
  final d = DateTime.tryParse('${value}T00:00:00Z');
  return d != null && rentalDateToJson(d) == value;
}

/// Web `validateStayDates`: optional, but both or neither; never in the past;
/// checkout after check-in.
String? validateStayDates(StayDates dates, {DateTime? now}) {
  if (dates.startDate.isEmpty && dates.endDate.isEmpty) return null;
  if (dates.startDate.isEmpty || dates.endDate.isEmpty) {
    return 'Choose both check-in and checkout dates.';
  }
  if (!_realDate(dates.startDate) || !_realDate(dates.endDate)) {
    return 'Choose valid dates.';
  }
  if (dates.startDate.compareTo(staySearchToday(now)) < 0) {
    return 'Check-in cannot be in the past.';
  }
  if (dates.endDate.compareTo(dates.startDate) <= 0) {
    return 'Checkout must be after check-in.';
  }
  return null;
}

/// Dates from a link's `checkIn` / `checkOut` (web `readStayDates`); an
/// invalid pair reads as no dates.
StayDates readStayDates(Map<String, String> params, {DateTime? now}) {
  final dates = StayDates(
      startDate: params['checkIn'] ?? '', endDate: params['checkOut'] ?? '');
  return validateStayDates(dates, now: now) == null ? dates : StayDates.none;
}

// ---------------------------------------------------------------------------
// Listing a property
// ---------------------------------------------------------------------------

/// What a short stay must state, in the order the form asks (web
/// `REQUIRED_STAY_DETAILS`).
const kRequiredStayDetails = [
  'Property Type',
  'Bedrooms',
  'Bathrooms',
  'Number of allowed Guests',
  'Check-in time',
  'Checkout time',
];

/// The required details for a subcategory: an apartment or house already
/// says what it is, and a room has no bedroom count.
List<String> stayDetailsForSubcategory(String? subcategorySlug) {
  if (subcategorySlug == 'apartments-for-rent' ||
      subcategorySlug == 'houses-for-rent') {
    return kRequiredStayDetails.where((n) => n != 'Property Type').toList();
  }
  if (subcategorySlug == 'rooms-shared-housing') {
    return kRequiredStayDetails
        .where((n) => n != 'Property Type' && n != 'Bedrooms')
        .toList();
  }
  return kRequiredStayDetails;
}

/// Details only a short stay shows; a long let or a sale hides them.
const kStayOnlyDetails = [
  'Number of allowed Guests',
  'Check-in time',
  'Checkout time',
];

/// Detail names a real-estate listing hides (web `hiddenPropertyDetailKeys`).
List<String> hiddenPropertyDetailKeys(RentalConfiguration? configuration) =>
    configuration != null && configuration.isShortStay
        ? const []
        : kStayOnlyDetails;

/// The required stay details still missing exactly one value (web
/// `missingStayDetails`): each must be a single fixed fact, not a choice.
List<String> missingStayDetails(
  ProductChoiceConfiguration configuration,
  String? subcategorySlug,
) {
  return stayDetailsForSubcategory(subcategorySlug).where((name) {
    ProductChoiceAttribute? attribute;
    for (final a in configuration.attributes) {
      if (a.name.toLowerCase() == name.toLowerCase()) {
        attribute = a;
        break;
      }
    }
    final values = attribute == null
        ? const <ProductChoiceValue>[]
        : attribute.values
            .where((v) => v.active && v.label.trim().isNotEmpty)
            .toList();
    return !configuration.hasChoices || values.length != 1;
  }).toList();
}

/// Single-value options for a count detail: 1-9 then 10+ (web
/// product-choice-definition-editor), guests spelled "2 Guests".
List<String> stayCountOptions(String detailName) {
  final guests = detailName == 'Number of allowed Guests';
  return [
    for (var n = 1; n < 10; n++)
      guests ? '$n Guest${n == 1 ? '' : 's'}' : '$n',
    guests ? '10+ Guests' : '10+',
  ];
}

/// "Max guests" for the guest count, the detail's own name otherwise.
String stayDetailLabel(String detailName) =>
    detailName == 'Number of allowed Guests' ? 'Max guests' : detailName;

bool isStayCountDetail(String name) =>
    RegExp(r'^(bedrooms|bathrooms|number of allowed guests)$',
            caseSensitive: false)
        .hasMatch(name);

bool isStayTimeDetail(String name) =>
    RegExp(r'^(check-in time|checkout time)$', caseSensitive: false)
        .hasMatch(name);
