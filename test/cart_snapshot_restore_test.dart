import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/domain/rentals.dart';

/// CARTCH-03 / APISUR-05: when a proforma expires/cancels, the checkout writes a
/// durable cart snapshot (`KvStore.kProformaCartSnapshot`) BEFORE clearing the
/// cart, and the "start over" / restore action merges it back by line id. This
/// guards the round-trip: a rental line (booking + region/transport fields)
/// must survive toJson → fromJson → restoreSnapshot with identity and qty merge.
void main() {
  // A complete (serializable) booking — RentalBooking.toJson refuses null dates.
  RentalBooking booking({int units = 2}) => RentalBooking(
        listingType: 'FOR_RENT',
        ratePeriod: 'DAY',
        startDate: DateTime(2026, 1, 10),
        endDate: DateTime(2026, 1, 12),
        pickupTime: '09:00',
        returnTime: '18:00',
        billableUnits: units,
        sellerUnitRate: 100000,
        sellingUnitRate: 200000,
        sellerTotal: (100000 * units).toDouble(),
        sellingTotal: (200000 * units).toDouble(),
      );

  CartItem rentalLine({int qty = 1}) => CartItem(
        productId: 300,
        sellerId: '42',
        sellerName: 'Rental Owner',
        title: 'Projector',
        price: 200000,
        category: 'electronics',
        location: 'Mikocheni, Dar es Salaam, Tanzania',
        productRegion: 'Dar es Salaam',
        productCountry: 'Tanzania',
        transportRequirement: 'EXEMPT', // rentals never use delivery logistics
        quantity: qty,
        rentalBooking: booking(),
      );

  test('rental cart line survives toJson → fromJson → restoreSnapshot', () {
    final cart = CartStore();
    final line = rentalLine();
    cart.addDetail(
      productId: line.productId,
      sellerId: line.sellerId,
      sellerName: line.sellerName,
      title: line.title,
      price: line.price,
      category: line.category,
      location: line.location,
      productRegion: line.productRegion,
      productCountry: line.productCountry,
      transportRequirement: line.transportRequirement,
      rentalBooking: booking(),
    );

    final snapshot = [for (final i in cart.items) i.toJson()];
    expect(snapshot.single['rentalBooking'], isNotNull,
        reason: 'booking must be serialized into the snapshot');
    expect(snapshot.single['productRegion'], 'Dar es Salaam');
    expect(snapshot.single['transportRequirement'], 'EXEMPT');

    cart.clear();
    expect(cart.isEmpty, isTrue);

    cart.restoreSnapshot(snapshot);
    expect(cart.items.length, 1);
    final restored = cart.items.single;
    expect(restored.productId, 300);
    expect(restored.sellerId, '42');
    expect(restored.productRegion, 'Dar es Salaam');
    expect(restored.productCountry, 'Tanzania');
    expect(restored.transportRequirement, 'EXEMPT');
    expect(restored.selected, isTrue);
    expect(restored.rentalBooking, isNotNull);
    expect(restored.rentalBooking!.listingType, 'FOR_RENT');
    expect(restored.rentalBooking!.ratePeriod, 'DAY');
    expect(restored.rentalBooking!.billableUnits, 2);
    expect(restored.rentalBooking!.startDate, DateTime(2026, 1, 10));
  });

  test('restoreSnapshot merges quantity by line id and re-selects', () {
    final cart = CartStore();
    cart.addDetail(
      productId: 300,
      sellerId: '42',
      title: 'Projector',
      price: 200000,
      transportRequirement: 'EXEMPT',
      rentalBooking: booking(),
    );
    // Existing line is deselected and carries qty 1.
    cart.items.single.selected = false;
    cart.items.single.quantity = 1;

    final snapshot = [for (final i in cart.items) i.toJson()];
    // Snapshot records the same line with qty 2 (e.g. buyer raised it before
    // the invoice); restore must ADD to the existing 1 → 3 and reselect.
    snapshot.single['quantity'] = 2;

    cart.restoreSnapshot(snapshot);
    final restored = cart.items.single;
    expect(restored.quantity, 3);
    expect(restored.selected, isTrue);
  });

  test('restoreSnapshot skips junk lines and a fresh empty snapshot is a no-op',
      () {
    final cart = CartStore();
    cart.restoreSnapshot(const <Map<String, dynamic>>[]);
    expect(cart.isEmpty, isTrue);

    cart.restoreSnapshot(const [
      {'productId': 1, 'title': 'Bad — no lineId'},
    ]);
    expect(cart.isEmpty, isTrue);
  });
}
