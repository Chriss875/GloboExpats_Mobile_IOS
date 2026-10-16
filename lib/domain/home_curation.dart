import '../config.dart';
import '../models/category.dart';

/// Web parity `lib/home-quick-subcategories.ts`: the home page's curation now
/// lives entirely on the taxonomy (backend phase 2) — every subcategory
/// carries `imageUrl`/`featured`/`homePosition`/`displayOrder`, and nothing
/// curated means the section hides itself rather than falling back to a
/// bundled default. This file ports the selection functions the web home page
/// uses, so the app follows the exact same admin curation instead of guessing
/// its own "popular" picks.
const int maxTilesPerCard = 4;
const int _last = 1 << 30;

class TaxonomyEntry {
  final int categoryId;
  final String categoryName;
  final String categorySlug;
  final int subcategoryId;
  final String name;
  final String slug;
  final String? imageUrl;
  final bool featured;
  final int? homePosition;
  final int? displayOrder;

  const TaxonomyEntry({
    required this.categoryId,
    required this.categoryName,
    required this.categorySlug,
    required this.subcategoryId,
    required this.name,
    required this.slug,
    this.imageUrl,
    this.featured = false,
    this.homePosition,
    this.displayOrder,
  });
}

List<TaxonomyEntry> flattenSubcategories(List<Category> categories) {
  final out = <TaxonomyEntry>[];
  for (final c in categories) {
    if (c.status != 'ACTIVE') continue;
    for (final s in c.subcategories) {
      if (s.status != 'ACTIVE') continue;
      out.add(TaxonomyEntry(
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        categorySlug: c.slug,
        subcategoryId: s.subcategoryId,
        name: s.subcategoryName,
        slug: s.slug,
        imageUrl: s.imageUrl,
        featured: s.featured,
        homePosition: s.homePosition,
        displayOrder: s.displayOrder,
      ));
    }
  }
  return out;
}

int _byCuratedOrder(TaxonomyEntry a, TaxonomyEntry b) {
  final h = (a.homePosition ?? _last).compareTo(b.homePosition ?? _last);
  if (h != 0) return h;
  final d = (a.displayOrder ?? _last).compareTo(b.displayOrder ?? _last);
  if (d != 0) return d;
  return a.name.compareTo(b.name);
}

/// "Most Popular Categories" rail: strictly the admin's `homePosition` picks
/// that also have a picture. An empty rail means nothing has been curated yet
/// — the section hides, it never auto-fills from ordinary categories.
List<TaxonomyEntry> selectHomeRailSubcategories(List<Category> categories, {int limit = 6}) {
  final featured = flattenSubcategories(categories)
      .where((e) => e.homePosition != null && (e.imageUrl ?? '').isNotEmpty)
      .toList()
    ..sort(_byCuratedOrder);
  return featured.take(limit).toList();
}

/// Grid tiles: only the explicit `featured` selections with artwork, in
/// category display order. Popular-rail placement never selects a grid tile.
List<TaxonomyEntry> buildHomeCategoryTiles(List<Category> categories) {
  final tiles = flattenSubcategories(categories)
      .where((e) => e.featured && (e.imageUrl ?? '').isNotEmpty)
      .toList()
    ..sort((a, b) {
      final d = (a.displayOrder ?? _last).compareTo(b.displayOrder ?? _last);
      if (d != 0) return d;
      return a.name.compareTo(b.name);
    });
  return tiles;
}

/// How many of a category's subcategories are explicitly featured (with
/// resolvable artwork) — once 1+, its card shows exactly that many tiles
/// (up to [maxTilesPerCard]) instead of the default rhythm.
Map<int, int> buildFeaturedTileCounts(List<Category> categories) {
  final counts = <int, int>{};
  for (final e in flattenSubcategories(categories)) {
    if (!e.featured || (e.imageUrl ?? '').isEmpty) continue;
    counts[e.categoryId] = (counts[e.categoryId] ?? 0) + 1;
  }
  return counts;
}

class CategoryEntry {
  final int categoryId;
  final String categoryName;
  final String categorySlug;
  final int? displayOrder;

  const CategoryEntry({
    required this.categoryId,
    required this.categoryName,
    required this.categorySlug,
    this.displayOrder,
  });
}

/// "Shop by Category" grid: strictly the categories an admin marked
/// `featured`, in display order. No "nothing featured -> show everything"
/// fallback — same rule as the rail: nothing curated renders nothing.
List<CategoryEntry> selectHomeCategories(List<Category> categories) {
  final entries = categories
      .where((c) => c.status == 'ACTIVE' && c.featured)
      .map((c) => CategoryEntry(
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          categorySlug: c.slug,
          displayOrder: c.displayOrder))
      .toList()
    ..sort((a, b) {
      final d = (a.displayOrder ?? _last).compareTo(b.displayOrder ?? _last);
      if (d != 0) return d;
      return a.categoryName.compareTo(b.categoryName);
    });
  return entries;
}

/// Fallback tile-count rhythm for a category with nothing explicitly
/// featured yet, so the grid still mixes card shapes.
const List<int> _defaultTileRhythm = [4, 4, 3, 4, 2, 4, 4, 3, 4, 2];

class CategoryCard {
  final int categoryId;
  final String categoryName;
  final String categorySlug;
  final List<TaxonomyEntry> tiles;
  const CategoryCard(
      {required this.categoryId,
      required this.categoryName,
      required this.categorySlug,
      required this.tiles});
}

/// Groups the curated subcategories under their parent category, capped at
/// [maxCards] cards and [maxTilesPerCard] tiles each. Web parity
/// `buildCategoryCards` (home-category-grid.tsx).
List<CategoryCard> buildCategoryCards(
  List<TaxonomyEntry> items, {
  List<int>? allowedCategoryIds,
  Map<int, int>? tileCounts,
  int maxCards = 8,
}) {
  final grouped = <int, List<TaxonomyEntry>>{};
  final meta = <int, TaxonomyEntry>{};
  for (final item in items) {
    (grouped[item.categoryId] ??= []).add(item);
    meta.putIfAbsent(item.categoryId, () => item);
  }

  Iterable<int> order = allowedCategoryIds ?? grouped.keys;
  final ordered = <int>[for (final id in order) if (grouped.containsKey(id)) id];

  final cards = <CategoryCard>[];
  for (var position = 0; position < ordered.length && cards.length < maxCards; position++) {
    final id = ordered[position];
    final tiles = grouped[id]!;
    final requested =
        tileCounts?[id] ?? _defaultTileRhythm[position % _defaultTileRhythm.length];
    final count = requested.clamp(1, maxTilesPerCard).clamp(1, tiles.length);
    cards.add(CategoryCard(
      categoryId: id,
      categoryName: meta[id]!.categoryName,
      categorySlug: meta[id]!.categorySlug,
      tiles: tiles.take(count).toList(),
    ));
  }
  return cards;
}

/// Resolves a subcategory/tile image to a renderable URL, or null when there
/// is nothing to show (never falls back to a bundled placeholder — an entry
/// with no backend picture is dropped upstream by the selectors above).
String? resolveTileImage(String? imageUrl) =>
    (imageUrl == null || imageUrl.isEmpty) ? null : AppConfig.resolveAssetUrl(imageUrl);
