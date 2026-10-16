/// Offset-aware timestamp + EAT (Africa/Dar_es_Salaam) day math.
///
/// Port of the web's `lib/time.ts` convention: backend timestamps arrive as
/// ISO-8601 with offset, naive ISO (treat as UTC), Jackson arrays
/// [y,m,d,h,m,s] or epoch millis. Never parse a naive string as device-local.
class TimeUtils {
  TimeUtils._();

  /// EAT = UTC+3, no DST, constant year-round.
  static const Duration eatOffset = Duration(hours: 3);

  /// Parse any backend timestamp shape to a UTC DateTime. Throws FormatException
  /// only when nothing parseable is present.
  static DateTime parseBackendTimestamp(dynamic raw) {
    if (raw == null) throw const FormatException('null timestamp');
    if (raw is List && raw.isNotEmpty) {
      // Jackson array [y,m,d,h,m,s,(ms)] — naive → treat as UTC.
      return DateTime.utc(
        raw[0].toInt(),
        raw.length > 1 ? raw[1].toInt() : 1,
        raw.length > 2 ? raw[2].toInt() : 1,
        raw.length > 3 ? raw[3].toInt() : 0,
        raw.length > 4 ? raw[4].toInt() : 0,
        raw.length > 5 ? raw[5].toInt() : 0,
      );
    }
    if (raw is num) {
      // Epoch numbers: web `lib/time.ts` auto-detects second-granularity
      // stamps (< 1e12) and scales them to millis. Reading a seconds value as
      // millis would land ~55 years in the past (early 1970), making deadlines
      // and countdowns appear long expired.
      final millis =
          raw.abs() < 1000000000000 ? raw * 1000 : raw;
      return DateTime.fromMillisecondsSinceEpoch(millis.toInt(), isUtc: true);
    }
    final s = raw.toString();
    if (s.isEmpty) throw const FormatException('empty timestamp');
    // epoch millis (13 digits) or seconds (10 digits) smuggled as a digit
    // string — same auto-detect rule as the numeric branch above.
    if (RegExp(r'^\d{13}$').hasMatch(s)) {
      return DateTime.fromMillisecondsSinceEpoch(int.parse(s), isUtc: true);
    }
    if (RegExp(r'^\d{10}$').hasMatch(s)) {
      return DateTime.fromMillisecondsSinceEpoch(int.parse(s) * 1000, isUtc: true);
    }
    var t = s;
    if (!t.contains('T') && t.length >= 10) {
      // date-only → midnight UTC
      final d = DateTime.tryParse('${t}T00:00:00Z');
      if (d != null) return d;
    }
    if (t.endsWith('Z')) {
      final d = DateTime.tryParse(t.replaceFirst('Z', '.000Z'));
      if (d != null) return d.toUtc();
    }
    // ISO with explicit offset other than Z
    final withOffset = RegExp(r'[+-]\d{2}:?\d{2}$').firstMatch(t);
    if (withOffset != null) {
      final d = DateTime.tryParse(t);
      if (d != null) return d.toUtc();
    }
    // Naive ISO → treat as UTC per the convention.
    final d = DateTime.tryParse('${t}Z'.replaceAll('ZZ', 'Z'));
    if (d != null) return d.toUtc();
    throw FormatException('unparseable timestamp: $s');
  }

  static DateTime? tryParseBackendTimestamp(dynamic raw) {
    try {
      return parseBackendTimestamp(raw);
    } on FormatException {
      return null;
    }
  }

  /// Convert a UTC instant to wall-clock EAT components.
  ///
  /// The returned DateTime carries EAT wall-clock values but the UTC flag
  /// (so comparisons never re-convert through the MACHINE timezone — the
  /// classic Dart tz trap; `.add()` preserves isUtc and would silently
  /// shift boundaries when mixed with local-flagged DateTimes).
  static DateTime toEat(DateTime utc) {
    final shifted = utc.toUtc().add(eatOffset);
    return DateTime.utc(
      shifted.year, shifted.month, shifted.day,
      shifted.hour, shifted.minute, shifted.second,
    );
  }

  /// Convert EAT wall-clock components (UTC-flagged) back to a UTC instant.
  static DateTime eatToUtc(DateTime eatWallClock) =>
      DateTime.utc(
        eatWallClock.year, eatWallClock.month, eatWallClock.day,
        eatWallClock.hour, eatWallClock.minute, eatWallClock.second,
      ).subtract(eatOffset);

  static String _two(int n) => n.toString().padLeft(2, '0');

  /// `YYYY-MM-DD` for an EAT wall-clock DateTime.
  static String eatDateYmd(DateTime eat) =>
      '${eat.year}-${_two(eat.month)}-${_two(eat.day)}';

  static String eatFormatDayMonth(DateTime eat) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${_two(eat.day)} ${months[eat.month - 1]}';
  }

  /// Today / Tomorrow in EAT as `YYYY-MM-DD` (for window labels).
  static String todayYmdEAT(DateTime nowUtc) => eatDateYmd(toEat(nowUtc));

  /// Tomorrow's EAT calendar date as `YYYY-MM-DD`.
  static String tomorrowYmdEAT(DateTime nowUtc) =>
      eatDateYmd(toEat(nowUtc).add(const Duration(days: 1)));
}

