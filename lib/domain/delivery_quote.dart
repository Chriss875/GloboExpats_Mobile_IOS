import '../cart/seller_grouping.dart' show SellerGroup;

/// Delivery-quote failure model (BUYER_FLOW_SPEC §4.2, AU-025).
///
/// Port of the web reference `lib/cart-grouping.ts`: why a seller's delivery
/// fee couldn't be quoted, so the UI can tell the buyer exactly whose side is
/// the problem instead of a generic "unavailable". Pure logic — the checkout
/// step machine renders the labels and owns the 20 s watchdog.
// ignore_for_file: constant_identifier_names

/// Why a fee couldn't be calculated for a seller group (backend/web enum).
enum DeliveryQuoteFailureReason {
  SELLER_LOCATION_MISSING,
  SELLER_LOCATION_NEEDS_PIN,
  SELLER_TRANSPORT_MODE_MISSING,
  BUYER_LOCATION_MISSING,
  BUYER_LOCATION_NEEDS_PIN,
  ROUTE_UNAVAILABLE,
  PRODUCT_DETAILS_TIMEOUT,
  CALCULATION_TIMEOUT;

  static DeliveryQuoteFailureReason? tryParse(String raw) =>
      values.asNameMap()[raw.trim().toUpperCase()];

  /// Short cell label (web `SHORT_FAILURE_REASON`) rendered in the per-seller
  /// fee row when that group could not be quoted.
  String get shortLabel => switch (this) {
        SELLER_LOCATION_MISSING => "Seller hasn't set a location",
        SELLER_LOCATION_NEEDS_PIN => 'Seller must update pickup pin',
        SELLER_TRANSPORT_MODE_MISSING => 'Seller must select a delivery vehicle',
        BUYER_LOCATION_MISSING => 'Add your delivery pin',
        BUYER_LOCATION_NEEDS_PIN => 'Update your delivery pin',
        ROUTE_UNAVAILABLE => 'No route found',
        PRODUCT_DETAILS_TIMEOUT => 'Product location did not load',
        CALCULATION_TIMEOUT => 'Calculation timed out',
      };
}

/// One seller group that could not be quoted.
class SellerQuoteFailure {
  final String sellerKey;
  final String sellerName;
  final DeliveryQuoteFailureReason reason;
  const SellerQuoteFailure({
    required this.sellerKey,
    required this.sellerName,
    required this.reason,
  });

  @override
  bool operator ==(Object other) =>
      other is SellerQuoteFailure &&
      other.sellerKey == sellerKey &&
      other.reason == reason;

  @override
  int get hashCode => Object.hash(sellerKey, reason);

  @override
  String toString() => '$sellerName: ${reason.name}';
}

/// The checkout may not wait forever for Google routing: after this long the
/// quote is abandoned and every group is marked CALCULATION_TIMEOUT (web
/// `setTimeout(..., 20_000)` in checkout-content.tsx).
const Duration kDeliveryQuoteTimeout = Duration(seconds: 20);

/// One-line explanation per failure reason (web `getDeliveryQuoteResolutions`).
String resolutionFor(DeliveryQuoteFailureReason reason) => switch (reason) {
      DeliveryQuoteFailureReason.BUYER_LOCATION_MISSING ||
      DeliveryQuoteFailureReason.BUYER_LOCATION_NEEDS_PIN =>
        'Open Address Settings, edit the selected delivery address, search for '
            'the exact place in Google Maps, drop the pin at the entrance, and save it.',
      DeliveryQuoteFailureReason.ROUTE_UNAVAILABLE =>
        'Both sides should confirm their pins sit on an accessible road or '
            'entrance — not inside a building, estate, or unmapped area — then retry.',
      DeliveryQuoteFailureReason.PRODUCT_DETAILS_TIMEOUT =>
        'Reload the product location data with Retry. If it fails again the '
            'product may need to be reopened and saved with its Google Maps pin.',
      DeliveryQuoteFailureReason.CALCULATION_TIMEOUT =>
        'Check the internet connection and retry. If the timeout repeats, '
            'contact support because Google Maps routing may be unavailable.',
      DeliveryQuoteFailureReason.SELLER_LOCATION_MISSING ||
      DeliveryQuoteFailureReason.SELLER_LOCATION_NEEDS_PIN ||
      DeliveryQuoteFailureReason.SELLER_TRANSPORT_MODE_MISSING =>
        'GloboExpats contacts the seller to update their pickup information; '
            'please try again later or contact support.',
    };

/// Buyer-facing explanation of a failed quote (web
/// `describeDeliveryQuoteFailures`): headline + detail + fix instructions.
class QuoteFailureExplanation {
  final String title;
  final String description;
  final List<String> resolutions;
  /// True when the buyer can fix it themselves (address pin) — the UI offers
  /// "Fix delivery address" alongside "Retry check".
  final bool buyerCanFix;
  /// True when only the seller/support can fix it — the UI offers
  /// "Contact support".
  final bool sellerMustFix;
  const QuoteFailureExplanation({
    required this.title,
    required this.description,
    required this.resolutions,
    required this.buyerCanFix,
    required this.sellerMustFix,
  });
}

/// Turns per-seller quote failures into one clear, actionable message.
QuoteFailureExplanation explainQuoteFailures(
    List<SellerQuoteFailure> failures) {
  if (failures.isEmpty) {
    return const QuoteFailureExplanation(
      title: 'Delivery route unavailable',
      description:
          'We could not calculate a route from the seller pickup location to '
              'your saved address.',
      resolutions: [],
      buyerCanFix: false,
      sellerMustFix: false,
    );
  }

  final reasons = failures.map((f) => f.reason).toSet();

  String namesFor(DeliveryQuoteFailureReason reason) => failures
      .where((f) => f.reason == reason)
      .map((f) => f.sellerName)
      .toSet()
      .join(', ');

  if (reasons.contains(DeliveryQuoteFailureReason.BUYER_LOCATION_MISSING)) {
    return QuoteFailureExplanation(
      title: 'Your delivery address needs a location',
      description:
          'Edit your delivery address and drop a map pin (or confirm the street '
              'address) so we can calculate the delivery fee.',
      resolutions: [
        resolutionFor(DeliveryQuoteFailureReason.BUYER_LOCATION_MISSING),
      ],
      buyerCanFix: true,
      sellerMustFix: false,
    );
  }

  if (reasons.contains(DeliveryQuoteFailureReason.BUYER_LOCATION_NEEDS_PIN)) {
    return QuoteFailureExplanation(
      title: 'Your saved address needs a Google Maps pin',
      description:
          'This address was saved using the old location format. Its name could '
              'not be converted into a reliable driving route.',
      resolutions: [
        resolutionFor(DeliveryQuoteFailureReason.BUYER_LOCATION_NEEDS_PIN),
      ],
      buyerCanFix: true,
      sellerMustFix: false,
    );
  }

  final sellerSetupNames = <String>{
    if (reasons.contains(DeliveryQuoteFailureReason.SELLER_LOCATION_MISSING))
      ...failures
          .where((f) => f.reason ==
              DeliveryQuoteFailureReason.SELLER_LOCATION_MISSING)
          .map((f) => f.sellerName),
    if (reasons
        .contains(DeliveryQuoteFailureReason.SELLER_LOCATION_NEEDS_PIN))
      ...failures
          .where((f) => f.reason ==
              DeliveryQuoteFailureReason.SELLER_LOCATION_NEEDS_PIN)
          .map((f) => f.sellerName),
    if (reasons
        .contains(DeliveryQuoteFailureReason.SELLER_TRANSPORT_MODE_MISSING))
      ...failures
          .where((f) => f.reason ==
              DeliveryQuoteFailureReason.SELLER_TRANSPORT_MODE_MISSING)
          .map((f) => f.sellerName),
  };

  if (sellerSetupNames.isNotEmpty) {
    final names = sellerSetupNames.toList();
    final sellerLabel = names.length == 1
        ? "${names[0]}'s pickup location and mode of transport need to be "
            'updated.'
        : '${names.join(', ')} need to update their pickup locations and modes '
            'of transport.';
    return QuoteFailureExplanation(
      title: 'Delivery fee unavailable',
      description:
          '$sellerLabel GloboExpats will contact the seller and notify them to '
              'update the information.',
      resolutions: [
        resolutionFor(DeliveryQuoteFailureReason.SELLER_LOCATION_MISSING),
      ],
      buyerCanFix: false,
      sellerMustFix: true,
    );
  }

  final parts = <String>[];
  final missing = reasons.contains(DeliveryQuoteFailureReason.SELLER_LOCATION_MISSING)
      ? namesFor(DeliveryQuoteFailureReason.SELLER_LOCATION_MISSING)
      : '';
  if (missing.isNotEmpty) parts.add('$missing has not set a pickup location yet');
  final noRoute =
      reasons.contains(DeliveryQuoteFailureReason.ROUTE_UNAVAILABLE)
          ? namesFor(DeliveryQuoteFailureReason.ROUTE_UNAVAILABLE)
          : '';
  if (noRoute.isNotEmpty) {
    parts.add("we couldn't find a delivery route to $noRoute");
  }
  final timeouts = reasons.contains(DeliveryQuoteFailureReason.CALCULATION_TIMEOUT)
      ? namesFor(DeliveryQuoteFailureReason.CALCULATION_TIMEOUT)
      : '';
  if (timeouts.isNotEmpty) {
    parts.add('route calculation timed out for $timeouts');
  }
  final productTimeouts =
      reasons.contains(DeliveryQuoteFailureReason.PRODUCT_DETAILS_TIMEOUT)
          ? namesFor(DeliveryQuoteFailureReason.PRODUCT_DETAILS_TIMEOUT)
          : '';
  if (productTimeouts.isNotEmpty) {
    parts.add('product location data did not load for $productTimeouts');
  }

  return QuoteFailureExplanation(
    title: 'Delivery fee unavailable',
    description:
        '${parts.join('; ')}. Check your connection and retry, double-check '
            'your delivery address, or reach support.',
    resolutions: [
      for (final r in reasons) resolutionFor(r),
    ],
    buyerCanFix: false,
    sellerMustFix: false,
  );
}

/// The consolidated fee the server quoted for one seller group, matched by
/// numeric seller id first then by key; null when that group has no quote.
double? quotedFeeForSeller(
  Map<String, dynamic>? quote, {
  required String sellerKey,
  String? sellerId,
}) {
  final groups = quote?['sellerGroups'];
  if (groups is! List) return null;
  for (final g in groups) {
    if (g is! Map) continue;
    final idMatch = sellerId != null &&
        sellerId.isNotEmpty &&
        sellerId != 'null' &&
        num.tryParse(sellerId) != null &&
        num.tryParse(sellerId) == num.tryParse('${g['sellerId']}');
    final keyMatch = '${g['sellerKey'] ?? ''}' == sellerKey;
    if (idMatch || keyMatch) {
      final fee = g['consolidatedDeliveryFee'];
      return fee is num ? fee.toDouble() : null;
    }
  }
  return null;
}

/// Failure already recorded for a group (by key), if any.
SellerQuoteFailure? failureForGroup(
  List<SellerQuoteFailure> failures,
  SellerGroup group,
) {
  for (final f in failures) {
    if (f.sellerKey == group.sellerKey) return f;
  }
  return null;
}
