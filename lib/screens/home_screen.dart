import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../widgets/app_image.dart';
import '../widgets/skeleton_loader.dart';
import '../widgets/home_preferences.dart';
import '../widgets/curated_tile_mosaic.dart';

import '../api/api_client.dart';
import '../domain/listing_events.dart';
import '../domain/home_curation.dart';
import '../models/category.dart';
import '../domain/product_source.dart';
import '../models/product.dart';
import '../theme.dart';
import '../widgets/product_card.dart' as product_cards;
import 'catalog_screens.dart';

/// Home screen — mirrors the web reference's *current* design (it has moved
/// on twice since this screen was first built): `HomePromo`'s image-carousel
/// hero, then `HomeCategoryDiscovery`'s stack of `QuickSubcategories`
/// ("Most Popular Categories"), Featured, `HomeCategoryGrid`
/// ("Shop by Category"), New Arrivals and Trending Now — no tab switcher
/// anywhere, everything always visible, each curated list hiding itself
/// entirely when the admin hasn't curated anything for it yet (web parity
/// `lib/home-quick-subcategories.ts`: "nothing curated renders nothing").
///
/// Preference collections follow the web's public curation contract.
/// Desktop-only hero controls are intentionally omitted on mobile, exactly
/// like the web breakpoint. The mobile page otherwise follows the web's
/// section order, dimensions and two-column content rhythm.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.api});
  final ApiClient? api;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<List<Category>> _catsFuture;
  late Future<List<Product>> _featuredFuture;
  late Future<List<Product>> _newestFuture;
  late Future<List<Product>> _topPicksFuture;
  late Future<List<Map<String, dynamic>>> _preferencesFuture;
  late String _seed;

  @override
  void initState() {
    super.initState();
    _load();
    ListingEvents.instance.addListener(_onListingsChanged);
  }

  @override
  void dispose() {
    ListingEvents.instance.removeListener(_onListingsChanged);
    super.dispose();
  }

  /// A listing was published or changed somewhere in the app: the rails were
  /// loaded before it, so fetch them again (the web reloads on navigation).
  void _onListingsChanged() {
    if (mounted) setState(_load);
  }

  void _load() {
    _catsFuture = _api.fetchCategories();
    _preferencesFuture = _api.fetchHomePreferences();
    // Web parity `getFeaturedListings`: a per-load SHUFFLE seed. Held on the
    // state so a source switch reshuffles the same deck rather than a new one.
    _seed = DateTime.now().millisecondsSinceEpoch.remainder(100000).toString();
    _featuredFuture = _api.fetchDisplayShuffle(_seed, size: 18);
    _newestFuture = _newest();
    _topPicksFuture = _api.fetchDisplay('top-picks', size: 24);
  }

  /// Web New Arrivals: strictly newest first, whatever order the server
  /// returned them in.
  Future<List<Product>> _newest([String? source]) => _api
      .fetchDisplay('newest', size: 24, productSource: source)
      .then((list) => [...list]..sort(Product.newestFirst));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          setState(_load);
          await Future.wait(
              [_catsFuture, _featuredFuture, _newestFuture, _topPicksFuture]);
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            const SliverToBoxAdapter(child: _HeroCarousel()),
            SliverToBoxAdapter(child: _PopularSubcategoriesRail(_catsFuture)),
            SliverToBoxAdapter(
                child: HomePreferences(
                    collections: _preferencesFuture, categories: _catsFuture)),
            SliverToBoxAdapter(
              child: _DiscoverSection(
                title: 'Featured',
                subtitle: 'A quick scan of trusted listings across categories',
                future: _featuredFuture,
                fetchSource: (source) => _api.fetchDisplayShuffle(_seed,
                    size: 18, productSource: source),
              ),
            ),
            SliverToBoxAdapter(child: _CategoryGrid(_catsFuture)),
            SliverToBoxAdapter(
              child: _DiscoverSection(
                title: 'New Arrivals',
                subtitle: 'Fresh items posted by the expat community',
                future: _newestFuture,
                fetchSource: (source) => _newest(source),
                seeMoreQuery: '?sort=date-desc',
              ),
            ),
            SliverToBoxAdapter(
              child: _DiscoverSection(
                title: 'Trending Now',
                subtitle: 'Most popular items right now',
                future: _topPicksFuture,
                fetchSource: (source) => _api.fetchDisplay('top-picks',
                    size: 24, productSource: source),
                seeMoreQuery: '?sort=trending',
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 32)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Hero — web parity `home-promo.tsx`: an image carousel, not a static banner.
// ---------------------------------------------------------------------------

class _HeroSlide {
  final String asset;
  final String description;
  const _HeroSlide(this.asset, this.description);
}

const _heroDescription =
    'Find quality goods, trusted services, homes, vehicles and community requests across Dar es Salaam.';

/// Same six topics as the web hero, using this app's already-bundled static
/// art (Rule 13 asset parity) — the web's per-slide revisioned filenames
/// aren't shipped here, but the underlying artwork is the same.
const _heroSlides = [
  // The courier-with-a-box shot is deliberately not here: it led the
  // rotation and read as a delivery service rather than a marketplace.
  _HeroSlide('assets/images/home/globoexpats-listing-electronics.webp',
      _heroDescription),
  _HeroSlide(
      'assets/images/home/globoexpats-listing-vehicles.webp', _heroDescription),
  _HeroSlide(
      'assets/images/home/globoexpats-listing-property.webp', _heroDescription),
  _HeroSlide('assets/images/home/globoexpats-listing-home-living.webp',
      _heroDescription),
  _HeroSlide(
      'assets/images/home/globoexpats-services-jobs.webp', _heroDescription),
];

class _HeroCarousel extends StatefulWidget {
  const _HeroCarousel();

  @override
  State<_HeroCarousel> createState() => _HeroCarouselState();
}

class _HeroCarouselState extends State<_HeroCarousel> {
  final _controller = PageController();
  int _index = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Web parity: auto-advances every 5s; a manual swipe just changes which
    // slide the timer advances from next.
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted || !_controller.hasClients) return;
      final next = (_index + 1) % _heroSlides.length;
      _controller.animateToPage(next,
          duration: const Duration(milliseconds: 450), curve: Curves.easeInOut);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 640),
        child: AspectRatio(
            aspectRatio: 4 / 5,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Container(
                decoration: BoxDecoration(
                  // Web parity home-promo.tsx: a 118deg ramp that holds the
                  // brand blue for its first 44% before turning over.
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(0xFF1E40AF),
                      Color(0xFF1E40AF),
                      AppPalette.of(context).infoText,
                      Color(0xFF1E3A8A)
                    ],
                    stops: [0, .44, .74, 1],
                  ),
                ),
                child: Stack(children: [
                  Positioned.fill(
                    child: PageView.builder(
                      controller: _controller,
                      itemCount: _heroSlides.length,
                      onPageChanged: (i) => setState(() => _index = i),
                      itemBuilder: (context, i) => Padding(
                        padding: const EdgeInsets.fromLTRB(16, 92, 16, 0),
                        child: Align(
                          alignment: Alignment.bottomCenter,
                          child: Image.asset(_heroSlides[i].asset,
                              fit: BoxFit.contain,
                              alignment: Alignment.bottomCenter,
                              filterQuality: FilterQuality.high),
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 32, 16, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text.rich(
                          TextSpan(
                            style: TextStyle(
                                fontSize: 28,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                                height: 1.04),
                            children: [
                              TextSpan(text: 'Buy. '),
                              TextSpan(
                                  text: 'Sell.',
                                  style: TextStyle(color: Color(0xFFFF9800))),
                              TextSpan(text: ' Connect.'),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          _heroSlides[_index].description,
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: .9),
                              fontSize: 14,
                              height: 24 / 14),
                        ),
                      ],
                    ),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 24,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var i = 0; i < _heroSlides.length; i++)
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            margin: const EdgeInsets.symmetric(horizontal: 4),
                            width: i == _index ? 32 : 20,
                            height: 6,
                            decoration: BoxDecoration(
                              color: i == _index
                                  ? Colors.white
                                  : Colors.white.withValues(alpha: 0.55),
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                      ],
                    ),
                  ),
                ]),
              ),
            )),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Section header — web parity `components/sections/section-header.tsx`.
// ---------------------------------------------------------------------------
class _SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  const _SectionHeader(this.title, {this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: TextStyle(
                  fontSize: 20,
                  height: 1.2,
                  letterSpacing: -.25,
                  color: AppPalette.of(context).textPrimary,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Row(children: [
            Container(
                width: 48,
                height: 3,
                decoration: BoxDecoration(
                    color: AppColors.brandBlue,
                    borderRadius: BorderRadius.circular(99))),
            const SizedBox(width: 8),
            Container(
                width: 6,
                height: 6,
                decoration: const BoxDecoration(
                    color: AppColors.brandAmber, shape: BoxShape.circle)),
            const SizedBox(width: 8),
            Container(
                width: 28,
                height: 3,
                decoration: BoxDecoration(
                    color: AppColors.brandAmber,
                    borderRadius: BorderRadius.circular(99))),
          ]),
          if (subtitle != null) ...[
            const SizedBox(height: 8),
            Text(subtitle!,
                style: TextStyle(
                    fontSize: 14, height: 1.45, color: AppPalette.of(context).textSecondary)),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// "Most Popular Categories" — web parity `quick-subcategories.tsx`: a curated
// grid of subcategory tiles (admin `homePosition`), not a plain category rail.
// ---------------------------------------------------------------------------
class _PopularSubcategoriesRail extends StatelessWidget {
  final Future<List<Category>> future;
  const _PopularSubcategoriesRail(this.future);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Category>>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const _PopularSubcategoriesSkeleton();
        }
        // Web parity: a failed/empty curation just hides the section, it
        // never shows an error box for a purely cosmetic rail.
        if (snap.hasError) return const SizedBox.shrink();
        final items = selectHomeRailSubcategories(snap.data ?? const []);
        if (items.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionHeader('Most Popular Categories'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: items.length > 6 ? 6 : items.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  childAspectRatio: 4 / 3,
                ),
                itemBuilder: (context, i) => _SubcategoryTile(items[i]),
              ),
            ),
            const SizedBox(height: 4),
          ],
        );
      },
    );
  }
}

class _PopularSubcategoriesSkeleton extends StatelessWidget {
  const _PopularSubcategoriesSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader('Most Popular Categories'),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: GridViewSkeletonTileSet(),
        ),
        SizedBox(height: 4),
      ],
    );
  }
}

class GridViewSkeletonTileSet extends StatelessWidget {
  const GridViewSkeletonTileSet({super.key});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 4 / 3,
      children: const [
        SkeletonBox(height: double.infinity),
        SkeletonBox(height: double.infinity),
        SkeletonBox(height: double.infinity),
        SkeletonBox(height: double.infinity),
      ],
    );
  }
}

class _SubcategoryTile extends StatelessWidget {
  final TaxonomyEntry entry;
  const _SubcategoryTile(this.entry);

  @override
  Widget build(BuildContext context) {
    final imageUrl = resolveTileImage(entry.imageUrl);
    return InkWell(
      borderRadius: BorderRadius.zero,
      // Web parity `buildQuickSubcategoryBrowseHref`: the tile IS a
      // taxonomy node, so it selects that subcategory in the marketplace
      // rather than running a text search for its label.
      onTap: () => context.push('/browse?category=${entry.categoryId}'
          '&subcategory=${entry.subcategoryId}'),
      child: ClipRect(
        child: Stack(fit: StackFit.expand, children: [
          imageUrl != null
              ? AppImage(imageUrl, fit: BoxFit.cover)
              : Container(color: AppPalette.of(context).border),
          // Web parity quick-subcategories.tsx: the scrim covers the bottom
          // half and ramps slate-950 75% -> 20% -> clear, so the label reads
          // without flattening the photo behind it.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 24, 10, 10),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0x00020617),
                    Color(0x33020617),
                    Color(0xBF020617),
                  ],
                  stops: [0, .46, 1],
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(entry.categoryName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: .8),
                          fontSize: 10,
                          height: 1.2,
                          fontWeight: FontWeight.w500)),
                  const SizedBox(height: 2),
                  Text(entry.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          height: 1.15,
                          fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ),
          // ring-1 ring-slate-900/5
          const Positioned.fill(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.fromBorderSide(
                      BorderSide(color: Color(0x0D0F172A))),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// "Shop by Category" — web parity `home-category-grid.tsx`: category cards,
// each holding its own curated subcategory tiles in the same four layout
// shapes used by the web experience.
// ---------------------------------------------------------------------------
class _CategoryGrid extends StatelessWidget {
  final Future<List<Category>> future;
  const _CategoryGrid(this.future);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Category>>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const SizedBox.shrink();
        }
        if (snap.hasError) return const SizedBox.shrink();
        final cats = snap.data ?? const [];
        final tiles = buildHomeCategoryTiles(cats);
        final allowed =
            selectHomeCategories(cats).map((e) => e.categoryId).toList();
        final counts = buildFeaturedTileCounts(cats);
        final cards = buildCategoryCards(tiles,
            allowedCategoryIds: allowed, tileCounts: counts);
        if (cards.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionHeader('Shop by Category',
                subtitle:
                    'Every category with its top sections, in one place.'),
            // Web parity home-category-grid.tsx: 260px-basis panels, so one
            // card fills each row at phone widths, each sized by its own tiles
            // rather than squeezed into a fixed-ratio grid cell.
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Column(
                children: [
                  for (final card in cards.take(6))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 288),
                        child: _CategoryCardView(card: card, categories: cats),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _CategoryCardView extends StatelessWidget {
  final CategoryCard card;
  final List<Category> categories;
  const _CategoryCardView({required this.card, required this.categories});

  void _openCategory(BuildContext context) {
    final full = categories.firstWhere(
      (c) => c.categoryId == card.categoryId,
      orElse: () => Category(
          categoryId: card.categoryId,
          categoryName: card.categoryName,
          slug: card.categorySlug),
    );
    Navigator.of(context).push(
        MaterialPageRoute(
            settings: RouteSettings(name: '/category/${full.slug}'),
            builder: (_) => CategoryScreen(category: full)));
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(card.categoryName,
              style:
                  const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height: 10),
          CuratedTileMosaic(
            tiles: [
              for (final tile in card.tiles)
                CuratedTile(
                  imageUrl: resolveTileImage(tile.imageUrl),
                  label: tile.name,
                  onTap: () => context
                      .push('/browse?category=${tile.categoryId}'
                          '&subcategory=${tile.subcategoryId}'),
                ),
            ],
          ),
          const SizedBox(height: 10),
          InkWell(
            onTap: () => _openCategory(context),
            child: Text('See more in ${card.categoryName}',
                style: TextStyle(
                    color: AppPalette.of(context).accentInk,
                    fontWeight: FontWeight.w700,
                    fontSize: 12.5)),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Featured / New Arrivals / Trending Now — web parity `home-discover-tabs.tsx`
// (a misnomer kept from an earlier design: these are three always-visible
// stacked sections now, not tabs a visitor switches between).
// ---------------------------------------------------------------------------
class _DiscoverSection extends StatefulWidget {
  final String title;
  final String subtitle;
  final Future<List<Product>> future;

  /// Re-runs the section's request for one source. The chips are a BACKEND
  /// filter on the web (`productSource=COMMUNITY|SHOPS`), so mobile has to
  /// ask the server too — see [parseProductSource].
  final Future<List<Product>> Function(String source) fetchSource;
  final String seeMoreQuery;
  const _DiscoverSection({
    required this.title,
    required this.subtitle,
    required this.future,
    required this.fetchSource,
    this.seeMoreQuery = '',
  });

  @override
  State<_DiscoverSection> createState() => _DiscoverSectionState();
}

class _DiscoverSectionState extends State<_DiscoverSection> {
  bool _expanded = false;
  String _source = kSourceAll;

  /// The request in flight for the chosen source. Starts as the parent's
  /// "all" request so the first paint costs nothing extra.
  late Future<List<Product>> _future = widget.future;

  @override
  void didUpdateWidget(covariant _DiscoverSection old) {
    super.didUpdateWidget(old);
    // Pull-to-refresh rebuilds the parent with a fresh request.
    if (old.future != widget.future && _source == kSourceAll) {
      _future = widget.future;
    }
  }

  Widget _sourceChip(String value, String label) {
    final selected = _source == value;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => setState(() {
        _source = value;
        _expanded = false;
        // The server decides what belongs to each source; filtering the page
        // we already hold would both use the wrong rule and only ever see the
        // items already fetched.
        _future = value == kSourceAll
            ? widget.future
            : widget.fetchSource(value);
      }),
      showCheckmark: selected,
      visualDensity: VisualDensity.compact,
      labelStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: selected
              ? AppPalette.of(context).infoText
              : AppPalette.of(context).textSecondary),
      selectedColor: AppPalette.of(context).infoFill,
      backgroundColor: AppPalette.of(context).surface,
      side: BorderSide(
          color: selected
              ? AppPalette.of(context).infoBorder
              : AppPalette.of(context).borderStrong),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Product>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SectionHeader(widget.title, subtitle: widget.subtitle),
              const SectionSkeleton(horizontal: true),
            ],
          );
        }
        if (snap.hasError) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SectionHeader(widget.title, subtitle: widget.subtitle),
              _ErrorBox('Could not load ${widget.title}. Please try again.'),
            ],
          );
        }
        final filtered = snap.data ?? const <Product>[];
        // An empty "all" section is nothing to show; an empty source says so,
        // because the chips have to stay reachable to switch back.
        if (filtered.isEmpty && _source == kSourceAll) {
          return const SizedBox.shrink();
        }
        final visible = _expanded || filtered.length <= 12
            ? filtered
            : filtered.sublist(0, 12);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(widget.title, subtitle: widget.subtitle),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  for (final option in kProductSourceOptions)
                    _sourceChip(option.value, option.label),
                ],
              ),
            ),
            if (filtered.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  color: AppPalette.of(context).background,
                  child: Text(
                    productSourceEmptyMessage(_source),
                    style:
                        TextStyle(fontSize: 13, color: AppPalette.of(context).textSecondary),
                  ),
                ),
              )
            else ...[
              if (!_expanded)
                Padding(
                  padding: EdgeInsets.only(right: 12, bottom: 4),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Text('Swipe to explore →',
                        style:
                            TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary)),
                  ),
                ),
              if (_expanded)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: LayoutBuilder(builder: (context, constraints) {
                    final cardWidth = (constraints.maxWidth - 12) / 2;
                    return GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: visible.length,
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        childAspectRatio: cardWidth /
                            product_cards.productCardHeight(context,
                                width: cardWidth, compact: true),
                      ),
                      itemBuilder: (context, i) =>
                          product_cards.ProductCard(visible[i], compact: true),
                    );
                  }),
                )
              else
                LayoutBuilder(builder: (context, constraints) {
                  final width = (constraints.maxWidth - 36) / 2;
                  return SizedBox(
                    // Sized to the card's content — a fixed ratio left the
                    // rail's compact cards with a band of dead space above
                    // their price row (see productCardHeight).
                    height: product_cards.productCardHeight(context,
                        width: width, compact: true),
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      itemCount: visible.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 12),
                      itemBuilder: (context, i) => SizedBox(
                          width: width,
                          child: product_cards.ProductCard(visible[i],
                              compact: true)),
                    ),
                  );
                }),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                child: Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (filtered.length > 12)
                      OutlinedButton(
                        onPressed: () => setState(() => _expanded = !_expanded),
                        child: Text(_expanded ? 'Show less' : 'Load more'),
                      ),
                    OutlinedButton.icon(
                      onPressed: () =>
                          context.push('/browse${widget.seeMoreQuery}'),
                      icon: const Icon(Icons.arrow_forward, size: 14),
                      label: Text('See more ${widget.title.toLowerCase()}',
                          style: const TextStyle(fontSize: 12)),
                      style: OutlinedButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _ErrorBox extends StatelessWidget {
  final String message;
  const _ErrorBox(this.message);
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: Colors.red.shade50, borderRadius: BorderRadius.circular(8)),
        child: Text(message,
            style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
      ),
    );
  }
}
