/// Port of the reference `lib/transport-requirements.ts` (web parity): whether
/// a checkout line actually uses delivery logistics, and what the cart as a
/// whole needs.
///
/// Rentals (and property/handoff listings whose transport requirement is
/// EXEMPT) are NOT delivered by a GloboExpats transporter — they are picked up
/// by the buyer or arranged with the seller ("Booking access" / "Handoff" on
/// the web review step). Feeding them through delivery quoting produces bogus
/// fees and windows the seller never offered, so the checkout must exclude them
/// from the quote/window payloads and force BUYER_PICKUP when nothing needs
/// logistics (CARTCH-06 / APISUR-09 parity).
library;

// `delivery_transport_mode` is the backend snake_case field the reference also
// reads (the snake_case alias is intentional).
// ignore_for_file: non_constant_identifier_names

/// Web `itemUsesDeliveryLogistics`: rentals and EXEMPT items never use
/// delivery logistics; OPTIONAL items only when a transport mode was set.
bool itemUsesDeliveryLogistics({
  required bool isRentalBooking,
  String? transportRequirement,
  String? deliveryTransportMode,
  String? delivery_transport_mode,
}) {
  final requirement = (transportRequirement ?? '').trim().toUpperCase();
  if (isRentalBooking || requirement == 'EXEMPT') return false;
  if (requirement == 'OPTIONAL') {
    final mode = deliveryTransportMode ?? delivery_transport_mode;
    return mode != null && mode.trim().isNotEmpty;
  }
  return true;
}

/// Web `getDefaultTransportRequirement`: category-driven default. Only the
/// real-estate category defaults to EXEMPT; everything else is REQUIRED.
String getDefaultTransportRequirement(String? categorySlug) =>
    categorySlug == 'real-estate' ? 'EXEMPT' : 'REQUIRED';

/// Web `resolveListingTransportRequirement`: a rental listing is always EXEMPT
/// from delivery logistics regardless of what the seller selected.
String resolveListingTransportRequirement(
    String transportRequirement, bool isRental) {
  return isRental ? 'EXEMPT' : transportRequirement;
}

/// Web `resolveCheckoutTransportRequirement`: the cart's overall requirement.
/// Rentals are skipped; the most demanding non-rental item wins
/// (REQUIRED > OPTIONAL > EXEMPT).
String resolveCheckoutTransportRequirement(
  Iterable<({bool isRental, String? transportRequirement})> items,
) {
  var result = 'EXEMPT';
  for (final item in items) {
    if (item.isRental) continue;
    final requirement = (item.transportRequirement ?? '').trim().toUpperCase();
    final effective = requirement.isEmpty ? 'REQUIRED' : requirement;
    if (effective == 'REQUIRED') return 'REQUIRED';
    if (effective == 'OPTIONAL') result = 'OPTIONAL';
  }
  return result;
}
