/// Share Kit links and captions — the web's `lib/product-share.ts` and the
/// label helpers in `components/share-product-modal.tsx`, so a product or
/// shop shared from the app reads, and is counted, exactly like one shared
/// from the website.
library;

/// The public site every shared link points at (web `DEFAULT_SITE_ORIGIN`).
const String shareSiteOrigin = 'https://globoexpats.com';

/// Share channels. Each becomes the Matomo campaign source on the shared
/// link, so visits are counted per channel (and per sharer via mtm_content).
enum ShareChannel { native, copy, qr, save }

String _clean(String? value) => value?.trim() ?? '';

/// `/product/42` or an absolute URL → an absolute `https://globoexpats.com/…`.
String resolveShareUrl(String url) {
  final value = _clean(url);
  if (value.isEmpty) return '';
  try {
    return Uri.parse(shareSiteOrigin).resolve(value).toString();
  } catch (_) {
    return value;
  }
}

/// Adds the Matomo campaign parameters (web `buildTrackedShareUrl`). Matomo
/// reads mtm_* natively, so visits are attributed with no backend change.
String buildTrackedShareUrl(String url, ShareChannel channel,
    [Object? sharerId]) {
  final resolved = resolveShareUrl(url);
  if (resolved.isEmpty) return '';
  try {
    final uri = Uri.parse(resolved);
    final params = Map<String, String>.of(uri.queryParameters)
      ..['mtm_campaign'] = 'share'
      ..['mtm_source'] = channel.name;
    final sharer = sharerId == null ? '' : _clean('$sharerId');
    if (sharer.isNotEmpty) params['mtm_content'] = sharer;
    return uri.replace(queryParameters: params).toString();
  } catch (_) {
    return resolved;
  }
}

/// The readable link printed on the cards, e.g. `globoexpats.com/product/12`.
String shareDisplayUrl(String url) {
  final resolved = resolveShareUrl(url);
  try {
    final uri = Uri.parse(resolved);
    final path = uri.path.endsWith('/')
        ? uri.path.substring(0, uri.path.length - 1)
        : uri.path;
    return '${uri.host.replaceFirst(RegExp(r'^www\.'), '')}$path';
  } catch (_) {
    return resolved;
  }
}

/// Web `generateSlug`: lower-case words joined by hyphens.
String shareSlug(String text) => text
    .toLowerCase()
    .trim()
    .replaceAll(RegExp(r'[^\w\s-]'), '')
    .replaceAll(RegExp(r'\s+'), '-')
    .replaceAll(RegExp(r'-+'), '-')
    .replaceAll(RegExp(r'^-+|-+$'), '');

/// Web `getProductUrl`: `/product/{slug}-{id}` (the page's own address).
String productSharePath(int productId, String productName) {
  final slug = shareSlug(productName);
  return slug.isEmpty ? '/product/$productId' : '/product/$slug-$productId';
}

/// Web `toSlug`: the file-name stem of a saved picture.
String shareFileSlug(String value) {
  final slug = value
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
  final cut = slug.length > 48 ? slug.substring(0, 48) : slug;
  return cut.isEmpty ? 'globoexpats' : cut;
}

/// Web `getInitials`: first and last name initials, upper-case.
String shareInitials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  final picked = parts.length > 1 ? [parts.first, parts.last] : parts;
  return picked.map((p) => p[0]).join().toUpperCase();
}

const Map<String, String> _conditionLabels = {
  'new': 'New',
  'like-new': 'Like New',
  'excellent': 'Excellent',
  'very-good': 'Very Good',
  'good': 'Good',
  'fair': 'Fair',
};

/// Backend sends e.g. LIKE_NEW; the cards show the listing form's label.
String? shareConditionLabel(String? value) {
  final raw = _clean(value);
  if (raw.isEmpty) return null;
  final key = raw.toLowerCase().replaceAll(RegExp(r'[_\s]+'), '-');
  final known = _conditionLabels[key];
  if (known != null) return known;
  final words = raw.toLowerCase().replaceAll(RegExp(r'[_-]+'), ' ');
  return words[0].toUpperCase() + words.substring(1);
}

const Set<String> _lowercasePlaceWords = {'es', 'de', 'la', 'of', 'and'};

/// Backend place names can arrive lower-case ("dar es salaam" → "Dar es
/// Salaam").
String? sharePlaceLabel(String? value) {
  final words = _clean(value)
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return null;
  return [
    for (var i = 0; i < words.length; i++)
      i > 0 && _lowercasePlaceWords.contains(words[i].toLowerCase())
          ? words[i].toLowerCase()
          : words[i][0].toUpperCase() + words[i].substring(1),
  ].join(' ');
}

/// City and country without repeats, else the stored location (web
/// `buildLocation`).
String shareLocation({String? city, String? country, String? location}) {
  final parts = [_clean(city), _clean(country)].where((p) => p.isNotEmpty);
  final seen = <String>{};
  final unique = [
    for (final p in parts)
      if (seen.add(p.toLowerCase())) p,
  ];
  return unique.isNotEmpty ? unique.join(', ') : _clean(location);
}

/// Web `buildShareCaption`: photo posters already carry the details, so they
/// get the short line; QR-only and QR posters need them in the caption.
String buildProductShareCaption({
  required String title,
  required String link,
  bool details = true,
  String? price,
  String? condition,
  String? description,
  String? city,
  String? country,
  String? location,
}) {
  if (!details) return 'Check out this product on GloboExpats:\n$link';
  final where = shareLocation(city: city, country: country, location: location);
  final about = _clean(description).replaceAll(RegExp(r'\s+'), ' ');
  return [
    [_clean(title), _clean(price)].where((p) => p.isNotEmpty).join(' · '),
    [_clean(condition), where].where((p) => p.isNotEmpty).join(' · '),
    about.length > 240 ? about.substring(0, 240) : about,
    'See the full listing on GloboExpats:',
    link,
  ].where((line) => line.isNotEmpty).join('\n');
}

/// The seller-profile invitation (web `ShareSellerProfileModal`).
String sellerShareMessage(String sellerName) =>
    "Come take a look at $sellerName's shop on GloboExpats! Browse the "
    "collection and find something you'll love.";
