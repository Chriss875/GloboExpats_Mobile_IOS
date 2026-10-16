import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/checkout_proforma.dart';
import 'package:globoexpats_mobile/domain/delivery_windows.dart';

void main() {
  // 10:00 EAT on 1 Mar 2026 => 07:00 UTC. Early enough that every slot is
  // still open, so any date shift is unambiguously the prep period.
  final now = DateTime.utc(2026, 3, 1, 7);

  group('production time shifts the offered delivery windows', () {
    test('with no prep period the windows are today and tomorrow', () {
      final windows = resolveDeliveryWindows(now);
      expect(windows.first.dateYmd, '2026-03-01');
      expect(windows.last.dateYmd, '2026-03-02');
    });

    test('a 5-day prep period pushes every window 5 days out', () {
      final windows = resolveDeliveryWindows(now, 5);
      expect(windows.first.dateYmd, '2026-03-06');
      expect(windows.last.dateYmd, '2026-03-07');
    });

    test('the payload carries the shifted dates, not today', () {
      final payload =
          preferredDeliveryWindowsPayload({'TODAY_MORNING'}, now, 5);
      expect(payload.single['date'], '2026-03-06');
      expect(payload.single['slot'], 'MORNING');
    });

    test('the whole cart waits for its slowest item', () {
      expect(maximumProductionTimeDays([0, 3, 7, 2]), 7);
      expect(maximumProductionTimeDays(const <int>[]), 0);
    });

    test('buyDetails sends the shifted window date', () {
      final details = buildBuyDetails(
        address: const CheckoutAddressInput(
          firstName: 'A', lastName: 'B', emailAddress: 'a@b.com',
          phoneNumber: '+255700000000', address: 'St', city: 'Dar',
          country: 'Tanzania',
        ),
        fulfillmentType: 'SELLER_DELIVERY',
        paymentMethodType: 'MOBILE_MONEY',
        deliveryFee: 4000,
        subtotal: 100000,
        selectedWindowValues: const {'TODAY_MORNING'},
        nowUtc: now,
        productionTimeDays: 5,
      );
      expect(details['preferredDeliveryDate'], '2026-03-06');
      expect((details['preferredDeliveryWindows'] as List).single['date'],
          '2026-03-06');
    });

    test('a prep period keeps every slot selectable, including ones already '
        'past today', () {
      // 19:00 EAT: today's morning+afternoon have closed for a same-day item.
      final evening = DateTime.utc(2026, 3, 1, 16);
      expect(resolveDeliveryWindows(evening).length, lessThan(6));
      // With a prep period those slots are days away, so none has passed.
      expect(resolveDeliveryWindows(evening, 5).length, 6);
    });
  });
}
