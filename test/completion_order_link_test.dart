import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/checkout_proforma.dart';

/// "i completed checkout i clicked view order details and it took me to
/// myspace with blank screen".
///
/// The completion step derived its link from `sellerGroups[].orderId` and
/// fell back to the proforma NUMBER — or to an empty string when the refresh
/// after a wallet payment came back without either. Both end up on the
/// buyer's order LIST rather than the order: `/orders/<proforma number>`
/// finds nothing, and `/orders/` normalises to `/orders`, which is My Space
/// with a list in it — the blank screen.
void main() {
  group('the order id behind View Order Details', () {
    test('is the first seller group that has one', () {
      expect(
          firstProformaOrderId(const {
            'proformaNumber': 'PRF-2026-000123',
            'sellerGroups': [
              {'sellerId': '1'},
              {'sellerId': '2', 'orderId': 'ORD-2026-000045'},
            ],
          }),
          'ORD-2026-000045');
    });

    test('is null rather than the proforma number', () {
      // The proforma number is not an order id. Routing to it 404s, and the
      // buyer lands on a list instead of their order.
      expect(
          firstProformaOrderId(const {
            'proformaNumber': 'PRF-2026-000123',
            'proformaId': 'abc-def',
            'sellerGroups': [
              {'sellerId': '1'},
            ],
          }),
          isNull);
    });

    test('is null when the webhook has not written the orders yet', () {
      // Selcom's webhook creates the orders; the status poll can report
      // COMPLETED before it has landed.
      expect(firstProformaOrderId(const {'sellerGroups': []}),
          isNull);
      expect(firstProformaOrderId(const {}), isNull);
    });

    test('ignores a group whose order id is blank', () {
      expect(
          firstProformaOrderId(const {
            'sellerGroups': [
              {'orderId': '   '},
              {'orderId': 'ORD-9'},
            ],
          }),
          'ORD-9');
    });
  });
}
