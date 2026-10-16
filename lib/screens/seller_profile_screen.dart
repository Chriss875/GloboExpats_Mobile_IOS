import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../config.dart';
import '../domain/seller_display.dart';
import '../models/product.dart' show Product;
import '../theme.dart';
import '../widgets/app_image.dart';
import '../widgets/error_text.dart';
import '../widgets/fullscreen_image_viewer.dart';
import '../widgets/halal_badge.dart';
import '../widgets/product_card.dart' show ProductSaveButton;
import '../widgets/share_kit/share_cards.dart' show ShareCardItem;
import '../widgets/share_kit/share_sheets.dart';
import '../widgets/skeleton_loader.dart';

/// AU-051 public seller storefront (web `/seller/[id]` parity).
///
/// LISTIN-22/23/24/25/26: trust header (photo/initials avatar, verified badge,
/// Member Since / Success Rating), masked public names (header + reviews), a
/// search/filter/sort showcase that reveals the seller's FULL catalog 12 at a
/// time (web `getFilteredProductsComplete` + ITEMS_PER_PAGE slice), up-to-20
/// reviews with dates, and the share-profile sheet: the Share Kit's shop
/// pictures when sellers share their own shop, the link for everyone else.
///
/// The web is the copy source: `app/seller/[id]/page.tsx`,
/// `components/seller/seller-showcase-controls.tsx`,
/// `components/seller/share-seller-profile-modal.tsx`,
/// `lib/seller-display.ts` and `lib/seller-profile-route.ts`.
class SellerProfileScreen extends StatefulWidget {
  final int sellerId;
  const SellerProfileScreen({super.key, required this.sellerId, this.api});
  final ApiClient? api;
  @override
  State<SellerProfileScreen> createState() => _SellerProfileScreenState();
}

/// Web `MARKETPLACE_SORT_OPTIONS` (lib/marketplace-sort.ts), in order.
enum _ShowcaseSort {
  relevance,
  priceAsc,
  priceDesc,
  newest,
  ratingDesc,
  trending
}

const int _itemsPerPage = 12; // web ITEMS_PER_PAGE
const int _listingsBatchSize = 48; // fetch-all page size
const int _reviewsFetchSize = 20; // web getUserRatings(userId, 0, 20)

class _SellerProfileScreenState extends State<SellerProfileScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();

  // Summary (GET /userManagement/seller-summary/{id}).
  Map<String, dynamic>? _summary;
  Object? _summaryError;
  bool _loadingSummary = true;

  // Complete seller catalog + received ratings.
  List<Product> _allListings = const [];
  bool _loadingListings = true;
  Object? _listingsError;
  List<Map<String, dynamic>> _ratings = const [];
  bool _loadingRatings = true;

  // Showcase controls (client-side over the full catalog — web parity).
  final TextEditingController _search = TextEditingController();
  _ShowcaseSort _sort = _ShowcaseSort.relevance;
  String? _categoryFilter;
  String? _subcategoryFilter;
  int _visibleListingCount = _itemsPerPage;

  /// The signed-in viewer, to recognise a seller looking at their own shop.
  int? _viewerId;

  /// Guards against an older catalogue load finishing after a refresh.
  int _listingsGeneration = 0;

  /// More catalogue pages are still arriving in the background.
  bool _moreListingsComing = false;

  /// Reveal the next listings this far before the end of the page.
  static const double _revealExtent = 600;

  final ScrollController _scroll = ScrollController();

  /// Infinite scroll: near the bottom, show the next batch.
  bool _onScroll(ScrollNotification n) {
    if (n.metrics.axis == Axis.vertical &&
        n.metrics.extentAfter < _revealExtent) {
      _revealMore();
    }
    return false;
  }

  void _revealMore() {
    final remaining = _filtered().length - _visibleListingCount;
    if (remaining <= 0) return;
    setState(() => _visibleListingCount += _itemsPerPage);
    _revealIfShort();
  }

  /// A batch that does not reach the bottom of the screen cannot be
  /// scrolled, so nothing would reveal the next one: check after layout.
  void _revealIfShort() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      if (_scroll.position.extentAfter < _revealExtent) _revealMore();
    });
  }

  @override
  void initState() {
    super.initState();
    _refresh();
    _resolveViewer();
  }

  Future<void> _resolveViewer() async {
    final token = AuthStore.instance?.token;
    if (token == null || token.isEmpty) return;
    try {
      final me = await _api.getUserDetails(token);
      final raw = me['userId'] ?? me['id'];
      final id = raw is num ? raw.toInt() : int.tryParse('$raw');
      if (mounted) setState(() => _viewerId = id);
    } catch (_) {
      // Unknown viewer: the share sheet offers the link, like for visitors.
    }
  }

  bool get _isOwnProfile => _viewerId != null && _viewerId == _userId;

  @override
  void dispose() {
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    await Future.wait([_loadSummary(), _loadAllListings(), _loadRatings()]);
  }

  Future<void> _loadSummary() async {
    setState(() {
      _loadingSummary = true;
      _summaryError = null;
    });
    try {
      final s = await _api.fetchSellerSummary(widget.sellerId);
      if (!mounted) return;
      setState(() {
        _summary = s;
        _loadingSummary = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _summaryError = e;
        _loadingSummary = false;
      });
    }
  }

  /// Fetch the seller's ENTIRE catalog, page by page (web
  /// `getFilteredProductsComplete` loops filterProducts until exhausted), so no
  /// product is invisible the way the old single-24 fetch made them (LISTIN-25).
  ///
  /// The shop shows as soon as the first page lands; the rest of a big
  /// catalogue keeps arriving underneath while the buyer already browses.
  Future<void> _loadAllListings() async {
    final generation = ++_listingsGeneration;
    setState(() {
      _loadingListings = true;
      _listingsError = null;
    });
    try {
      final all = <Product>[];
      var totalElements = -1;
      for (var page = 0; page < 200; page++) {
        final res = await _api.fetchFiltered(
            sellerId: widget.sellerId, page: page, size: _listingsBatchSize);
        if (!mounted || generation != _listingsGeneration) return;
        all.addAll(res.products);
        totalElements = res.totalElements;
        final done = res.products.isEmpty || all.length >= totalElements;
        setState(() {
          _allListings = List.of(all);
          if (page == 0) _visibleListingCount = _itemsPerPage;
          _loadingListings = false;
          _moreListingsComing = !done;
        });
        if (done) break;
        _revealIfShort();
      }
    } catch (e) {
      if (!mounted || generation != _listingsGeneration) return;
      setState(() {
        // Keep what already arrived; only an empty shop shows the error.
        if (_allListings.isEmpty) _listingsError = e;
        _loadingListings = false;
        _moreListingsComing = false;
      });
    }
  }

  Future<void> _loadRatings() async {
    setState(() => _loadingRatings = true);
    try {
      final rows =
          await _api.fetchUserRatings(widget.sellerId, size: _reviewsFetchSize);
      if (!mounted) return;
      setState(() {
        _ratings = rows;
        _loadingRatings = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _ratings = const [];
        _loadingRatings = false;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Derived summary helpers
  // ---------------------------------------------------------------------------

  Map<String, dynamic>? get _s => _summary;

  String _fullName() {
    final s = _s;
    if (s == null) return 'Seller';
    return [s['firstName'], s['lastName']]
        .where((e) => e != null && e.toString().isNotEmpty)
        .join(' ')
        .trim();
  }

  int get _userId {
    final raw = _s?['userId'];
    final parsed = raw is num ? raw.toInt() : int.tryParse('$raw');
    return parsed ?? widget.sellerId;
  }

  double get _avgRating => (_s?['averageRating'] as num?)?.toDouble() ?? 0;
  int get _totalReviews => (_s?['totalRatingsCount'] as num?)?.toInt() ?? 0;
  bool get _hasRating => _avgRating > 0 && _totalReviews > 0;
  bool get _verified => sellerVerifiedFromSummary(_s ?? const {});
  String? get _profileImage {
    final url = _s?['profileImageUrl']?.toString() ?? '';
    return url.isEmpty ? null : AppConfig.resolveAssetUrl(url);
  }

  String? get _locationLabel {
    final s = _s;
    if (s == null) return null;
    for (final key in const ['location', 'placeName']) {
      final v = s[key]?.toString().trim() ?? '';
      if (v.isNotEmpty && v != 'null') return v;
    }
    final region = s['region']?.toString().trim() ?? '';
    final country = s['country']?.toString().trim() ?? '';
    if (region.isNotEmpty || country.isNotEmpty) {
      return [region, country].where((e) => e.isNotEmpty).join(', ');
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // The brand bar runs straight into the hero banner (web seller page).
      appBar: AppBar(
        title: Text(_isOwnProfile ? 'Your shop' : 'Seller'),
        backgroundColor: AppColors.brandBlue,
        foregroundColor: BrandStage.ink,
        systemOverlayStyle: SystemUiOverlayStyle.light,
      ),
      body: NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: _buildBody(),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loadingSummary) {
      return const SkeletonPage();
    }
    if (_summaryError != null) {
      return Center(
          child: ErrorText(
              error: _summaryError, context: 'Could not load seller.'));
    }
    final s = _s!;
    final displayName = publicSellerName(_fullName());
    final initials = publicInitials(displayName, fallback: '?');
    final position = (s['position'] ?? '').toString().trim();
    final aboutMe = (s['aboutMe'] ?? '').toString().trim();

    return ListView(
      controller: _scroll,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        _HeaderCard(
          onShare: () => _share(context),
          imageUrl: _profileImage,
          initials: initials,
          verified: _verified,
          displayName: displayName,
          position: position,
          hasRating: _hasRating,
          averageRating: _avgRating,
          totalReviews: _totalReviews,
          listingCount: _allListings.length,
          memberSince: memberSinceYear(s['joinedDate'] ?? s['createdAt']),
          location: _locationLabel,
        ),
        const SizedBox(height: 12),
        // Working-hours card (web SellerScheduleCard) is deferred — see report.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _AboutAndReviewsCard(
            displayName: displayName,
            aboutMe: aboutMe,
            verified: _verified,
            totalReviews: _totalReviews,
            loadingRatings: _loadingRatings,
            ratings: _ratings,
          ),
        ),
        const SizedBox(height: 20),
        _showcaseHeader(),
        const SizedBox(height: 12),
        _showcase(),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Showcase
  // ---------------------------------------------------------------------------

  Widget _showcaseHeader() {
    final n = _allListings.length;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          const Expanded(
            child: Text('Seller Showcase',
                style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.3)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
                color: AppColors.brandBlue,
                borderRadius: BorderRadius.circular(999)),
            child: Text(
              '$n ${n == 1 ? 'Product' : 'Products'}',
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _showcase() {
    if (_loadingListings) {
      return const ProductGridSkeleton();
    }
    if (_listingsError != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(children: [
          ErrorText(
              error: _listingsError,
              context: 'Could not load this seller\'s products.'),
          TextButton(onPressed: _loadAllListings, child: const Text('Retry')),
        ]),
      );
    }
    // Web empty state (page.tsx:822-854): icon tinted by verification.
    if (_allListings.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
              side: BorderSide(color: AppPalette.of(context).border),
              borderRadius: BorderRadius.circular(16)),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                    color: _verified
                        ? AppPalette.of(context).successFill
                        : AppPalette.of(context).warningFill,
                    borderRadius: BorderRadius.circular(16)),
                child: Icon(
                  _verified ? Icons.verified : Icons.badge_outlined,
                  size: 30,
                  color: _verified
                      ? const Color(0xFF059669)
                      : AppPalette.of(context).warningText,
                ),
              ),
              const SizedBox(height: 12),
              const Text('No items listed yet',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(
                _verified
                    ? 'Their seller verification is complete, so they can publish their '
                        'first listing whenever they’re ready.'
                    : 'They’ll need to complete seller verification before they can start selling.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: AppPalette.of(context).textSecondary, fontSize: 13, height: 1.4),
              ),
            ]),
          ),
        ),
      );
    }

    final categories = _categoryOptions();
    final subcategories = _subcategoryOptions();
    final filtered = _filtered();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ShowcaseControls(
            searchController: _search,
            onSearchChanged: (_) {
              setState(() => _visibleListingCount = _itemsPerPage);
              _revealIfShort();
            },
            categories: categories,
            selectedCategory: _categoryFilter,
            onCategoryChanged: (c) => setState(() {
              _categoryFilter = c;
              _subcategoryFilter = null;
              _visibleListingCount = _itemsPerPage;
            }),
            subcategories: subcategories,
            selectedSubcategory: _subcategoryFilter,
            onSubcategoryChanged: (s) => setState(() {
              _subcategoryFilter = s;
              _visibleListingCount = _itemsPerPage;
            }),
            sort: _sort,
            onSortChanged: (s) => setState(() {
              _sort = s;
              _visibleListingCount = _itemsPerPage;
            }),
            hasActiveFilters: _hasActiveFilters,
            onClear: _clearShowcaseFilters,
          ),
          const SizedBox(height: 12),
          if (filtered.isEmpty)
            // Web filtered-empty state (page.tsx:855-870).
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Column(children: [
                Icon(Icons.search, size: 40, color: AppPalette.of(context).borderStrong),
                const SizedBox(height: 8),
                const Text('No matching products',
                    style:
                        TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(
                  'Try another search term or clear the category filter to see more products.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppPalette.of(context).textSecondary, fontSize: 13),
                ),
                const SizedBox(height: 8),
                TextButton(
                    onPressed: _clearShowcaseFilters,
                    child: const Text('Clear search and filters')),
              ]),
            )
          else ...[
            _ListingGrid(
              products: filtered.take(_visibleListingCount).toList(),
              onOpen: (p) => context.push('/product/${p.productId}', extra: p),
            ),
            // Infinite scroll: the next batch appears as the buyer nears
            // the end (and whenever a filter leaves the page short). The
            // spinner only shows while pages are still downloading.
            if (_visibleListingCount < filtered.length)
              Builder(builder: (_) {
                _revealIfShort();
                return const SizedBox(height: 48);
              })
            else if (_moreListingsComing)
              const Padding(
                key: ValueKey('seller-showcase-more'),
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.4)),
                ),
              ),
          ],
        ],
      ),
    );
  }

  bool get _hasActiveFilters =>
      _search.text.trim().isNotEmpty ||
      _categoryFilter != null ||
      _subcategoryFilter != null;

  void _clearShowcaseFilters() {
    setState(() {
      _search.clear();
      _categoryFilter = null;
      _subcategoryFilter = null;
      _visibleListingCount = _itemsPerPage;
    });
  }

  List<String> _categoryOptions() {
    final map = <String, Set<String>>{};
    for (final p in _allListings) {
      final c = (p.categoryName ?? '').trim();
      if (c.isEmpty) continue;
      map.putIfAbsent(c, () => <String>{});
      final sub = (p.subcategoryName ?? '').trim();
      if (sub.isNotEmpty) map[c]!.add(sub);
    }
    return map.keys.toList()..sort();
  }

  List<String> _subcategoryOptions() {
    final selected = _categoryFilter;
    if (selected == null) return const [];
    final subs = <String>{};
    for (final p in _allListings) {
      if (p.categoryName == selected) {
        final sub = (p.subcategoryName ?? '').trim();
        if (sub.isNotEmpty) subs.add(sub);
      }
    }
    return subs.toList()..sort();
  }

  /// Mirrors the web `filteredListings` useMemo (page.tsx:404-440): search over
  /// title/category/condition/location/description, then category + subcategory
  /// equality, then the six marketplace sorts.
  List<Product> _filtered() {
    final q = _search.text.trim().toLowerCase();
    final list = _allListings.where((p) {
      final category = p.categoryName ?? '';
      if (_categoryFilter != null && category != _categoryFilter) return false;
      if (_subcategoryFilter != null &&
          (p.subcategoryName ?? '') != _subcategoryFilter) {
        return false;
      }
      if (q.isEmpty) return true;
      final location = [p.productRegion, p.placeName]
          .where((e) => e != null && e.isNotEmpty)
          .join(' ');
      final haystack = [
        p.productName,
        category,
        p.productCondition,
        location,
        p.productDescription,
      ].whereType<String>().join('\n').toLowerCase();
      return haystack.contains(q);
    }).toList();

    list.sort((a, b) {
      switch (_sort) {
        case _ShowcaseSort.priceAsc:
          return a.productAskingPrice.compareTo(b.productAskingPrice);
        case _ShowcaseSort.priceDesc:
          return b.productAskingPrice.compareTo(a.productAskingPrice);
        case _ShowcaseSort.newest:
          // No parsed creation date on the model; ids grow with creation time.
          return b.productId.compareTo(a.productId);
        case _ShowcaseSort.ratingDesc:
          final byRating = b.averageRating.compareTo(a.averageRating);
          return byRating != 0
              ? byRating
              : b.totalRatingsCount.compareTo(a.totalRatingsCount);
        case _ShowcaseSort.trending:
          return b.clickCount.compareTo(a.clickCount);
        case _ShowcaseSort.relevance:
          return 0; // keep fetch order
      }
    });
    return list;
  }

  // ---------------------------------------------------------------------------
  // Share (web share-seller-profile-modal.tsx)
  // ---------------------------------------------------------------------------

  /// Anyone can share a shop with the Share Kit; the sharer (the seller
  /// themselves or a visitor who is signed in) is credited on the links.
  void _share(BuildContext context) {
    final name = publicSellerName(_fullName());
    showSellerShareSheet(
      context,
      sellerName: name,
      profilePath: buildSellerProfilePath(_fullName(), _userId),
      profileImageUrl: _profileImage,
      sharerId: _viewerId,
      kit: SellerShareKitDetails(
        sellerId: _userId,
        verified: _verified,
        city: _locationLabel,
        statsText: _hasRating
            ? '★ ${_avgRating.toStringAsFixed(1)} · $_totalReviews reviews'
            : null,
        listings: [
          for (final p in _allListings
              .where((p) => (p.primaryImageUrl ?? '').isNotEmpty)
              .take(6))
            ShareCardItem(
              imageUrl: AppConfig.resolveAssetUrl(p.primaryImageUrl!),
              price: Product.formatPrice(p.productAskingPrice, p.productCurrency),
            ),
        ],
        listingCount: _allListings.length,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Header card
// ---------------------------------------------------------------------------

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({
    required this.onShare,
    required this.imageUrl,
    required this.initials,
    required this.verified,
    required this.displayName,
    required this.position,
    required this.hasRating,
    required this.averageRating,
    required this.totalReviews,
    required this.listingCount,
    required this.memberSince,
    required this.location,
  });
  final VoidCallback onShare;
  final String? imageUrl;
  final String initials;
  final bool verified;
  final String displayName;
  final String position;
  final bool hasRating;
  final double averageRating;
  final int totalReviews;
  final int listingCount;
  final String memberSince;
  final String? location;

  static const double _bannerHeight = 112;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    // Web seller page: a brand-blue hero with the profile card lifted over
    // its lower edge, which fades into the page.
    return Stack(children: [
      Container(
        height: _bannerHeight,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.brandBlue, AppColors.heroBlue700, AppColors.heroBlue600],
          ),
        ),
      ),
      Positioned(
        left: 0,
        right: 0,
        top: _bannerHeight - 56,
        height: 56,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                palette.background.withValues(alpha: 0),
                palette.background,
              ],
            ),
          ),
        ),
      ),
      Container(
        margin: const EdgeInsets.fromLTRB(12, 44, 12, 0),
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: palette.border),
          boxShadow: const [
            BoxShadow(
                color: Color(0x14172554), blurRadius: 18, offset: Offset(0, 6)),
          ],
        ),
        child: Stack(children: [
          Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 16),
                child: Column(children: [
                  _Avatar(
                      imageUrl: imageUrl, initials: initials, verified: verified),
                  const SizedBox(height: 14),
                  Text(displayName,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontFamily: 'Lexend',
                          fontSize: 23,
                          height: 1.2,
                          fontWeight: FontWeight.w700,
                          color: palette.textPrimary)),
                  if (position.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(position.toUpperCase(),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                              color: palette.accentInk)),
                    ),
                  if (hasRating) ...[
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _Stars(rating: averageRating, size: 18),
                        const SizedBox(width: 6),
                        Text(averageRating.toStringAsFixed(1),
                            style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: palette.textPrimary)),
                        const SizedBox(width: 6),
                        Text(
                            '($totalReviews ${totalReviews == 1 ? 'Review' : 'Reviews'})',
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: palette.textSecondary)),
                      ],
                    ),
                  ],
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    alignment: WrapAlignment.center,
                    children: [
                      if (verified)
                        _Pill(
                          icon: Icons.verified,
                          label: 'Verified',
                          fill: palette.successFill,
                          ink: palette.successText,
                        ),
                      _Pill(
                        icon: Icons.storefront_outlined,
                        label:
                            '$listingCount ${listingCount == 1 ? 'Listing' : 'Listings'}',
                        fill: palette.infoFill,
                        ink: palette.infoText,
                      ),
                    ],
                  ),
                  if (location != null && location!.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.place_outlined,
                            size: 16, color: palette.textMuted),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(location!,
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: palette.textSecondary)),
                        ),
                      ],
                    ),
                  ],
                ]),
              ),
              Divider(height: 1, color: palette.border),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 16),
                child: Column(children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Member Since',
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: palette.textSecondary)),
                      Text(memberSince,
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: palette.textPrimary)),
                    ],
                  ),
                  if (hasRating) ...[
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Success Rating',
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: palette.textSecondary)),
                        Row(children: [
                          _Stars(rating: averageRating, size: 14),
                          const SizedBox(width: 5),
                          Text(averageRating.toStringAsFixed(1),
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  color: palette.textPrimary)),
                          const SizedBox(width: 4),
                          Text('($totalReviews)',
                              style: TextStyle(
                                  fontSize: 12, color: palette.textMuted)),
                        ]),
                      ],
                    ),
                  ],
                ]),
              ),
            ],
          ),
          Positioned(
            top: 8,
            right: 8,
            child: IconButton(
              tooltip: 'Share profile',
              onPressed: onShare,
              style: IconButton.styleFrom(
                  foregroundColor: palette.textSecondary),
              icon: const Icon(Icons.share_outlined, size: 21),
            ),
          ),
        ]),
      ),
    ]);
  }
}

/// The big profile photo with its white ring, soft brand glow and the
/// verified seal (web seller page avatar).
class _Avatar extends StatelessWidget {
  const _Avatar(
      {required this.imageUrl, required this.initials, required this.verified});
  final String? imageUrl;
  final String initials;
  final bool verified;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Stack(clipBehavior: Clip.none, children: [
      // A-19: tapping the seller photo opens the fullscreen preview.
      GestureDetector(
        onTap: imageUrl != null
            ? () => showFullscreenImagePreview(context, urls: [imageUrl!])
            : null,
        child: Container(
          width: 104,
          height: 104,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: palette.surface, width: 4),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.brandBlue, Color(0xFF60A5FA)],
            ),
            boxShadow: [
              BoxShadow(
                  color: AppColors.brandBlue.withValues(alpha: 0.18),
                  blurRadius: 28,
                  spreadRadius: 6),
              const BoxShadow(
                  color: Color(0x26000000),
                  blurRadius: 12,
                  offset: Offset(0, 5)),
            ],
          ),
          // Clip the photo itself: the ring is drawn inside the circle, so
          // a clip on the outer edge left the square photo's sides showing.
          child: imageUrl != null
              ? ClipOval(child: AppImage(imageUrl!, fit: BoxFit.cover))
              : Center(
                  child: Text(initials,
                      style: const TextStyle(
                          fontSize: 34,
                          color: BrandStage.ink,
                          fontWeight: FontWeight.w700)),
                ),
        ),
      ),
      if (verified)
        Positioned(
          right: 0,
          bottom: 2,
          child: Tooltip(
            message: 'Verified Seller',
            child: Container(
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981),
                shape: BoxShape.circle,
                border: Border.all(color: palette.surface, width: 3),
                boxShadow: const [
                  BoxShadow(
                      color: Color(0x33000000),
                      blurRadius: 6,
                      offset: Offset(0, 2)),
                ],
              ),
              child: const Icon(Icons.verified,
                  size: 17, color: BrandStage.ink),
            ),
          ),
        ),
    ]);
  }
}

class _Pill extends StatelessWidget {
  const _Pill(
      {required this.icon,
      required this.label,
      required this.fill,
      required this.ink});
  final IconData icon;
  final String label;
  final Color fill;
  final Color ink;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: ink),
        const SizedBox(width: 5),
        Text(label,
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w700, color: ink)),
      ]),
    );
  }
}

/// Five stars, filled to the rating (web `RatingStars`).
class _Stars extends StatelessWidget {
  const _Stars({required this.rating, required this.size});
  final double rating;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      for (var i = 1; i <= 5; i++)
        Icon(
          rating >= i
              ? Icons.star_rounded
              : rating >= i - 0.5
                  ? Icons.star_half_rounded
                  : Icons.star_outline_rounded,
          size: size,
          color: const Color(0xFFF59E0B),
        ),
    ]);
  }
}

// ---------------------------------------------------------------------------
// About + Reviews (web accordion card)
// ---------------------------------------------------------------------------

class _AboutAndReviewsCard extends StatelessWidget {
  const _AboutAndReviewsCard({
    required this.displayName,
    required this.aboutMe,
    required this.verified,
    required this.totalReviews,
    required this.loadingRatings,
    required this.ratings,
  });
  final String displayName;
  final String aboutMe;
  final bool verified;
  final int totalReviews;
  final bool loadingRatings;
  final List<Map<String, dynamic>> ratings;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // About
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            child: Row(children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppPalette.of(context).infoFill,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.person_outline,
                    size: 18, color: AppPalette.of(context).accentInk),
              ),
              const SizedBox(width: 10),
              const Text('About the seller',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Text(
              aboutMe.isEmpty
                  ? 'This seller hasn\'t shared a bio yet.'
                  : aboutMe,
              style: TextStyle(
                  fontSize: 14,
                  height: 1.5,
                  color: aboutMe.isEmpty ? AppPalette.of(context).textSecondary : null),
            ),
          ),
          const Divider(height: 1),
          // Reviews
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Row(children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppPalette.of(context).warningFill,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.star_outline,
                    size: 18, color: Color(0xFFD97706)),
              ),
              const SizedBox(width: 10),
              const Text('Reviews',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
                decoration: BoxDecoration(
                  color: AppPalette.of(context).surfaceMuted,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('$totalReviews',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700)),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: _reviewList(),
          ),
        ],
      ),
    );
  }

  Widget _reviewList() {
    if (loadingRatings) {
      return const Padding(
        padding: EdgeInsets.all(8),
        child: Center(
            child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2))),
      );
    }
    if (ratings.isEmpty) {
      return Text(
          'Reviews will appear here after completed transactions.',
          style: TextStyle(fontSize: 13, color: AppColors.textSecondary));
    }
    return Column(
      children: [
        for (final r in ratings) _ReviewCard(rating: r),
      ],
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.rating});
  final Map<String, dynamic> rating;

  String _authorName() {
    final author = rating['author'];
    if (author is Map) {
      final first = (author['firstName'] ?? '').toString().trim();
      final last = (author['lastName'] ?? '').toString().trim();
      final joined = '$first $last'.trim();
      if (joined.isNotEmpty) return joined;
    }
    return (rating['authorName'] ?? '').toString().trim();
  }

  double get _stars =>
      ((rating['stars'] ?? rating['rating']) as num?)?.toDouble() ?? 0;

  String? get _text {
    final t = (rating['reviewText'] ?? '').toString().trim();
    return t.isEmpty ? null : t;
  }

  String? get _date {
    final raw = rating['createdAt'];
    if (raw == null) return null;
    DateTime? parsed;
    if (raw is List && raw.length >= 3) {
      parsed = DateTime.tryParse(
          '${raw[0]}-${raw[1].toString().padLeft(2, '0')}-${raw[2].toString().padLeft(2, '0')}');
    } else {
      parsed = DateTime.tryParse(raw.toString());
    }
    if (parsed == null) return null;
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return '${parsed.day} ${months[parsed.month - 1]} ${parsed.year}';
  }

  @override
  Widget build(BuildContext context) {
    final full = _authorName();
    final masked = publicSellerName(full, fallback: 'Anonymous');
    final firstInitial = masked
        .split(RegExp(r'\s+'))
        .firstWhere((p) => p.isNotEmpty, orElse: () => 'U')
        .characters
        .first
        .toUpperCase();
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            CircleAvatar(
              radius: 12,
              backgroundColor: AppColors.brandBlue,
              child: Text(firstInitial,
                  style: const TextStyle(
                      fontSize: 10,
                      color: Colors.white,
                      fontWeight: FontWeight.w800)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(masked,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600)),
            ),
            const Icon(Icons.star, size: 14, color: Colors.amber),
            const SizedBox(width: 3),
            Text(_stars.toStringAsFixed(1),
                style: const TextStyle(fontSize: 13)),
          ]),
          if (_text != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(_text!,
                  style: TextStyle(
                      fontSize: 13,
                      color: AppPalette.of(context).textSecondary,
                      height: 1.4)),
            ),
          if (_date != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(_date!,
                  style: TextStyle(
                      fontSize: 11, color: AppPalette.of(context).textSecondary)),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Showcase controls
// ---------------------------------------------------------------------------

class _ShowcaseControls extends StatelessWidget {
  const _ShowcaseControls({
    required this.searchController,
    required this.onSearchChanged,
    required this.categories,
    required this.selectedCategory,
    required this.onCategoryChanged,
    required this.subcategories,
    required this.selectedSubcategory,
    required this.onSubcategoryChanged,
    required this.sort,
    required this.onSortChanged,
    required this.hasActiveFilters,
    required this.onClear,
  });
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final List<String> categories;
  final String? selectedCategory;
  final ValueChanged<String?> onCategoryChanged;
  final List<String> subcategories;
  final String? selectedSubcategory;
  final ValueChanged<String?> onSubcategoryChanged;
  final _ShowcaseSort sort;
  final ValueChanged<_ShowcaseSort> onSortChanged;
  final bool hasActiveFilters;
  final VoidCallback onClear;

  static const _sortLabels = {
    _ShowcaseSort.relevance: 'Relevance',
    _ShowcaseSort.priceAsc: 'Price: Low to High',
    _ShowcaseSort.priceDesc: 'Price: High to Low',
    _ShowcaseSort.newest: 'Newest',
    _ShowcaseSort.ratingDesc: 'Highest Rating',
    _ShowcaseSort.trending: 'Trending',
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            key: const ValueKey('seller-showcase-search'),
            controller: searchController,
            onChanged: onSearchChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: "Search this seller's products",
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () {
                        searchController.clear();
                        onSearchChanged('');
                      },
                    )
                  : null,
              isDense: true,
              filled: true,
              fillColor: AppPalette.of(context).background,
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: AppPalette.of(context).border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: AppPalette.of(context).border),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _FilterDropdown<String>(
                  key: const ValueKey('showcase-category-filter'),
                  value: selectedCategory,
                  hint: 'All categories',
                  placeholder: 'All categories',
                  options: categories,
                  onChanged: onCategoryChanged,
                ),
              ),
              if (selectedCategory != null && subcategories.isNotEmpty) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: _FilterDropdown<String>(
                    key: const ValueKey('showcase-subcategory-filter'),
                    value: selectedSubcategory,
                    hint: 'All subcategories',
                    placeholder: 'All subcategories',
                    options: subcategories,
                    onChanged: onSubcategoryChanged,
                  ),
                ),
              ],
              const SizedBox(width: 8),
              PopupMenuButton<_ShowcaseSort>(
                initialValue: sort,
                tooltip: 'Sort seller products',
                onSelected: onSortChanged,
                itemBuilder: (_) => [
                  for (final s in _ShowcaseSort.values)
                    PopupMenuItem(value: s, child: Text(_sortLabels[s]!)),
                ],
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppPalette.of(context).border),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.sort,
                        size: 18, color: AppPalette.of(context).textSecondary),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(_sortLabels[sort]!,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12)),
                    ),
                  ]),
                ),
              ),
            ],
          ),
          if (hasActiveFilters) ...[
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onClear,
                icon: const Icon(Icons.filter_alt_off_outlined, size: 16),
                label: const Text('Clear search and filters'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _FilterDropdown<T> extends StatelessWidget {
  const _FilterDropdown({
    super.key,
    required this.value,
    required this.hint,
    required this.placeholder,
    required this.options,
    required this.onChanged,
  });
  final T? value;
  final String hint;
  final String placeholder;
  final List<String> options;
  final ValueChanged<T?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<T?>(
      value: value,
      isExpanded: true,
      decoration: InputDecoration(
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        hintText: hint,
        filled: true,
        fillColor: AppPalette.of(context).surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppPalette.of(context).border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppPalette.of(context).border),
        ),
      ),
      items: [
        DropdownMenuItem<T?>(value: null, child: Text(placeholder)),
        for (final o in options)
          DropdownMenuItem<T?>(
              value: o as T?, child: Text(o, overflow: TextOverflow.ellipsis)),
      ],
      onChanged: (v) => onChanged(v),
    );
  }
}

class _ListingGrid extends StatelessWidget {
  const _ListingGrid({required this.products, required this.onOpen});
  final List<Product> products;
  final ValueChanged<Product> onOpen;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: products.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 0.72),
      itemBuilder: (context, i) {
        final p = products[i];
        return InkWell(
          onTap: () => onOpen(p),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            decoration: BoxDecoration(
                color: AppPalette.of(context).surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppPalette.of(context).border)),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Stack(fit: StackFit.expand, children: [
                    p.primaryImageUrl != null
                        ? AppImage(
                            AppConfig.resolveAssetUrl(p.primaryImageUrl!),
                            fit: BoxFit.cover)
                        : Container(
                            color: AppPalette.of(context).border,
                            child: const Icon(Icons.image_outlined)),
                    // The marketplace card's badge and heart.
                    if (p.isHalal)
                      const Positioned(
                          left: 6, top: 6, child: HalalBadge(size: 28)),
                    Positioned(
                      right: 6,
                      top: 6,
                      child: ProductSaveButton(product: p, compact: true),
                    ),
                  ]),
                ),
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                          Product.formatPrice(
                              p.productAskingPrice, p.productCurrency),
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: AppColors.price,
                              fontSize: 13)),
                      Text(p.productName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
