import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/delivery_windows.dart';
import 'package:globoexpats_mobile/domain/time_utils.dart';

void main() {
  // Reference instants (UTC). EAT = UTC+3.
  final morning = DateTime.utc(2026, 8, 22, 6, 0); // 09:00 EAT → all 6 open

  group('option inventory (web DELIVERY_WINDOW_OPTIONS parity)', () {
    test('exactly 6 composites in visual order', () {
      expect(kDeliveryWindowOptions, hasLength(6));
      expect(kDeliveryWindowOptions.map((o) => o.value), [
        'TODAY_MORNING',
        'TODAY_AFTERNOON',
        'TODAY_EVENING',
        'TOMORROW_MORNING',
        'TOMORROW_AFTERNOON',
        'TOMORROW_EVENING',
      ]);
    });

    test('slot labels + hours captions byte-identical to reference', () {
      expect(DeliverySlot.MORNING.label, 'Morning');
      expect(DeliverySlot.MORNING.hours, '10:00 – 12:00');
      expect(DeliverySlot.AFTERNOON.label, 'Afternoon');
      expect(DeliverySlot.AFTERNOON.hours, '12:00 – 16:00');
      expect(DeliverySlot.EVENING.label, 'Evening');
      expect(DeliverySlot.EVENING.hours, '16:00 – 20:00');
      expect(DeliveryDay.TODAY.label, 'Today');
      expect(DeliveryDay.TOMORROW.label, 'Tomorrow');
    });

    test('accessibility label matches web aria-label shape', () {
      const opt = DeliveryWindowOption(
          day: DeliveryDay.TODAY, slot: DeliverySlot.AFTERNOON);
      expect(opt.accessibilityLabel, 'Today Afternoon, 12:00 – 16:00');
      expect(opt.summaryLabel, 'Today Afternoon (12:00–16:00)');
    });

    test('round-trips through composite value strings', () {
      for (final o in kDeliveryWindowOptions) {
        expect(deliveryWindowOptionFromValue(o.value), o);
      }
      expect(deliveryWindowOptionFromValue('YESTERDAY_MORNING'), isNull);
      expect(deliveryWindowOptionFromValue('TODAY'), isNull);
      expect(deliveryWindowOptionFromValue('garbage'), isNull);
    });
  });

  group('EAT day math (never device-local)', () {
    test('TODAY/TOMORROW resolve to EAT calendar days across the UTC boundary',
        () {
      // 2026-08-22T21:00Z == 2026-08-23 00:00 EAT → "today" is Aug 23 in EAT.
      final atMidnightEat = DateTime.utc(2026, 8, 22, 21, 0);
      expect(TimeUtils.eatDateYmd(DeliveryDay.TODAY.eatDate(atMidnightEat)),
          '2026-08-23');
      expect(TimeUtils.eatDateYmd(DeliveryDay.TOMORROW.eatDate(atMidnightEat)),
          '2026-08-24');
      // Same UTC instant minus one second is still Aug 22 in EAT.
      final justBefore = DateTime.utc(2026, 8, 22, 20, 59, 59);
      expect(TimeUtils.eatDateYmd(DeliveryDay.TODAY.eatDate(justBefore)),
          '2026-08-22');
      expect(TimeUtils.eatDateYmd(DeliveryDay.TOMORROW.eatDate(justBefore)),
          '2026-08-23');
    });

    test('resolve is independent of the device timezone', () {
      // Sanity guard: results derive only from nowUtc (+03:00 fixed offset).
      final w = resolveDeliveryWindows(morning);
      expect(w.map((x) => x.dateYmd), [
        '2026-08-22', '2026-08-22', '2026-08-22',
        '2026-08-23', '2026-08-23', '2026-08-23',
      ]);
      expect(w.map((x) => x.slot.name), [
        'MORNING', 'AFTERNOON', 'EVENING', 'MORNING', 'AFTERNOON', 'EVENING',
      ]);
    });
  });

  test('resolveDeliveryWindows returns all 6 composites in the morning', () {
    final w = resolveDeliveryWindows(morning);
    expect(w.length, 6);
    final todaySlots = w.take(3).map((x) => x.slot).toSet();
    final tomorrowSlots = w.skip(3).map((x) => x.slot).toSet();
    expect(todaySlots.length, 3);
    expect(tomorrowSlots.length, 3);
  });

  test('past windows are dropped silently (13:00 EAT)', () {
    final at1300eat = DateTime.utc(2026, 8, 22, 10, 0); // 13:00 EAT
    final w = resolveDeliveryWindows(at1300eat);
    // MORNING (ends 12:00) is gone; today AFTERNOON/EVENING + tomorrow's 3.
    expect(w.length, 5);
    expect(w.first.dateYmd, '2026-08-22');
    expect(w.first.slot, DeliverySlot.AFTERNOON);
    expect(w.any((x) => x.dateYmd == '2026-08-22' &&
        x.slot == DeliverySlot.MORNING), isFalse);
  });

  test('window expires exactly AT its end hour (boundary ≤)', () {
    // 12:00:00 EAT sharp → TODAY_MORNING just became unselectable.
    final atNoonEat = DateTime.utc(2026, 8, 22, 9, 0);
    expect(
      availableDeliveryWindowOptions(atNoonEat)
          .any((o) => o.value == 'TODAY_MORNING'),
      isFalse,
    );
    // One second earlier it was still selectable.
    final before = DateTime.utc(2026, 8, 22, 8, 59, 59);
    expect(
      availableDeliveryWindowOptions(before)
          .any((o) => o.value == 'TODAY_MORNING'),
      isTrue,
    );
  });

  test('evening-only remains late at night (tomorrow carries over)', () {
    final at2100eat = DateTime.utc(2026, 8, 22, 18, 0); // 21:00 EAT
    final w = resolveDeliveryWindows(at2100eat);
    expect(w.length, 3);
    for (final x in w) {
      expect(x.dateYmd, '2026-08-23');
    }
    expect(availableDeliveryWindowOptions(at2100eat)
        .every((o) => o.day == DeliveryDay.TOMORROW), isTrue);
  });

  group('payload shape (BUYER_FLOW_SPEC §5.1 preferredDeliveryWindows[])', () {
    test('{date: YYYY-MM-DD, slot: NAME} entries', () {
      final j = resolveDeliveryWindows(morning).first.toJson();
      expect(j, {'date': '2026-08-22', 'slot': 'MORNING'});
      expect(j.keys.toSet(), {'date', 'slot'});
    });

    test('selection order does not leak; output stays in visual order', () {
      final payload = preferredDeliveryWindowsPayload(
        ['TOMORROW_EVENING', 'TODAY_EVENING'],
        morning,
      );
      expect(payload, [
        {'date': '2026-08-22', 'slot': 'EVENING'},
        {'date': '2026-08-23', 'slot': 'EVENING'},
      ]);
    });

    test('already-passed selections are silently excluded', () {
      final at1700eat = DateTime.utc(2026, 8, 22, 14, 0); // 17:00 EAT
      final payload = preferredDeliveryWindowsPayload(
        [
          'TODAY_MORNING', // ended 12:00 EAT → dropped
          'TODAY_AFTERNOON', // ended 16:00 EAT → dropped
          'TODAY_EVENING', // runs to 20:00 EAT → still open
          'TOMORROW_MORNING',
        ],
        at1700eat,
      );
      expect(payload, [
        {'date': '2026-08-22', 'slot': 'EVENING'},
        {'date': '2026-08-23', 'slot': 'MORNING'},
      ]);
    });

    test('empty selection → empty payload (pickup / no-logistics path)', () {
      expect(preferredDeliveryWindowsPayload(const [], morning), isEmpty);
    });
  });

  group('dated window parsing (web readDeliveryWindows parity)', () {
    test('accepts strict date + known slot, case/whitespace tolerant on slot', () {
      final w = parseDatedWindow(date: '2026-09-01', slot: 'afternoon');
      expect(w, isNotNull);
      expect(w!.toJson(), {'date': '2026-09-01', 'slot': 'AFTERNOON'});
    });

    test('rejects malformed dates and unknown slots', () {
      expect(parseDatedWindow(date: '2026-9-1', slot: 'MORNING'), isNull);
      expect(parseDatedWindow(date: '01/09/2026', slot: 'MORNING'), isNull);
      expect(parseDatedWindow(date: '', slot: ''), isNull);
      expect(parseDatedWindow(date: null, slot: null), isNull);
      expect(parseDatedWindow(date: '2026-09-01', slot: 'NIGHT'), isNull);
    });

    test('start/end instants round-trip through UTC+3', () {
      final w = parseDatedWindow(date: '2026-08-23', slot: 'AFTERNOON')!;
      expect(w.startUtc, DateTime.utc(2026, 8, 23, 9, 0)); // 12:00 EAT
      expect(w.endUtc, DateTime.utc(2026, 8, 23, 13, 0)); // 16:00 EAT
    });
  });

  group('fulfillmentDeadline rules (§7)', () {
    test('T23 vector: tomorrow-AFTERNOON ⇒ tomorrow 13:00Z (16:00 EAT)', () {
      final w = resolveDeliveryWindows(morning);
      final tomorrowAfternoon = w
          .firstWhere((x) => x.dateYmd == '2026-08-23' &&
              x.slot == DeliverySlot.AFTERNOON);
      expect(fulfillmentDeadlineFor([tomorrowAfternoon]),
          DateTime.utc(2026, 8, 23, 13, 0));
    });

    test('each slot maps END-of-window in EAT → UTC', () {
      DateTime? deadlineFor(String ymd, String slotName) {
        final w = parseDatedWindow(date: ymd, slot: slotName)!;
        return fulfillmentDeadlineFor([w]);
      }

      expect(deadlineFor('2026-08-23', 'MORNING'),
          DateTime.utc(2026, 8, 23, 9, 0)); // 12:00 EAT
      expect(deadlineFor('2026-08-23', 'AFTERNOON'),
          DateTime.utc(2026, 8, 23, 13, 0)); // 16:00 EAT
      expect(deadlineFor('2026-08-23', 'EVENING'),
          DateTime.utc(2026, 8, 23, 17, 0)); // 20:00 EAT
    });

    test('deadline uses the FIRST accepted window', () {
      final accepted = [
        parseDatedWindow(date: '2026-08-22', slot: 'EVENING')!,
        parseDatedWindow(date: '2026-08-23', slot: 'MORNING')!,
      ];
      expect(fulfillmentDeadlineFor(accepted),
          DateTime.utc(2026, 8, 22, 17, 0)); // first window's end
    });

    test('null when nothing accepted', () {
      expect(fulfillmentDeadlineFor(const []), isNull);
    });

    test('latestWindowEndUtc spans multiple buyer windows', () {
      final accepted = [
        parseDatedWindow(date: '2026-08-22', slot: 'EVENING')!,
        parseDatedWindow(date: '2026-08-23', slot: 'MORNING')!,
      ];
      expect(latestWindowEndUtc(accepted), DateTime.utc(2026, 8, 23, 9, 0));
      expect(latestWindowEndUtc(const []), isNull);
    });

    test('dispatch allowance: opens 1 h before slot start (§7)', () {
      final w = parseDatedWindow(date: '2026-08-23', slot: 'AFTERNOON')!;
      final dispatchOpensAt =
          w.startUtc.subtract(const Duration(hours: 1)); // 11:00 EAT
      expect(dispatchOpensAt, DateTime.utc(2026, 8, 23, 8, 0));
    });
  });

  test('window labels Today/Tomorrow computed in EAT', () {
    final w = resolveDeliveryWindows(morning);
    expect(w[0].label('2026-08-22', '2026-08-23'), 'Today · Morning');
    expect(w[5].label('2026-08-22', '2026-08-23'), 'Tomorrow · Evening');
    expect(
      w[5].summaryLabel('2026-08-22', '2026-08-23'),
      'Tomorrow Evening (16:00–20:00)',
    );
    // Non-today/tomorrow fallback formats as "DD Mon".
    final later = parseDatedWindow(date: '2026-08-25', slot: 'EVENING')!;
    expect(later.label('2026-08-22', '2026-08-23'), '25 Aug · Evening');
    expect(later.summaryLabel('2026-08-22', '2026-08-23'),
        '25 Aug Evening (16:00–20:00)');
  });
}
