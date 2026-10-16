import 'time_utils.dart';

/// Delivery windows for SELLER_DELIVERY checkout (BUYER_FLOW_SPEC §5, §7).
///
/// Port of the web reference `lib/checkout-delivery-windows.ts`: exactly 6
/// composite options — TODAY/TOMORROW × MORNING/AFTERNOON/EVENING — computed in
/// Africa/Dar_es_Salaam (EAT = UTC+3, no DST), never device-local. A window
/// whose EAT end-hour has been reached is no longer selectable ("Time passed").
///
/// Pure logic only: widgets render [DeliveryWindowOption] parts, and the
/// checkout payload is produced by [preferredDeliveryWindowsPayload]
/// (`preferredDeliveryWindows:[{date,slot}]` per BUYER_FLOW_SPEC §5.1).
// ignore_for_file: constant_identifier_names

/// Buyer-facing day half of a composite window (web `DELIVERY_DAYS`):
/// TODAY = current EAT calendar day, TOMORROW = next EAT calendar day.
enum DeliveryDay { TODAY, TOMORROW }

extension DeliveryDayX on DeliveryDay {
  /// Day offset from the current EAT date (0 = today, 1 = tomorrow).
  int get offsetEATDays => this == DeliveryDay.TODAY ? 0 : 1;

  /// Reference label (`"Today"` / `"Tomorrow"`).
  String get label => this == DeliveryDay.TODAY ? 'Today' : 'Tomorrow';

  /// EAT wall-clock date for this day relative to [nowUtc], as UTC-flagged
  /// midnight carrying EAT calendar components (the file-wide convention).
  DateTime eatDate(DateTime nowUtc, [int productionTimeDays = 0]) {
    final nowEat = TimeUtils.toEat(nowUtc);
    final base = DateTime.utc(nowEat.year, nowEat.month, nowEat.day);
    return base.add(Duration(days: productionTimeDays + offsetEATDays));
  }
}

enum DeliverySlot {
  MORNING,
  AFTERNOON,
  EVENING,

  /// Seller-configured working-hours window (web `SELLER_HOURS`): runs the
  /// whole EAT day (00:00–24:00) and only ever arrives from the backend —
  /// seller availability or an order payload — never from the six buyer
  /// checkout composites in [kDeliveryWindowOptions].
  SELLER_HOURS,
}

extension DeliverySlotX on DeliverySlot {
  /// EAT start-hour of the slot (dispatch opens 1 h before this, §7).
  int get startHourEAT => switch (this) {
        DeliverySlot.MORNING => 10,
        DeliverySlot.AFTERNOON => 12,
        DeliverySlot.EVENING => 16,
        DeliverySlot.SELLER_HOURS => 0,
      };

  /// EAT end-hour of the slot (fulfillmentDeadline basis, §7).
  int get endHourEAT => switch (this) {
        DeliverySlot.MORNING => 12,
        DeliverySlot.AFTERNOON => 16,
        DeliverySlot.EVENING => 20,
        DeliverySlot.SELLER_HOURS => 24,
      };

  /// Reference label (`DELIVERY_SLOTS[].label`; web `SLOT_LABELS` for
  /// SELLER_HOURS).
  String get label => switch (this) {
        DeliverySlot.MORNING => 'Morning',
        DeliverySlot.AFTERNOON => 'Afternoon',
        DeliverySlot.EVENING => 'Evening',
        DeliverySlot.SELLER_HOURS => 'Seller working hours',
      };

  /// True for the backend-only whole-day slot (legacy single-window deadline
  /// excludes it — web `order-delivery-deadline.ts:265`).
  bool get isSellerHours => this == DeliverySlot.SELLER_HOURS;

  static String _hh(int h) => '${h.toString().padLeft(2, '0')}:00';

  /// Review-step caption, byte-identical to the web: `'10:00 – 12:00'`.
  String get hours =>
      '${DeliverySlotX._hh(startHourEAT)} – ${DeliverySlotX._hh(endHourEAT)}';

  /// Compact variant used by order/detail rows (`'10:00–12:00'`), matching the
  /// web `SLOT_LABELS` shape "Morning (10:00–12:00)".
  String get hoursCompact =>
      '${DeliverySlotX._hh(startHourEAT)}–${DeliverySlotX._hh(endHourEAT)}';
}

/// One of the six buyer-selectable composite options, e.g. `TOMORROW_AFTERNOON`.
class DeliveryWindowOption {
  final DeliveryDay day;
  final DeliverySlot slot;

  const DeliveryWindowOption({required this.day, required this.slot});

  /// Composite identifier exactly as the web sends/stores it.
  String get value => '${day.name}_${slot.name}';

  String get dayLabel => day.label;

  String get slotLabel => slot.label;

  /// Hours caption shown under the slot label (`'12:00 – 16:00'`).
  String get hours => slot.hours;

  /// Checkbox accessibility label, identical to the web review step:
  /// `"Today Afternoon, 12:00 – 16:00"`.
  String get accessibilityLabel => '$dayLabel $slotLabel, $hours';

  /// Single-line summary label: `"Tomorrow Afternoon (12:00–16:00)"`.
  String get summaryLabel => '$dayLabel $slotLabel (${slot.hoursCompact})';

  /// Dated window for this option relative to [nowUtc], pushed out by the
  /// seller's prep period when the cart has one.
  DeliveryWindow resolve(DateTime nowUtc, [int productionTimeDays = 0]) =>
      DeliveryWindow(date: day.eatDate(nowUtc, productionTimeDays), slot: slot);

  /// True once the EAT end-instant of this option has been reached
  /// (web `isDeliveryWindowPast`); such options render disabled/"Time passed".
  ///
  /// With a prep period the window sits days ahead, so it cannot be past —
  /// which is exactly why every slot stays offered on a made-to-order item.
  bool isPast(DateTime nowUtc, [int productionTimeDays = 0]) {
    final date = day.eatDate(nowUtc, productionTimeDays);
    final end = DateTime.utc(date.year, date.month, date.day, slot.endHourEAT);
    return !TimeUtils.toEat(nowUtc).isBefore(end);
  }

  /// Buyer-facing day label. Once a prep period applies, "Today"/"Tomorrow"
  /// would be a lie, so web swaps in the real date (`getDeliveryDayLabel`)
  /// and marks the first one "Earliest".
  String dayLabelFor(DateTime nowUtc, [int productionTimeDays = 0]) {
    if (productionTimeDays <= 0) return day.label;
    final d = day.eatDate(nowUtc, productionTimeDays);
    final formatted = '${_kDayNames[d.weekday % 7]}, ${d.day} ${_kMonthNames[d.month - 1]}';
    return day == DeliveryDay.TODAY ? 'Earliest · $formatted' : formatted;
  }

  @override
  bool operator ==(Object other) =>
      other is DeliveryWindowOption && other.day == day && other.slot == slot;

  @override
  int get hashCode => Object.hash(day, slot);

  @override
  String toString() => value;
}

/// All six composite options in visual order: Today's slots top-to-bottom
/// (MORNING, AFTERNOON, EVENING), then Tomorrow's — matching the web
/// `DELIVERY_WINDOW_OPTIONS`.
const List<DeliveryWindowOption> kDeliveryWindowOptions = [
  DeliveryWindowOption(day: DeliveryDay.TODAY, slot: DeliverySlot.MORNING),
  DeliveryWindowOption(day: DeliveryDay.TODAY, slot: DeliverySlot.AFTERNOON),
  DeliveryWindowOption(day: DeliveryDay.TODAY, slot: DeliverySlot.EVENING),
  DeliveryWindowOption(day: DeliveryDay.TOMORROW, slot: DeliverySlot.MORNING),
  DeliveryWindowOption(day: DeliveryDay.TOMORROW, slot: DeliverySlot.AFTERNOON),
  DeliveryWindowOption(day: DeliveryDay.TOMORROW, slot: DeliverySlot.EVENING),
];

/// Options still selectable NOW (past ones dropped), in visual order.
List<DeliveryWindowOption> availableDeliveryWindowOptions(DateTime nowUtc,
        [int productionTimeDays = 0]) =>
    kDeliveryWindowOptions
        .where((o) => !o.isPast(nowUtc, productionTimeDays))
        .toList(growable: false);

/// Parses a composite value like `TODAY_EVENING`; null when malformed.
DeliveryWindowOption? deliveryWindowOptionFromValue(String value) {
  final parts = value.split('_');
  if (parts.length != 2) return null;
  final day = DeliveryDay.values.asNameMap()[parts[0]];
  final slot = DeliverySlot.values.asNameMap()[parts[1]];
  if (day == null || slot == null) return null;
  return DeliveryWindowOption(day: day, slot: slot);
}

/// A dated delivery window: an EAT calendar day + slot. The [date] field is a
/// UTC-flagged midnight carrying EAT calendar components (never machine-local).
///
/// An order payload may override the fixed slot bounds with server `startsAt` /
/// `endsAt` timestamps (web `ResolvedDeliveryWindow`); when present those win
/// over the slot hours in [startUtc] / [endUtc].
class DeliveryWindow {
  final DateTime date; // calendar day in EAT
  final DeliverySlot slot;

  /// Server-provided window-start override (order payload `startsAt`), already
  /// parsed to UTC, or null when absent/unparseable.
  final DateTime? startsAtUtc;

  /// Server-provided window-end override (order payload `endsAt`), already
  /// parsed to UTC, or null when absent/unparseable.
  final DateTime? endsAtUtc;

  const DeliveryWindow({
    required this.date,
    required this.slot,
    this.startsAtUtc,
    this.endsAtUtc,
  });

  String get dateYmd => TimeUtils.eatDateYmd(date);

  Map<String, dynamic> toJson() => {'date': dateYmd, 'slot': slot.name};

  /// Start instant of the window in UTC: the server `startsAt` override when
  /// present, else EAT {startHour}:00 of [date].
  DateTime get startUtc =>
      startsAtUtc ??
      TimeUtils.eatToUtc(
        DateTime.utc(date.year, date.month, date.day, slot.startHourEAT),
      );

  /// End instant of the window in UTC: the server `endsAt` override when
  /// present, else EAT {endHour}:00 of [date].
  DateTime get endUtc =>
      endsAtUtc ??
      TimeUtils.eatToUtc(
        DateTime.utc(date.year, date.month, date.day, slot.endHourEAT),
      );

  /// Label like "Today · Morning" / "Tomorrow · Afternoon" / "25 Aug · Evening".
  String label(String todayYmd, String tomorrowYmd) {
    final d = dateYmd;
    final day = d == todayYmd
        ? 'Today'
        : d == tomorrowYmd
            ? 'Tomorrow'
            : TimeUtils.eatFormatDayMonth(date);
    return '$day · ${slot.label}';
  }

  /// Summary label like "Tomorrow Afternoon (12:00–16:00)" (web `SLOT_LABELS`).
  String summaryLabel(String todayYmd, String tomorrowYmd) {
    final d = dateYmd;
    final day = d == todayYmd
        ? 'Today'
        : d == tomorrowYmd
            ? 'Tomorrow'
            : TimeUtils.eatFormatDayMonth(date);
    return '$day ${slot.label} (${slot.hoursCompact})';
  }

  @override
  bool operator ==(Object other) =>
      other is DeliveryWindow &&
      other.date == date &&
      other.slot == slot &&
      other.startsAtUtc == startsAtUtc &&
      other.endsAtUtc == endsAtUtc;

  @override
  int get hashCode => Object.hash(date, slot, startsAtUtc, endsAtUtc);
}

/// Validates + parses backend/order window fields the way the web
/// `readDeliveryWindows` does: strict `YYYY-MM-DD` date and a known upper-case
/// slot (MORNING/AFTERNOON/EVENING/SELLER_HOURS). Server `startsAt`/`endsAt`
/// overrides, when parseable, become [DeliveryWindow.startsAtUtc]/[endsAtUtc].
/// Null when either side is missing/unparseable.
DeliveryWindow? parseDatedWindow({
  dynamic date,
  dynamic slot,
  dynamic startsAt,
  dynamic endsAt,
}) {
  final d = date?.toString().trim() ?? '';
  final s = slot?.toString().trim().toUpperCase() ?? '';
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(d)) return null;
  final parsedSlot = DeliverySlot.values.asNameMap()[s];
  if (parsedSlot == null) return null;
  final y = int.parse(d.substring(0, 4));
  final m = int.parse(d.substring(5, 7));
  final day = int.parse(d.substring(8, 10));
  return DeliveryWindow(
    date: DateTime.utc(y, m, day),
    slot: parsedSlot,
    startsAtUtc: TimeUtils.tryParseBackendTimestamp(startsAt),
    endsAtUtc: TimeUtils.tryParseBackendTimestamp(endsAt),
  );
}

/// Parses every entry of the order's `preferredDeliveryWindows` array (or its
/// snake_case twin) into dated windows — the web `readDeliveryWindows`. Honors
/// per-window `startsAt`/`endsAt` overrides and the SELLER_HOURS slot; drops
/// malformed entries. Returns const [] when the payload has no array (legacy
/// single-window orders are read by [legacyDeliveryWindow]).
List<DeliveryWindow> readOrderDeliveryWindows(Map<String, dynamic> order) {
  final raw = order['preferredDeliveryWindows'] ?? order['preferred_delivery_windows'];
  if (raw is! List) return const [];
  final windows = <DeliveryWindow>[];
  for (final entry in raw) {
    if (entry is! Map) continue;
    final w = entry.cast<String, dynamic>();
    final parsed = parseDatedWindow(
      date: w['date'] ?? w['deliveryDate'],
      slot: w['slot'] ?? w['deliverySlot'],
      startsAt: w['startsAt'],
      endsAt: w['endsAt'],
    );
    if (parsed != null) windows.add(parsed);
  }
  return windows;
}

/// Legacy single-window order fields (`preferredDeliveryDate`/`Slot` plus their
/// snake_case spellings) — the web `getPrimaryDeliveryWindow` fallback.
DeliveryWindow? legacyDeliveryWindow(Map<String, dynamic> order) =>
    parseDatedWindow(
      date: order['preferredDeliveryDate'] ?? order['preferred_delivery_date'],
      slot: order['preferredDeliverySlot'] ?? order['preferred_delivery_slot'],
    );

/// Parses the seller `availability-windows` endpoint rows (web
/// `AvailabilityWindow[]`: `{key, date, slot, startsAt, endsAt}`) into dated
/// windows. Honors the SELLER_HOURS slot and per-window server `startsAt` /
/// `endsAt` bounds; malformed rows are dropped. Returns const [] when the body
/// has no array — the caller then falls back to the six composite options.
List<DeliveryWindow> parseSellerAvailabilityWindows(dynamic body) {
  if (body is! List) return const [];
  final windows = <DeliveryWindow>[];
  for (final entry in body) {
    if (entry is! Map) continue;
    final w = entry.cast<String, dynamic>();
    final parsed = parseDatedWindow(
      date: w['date'],
      slot: w['slot'] ?? w['deliverySlot'],
      startsAt: w['startsAt'],
      endsAt: w['endsAt'],
    );
    if (parsed != null) windows.add(parsed);
  }
  return windows;
}

/// Resolve the selectable windows NOW: the 6 composites minus any whose EAT
/// end-hour has already passed, in visual order (Today MORNING→EVENING, then
/// Tomorrow).
List<DeliveryWindow> resolveDeliveryWindows(DateTime nowUtc,
        [int productionTimeDays = 0]) =>
    availableDeliveryWindowOptions(nowUtc, productionTimeDays)
        .map((o) => o.resolve(nowUtc, productionTimeDays))
        .toList();

/// Builds the `preferredDeliveryWindows:[{date,slot}]` checkout payload
/// (BUYER_FLOW_SPEC §5.1) from the buyer's selected composite values.
///
/// Mirrors web `resolveCheckoutDeliveryWindows`: results always follow visual
/// day/time order regardless of tap order, and windows whose time has already
/// passed are silently excluded. Pure producer; the checkout step machine owns
/// payload assembly (AU-028).
List<Map<String, dynamic>> preferredDeliveryWindowsPayload(
  Iterable<String> selectedValues,
  DateTime nowUtc, [
  int productionTimeDays = 0,
]) {
  final wanted = selectedValues.toSet();
  return [
    for (final option in kDeliveryWindowOptions)
      if (wanted.contains(option.value) && !option.isPast(nowUtc, productionTimeDays))
        option.resolve(nowUtc, productionTimeDays).toJson(),
  ];
}

/// The longest prep period in the cart — the whole order can only start
/// moving once its slowest item is ready (web `maximumProductionTimeDays`).
int maximumProductionTimeDays(Iterable<int> perItemDays) =>
    perItemDays.fold(0, (max, d) => d > max ? d : max);

/// fulfillmentDeadline for chosen windows (BUYER_FLOW_SPEC §7): END of the
/// FIRST accepted window in EAT → UTC (MORNING→12:00, AFTERNOON→16:00,
/// EVENING→20:00). Null when nothing was accepted.
DateTime? fulfillmentDeadlineFor(List<DeliveryWindow> accepted) {
  if (accepted.isEmpty) return null;
  return accepted.first.endUtc;
}

/// Latest end across several accepted windows — the client-side fallback the
/// web applies when no server deadline exists (multiple buyer windows stay
/// valid until the last one ends). Null when empty.
DateTime? latestWindowEndUtc(List<DeliveryWindow> accepted) {
  if (accepted.isEmpty) return null;
  var best = accepted.first.endUtc;
  for (final w in accepted.skip(1)) {
    final end = w.endUtc;
    if (end.isAfter(best)) best = end;
  }
  return best;
}

/// Day/month names for the dated window labels — web parity `DAY_NAMES` /
/// `MONTH_NAMES`. Dart's weekday is 1=Mon..7=Sun, so `weekday % 7` maps onto
/// this Sunday-first list.
const List<String> _kDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const List<String> _kMonthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// Day header for a server availability window — "Today", "Tomorrow", or
/// "Sat, 21 Sep" (web `availabilityDayLabel`, `lib/seller-schedule.ts:159`).
String availabilityDayLabel(DeliveryWindow window, DateTime nowUtc) {
  final ymd = window.dateYmd;
  if (ymd == TimeUtils.todayYmdEAT(nowUtc)) return 'Today';
  if (ymd == TimeUtils.tomorrowYmdEAT(nowUtc)) return 'Tomorrow';
  final d = window.date;
  return '${_kDayNames[d.weekday % 7]}, ${d.day} ${_kMonthNames[d.month - 1]}';
}

/// Time range inside a day group — "10:00–12:00 EAT" (web
/// `availabilityTimeLabel`). Read off the window's real bounds, so a server
/// `startsAt`/`endsAt` override is honoured instead of the slot's nominal
/// hours.
String availabilityTimeLabel(DeliveryWindow window) {
  String hhmm(DateTime utc) {
    final eat = TimeUtils.toEat(utc);
    return '${eat.hour.toString().padLeft(2, '0')}:'
        '${eat.minute.toString().padLeft(2, '0')}';
  }

  return '${hhmm(window.startUtc)}–${hhmm(window.endUtc)} EAT';
}
