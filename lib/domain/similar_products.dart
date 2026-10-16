/// Similar-products ranking for the product-detail rail.
///
/// Ports the web reference heuristic (app/product/[id]/page.tsx): candidates
/// come from `getNewestListings(0,50)`, filtered to in-stock items excluding
/// the current product; scored by name-token overlap (weight 1000), same
/// category (+100), then description-token overlap. Zero-signal lists fall
/// back to candidate order.
library;

import '../models/product.dart';

/// Tokenize like the reference: lowercase, strip non-alphanumerics, keep
/// tokens longer than 2 chars.
List<String> tokenizeForSimilarity(String? text) {
  if (text == null) return const [];
  final t = text.toLowerCase().replaceAll(RegExp(r'[^a-z0-9\s]'), ' ');
  return t
      .split(RegExp(r'\s+'))
      .where((w) => w.length > 2)
      .toList(growable: false);
}

int _overlap(Set<String> a, Set<String> b) {
  if (a.isEmpty || b.isEmpty) return 0;
  var count = 0;
  for (final t in a) {
    if (b.contains(t)) count++;
  }
  return count;
}

/// Rank [candidates] against [current]; returns up to [limit] items ordered
/// best-first. Mirrors the reference weights exactly (name x1000, category
/// +100, description x1).
List<Product> rankSimilarProducts({
  required Product current,
  required List<Product> candidates,
  int limit = 4,
}) {
  final nameTokens = tokenizeForSimilarity(current.productName).toSet();
  final descTokens =
      tokenizeForSimilarity(current.productDescription).take(50).toSet();
  // The mobile summary model carries the category by name only; the reference
  // matches on id OR lowercased name, so name is the operative signal here.
  final categoryName = (current.categoryName ?? '').toLowerCase();

  final scored = <MapEntry<Product, int>>[];
  for (final p in candidates) {
    if (p.productId == current.productId) continue;
    if ((p.productQuantity ?? 0) <= 0) continue;

    final score = _overlap(nameTokens, tokenizeForSimilarity(p.productName).toSet()) * 1000 +
        ((categoryName.isNotEmpty &&
                (p.categoryName ?? '').toLowerCase() == categoryName)
            ? 100
            : 0) +
        _overlap(descTokens, tokenizeForSimilarity(p.productDescription).toSet());
    scored.add(MapEntry(p, score));
  }
  scored.sort((a, b) => b.value.compareTo(a.value));
  final ranked = scored.map((e) => e.key).toList();
  // Zero-signal fallback keeps candidate order (reference behavior).
  final list = ranked.isNotEmpty ? ranked : candidates;
  return list.take(limit).toList(growable: false);
}
