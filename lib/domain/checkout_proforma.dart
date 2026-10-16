import 'delivery_windows.dart';
import 'rentals.dart' show RentalBooking;

/// Proforma creation payload assembly + price guard (BUYER_FLOW_SPEC §5,
/// AU-028). Pure producers so the checkout step machine only wires state into
/// them — and the tests can assert the exact wire shape without widgets.
// ignore_for_file: constant_identifier_names

/// Cart line accepted by [buildBuyDetails]/[buildItemsPayload]: the fields
/// checkout needs from a `CartItem` (kept structural so widget tests can pass
/// plain fixtures).
class CheckoutLine {
  final int productId;
  final int quantity;
  final double price;
  final String? sellerId;
  final List<({int definitionId, String valueId})> selectedChoices;

  /// The booked dates when this line is a rental. Without it the proforma is
  /// created for a rental with no period at all — the cart carries the
  /// booking (line identity is even keyed on it), so dropping it here loses
  /// the only record of what the buyer actually reserved.
  final RentalBooking? rentalBooking;
  const CheckoutLine({
    required this.productId,
    required this.quantity,
    required this.price,
    this.sellerId,
    this.selectedChoices = const [],
    this.rentalBooking,
  });
}

/// Address/fulfillment inputs captured on Step 1 (structural view of the
/// form state — mirrors web `ShippingAddress`).
class CheckoutAddressInput {
  final String firstName;
  final String lastName;
  final String emailAddress;
  final String phoneNumber;
  final String address;
  final String label;
  final String placeName;
  final String neighbourhood;
  final String city;
  final String country;
  final String zipCode;

  /// Map-pin lockstep with the chosen saved address (null when the address
  /// has no usable pin — the backend then quotes/bills without coordinates).
  final double? latitude;
  final double? longitude;
  const CheckoutAddressInput({
    required this.firstName,
    required this.lastName,
    required this.emailAddress,
    required this.phoneNumber,
    required this.address,
    this.label = '',
    this.placeName = '',
    this.neighbourhood = '',
    required this.city,
    required this.country,
    this.zipCode = '',
    this.latitude,
    this.longitude,
  });
}

/// Builds the `buyDetails` map EXACTLY per BUYER_FLOW_SPEC §5.1.
///
/// Invariants asserted by test T9/T26:
/// - real enums only (`fulfillmentType` ∈ SELLER_DELIVERY|BUYER_PICKUP,
///   `paymentMethodType` ∈ MOBILE_MONEY|BANK_TRANSFER) — never 'CARD'/'SALE';
/// - `state` is its own field, never a copy of the city text;
/// - `latitude`/`longitude` present (possibly null) — the key must exist;
/// - `preferredDeliveryWindows[]` dated composites, first mirrored to the
///   legacy `preferredDeliveryDate`+`preferredDeliverySlot`;
/// - `deliveryFee` = quoted total for delivery orders, 0 for pickup;
/// - `totalAmount` = round2(subtotal + deliveryFee).
Map<String, dynamic> buildBuyDetails({
  required CheckoutAddressInput address,
  required String fulfillmentType,
  required String paymentMethodType,
  required double deliveryFee,
  required double subtotal,
  required Iterable<String> selectedWindowValues,
  required DateTime nowUtc,
  int productionTimeDays = 0,
  List<Map<String, dynamic>>? resolvedDeliveryWindows,
}) {
  assert(
      fulfillmentType == 'SELLER_DELIVERY' || fulfillmentType == 'BUYER_PICKUP',
      'fulfillmentType must be a real backend enum');
  assert(
      paymentMethodType == 'MOBILE_MONEY' ||
          paymentMethodType == 'BANK_TRANSFER',
      'paymentMethodType must be a real backend enum');

  final windows = resolvedDeliveryWindows != null
      ? [
          for (final window in resolvedDeliveryWindows)
            Map<String, dynamic>.from(window)
        ]
      : preferredDeliveryWindowsPayload(
          selectedWindowValues, nowUtc, productionTimeDays);
  if (fulfillmentType == 'SELLER_DELIVERY') {
    if (windows.isEmpty) {
      throw StateError(
          'At least one preferred delivery window (with a date) is required.');
    }
  } else {
    // Pickup: no windows are sent (fee 0, quote skipped per §4.1).
    windows.clear();
  }

  final fee = fulfillmentType == 'BUYER_PICKUP' ? 0.0 : deliveryFee;
  final primary = windows.isNotEmpty ? windows.first : null;

  return <String, dynamic>{
    'firstName': address.firstName.trim(),
    'lastName': address.lastName.trim(),
    'emailAddress': address.emailAddress.trim(),
    'phoneNumber': address.phoneNumber.trim(),
    // Web sends street AND neighbourhood joined here (and still repeats the
    // neighbourhood in its own field below) — a courier reading only
    // `address` would otherwise lose it.
    'address':
        joinStreetAndNeighbourhood(address.address, address.neighbourhood),
    'deliveryLabel': address.label,
    'deliveryPlaceName': address.placeName,
    'deliveryNeighbourhood': address.neighbourhood,
    'city': address.city.trim(),
    // Its own field — the legacy mobile bug copied the city text here.
    'state': '',
    'country': address.country.trim(),
    'zipCode': address.zipCode,
    'deliveryInstructions': '',
    'fulfillmentType': fulfillmentType,
    'paymentMethodType': paymentMethodType,
    'deliveryFee': round2(fee),
    'agreeToTerms': true,
    'totalAmount': round2(subtotal + fee),
    'currency': 'TZS',
    'latitude': address.latitude,
    'longitude': address.longitude,
    'preferredDeliveryDate': primary?['date'] ?? '',
    'preferredDeliverySlot': primary?['slot'] ?? '',
    'preferredDeliveryWindows': windows,
  };
}

/// Items payload: `{productId, quantity, selectedChoices?}` per line
/// (rental bookings ride along when a line carries one).
List<Map<String, dynamic>> buildItemsPayload(Iterable<CheckoutLine> lines) => [
      for (final l in lines)
        {
          'productId': l.productId,
          // Web clamps to >= 1; a 0 would ask the backend to reserve nothing.
          'quantity': l.quantity < 1 ? 1 : l.quantity,
          if (l.selectedChoices.isNotEmpty)
            'selectedChoices': [
              for (final c in l.selectedChoices)
                {'definitionId': c.definitionId, 'valueId': c.valueId},
            ],
          if (l.rentalBooking != null)
            'rentalBooking': l.rentalBooking!.toJson(),
        },
    ];

/// Price guard (§5.3): true when |grandTotal - reviewedTotal| exceeds the
/// 0.01 tolerance — the buyer must never pay a stale total.
bool grandTotalMismatch({
  required num? grandTotal,
  required num reviewedTotal,
}) =>
    grandTotal == null ||
    ((grandTotal.toDouble() - reviewedTotal).abs() > 0.01);

/// Authoritative per-line unit prices from the created proforma, keyed by
/// productId — used to resync the cart after the price guard trips
/// (web `authoritativePrices`). Later duplicates keep the first price seen.
Map<int, double> authoritativeUnitPrices(Map<String, dynamic> proforma) {
  final out = <int, double>{};
  for (final group
      in (proforma['sellerGroups'] as List<dynamic>? ?? const [])) {
    if (group is! Map) continue;
    for (final item in (group['items'] as List<dynamic>? ?? const [])) {
      if (item is! Map) continue;
      final pid = item['productId'];
      final unit = item['unitPrice'];
      if (pid is! num || unit is! num) continue;
      out.putIfAbsent(pid.toInt(), () => unit.toDouble());
    }
  }
  return out;
}

/// Round-half-up to 2 dp in decimal space (money math never floats through).
double round2(num v) {
  final scaled = v * 100;
  final rounded =
      scaled >= 0 ? scaled.roundToDouble() : -(-scaled).roundToDouble();
  return rounded / 100;
}

/// Adapts a persisted cart line into the structural [CheckoutLine].
CheckoutLine cartLineToCheckoutLine(dynamic item) => CheckoutLine(
      productId: item.productId as int,
      quantity: item.quantity as int,
      price: (item.price as num?)?.toDouble() ?? 0,
      sellerId: item.sellerId as String?,
      selectedChoices: [
        for (final c in item.selectedChoices)
          (
            definitionId: c.definitionId as int,
            valueId: c.valueId as String,
          ),
      ],
      rentalBooking: item.rentalBooking as RentalBooking?,
    );

/// Maps a proforma-creation failure onto the copy the buyer needs, exactly
/// like web's handler. The raw backend string is kept as the fallback, but
/// these four codes each mean something specific the buyer can act on, and a
/// bare code (or a generic "something went wrong") tells them nothing:
/// INSUFFICIENT_STOCK in particular is not the buyer's fault and is fixed by
/// reviewing the cart, not by retrying.
String proformaFailureMessage(Object error) {
  final raw = '$error'.replaceFirst(RegExp(r'^ApiException:\s*'), '');
  final upper = raw.toUpperCase();
  if (upper.contains('ACCOUNT_BLOCKED')) {
    return 'Your account is blocked from placing orders. Please contact support.';
  }
  if (upper.contains('INSUFFICIENT_STOCK')) {
    return 'Another buyer reserved one of your items. Please review your cart '
        'and try again.';
  }
  if (upper.contains('BUYER_PROFILE_SETUP_FAILED')) {
    return 'We could not finish setting up your buyer profile. Please retry '
        'once; verification is not required to buy.';
  }
  // CHECKOUT_DATA_INVALID (and a 422) carry a specific server-side reason, so
  // the message itself is the useful part.
  return raw;
}

/// Web parity `joinStreetAndNeighbourhood` (lib/location-utils.ts): combine
/// the street line with the neighbourhood, unless the street already ends
/// with it — repeating "Msasani" twice reads like two different places.
String joinStreetAndNeighbourhood(String? streetPart, String? neighbourhood) {
  final s = (streetPart ?? '').trim();
  final n = (neighbourhood ?? '').trim();
  if (s.isEmpty && n.isEmpty) return '';
  if (n.isEmpty) return s;
  if (s.isEmpty) return n;
  final alreadyEnds =
      RegExp(r',\s*' + RegExp.escape(n) + r'\s*$', caseSensitive: false)
          .hasMatch(s);
  return alreadyEnds ? s : '$s, $n';
}

/// The first per-seller order id on a proforma, or null while the backend has
/// not created the orders yet (web `sellerGroups.find(g => g.orderId)`).
///
/// Null is a real answer, not a failure: Selcom's webhook is what creates the
/// orders, so a proforma read straight after the status poll reports
/// COMPLETED can legitimately have none yet. Substituting the proforma NUMBER
/// here — as the completion step used to — produces a link to an order that
/// does not exist, and an empty string produces `/orders/`, which normalises
/// to the buyer's order LIST: My Space, apparently blank.
String? firstProformaOrderId(Map<String, dynamic> proforma) {
  for (final group in (proforma['sellerGroups'] as List<dynamic>? ?? const [])) {
    if (group is Map && group['orderId'] != null) {
      final id = group['orderId'].toString().trim();
      if (id.isNotEmpty) return id;
    }
  }
  return null;
}
