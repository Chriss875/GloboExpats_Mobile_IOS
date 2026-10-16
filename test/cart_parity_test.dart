import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/domain/rentals.dart';
import 'package:globoexpats_mobile/screens/cart_screen.dart';

/// CARTCH-07 / CARTCH-18 / CARTCH-19 (cart tile + empty state parity):
/// rental lines show a booking chip and no qty stepper / no shipping note,
/// ordinary lines keep the stepper + shipping note, the empty state offers a
/// "Start Shopping" CTA back to /browse.
void main() {
  RentalBooking booking() => RentalBooking(
        listingType: 'FOR_RENT',
        ratePeriod: 'DAY',
        startDate: DateTime(2026, 1, 10),
        endDate: DateTime(2026, 1, 12),
        pickupTime: '09:00',
        returnTime: '18:00',
        billableUnits: 2,
        sellerUnitRate: 100000,
        sellingUnitRate: 200000,
        sellerTotal: 200000,
        sellingTotal: 400000,
      );

  testWidgets('rental line shows booking chip, hides qty stepper and shipping',
      (tester) async {
    final cart = CartStore();
    cart.addDetail(
      productId: 9,
      sellerId: '1',
      sellerName: 'Rental Owner',
      title: 'Projector rental',
      price: 200000,
      transportRequirement: 'EXEMPT', // rentals never use delivery logistics
      rentalBooking: booking(),
    );
    await tester.pumpWidget(MaterialApp(home: CartScreen(cart: cart)));
    await tester.pump();
    await tester.pump();

    expect(find.text('Rental booking'), findsOneWidget);
    expect(find.text('10/01/2026 at 09:00 to 12/01/2026 at 18:00'),
        findsOneWidget);
    expect(find.text('2 days'), findsOneWidget);
    expect(find.text('Shipping calculated at checkout'), findsNothing);
    expect(find.text('Qty '), findsNothing);
  });

  testWidgets('ordinary line keeps the qty stepper and the shipping note',
      (tester) async {
    final cart = CartStore();
    cart.addDetail(
      productId: 3,
      sellerId: '1',
      sellerName: 'Local Seller',
      title: 'Standing desk',
      price: 350000,
      condition: 'like-new',
      location: 'Dar es Salaam',
    );
    await tester.pumpWidget(MaterialApp(home: CartScreen(cart: cart)));
    await tester.pump();
    await tester.pump();

    expect(find.text('Rental booking'), findsNothing);
    expect(find.text('Shipping calculated at checkout'), findsOneWidget);
    expect(find.text('Qty '), findsOneWidget);
    // Condition slug is shown as the ITEM_CONDITIONS label (CARTCH-19).
    expect(find.text('LIKE NEW'), findsOneWidget);
  });

  testWidgets('empty state offers the Start Shopping CTA', (tester) async {
    final cart = CartStore();
    await tester.pumpWidget(MaterialApp(home: CartScreen(cart: cart)));
    await tester.pump();

    expect(find.text('Your cart is empty'), findsOneWidget);
    expect(find.text('Start Shopping'), findsOneWidget);
  });
}
