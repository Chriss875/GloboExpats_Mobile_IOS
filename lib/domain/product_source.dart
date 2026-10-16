/// Buyer-facing "where is this listed from" filter — port of web
/// `lib/product-source.ts`.
///
/// This is a BACKEND filter, not a client-side guess. Mobile used to fetch a
/// page of listings and then sort them into shops and community itself, using
/// a heuristic over sellerType / vendorId / sellerOrganization. That produced
/// a different set from the desktop for two reasons at once: the heuristic is
/// not the backend's rule, and filtering after the fetch only ever sees the
/// items already on the page.
library;

const String kSourceAll = 'all';
const String kSourceCommunity = 'community';
const String kSourceShops = 'shops';

const List<({String value, String label})> kProductSourceOptions = [
  (value: kSourceAll, label: 'All'),
  (value: kSourceCommunity, label: 'Community'),
  (value: kSourceShops, label: 'Shops'),
];

/// Normalises anything user- or route-supplied (web `parseProductSource`).
String parseProductSource(String? value) {
  final normalized = value?.trim().toLowerCase();
  return (normalized == kSourceCommunity || normalized == kSourceShops)
      ? normalized!
      : kSourceAll;
}

/// What travels on the request: `COMMUNITY` / `SHOPS`, or nothing at all for
/// "all" (web `toApiProductSource`).
String? apiProductSource(String? value) {
  final parsed = parseProductSource(value);
  return parsed == kSourceAll ? null : parsed.toUpperCase();
}

/// Web `getProductSourceEmptyMessage`.
String productSourceEmptyMessage(String value) => switch (
    parseProductSource(value)) {
      kSourceShops => 'No shop listings to show yet.',
      kSourceCommunity => 'No community listings to show yet.',
      _ => 'No listings to show yet.',
    };
