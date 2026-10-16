/// Public seller-name masking and trust helpers (web parity — the reference
/// `lib/seller-display.ts` and `lib/seller-profile-route.ts`). The web masks
/// full legal names to "first name + uppercased last initial" everywhere a
/// buyer sees a seller or review author; mobile must not leak full names.
library;

/// Public person name: first name plus the first letter of the last name
/// (web `getPublicName`, seller-display.ts:2-16).
String publicSellerName(String? fullName, {String fallback = 'Unknown Seller'}) {
  final parts = (fullName ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return fallback;
  if (parts.length == 1) return parts.first;
  final lastInitial = String.fromCharCodes(parts.last.runes.take(1)).toUpperCase();
  return lastInitial.isEmpty ? parts.first : '${parts.first} $lastInitial.';
}

/// First (and, when present, last) initials for an avatar fallback (web
/// `getPublicNameInitials`, seller-display.ts:19-33).
String publicInitials(String? fullName, {String fallback = '?'}) {
  final parts = (fullName ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return fallback;
  final selected = parts.length == 1 ? [parts.first] : [parts.first, parts.last];
  final initials = selected
      .map((p) => String.fromCharCodes(p.runes.take(1)))
      .join()
      .toUpperCase();
  return initials.isEmpty ? fallback : initials;
}

/// Whether a LISTING CARD shows the trust badge.
///
/// Web parity `isVerifiedProduct` (lib/image-utils.ts:448), whose expression
/// ends in `|| true` — so every card on the web carries the badge. Mobile
/// keyed it off the payload instead and therefore showed it on nothing: the
/// listing endpoints send no verification field at all (checked against
/// `/api/v1/displayItem/newest` — the rows carry sellerId and sellerName and
/// nothing about verification), so there is no other signal to read.
///
/// This supersedes the LISTIN-31 note below for cards only. That rule still
/// holds everywhere the backend does answer with a status — the seller
/// profile reads [sellerVerifiedFromSummary] and shows the truth. Flip this
/// constant the day the listing rows carry verification.
const bool webParityListingBadgeAlwaysOn = true;

bool listingVerificationBadgeVisible(bool sellerVerifiedFlag) =>
    sellerVerifiedFlag || webParityListingBadgeAlwaysOn;

/// Verification heuristic (web page.tsx:255-264): the seller summary's own
/// verificationStatus, a SELLER/ADMIN role, or any product-level seller flag.
bool sellerVerifiedFromSummary(Map<String, dynamic> summary) {
  final status = (summary['verificationStatus'] ?? '').toString().toUpperCase();
  if (status == 'VERIFIED' || status == 'NATURAL_VERIFIED') return true;
  final roles = summary['roles'];
  if (roles is List) {
    for (final r in roles) {
      final name = r is Map
          ? (r['roleName'] ?? r['name'] ?? '').toString()
          : r.toString();
      final upper = name.toUpperCase();
      if (upper.contains('SELLER') || upper.contains('ADMIN')) return true;
    }
  }
  // Product-level flags ride the listing rows (sellerVerified / isVerified /
  // sellerVerificationStatus). With none present the seller stays unverified —
  // never default to a static 'Verified' badge (LISTIN-31).
  return summary['sellerVerified'] == true ||
      summary['isVerified'] == true ||
      (summary['sellerVerificationStatus'] ?? '').toString().toUpperCase() ==
          'VERIFIED';
}

/// 'Verified Shop' when the account looks like a shop/business, else
/// 'Verified Seller' (web `getSellerVerificationLabel`).
String verifiedSellerLabel(Map<String, dynamic> summary) {
  final sellerType = (summary['sellerType'] ?? '')
      .toString()
      .trim()
      .toUpperCase()
      .replaceAll(RegExp(r'[\s-]+'), '_');
  final source = (summary['productSource'] ?? '').toString().trim().toLowerCase();
  final vendorId = summary['vendorId'];
  final hasVendorId = vendorId != null && vendorId.toString().trim().isNotEmpty;
  final isShop = source == 'shops' ||
      hasVendorId ||
      const ['SHOP', 'VENDOR', 'BUSINESS', 'COMPANY', 'ORGANIZATION', 'MERCHANT']
          .any(sellerType.contains);
  return isShop ? 'Verified Shop' : 'Verified Seller';
}

/// Member-since year: web falls back to 2024 when no joined date exists
/// (page.tsx:645-657).
String memberSinceYear(dynamic joinedOrCreated) {
  final raw = (joinedOrCreated ?? '').toString();
  if (raw.trim().isEmpty) return '2024';
  final parsed = DateTime.tryParse(raw);
  if (parsed != null) return '${parsed.year}';
  final yearMatch = RegExp(r'\b(20\d{2})\b').firstMatch(raw);
  return yearMatch != null ? yearMatch.group(1)! : '2024';
}

/// Lowercased, diacritics-stripped, dash-joined name slug (web
/// `slugifySellerName`, seller-profile-route.ts:3-12). A pure Dart stand-in for
/// the JS `normalize('NFKD')`.
String slugifySellerName(String name) {
  const withDiacritics =
      'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ';
  const withoutDiacritics =
      'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeCcIIIIiiiiUUUUuuuuyNn';
  final buffer = StringBuffer();
  for (final rune in name.runes) {
    final ch = String.fromCharCode(rune);
    final i = withDiacritics.indexOf(ch);
    buffer.write(i >= 0 ? withoutDiacritics[i] : ch);
  }
  var slug = buffer
      .toString()
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
  if (slug.isEmpty) slug = 'seller';
  return slug;
}

/// Shareable profile path (web `buildSellerProfilePath`): `/seller/{slug}-pX`
/// where X is the base36 seller id.
String buildSellerProfilePath(String fullName, int? sellerId) {
  final nameSlug = slugifySellerName(fullName);
  if (sellerId == null || sellerId <= 0) return '/seller/$nameSlug';
  return '/seller/$nameSlug-p${sellerId.toRadixString(36)}';
}

/// Route-segment resolution (web `parseSellerProfileSegment`,
/// seller-profile-route.ts:28-53): a bare numeric id, a `{name}-p{base36}`
/// slug, or a name-only legacy slug.
({int? sellerId, String sellerName}) parseSellerProfileSegment(String segment) {
  final decoded = Uri.decodeComponent(segment.isNotEmpty ? segment : '').trim();
  if (RegExp(r'^\d+$').hasMatch(decoded)) {
    return (sellerId: int.tryParse(decoded), sellerName: '');
  }
  final keyMatch = RegExp(r'^(.*)-p([a-z0-9]+)$', caseSensitive: false)
      .firstMatch(decoded);
  if (keyMatch != null) {
    final id = int.tryParse(keyMatch.group(2)!, radix: 36);
    if (id != null && id > 0) {
      return (
        sellerId: id,
        sellerName: keyMatch.group(1)!.replaceAll(RegExp(r'-+'), ' ').trim(),
      );
    }
  }
  return (sellerId: null, sellerName: decoded.replaceAll(RegExp(r'-+'), ' ').trim());
}
