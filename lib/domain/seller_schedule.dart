/// A seller's weekly working hours — web `lib/seller-schedule.ts`, backend
/// `SellerSchedule`. Buyers are only offered delivery windows inside these
/// hours, so a seller sets them once before selling.
library;

const List<String> kWeekDays = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

String dayName(String day) =>
    day.isEmpty ? day : day[0] + day.substring(1).toLowerCase();

/// Opening hours for one day, as `HH:mm`. [overnight] means it closes the
/// next day (a bar open 18:00–02:00).
class WorkingHours {
  const WorkingHours(this.opens, this.closes);
  final String opens;
  final String closes;

  bool get overnight => closes.compareTo(opens) < 0;

  WorkingHours copyWith({String? opens, String? closes}) =>
      WorkingHours(opens ?? this.opens, closes ?? this.closes);

  Map<String, dynamic> toJson() =>
      {'opens': opens, 'closes': closes, 'overnight': overnight};

  /// The backend sends `LocalTime` as `"09:00"`, `"09:00:00"` or `[9, 0]`.
  static String _time(Object? v) {
    if (v is List && v.length >= 2) {
      String two(Object? n) => (n as num).toInt().toString().padLeft(2, '0');
      return '${two(v[0])}:${two(v[1])}';
    }
    final s = (v ?? '').toString();
    return s.length >= 5 ? s.substring(0, 5) : s;
  }

  factory WorkingHours.fromJson(Map<String, dynamic> j) =>
      WorkingHours(_time(j['opens']), _time(j['closes']));
}

class SellerSchedule {
  const SellerSchedule({
    required this.timezone,
    required this.days,
    this.closedDates = const [],
    this.excludeTanzaniaPublicHolidays = true,
  });

  final String timezone;

  /// A missing day is closed.
  final Map<String, WorkingHours> days;

  /// `yyyy-MM-dd`, in [timezone].
  final List<String> closedDates;
  final bool excludeTanzaniaPublicHolidays;

  /// Web `defaultSchedule`: weekdays 09:00–17:00, public holidays off.
  factory SellerSchedule.initial() => SellerSchedule(
        timezone: 'Africa/Dar_es_Salaam',
        days: {
          for (final d in kWeekDays.take(5)) d: const WorkingHours('09:00', '17:00')
        },
      );

  SellerSchedule copyWith({
    String? timezone,
    Map<String, WorkingHours>? days,
    List<String>? closedDates,
    bool? excludeTanzaniaPublicHolidays,
  }) =>
      SellerSchedule(
        timezone: timezone ?? this.timezone,
        days: days ?? this.days,
        closedDates: closedDates ?? this.closedDates,
        excludeTanzaniaPublicHolidays:
            excludeTanzaniaPublicHolidays ?? this.excludeTanzaniaPublicHolidays,
      );

  /// Sets or clears one day.
  SellerSchedule withDay(String day, WorkingHours? hours) {
    final next = Map<String, WorkingHours>.of(days);
    if (hours == null) {
      next.remove(day);
    } else {
      next[day] = hours;
    }
    return copyWith(days: next);
  }

  Map<String, dynamic> toJson() => {
        'timezone': timezone,
        'days': {for (final e in days.entries) e.key: e.value.toJson()},
        'closedDates': ([...closedDates]..sort()),
        'excludeTanzaniaPublicHolidays': excludeTanzaniaPublicHolidays,
      };

  static String _date(Object? v) {
    if (v is List && v.length >= 3) {
      String two(Object? n) => (n as num).toInt().toString().padLeft(2, '0');
      return '${v[0]}-${two(v[1])}-${two(v[2])}';
    }
    return (v ?? '').toString();
  }

  factory SellerSchedule.fromJson(Map<String, dynamic> j) {
    final raw = j['days'];
    return SellerSchedule(
      timezone: (j['timezone'] ?? 'Africa/Dar_es_Salaam').toString(),
      days: {
        if (raw is Map)
          for (final e in raw.entries)
            if (e.value is Map)
              e.key.toString(): WorkingHours.fromJson(
                  (e.value as Map).cast<String, dynamic>()),
      },
      closedDates: [
        if (j['closedDates'] is List)
          for (final d in j['closedDates'] as List) _date(d),
      ],
      excludeTanzaniaPublicHolidays: j['excludeTanzaniaPublicHolidays'] != false,
    );
  }
}

/// Web `validateSchedule` — the same rules the backend enforces, caught
/// before the save.
String? validateSchedule(SellerSchedule schedule) {
  if (schedule.days.isEmpty) return 'Choose at least one working day.';
  for (var i = 0; i < kWeekDays.length; i++) {
    final day = kWeekDays[i];
    final hours = schedule.days[day];
    if (hours == null) continue;
    if (hours.opens.isEmpty || hours.closes.isEmpty) {
      return 'Enter opening and closing times for ${dayName(day)}.';
    }
    if (hours.opens == hours.closes) {
      return '${dayName(day)}: opening and closing times must be different.';
    }
    final next = schedule.days[kWeekDays[(i + 1) % 7]];
    if (hours.overnight &&
        next != null &&
        hours.closes.compareTo(next.opens) > 0) {
      return "${dayName(day)} overlaps the next day's opening time.";
    }
  }
  return null;
}

/// Web `TanzaniaHolidaySetting`: the fixed-date holidays the backend skips.
const List<(String, String)> kTanzaniaHolidays = [
  ('1 Jan', 'New Year'),
  ('12 Jan', 'Zanzibar Revolution Day'),
  ('7 Apr', 'Karume Day'),
  ('26 Apr', 'Union Day'),
  ('1 May', 'Labour Day'),
  ('7 Jul', 'Saba Saba'),
  ('8 Aug', 'Nane Nane'),
  ('14 Oct', 'Nyerere Day'),
  ('9 Dec', 'Independence Day'),
  ('25 Dec', 'Christmas'),
  ('26 Dec', 'Boxing Day'),
];
