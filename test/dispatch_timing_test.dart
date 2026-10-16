import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/dispatch.dart';

/// Phase 3, unit 3 (time): the seller can now see when dispatch unlocks
/// instead of finding out from a rejected request. Port of the web
/// `lib/order-delivery-deadline.ts`.
///
/// Windows are EAT (UTC+3), so a MORNING window on 2026-09-10 starts at
/// 10:00 EAT = 07:00 UTC, and dispatch opens an hour before that: 06:00 UTC.
void main() {
  Map<String, dynamic> orderWithWindows(List<Map<String, String>> windows) =>
      {'preferredDeliveryWindows': windows};

  final morningOpensAt = DateTime.utc(2026, 9, 10, 6);

  group('when dispatch unlocks', () {
    test('one hour before the window starts, in EAT', () {
      final order = orderWithWindows([
        {'date': '2026-09-10', 'slot': 'MORNING'}
      ]);
      expect(dispatchOpensAt(order), morningOpensAt);
    });

    test('the earliest accepted window wins when the buyer picked several', () {
      final order = orderWithWindows([
        {'date': '2026-09-12', 'slot': 'EVENING'},
        {'date': '2026-09-10', 'slot': 'MORNING'},
      ]);
      // Web lib/order-delivery-deadline.ts:110-116: the allowance runs from the
      // EARLIEST window the buyer accepted, not whichever they listed first.
      // MORNING 2026-09-10 starts 10:00 EAT = 07:00 UTC → dispatch opens 06:00 UTC.
      expect(dispatchOpensAt(order), DateTime.utc(2026, 9, 10, 6));
    });

    test('the server dispatchOpensAt is authoritative when present', () {
      final order = {
        'dispatchOpensAt': '2026-09-10T09:30:00+03:00', // 06:30 UTC
        'preferredDeliveryWindows': [
          {'date': '2026-09-10', 'slot': 'MORNING'}, // would open 06:00 UTC
        ],
      };
      expect(dispatchOpensAt(order), DateTime.utc(2026, 9, 10, 6, 30));
    });

    test('a SELLER_HOURS window uses the whole-day slot start', () {
      // SELLER_HOURS runs 00:00–24:00 EAT; 2026-09-10 00:00 EAT = 21:00 UTC on
      // the 9th, so dispatch opens an hour before that: 20:00 UTC on the 9th.
      final order = orderWithWindows([
        {'date': '2026-09-10', 'slot': 'SELLER_HOURS'},
      ]);
      expect(dispatchOpensAt(order), DateTime.utc(2026, 9, 9, 20));
    });

    test('server startsAt overrides the slot start for the allowance', () {
      final order = orderWithWindows([
        {
          'date': '2026-09-10',
          'slot': 'AFTERNOON', // fixed start 12:00 EAT = 09:00 UTC
          'startsAt': '2026-09-10T11:00:00+03:00', // 08:00 UTC override
        },
      ]);
      expect(dispatchOpensAt(order), DateTime.utc(2026, 9, 10, 7));
    });

    test('falls back to the legacy single-window fields', () {
      expect(
        dispatchOpensAt({
          'preferredDeliveryDate': '2026-09-10',
          'preferredDeliverySlot': 'morning',
        }),
        morningOpensAt,
      );
    });

    test('tolerates the snake_case spelling', () {
      expect(
        dispatchOpensAt({
          'preferred_delivery_date': '2026-09-10',
          'preferred_delivery_slot': 'MORNING',
        }),
        morningOpensAt,
      );
    });
  });

  group('never blocks on data it cannot read', () {
    test('no window at all', () {
      expect(dispatchOpensAt(const {}), isNull);
      expect(isDispatchTooEarlyLocally(const {}), isFalse);
      expect(dispatchUnlockLabel(const {}), isNull);
    });

    test('a malformed date or an unknown slot', () {
      final bad = orderWithWindows([
        {'date': '10/09/2026', 'slot': 'MORNING'},
        {'date': '2026-09-10', 'slot': 'LUNCHTIME'},
      ]);
      expect(dispatchOpensAt(bad), isNull);
      expect(isDispatchTooEarlyLocally(bad), isFalse,
          reason: 'unreadable data must leave the backend authoritative');
    });
  });

  group('too early', () {
    final order = orderWithWindows([
      {'date': '2026-09-10', 'slot': 'MORNING'}
    ]);

    test('is true before the unlock and false from the moment it passes', () {
      expect(
          isDispatchTooEarlyLocally(order,
              now: morningOpensAt.subtract(const Duration(minutes: 1))),
          isTrue);
      expect(isDispatchTooEarlyLocally(order, now: morningOpensAt), isFalse);
      expect(
          isDispatchTooEarlyLocally(order,
              now: morningOpensAt.add(const Duration(hours: 2))),
          isFalse);
    });
  });

  group('the label the seller reads', () {
    final order = orderWithWindows([
      {'date': '2026-09-10', 'slot': 'MORNING'}
    ]);

    String? label(DateTime now) => dispatchUnlockLabel(order, now: now);

    test('counts minutes under an hour', () {
      expect(label(morningOpensAt.subtract(const Duration(minutes: 45))),
          'Unlocks at 09:00 (45 min)');
    });

    test('counts hours and minutes beyond that', () {
      expect(label(morningOpensAt.subtract(const Duration(hours: 2, minutes: 30))),
          'Unlocks at 09:00 (2h 30m)');
      expect(label(morningOpensAt.subtract(const Duration(hours: 3))),
          'Unlocks at 09:00 (3h)');
    });

    test('says so plainly once dispatch is open', () {
      expect(label(morningOpensAt), 'Dispatch is available now');
      expect(label(morningOpensAt.add(const Duration(days: 1))),
          'Dispatch is available now');
    });
  });
}
