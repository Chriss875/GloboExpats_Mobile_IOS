import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/checkout_proforma.dart';
import 'package:globoexpats_mobile/domain/rentals.dart';

void main() {
  // The cart keys a line's identity on the rental booking signature, so the
  // booking is the only record of what the buyer actually reserved. Dropping
  // it between cart and proforma creates a rental order with no period at
  // all - web sends `rentalBooking` on every item, so mobile must too.
  test('a rental line carries its booked dates into the proforma payload', () {
    final booking = buildRentalBooking(
      const RentalConfiguration(ratePeriod: RentalRatePeriod.night),
      DateTime(2026, 3, 1),
      DateTime(2026, 3, 4),
      sellerUnitRate: 50000,
      sellingUnitRate: 60000,
    );
    expect(booking.isComplete, isTrue);

    final payload = buildItemsPayload([
      CheckoutLine(productId: 7, quantity: 1, price: 180000, rentalBooking: booking),
    ]);

    expect(payload, hasLength(1));
    final sent = payload.single['rentalBooking'] as Map<String, dynamic>;
    expect(sent['ratePeriod'], 'NIGHT');
    expect(sent['startDate'], '2026-03-01');
    expect(sent['endDate'], '2026-03-04');
    expect(sent['billableUnits'], 3);
  });

  test('a non-rental line still sends no rentalBooking key at all', () {
    final payload = buildItemsPayload([
      const CheckoutLine(productId: 8, quantity: 2, price: 1000),
    ]);
    expect(payload.single.containsKey('rentalBooking'), isFalse);
  });
}
