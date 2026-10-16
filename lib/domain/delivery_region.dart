/// Cross-region delivery policy — port of the reference
/// `lib/delivery-region.ts` (BIZLOG-04 / APISUR-02).
///
/// When a seller's known listing region differs from the buyer's delivery
/// destination, GloboExpats declines to charge a distance-based delivery fee at
/// checkout: the fee is deferred ("To be confirmed") and collected after
/// checkout. This client-side policy defends against a stale priced response
/// re-enabling distance charging for a seller already known to be outside the
/// buyer's region. Pure functions; the checkout step machine owns when to call
/// them (Phase 6 wiring).
library;

String _normalize(String? value) =>
    value?.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase() ?? '';

/// True when buyer and seller are in different countries, or — when both
/// regions are known and no country mismatch applies — different regions.
/// Unknown legacy locations keep the existing local/distance behaviour (false).
bool isCrossRegionDelivery({
  String? buyerRegion,
  String? buyerCountry,
  String? sellerRegion,
  String? sellerCountry,
}) {
  final normalizedBuyerCountry = _normalize(buyerCountry);
  final normalizedSellerCountry = _normalize(sellerCountry);
  if (normalizedBuyerCountry.isNotEmpty &&
      normalizedSellerCountry.isNotEmpty &&
      normalizedBuyerCountry != normalizedSellerCountry) {
    return true;
  }
  final normalizedBuyerRegion = _normalize(buyerRegion);
  final normalizedSellerRegion = _normalize(sellerRegion);
  if (normalizedBuyerRegion.isEmpty || normalizedSellerRegion.isEmpty) {
    return false;
  }
  return normalizedBuyerRegion != normalizedSellerRegion;
}

/// Region/country from a seller's `"Region, City, Country"`-style location
/// string (web `locationTail`). Requires at least two comma parts; for exactly
/// two the first is the region, for more the second-from-last is.
({String? region, String? country}) locationTail(String? location) {
  final parts = (location ?? '')
      .split(',')
      .map((p) => p.trim())
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.length < 2) return (region: null, country: null);
  if (parts.length > 2) {
    return (region: parts[parts.length - 2], country: parts.last);
  }
  return (region: parts[0], country: parts.last);
}

/// A seller line that can be matched to a region (listings, quote seller
/// groups). Every identity the quote uses to address a seller group — the
/// string [sellerKey] (expat slug) and the numeric [sellerId] — is collected
/// by `getCrossRegionSellerKeys`, plus [expatName]/[expatId] for older payloads.
class CrossRegionItem {
  final String? expatId;
  final String? sellerId;
  final String? sellerKey;
  final String? expatName;
  final String? location;
  final String? productRegion;
  final String? productCountry;
  final String? region;
  final String? country;
  final String? city;
  const CrossRegionItem({
    this.expatId,
    this.sellerId,
    this.sellerKey,
    this.expatName,
    this.location,
    this.productRegion,
    this.productCountry,
    this.region,
    this.country,
    this.city,
  });
}

/// Keys (sellerKey / sellerId / expatId / expatName) whose known listing region
/// differs from the buyer destination (web `getCrossRegionSellerKeys`).
Set<String> getCrossRegionSellerKeys(
  Iterable<CrossRegionItem> items, {
  String? buyerRegion,
  String? buyerCountry,
}) {
  final keys = <String>{};
  for (final item in items) {
    final parsed = locationTail(item.location);
    if (!isCrossRegionDelivery(
      buyerRegion: buyerRegion,
      buyerCountry: buyerCountry,
      sellerRegion:
          item.productRegion ?? item.region ?? item.city ?? parsed.region,
      sellerCountry: item.productCountry ?? item.country ?? parsed.country,
    )) {
      continue;
    }
    for (final value in [
      item.sellerKey,
      item.sellerId,
      item.expatId,
      item.expatName,
    ]) {
      if (value != null && value.trim().isNotEmpty) keys.add(value.trim());
    }
  }
  return keys;
}

/// Defensive client policy (web `applyCrossRegionDeliveryPolicy`): for seller
/// groups whose key/id is in [crossRegionSellerKeys], null the distance-derived
/// fee/min/distance and stamp `crossRegionDelivery: true`, then recompute the
/// quote's `deliveryTotal`. Returns the quote unchanged when there is nothing
/// cross-region. Operates on the decoded JSON map the API client returns.
Map<String, dynamic>? applyCrossRegionDeliveryPolicy(
  Map<String, dynamic>? quote,
  Set<String> crossRegionSellerKeys,
) {
  if (quote == null || crossRegionSellerKeys.isEmpty) return quote;
  final rawGroups = quote['sellerGroups'];
  if (rawGroups is! List) return quote;

  var deliveryTotal = 0.0;
  final sellerGroups = <dynamic>[];
  for (final group in rawGroups) {
    if (group is! Map) {
      sellerGroups.add(group);
      continue;
    }
    final g = group.cast<String, dynamic>();
    final key = '${g['sellerKey'] ?? ''}'.trim();
    final id = '${g['sellerId'] ?? ''}'.trim();
    final isCrossRegion = (key.isNotEmpty && crossRegionSellerKeys.contains(key)) ||
        (id.isNotEmpty && crossRegionSellerKeys.contains(id));
    if (!isCrossRegion) {
      deliveryTotal += _feeOf(g['consolidatedDeliveryFee']);
      sellerGroups.add(g);
      continue;
    }
    final rewritten = <String, dynamic>{
      ...g,
      'consolidatedDeliveryFee': null,
      'consolidatedDeliveryFeeMin': null,
      'distanceKm': null,
      'crossRegionDelivery': true,
    };
    deliveryTotal += 0;
    sellerGroups.add(rewritten);
  }

  return <String, dynamic>{
    ...quote,
    'sellerGroups': sellerGroups,
    'deliveryTotal': deliveryTotal,
  };
}

double _feeOf(dynamic fee) => fee is num ? fee.toDouble() : 0;

/// Numeric-tolerant identity comparison for seller group lookups. The backend
/// emits `sellerKey` as a string and `sellerId` as a number, while screens may
/// hold either — so `'10' == 10` must hold (web `Number(g.sellerId) ===
/// Number(sellerId)` and strict `sellerKey === sellerKey`).
bool _sameSeller(dynamic a, dynamic b) {
  final sa = '${a ?? ''}'.trim();
  final sb = '${b ?? ''}'.trim();
  if (sa.isEmpty || sb.isEmpty) return false;
  if (sa == sb) return true;
  final na = int.tryParse(sa);
  final nb = int.tryParse(sb);
  return na != null && nb != null && na == nb;
}

/// True when any quote seller group carries a deferred cross-region delivery:
/// it was force-nulled by the client policy, so `crossRegionDelivery` is true
/// or its `consolidatedDeliveryFee` is null. Mirrors the web's review-step
/// `crossRegionSellerKeys` union (`group.crossRegionDelivery === true ||
/// group.consolidatedDeliveryFee === null`) used to flag the whole quote's
/// delivery as "arranged after checkout".
bool quoteHasDeferredCrossRegion(Map<String, dynamic>? quote) {
  if (quote == null) return false;
  final rawGroups = quote['sellerGroups'];
  if (rawGroups is! List) return false;
  for (final group in rawGroups) {
    if (group is! Map) continue;
    final g = group.cast<String, dynamic>();
    if (g['crossRegionDelivery'] == true || g['consolidatedDeliveryFee'] == null) {
      return true;
    }
  }
  return false;
}

/// Whether a single seller group renders as cross-region in review — web
/// `feeForSeller(...).crossRegion` (review-step.tsx:124-153).
///
/// When the quote holds a group matching [sellerKey] or [sellerId], the quote's
/// own stamps win: `crossRegionDelivery === true || consolidatedDeliveryFee ===
/// null`. When no group matches (quote loading/failed, or the group was never
/// delivery-quoted), the client-side [crossRegionSellerKeys] set from
/// `getCrossRegionSellerKeys` is the fallback — matching the reference's
/// `clientCrossRegionSellerKeys.has(String(value))`.
bool sellerGroupIsCrossRegion(
  Map<String, dynamic>? quote, {
  required String sellerKey,
  String? sellerId,
  Set<String> crossRegionSellerKeys = const {},
}) {
  final rawGroups = quote?['sellerGroups'];
  if (rawGroups is List) {
    for (final group in rawGroups) {
      if (group is! Map) continue;
      final g = group.cast<String, dynamic>();
      if (!_sameSeller(g['sellerKey'], sellerKey) &&
          !_sameSeller(g['sellerId'], sellerId)) {
        continue;
      }
      return g['crossRegionDelivery'] == true ||
          g['consolidatedDeliveryFee'] == null;
    }
  }
  final keys = crossRegionSellerKeys;
  if (sellerKey.trim().isNotEmpty && keys.contains(sellerKey.trim())) return true;
  final id = sellerId?.trim() ?? '';
  return id.isNotEmpty && keys.contains(id);
}
