import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/time_utils.dart';

/// Epoch-seconds auto-detection in [TimeUtils.parseBackendTimestamp],
/// mirroring web `lib/time.ts` (`value < 1e12 ? value * 1000 : value`) so a
/// second-granularity backend stamp is not read as millis (which would land
/// ~55 years in the past and make deadlines/countdowns look long expired).
void main() {
  // 2026-01-01T00:00:00Z as epoch seconds and as epoch millis.
  final expected = DateTime.utc(2026, 1, 1);
  const asSeconds = 1767225600;
  const asMillis = 1767225600000;

  group('epoch seconds auto-detect', () {
    test('numeric epoch seconds are scaled to millis', () {
      expect(TimeUtils.parseBackendTimestamp(asSeconds), expected);
    });

    test('numeric epoch millis are left untouched', () {
      expect(TimeUtils.parseBackendTimestamp(asMillis), expected);
    });

    test('digit-string epoch seconds are scaled too', () {
      expect(TimeUtils.parseBackendTimestamp('$asSeconds'), expected);
    });

    test('digit-string epoch millis still parse', () {
      expect(TimeUtils.parseBackendTimestamp('$asMillis'), expected);
    });

    test('negative-free ordinary millis before 2001 still parse as seconds '
        'like the web (value < 1e12)', () {
      // 1e9 as seconds = 2001-09-09; web treats anything < 1e12 as seconds.
      expect(TimeUtils.parseBackendTimestamp(1000000000),
          DateTime.fromMillisecondsSinceEpoch(1000000000000, isUtc: true));
    });

    test('ISO and Jackson array shapes are unchanged', () {
      expect(TimeUtils.parseBackendTimestamp('2026-01-01T00:00:00Z'), expected);
      expect(TimeUtils.parseBackendTimestamp([2026, 1, 1]), expected);
    });

    test('null still throws', () {
      expect(() => TimeUtils.parseBackendTimestamp(null),
          throwsA(isA<FormatException>()));
    });
  });
}
