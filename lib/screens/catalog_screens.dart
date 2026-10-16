import 'dart:math' as math;
import 'dart:async';

import 'dart:math';

import 'package:flutter/material.dart';

import '../services/matomo_tracker.dart';

import '../api/api_client.dart';
import '../domain/marketplace_taxonomy.dart';
import '../domain/rentals.dart' show rentalDateToJson, shortStaySubcategorySlug;
import '../domain/stay_listing.dart';
import '../models/category.dart';
import '../models/product.dart';
import '../theme.dart';
import '../widgets/account_ui.dart' show PillTab, PillTabs;
import '../widgets/marketplace_taxonomy_strips.dart';
import '../widgets/product_grid.dart';
import '../widgets/stay_dates_scope.dart';
import '../widgets/error_text.dart';
import '../widgets/skeleton_loader.dart';
import '../config.dart';

/// Client-side sort options over the accumulated pages (web parity:
/// lib/marketplace-sort.ts). The server only seeds SHUFFLE; these re-sort the
/// already-loaded list without refetching.
enum ProductSort {
  relevance('Relevance'),
  priceAsc('Price: Low to High'),
  priceDesc('Price: High to Low'),
  newest('Newest'),
  rating('Highest Rating'),
  trending('Trending');

  const ProductSort(this.label);
  final String label;

  /// Web `MARKETPLACE_SORT_OPTIONS` values, as links carry them.
  static ProductSort fromParam(String? value) =>
      switch ((value ?? '').trim().toLowerCase()) {
        'price-asc' => ProductSort.priceAsc,
        'price-desc' => ProductSort.priceDesc,
        'date-desc' || 'newest' => ProductSort.newest,
        'rating-desc' || 'rating' => ProductSort.rating,
        'trending' => ProductSort.trending,
        _ => ProductSort.relevance,
      };
}

List<Product> sortProducts(List<Product> products, ProductSort sort) {
  final list = [...products];
  switch (sort) {
    case ProductSort.priceAsc:
      list.sort((a, b) => a.productAskingPrice.compareTo(b.productAskingPrice));
    case ProductSort.priceDesc:
      list.sort((a, b) => b.productAskingPrice.compareTo(a.productAskingPrice));
    case ProductSort.rating:
      list.sort((a, b) => b.averageRating.compareTo(a.averageRating));
    // Web parity: trending orders by view count descending (reference
    // browse/page.tsx `case 'trending'` sorts by `views ?? 0`; the filter
    // endpoint exposes that counter as clickCount).
    case ProductSort.trending:
      list.sort((a, b) => b.clickCount.compareTo(a.clickCount));
    // Web `date-desc`: the marketplace stream arrives shuffled, so "Newest"
    // has to put the loaded listings in order itself.
    case ProductSort.newest:
      list.sort(Product.newestFirst);
    case ProductSort.relevance:
      break; // keep the server's (seeded) order
  }
  return list;
}

/// Active browse filters, mirroring the reference FilterState
/// (FE_BUYER_FLOW §1): price range, condition, neighbourhood, subcategories,
/// product source. SHUFFLE seed is regenerated per load (team convention).
class BrowseFilter {
  BrowseFilter({
    this.minPrice,
    this.maxPrice,
    this.condition,
    this.neighbourhood = '',
    this.productSource = '',
    this.subcategoryIds = const [],
    this.stayDates = StayDates.none,
    String? seed,
  }) : seed = seed ?? Random().nextInt(1 << 31).toString();

  /// Short Stays check-in / checkout (web 2026-10). Only sent while the
  /// short-stays subcategory is selected.
  StayDates stayDates;

  double? minPrice;
  double? maxPrice;
  String? condition;
  String neighbourhood;
  String productSource;
  List<int> subcategoryIds;
  String seed;

  bool get isEmpty =>
      minPrice == null &&
      maxPrice == null &&
      (condition == null || condition!.isEmpty) &&
      neighbourhood.trim().isEmpty &&
      productSource.trim().isEmpty &&
      subcategoryIds.isEmpty &&
      !stayDates.isSet;

  /// True when any criteria that bypass SHUFFLE randomization are set.
  bool get constrainsResults =>
      minPrice != null ||
      maxPrice != null ||
      (condition?.isNotEmpty ?? false) ||
      neighbourhood.trim().isNotEmpty ||
      productSource.trim().isNotEmpty ||
      stayDates.isSet;

  int get activeCount =>
      (minPrice != null ? 1 : 0) +
      (maxPrice != null ? 1 : 0) +
      ((condition?.isNotEmpty ?? false) ? 1 : 0) +
      (neighbourhood.trim().isNotEmpty ? 1 : 0) +
      (productSource.trim().isNotEmpty ? 1 : 0) +
      subcategoryIds.length +
      (stayDates.isSet ? 1 : 0);

  /// New SHUFFLE seed per application so a re-filter reshuffles like the web.
  void reshuffle() => seed = Random().nextInt(1 << 31).toString();

  /// A copy carrying one changed field.
  ///
  /// Every filter change has to produce a NEW instance: the results list
  /// reloads from `didUpdateWidget`, which compares the filter it was given
  /// against the previous one. Mutating the live filter in place left both
  /// sides of that comparison pointing at the same object, so the taxonomy
  /// rail highlighted the tapped subcategory while the products below it
  /// never reloaded.
  BrowseFilter copyWith({List<int>? subcategoryIds}) => BrowseFilter(
        minPrice: minPrice,
        maxPrice: maxPrice,
        condition: condition,
        neighbourhood: neighbourhood,
        productSource: productSource,
        subcategoryIds: subcategoryIds ?? this.subcategoryIds,
        stayDates: stayDates,
      );
}

/// Whether [subcategoryIds] select Short Stays (by its slug, never an id —
/// web `isShortStays`).
bool selectsShortStays(List<Category> categories, List<int> subcategoryIds) =>
    // Without the backend's date filter the results would ignore the dates.
    AppConfig.propertyRentals &&
    categories.any((c) => c.subcategories.any((s) =>
        s.slug == shortStaySubcategorySlug &&
        subcategoryIds.contains(s.subcategoryId)));

/// Marketplace / Browse: all products with a search entry point and the
/// filter sheet (price / condition / neighbourhood / source / subcategories).
class BrowseScreen extends StatefulWidget {
  final ApiClient? api;
  final List<int> initialSubcategoryIds;

  /// `/browse?q=` — the header search submits here (web parity
  /// `search-bar.tsx`), so the screen opens with the panel already showing
  /// the term it is filtering by.
  final String initialQuery;

  /// `/browse?category=` — the subcategory's PARENT, so the taxonomy rail
  /// shows where the visitor landed instead of sitting on "All categories"
  /// over a filtered list. Web parity `buildQuickSubcategoryBrowseHref`,
  /// which carries both halves of the path.
  final int? initialCategoryId;

  /// `/browse?sort=` — the order a link asked for.
  final ProductSort initialSort;

  /// `/browse?source=community|shops` (web `parseProductSource`).
  final String initialSource;
  const BrowseScreen(
      {super.key,
      this.api,
      this.initialSubcategoryIds = const [],
      this.initialQuery = '',
      this.initialCategoryId,
      this.initialSort = ProductSort.relevance,
      this.initialSource = ''});

  @override
  State<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends State<BrowseScreen> {
  late final ApiClient _a = widget.api ?? ApiClient();
  late int? _categoryId = widget.initialCategoryId;
  List<Category> _categories = const [];
  late ProductSort _sort = widget.initialSort;
  bool _showSold = false;
  // Browse opens in list view (reference 'grid' | 'list' toggle); the grid is
  // one tap away on the view-mode button.
  bool _listMode = true;
  late bool _searchOpen = widget.initialQuery.trim().isNotEmpty;

  /// What the list is actually filtered by. Distinct from [_searchField],
  /// which is what the user has typed so far — otherwise every keystroke
  /// would fire a page request.
  late String _query = widget.initialQuery.trim();
  late final TextEditingController _searchField =
      TextEditingController(text: widget.initialQuery.trim());
  late BrowseFilter _filter = BrowseFilter(
      subcategoryIds: widget.initialSubcategoryIds,
      productSource: switch (widget.initialSource.trim().toLowerCase()) {
        'community' => 'COMMUNITY',
        'shops' => 'SHOPS',
        _ => '',
      });

  /// The category the rails show. A "Shop by Preference" tile links only to
  /// its subcategories (`?subcategory=41,52`), so without this the
  /// subcategory rail — which needs a category — never appeared and the
  /// tile's picks were invisible. The category is only DISPLAYED: the query
  /// stays on the subcategories, which may span more than one category.
  int? get _railCategoryId {
    if (_categoryId != null) return _categoryId;
    final subs = _filter.subcategoryIds;
    if (subs.isEmpty) return null;
    for (final c in _categories) {
      if (c.subcategories.any((s) => subs.contains(s.subcategoryId))) {
        return c.categoryId;
      }
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _loadTaxonomy();
  }

  /// The taxonomy rails, narrowed to what is actually in stock (web parity
  /// app/browse/page.tsx:969 `loadTaxonomyAvailability`).
  ///
  /// The availability calls are best-effort: if they fail, the rails fall
  /// back to the full tree rather than emptying out, because a rail with no
  /// categories is a dead end while a rail with a few empty subcategories is
  /// merely untidy.
  Future<void> _loadTaxonomy() async {
    try {
      final categories = await _a.fetchCategories();
      if (!mounted) return;
      setState(() => _categories = categories);
      final availability = await Future.wait([
        _a.fetchCategoryAvailability(),
        _a.fetchSubcategoryAvailability(),
      ]);
      if (!mounted) return;
      setState(() => _categories = selectAvailableCategories(
          categories, availability[0], availability[1]));
    } catch (_) {
      // Taxonomy is decorative here — browse still lists every product.
    }
  }

  @override
  void dispose() {
    _searchField.dispose();
    super.dispose();
  }

  void _applySearch(String raw) {
    final next = raw.trim();
    if (next == _query) return;
    setState(() => _query = next);
  }

  void _pick(int? id) => setState(() {
        _categoryId = id;
        _filter = BrowseFilter(); // category change resets filters (reference)
      });

  Future<void> _openFilterSheet() async {
    final category = _FilterCategory(_railCategoryId);
    final draft = BrowseFilter(
      minPrice: _filter.minPrice,
      maxPrice: _filter.maxPrice,
      condition: _filter.condition,
      neighbourhood: _filter.neighbourhood,
      productSource: _filter.productSource,
      subcategoryIds: [..._filter.subcategoryIds],
      stayDates: _filter.stayDates,
      seed: _filter.seed,
    );
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      backgroundColor: AppPalette.of(context).surface,
      builder: (_) => _FilterSheet(
          api: _a, filter: draft, categories: _categories, category: category),
    );
    if (changed == true) {
      setState(() {
        _categoryId = category.id;
        _filter = draft..reshuffle();
      });
    }
  }

  void _pickSort(ProductSort? s) {
    if (s != null) setState(() => _sort = s);
  }

  void _selectSubcategory(int? id) => setState(() {
        // "All items" while the category was only inferred from the
        // subcategories: stay in that category rather than falling out of it.
        if (id == null && _categoryId == null) _categoryId = _railCategoryId;
        // A fresh instance, not a mutation — see BrowseFilter.copyWith. The
        // constructor also seeds a new shuffle, matching the filter sheet.
        _filter = _filter.copyWith(subcategoryIds: id == null ? <int>[] : [id]);
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          // Web parity /browse: a centred pill of circular controls rather
          // than a persistent search field — search is one of the controls and
          // expands a panel underneath.
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 10, 8, 10),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 356),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppPalette.of(context).surface,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.fromBorderSide(
                        BorderSide(color: AppPalette.of(context).border)),
                    boxShadow: const [
                      BoxShadow(
                          color: Color(0x0F0F172A),
                          blurRadius: 3,
                          offset: Offset(0, 1)),
                    ],
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _BrowseControlButton(
                        icon: Icons.search,
                        tooltip: 'Search products',
                        active: _searchOpen || _query.isNotEmpty,
                        dot: _query.isNotEmpty,
                        onPressed: () =>
                            setState(() => _searchOpen = !_searchOpen),
                      ),
                      const SizedBox(width: 8),
                      _BrowseControlButton(
                        icon: Icons.tune,
                        tooltip: 'Open filters',
                        active: _filter.activeCount > 0 || _categoryId != null,
                        dot: _filter.activeCount > 0 || _categoryId != null,
                        onPressed: _openFilterSheet,
                      ),
                      const SizedBox(width: 8),
                      _BrowseSortButton(
                        sort: _sort,
                        onSelected: _pickSort,
                      ),
                      const SizedBox(width: 8),
                      // The web keeps its grid/list switch on desktop only;
                      // the app opens in list and keeps the switch reachable.
                      _BrowseControlButton(
                        icon: _listMode
                            ? Icons.grid_view_rounded
                            : Icons.view_list_rounded,
                        tooltip: _listMode ? 'Grid view' : 'List view',
                        active: false,
                        dot: false,
                        onPressed: () => setState(() => _listMode = !_listMode),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (_searchOpen)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 10),
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.fromBorderSide(
                      BorderSide(color: AppPalette.of(context).border)),
                ),
                child: TextField(
                  controller: _searchField,
                  autofocus: true,
                  textInputAction: TextInputAction.search,
                  // Only repaints the clear button; the fetch waits for
                  // submit.
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Search products...',
                    isDense: true,
                    contentPadding:
                        const EdgeInsets.symmetric(vertical: 13, horizontal: 8),
                    prefixIcon: Icon(Icons.search,
                        size: 18, color: AppPalette.of(context).textMuted),
                    suffixIcon: _searchField.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear search',
                            icon: const Icon(Icons.close, size: 18),
                            onPressed: () {
                              _searchField.clear();
                              _applySearch('');
                            },
                          ),
                    filled: true,
                    fillColor: AppPalette.of(context).surfaceMuted,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide:
                            BorderSide(color: AppPalette.of(context).border)),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide:
                            BorderSide(color: AppPalette.of(context).border)),
                  ),
                  // Filters the marketplace in place. It used to push a
                  // separate SearchScreen on top, which left the browse list
                  // showing an "active search" dot over unfiltered results.
                  onSubmitted: _applySearch,
                ),
              ),
            ),
          MarketplaceTaxonomyStrips(
            categories: _categories,
            selectedCategoryId: _railCategoryId,
            selectedSubcategoryIds: _filter.subcategoryIds,
            onSelectCategory: _pick,
            onSelectSubcategory: _selectSubcategory,
          ),
          const SizedBox(height: 4),
          Expanded(
            child: StayDatesScope(
              dates: selectsShortStays(_categories, _filter.subcategoryIds)
                  ? _filter.stayDates
                  : StayDates.none,
              child: _PagedList(
                api: _a,
                categoryId: _categoryId,
                searchTerm: _query.isEmpty ? null : _query,
                filter: _filter,
                showSold: _showSold,
                sort: _sort,
                listMode: _listMode,
                onToggleShowSold: (v) => setState(() => _showSold = v),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Web parity /browse: one of the circular controls in the centred pill.
/// 44px, slate-50 on a slate-200 hairline, flipping to a blue tint while its
/// control is doing something, with a 6px dot for "this is not the default".
class _BrowseControlButton extends StatelessWidget {
  const _BrowseControlButton({
    required this.icon,
    required this.tooltip,
    required this.active,
    required this.dot,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final bool active;
  final bool dot;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Stack(clipBehavior: Clip.none, children: [
        Material(
          color: active ? AppPalette.of(context).infoFill : AppPalette.of(context).surfaceMuted,
          shape: CircleBorder(
            side: BorderSide(
                color: active
                    ? AppPalette.of(context).infoBorder
                    : AppPalette.of(context).border),
          ),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onPressed,
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(icon,
                  size: 18,
                  color: active
                      ? AppPalette.of(context).infoText
                      : AppPalette.of(context).textPrimary),
            ),
          ),
        ),
        if (dot)
          const Positioned(
            right: 6,
            top: 6,
            child: SizedBox(
              width: 6,
              height: 6,
              child: DecoratedBox(
                decoration: BoxDecoration(
                    color: Color(0xFF2563EB), shape: BoxShape.circle),
              ),
            ),
          ),
      ]),
    );
  }
}

/// The sort control: same circular shell, but it opens the sort menu and turns
/// blue whenever the order is anything other than relevance.
class _BrowseSortButton extends StatelessWidget {
  const _BrowseSortButton({required this.sort, required this.onSelected});

  final ProductSort sort;
  final ValueChanged<ProductSort?> onSelected;

  @override
  Widget build(BuildContext context) {
    final active = sort != ProductSort.relevance;
    return Material(
      color: active ? AppPalette.of(context).infoFill : AppPalette.of(context).surfaceMuted,
      shape: CircleBorder(
        side: BorderSide(
            color: active ? AppPalette.of(context).infoBorder : AppPalette.of(context).border),
      ),
      child: PopupMenuButton<ProductSort>(
        tooltip: 'Sort products by ${sort.label}',
        initialValue: sort,
        onSelected: onSelected,
        position: PopupMenuPosition.under,
        constraints: const BoxConstraints(minWidth: 210),
        itemBuilder: (_) => ProductSort.values
            .map((s) => PopupMenuItem(value: s, child: Text(s.label)))
            .toList(),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(Icons.swap_vert_rounded,
              size: 18,
              color:
                  active ? AppPalette.of(context).infoText : AppPalette.of(context).textPrimary),
        ),
      ),
    );
  }
}

/// Bottom sheet exposing the extended filter criteria wired to
/// `fetchFiltered` params (AU-049). Neighbourhood options come from
/// `GET /displayItem/neighbourhoods`.
/// The category the filter sheet picked, handed back to the screen.
class _FilterCategory {
  _FilterCategory(this.id);
  int? id;
}

/// Web parity `FilterContentEl` (app/browse/page.tsx): product source, then
/// category and its subcategories (several at once — a "Shop by Preference"
/// tile arrives with more than one), price, condition and neighbourhood.
/// Everything is a draft until Apply.
class _FilterSheet extends StatefulWidget {
  const _FilterSheet({
    required this.api,
    required this.filter,
    required this.categories,
    required this.category,
  });
  final ApiClient api;
  final BrowseFilter filter;
  final List<Category> categories;
  final _FilterCategory category;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late double? _min = widget.filter.minPrice;
  late double? _max = widget.filter.maxPrice;
  late String? _condition = widget.filter.condition;
  late String _neighbourhood = widget.filter.neighbourhood;
  late String _source = widget.filter.productSource;
  late int? _categoryId = widget.category.id;
  late List<int> _subIds = [...widget.filter.subcategoryIds];
  late StayDates _stayDates = widget.filter.stayDates;
  String? _stayError;
  List<String> _neighbourhoods = const [];
  bool _loadingNeighbourhoods = true;
  late final _minCtrl = TextEditingController(
      text: widget.filter.minPrice?.toInt().toString() ?? '');
  late final _maxCtrl = TextEditingController(
      text: widget.filter.maxPrice?.toInt().toString() ?? '');

  static const _conditions = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'];

  @override
  void initState() {
    super.initState();
    widget.api.fetchNeighbourhoods().then((n) {
      if (mounted) {
        setState(() {
          _neighbourhoods = n;
          _loadingNeighbourhoods = false;
        });
      }
    }).catchError((_) {
      if (mounted) setState(() => _loadingNeighbourhoods = false);
    });
  }

  @override
  void dispose() {
    _minCtrl.dispose();
    _maxCtrl.dispose();
    super.dispose();
  }

  List<Subcategory> get _subs {
    for (final c in widget.categories) {
      if (c.categoryId == _categoryId) return c.subcategories;
    }
    return const [];
  }

  void _clearAll() => setState(() {
        _min = null;
        _max = null;
        _minCtrl.clear();
        _maxCtrl.clear();
        _condition = null;
        _neighbourhood = '';
        _source = '';
        _categoryId = null;
        _subIds = [];
        _stayDates = StayDates.none;
        _stayError = null;
      });

  bool get _isShortStays => selectsShortStays(widget.categories, _subIds);

  static const _shortMonths = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  String _dayLabel(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? iso : '${d.day} ${_shortMonths[d.month - 1]} ${d.year}';
  }

  /// Web StaySearchControls: both dates or neither, checkout exclusive.
  Future<void> _pickStayDate({required bool checkIn}) async {
    final today = DateTime.parse(staySearchToday());
    final current = DateTime.tryParse(
        checkIn ? _stayDates.startDate : _stayDates.endDate);
    final first = checkIn
        ? today
        : (DateTime.tryParse(_stayDates.startDate)
                ?.add(const Duration(days: 1)) ??
            today.add(const Duration(days: 1)));
    final picked = await showDatePicker(
      context: context,
      firstDate: first,
      lastDate: today.add(const Duration(days: 730)),
      initialDate: current != null && !current.isBefore(first) ? current : first,
      helpText: checkIn ? 'Check-in' : 'Checkout',
    );
    if (picked == null || !mounted) return;
    final iso = rentalDateToJson(picked);
    setState(() {
      var next = checkIn
          ? StayDates(startDate: iso, endDate: _stayDates.endDate)
          : StayDates(startDate: _stayDates.startDate, endDate: iso);
      // A new check-in on or after the checkout drops the checkout.
      if (checkIn &&
          next.endDate.isNotEmpty &&
          next.endDate.compareTo(next.startDate) <= 0) {
        next = StayDates(startDate: iso);
      }
      _stayDates = next;
      _stayError = next.endDate.isEmpty ? null : validateStayDates(next);
    });
  }

  int get _activeCount =>
      (_source.isNotEmpty ? 1 : 0) +
      (_categoryId != null ? 1 : 0) +
      _subIds.length +
      (_min != null || _max != null ? 1 : 0) +
      (_condition != null ? 1 : 0) +
      (_neighbourhood.isNotEmpty ? 1 : 0) +
      (_isShortStays && _stayDates.isSet ? 1 : 0);

  Widget _heading(String text, {String? hint}) {
    final palette = AppPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 8),
      child: Row(children: [
        Text(text,
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: palette.textPrimary)),
        if (hint != null) ...[
          const SizedBox(width: 6),
          Flexible(
            child: Text(hint,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: palette.textSecondary)),
          ),
        ],
      ]),
    );
  }

  Widget _chip(String label, bool selected, ValueChanged<bool> onSelected,
      {Key? key, bool multi = false}) {
    final palette = AppPalette.of(context);
    return FilterChip(
      key: key,
      label: Text(label),
      selected: selected,
      showCheckmark: multi,
      onSelected: onSelected,
      labelStyle: TextStyle(
          fontSize: 13,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected ? palette.accentInk : palette.textPrimary),
      backgroundColor: palette.surfaceMuted,
      selectedColor: palette.infoFill,
      checkmarkColor: palette.accentInk,
      side: BorderSide(color: selected ? palette.infoBorder : palette.border),
      shape: const StadiumBorder(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final subs = _subs;
    // Selected subcategories that belong to no single chosen category (a
    // preference tile spanning two) still show, so they can be removed.
    final strays = _categoryId == null
        ? [
            for (final c in widget.categories)
              for (final s in c.subcategories)
                if (_subIds.contains(s.subcategoryId)) s
          ]
        : const <Subcategory>[];
    final bottom = math.max(MediaQuery.of(context).viewInsets.bottom,
        MediaQuery.of(context).viewPadding.bottom);
    return ConstrainedBox(
      constraints:
          BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 8, 4),
          child: Row(children: [
            Icon(Icons.tune_rounded, color: palette.accentInk),
            const SizedBox(width: 8),
            Expanded(
                child: Text('Filters',
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: palette.textPrimary))),
            TextButton(
              key: const ValueKey('filter-clear-all'),
              onPressed: _activeCount == 0 ? null : _clearAll,
              child: const Text('Clear all'),
            ),
          ]),
        ),
        Divider(height: 1, color: palette.border),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _heading('Product source'),
                PillTabs<String>(
                  key: const ValueKey('filter-source'),
                  tabs: const [
                    PillTab('', 'All'),
                    PillTab('COMMUNITY', 'Community'),
                    PillTab('SHOPS', 'Shops'),
                  ],
                  selected: _source,
                  onChanged: (v) => setState(() => _source = v),
                ),
                _heading('Category'),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  _chip('All categories', _categoryId == null, (_) {
                    setState(() {
                      _categoryId = null;
                      _subIds = [];
                    });
                  }),
                  for (final c in widget.categories)
                    _chip(c.categoryName, _categoryId == c.categoryId, (_) {
                      setState(() {
                        if (_categoryId == c.categoryId) return;
                        _categoryId = c.categoryId;
                        // Subcategories belong to their category.
                        _subIds = [
                          for (final id in _subIds)
                            if (c.subcategories
                                .any((s) => s.subcategoryId == id))
                              id
                        ];
                      });
                    }, key: ValueKey('filter-category-${c.categoryId}')),
                ]),
                if (subs.isNotEmpty || strays.isNotEmpty) ...[
                  _heading('Subcategories', hint: 'pick one or more'),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final s in [...subs, ...strays])
                      _chip(s.subcategoryName, _subIds.contains(s.subcategoryId),
                          (on) {
                        setState(() {
                          _subIds = on
                              ? [..._subIds, s.subcategoryId]
                              : [
                                  for (final id in _subIds)
                                    if (id != s.subcategoryId) id
                                ];
                        });
                      },
                          multi: true,
                          key: ValueKey('filter-subcategory-${s.subcategoryId}')),
                  ]),
                ],
                if (_isShortStays) ...[
                  _heading('Dates', hint: 'optional'),
                  Row(children: [
                    for (final checkIn in [true, false]) ...[
                      if (!checkIn) const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          key: ValueKey(
                              checkIn ? 'filter-check-in' : 'filter-checkout'),
                          onPressed: () => _pickStayDate(checkIn: checkIn),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(48),
                            alignment: Alignment.centerLeft,
                            foregroundColor: palette.textPrimary,
                            side: BorderSide(color: palette.borderStrong),
                          ),
                          icon: const Icon(Icons.event_outlined, size: 18),
                          label: Text(
                            () {
                              final v = checkIn
                                  ? _stayDates.startDate
                                  : _stayDates.endDate;
                              return v.isEmpty
                                  ? (checkIn ? 'Check-in' : 'Checkout')
                                  : _dayLabel(v);
                            }(),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                  ]),
                  if (_stayDates.startDate.isNotEmpty ||
                      _stayDates.endDate.isNotEmpty)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        key: const ValueKey('filter-clear-dates'),
                        onPressed: () => setState(() {
                          _stayDates = StayDates.none;
                          _stayError = null;
                        }),
                        icon: const Icon(Icons.close, size: 16),
                        label: const Text('Clear dates'),
                      ),
                    ),
                  if (_stayError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(_stayError!,
                          key: const ValueKey('filter-dates-error'),
                          style: TextStyle(
                              fontSize: 13, color: palette.dangerText)),
                    ),
                ],
                _heading('Price range', hint: 'TZS'),
                Row(children: [
                  Expanded(
                    child: TextField(
                      key: const ValueKey('filter-min-price'),
                      controller: _minCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                          labelText: 'Min', border: OutlineInputBorder()),
                      onChanged: (v) => setState(() =>
                          _min = double.tryParse(v.replaceAll(',', ''))),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Text('–',
                        style: TextStyle(color: palette.textSecondary)),
                  ),
                  Expanded(
                    child: TextField(
                      key: const ValueKey('filter-max-price'),
                      controller: _maxCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                          labelText: 'Max', border: OutlineInputBorder()),
                      onChanged: (v) => setState(() =>
                          _max = double.tryParse(v.replaceAll(',', ''))),
                    ),
                  ),
                ]),
                _heading('Condition'),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final c in _conditions)
                    _chip(
                        c[0] + c.substring(1).replaceAll('_', ' ').toLowerCase(),
                        _condition == c,
                        (on) => setState(() => _condition = on ? c : null)),
                ]),
                _heading('Neighbourhood'),
                DropdownButtonFormField<String>(
                  value: _neighbourhood.isEmpty ? null : _neighbourhood,
                  isExpanded: true,
                  decoration: InputDecoration(
                    hintText: 'Any neighbourhood',
                    border: const OutlineInputBorder(),
                    suffixIcon: _loadingNeighbourhoods
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: Padding(
                                padding: EdgeInsets.all(12),
                                child:
                                    CircularProgressIndicator(strokeWidth: 2)))
                        : null,
                  ),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('Any')),
                    ..._neighbourhoods
                        .map((n) => DropdownMenuItem(value: n, child: Text(n))),
                  ],
                  onChanged: (v) => setState(() => _neighbourhood = v ?? ''),
                ),
              ],
            ),
          ),
        ),
        Container(
          padding: EdgeInsets.fromLTRB(20, 12, 20, 12 + bottom),
          decoration: BoxDecoration(
            color: palette.surface,
            border: Border(top: BorderSide(color: palette.border)),
          ),
          child: Row(children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => Navigator.pop(context, false),
                style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14))),
                child: const Text('Cancel'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: FilledButton(
                key: const ValueKey('filter-apply'),
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandBlue,
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14))),
                onPressed: () {
                  // Half a date range is no search: say so, keep the sheet.
                  final dates = _isShortStays ? _stayDates : StayDates.none;
                  final dateError = validateStayDates(dates);
                  if (dateError != null) {
                    setState(() => _stayError = dateError);
                    return;
                  }
                  widget.filter
                    ..stayDates = dates
                    ..minPrice = _min
                    ..maxPrice = _max
                    ..condition = _condition
                    ..neighbourhood = _neighbourhood
                    ..productSource = _source
                    ..subcategoryIds = _subIds;
                  widget.category.id = _categoryId;
                  Navigator.pop(context, true);
                },
                child: Text(_activeCount == 0
                    ? 'Show results'
                    : 'Apply $_activeCount ${_activeCount == 1 ? 'filter' : 'filters'}',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}

/// Infinite-scrolling, category-filtered product list backed by
/// `POST /api/v1/displayItem/filter`. This endpoint is the one that actually
/// applies `categoryIds` on the backend (get-all-products ignores it), so both
/// the "All categories" feed and per-category browsing go through it. Resets to
/// page 0 when `categoryId` changes; appends the next page as the user reaches
/// the bottom, and stops once the server's `totalElements` is reached.
class _PagedList extends StatefulWidget {
  const _PagedList({
    required this.api,
    this.categoryId,
    this.searchTerm,
    required this.filter,
    required this.showSold,
    required this.sort,
    this.listMode = false,
    required this.onToggleShowSold,
  });

  final ApiClient api;
  final int? categoryId;

  /// The applied `/browse?q=` term, or null when the list is unfiltered.
  final String? searchTerm;
  final BrowseFilter filter;
  final bool showSold;
  final ProductSort sort;
  final bool listMode;
  final ValueChanged<bool> onToggleShowSold;

  @override
  State<_PagedList> createState() => _PagedListState();
}

class _PagedListState extends State<_PagedList> {
  static const _pageSize = 24;

  final ScrollController _scroll = ScrollController();
  final List<Product> _products = [];
  int _page = 0;
  int _total = 0;
  bool _initialLoading = true;
  bool _loadingMore = false;
  bool _moreFailed = false;
  Object? _error;

  /// Start fetching the next page this far before the end, so the grid
  /// keeps going without the shopper ever reaching a stop.
  static const double _prefetchExtent = 1200;

  bool get _hasMore => _products.length < _total;

  List<Product> get _visible {
    // Out-of-stock client filter targets KNOWN-zero stock only; an absent
    // quantity field must not hide the card.
    var out = widget.showSold
        ? _products
        : _products
            .where((p) => p.productQuantity == null || p.productQuantity! > 0)
            .toList();
    out = sortProducts(out, widget.sort);
    return out;
  }

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _loadInitial();
  }

  @override
  void didUpdateWidget(covariant _PagedList old) {
    super.didUpdateWidget(old);
    if (old.categoryId != widget.categoryId ||
        old.searchTerm != widget.searchTerm ||
        old.filter != widget.filter) {
      _loadInitial();
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadInitial() async {
    if (!mounted) return;
    setState(() {
      _initialLoading = true;
      _error = null;
      _page = 0;
    });
    try {
      final f = widget.filter;
      final r = await widget.api.fetchFiltered(
        categoryIds: widget.categoryId == null ? null : [widget.categoryId!],
        subcategoryIds: f.subcategoryIds,
        searchTerm: widget.searchTerm,
        neighbourhood: f.neighbourhood,
        minPrice: f.minPrice,
        maxPrice: f.maxPrice,
        conditionFilter: f.condition,
        productSource: f.productSource,
        rentalStartDate: f.stayDates.isSet ? f.stayDates.startDate : null,
        rentalEndDate: f.stayDates.isSet ? f.stayDates.endDate : null,
        priceSort: widget.searchTerm == null &&
                f.neighbourhood.trim().isEmpty &&
                f.minPrice == null &&
                f.maxPrice == null &&
                f.condition == null &&
                f.productSource.isEmpty &&
                !f.stayDates.isSet
            ? 'SHUFFLE'
            : null,
        seed: f.seed,
        page: 0,
        size: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _products
          ..clear()
          ..addAll(r.products);
        _total = r.totalElements;
        _page = 1;
        _initialLoading = false;
        _moreFailed = false;
      });
      _fillViewport();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _initialLoading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _initialLoading || !_hasMore) return;
    setState(() {
      _loadingMore = true;
      _moreFailed = false;
    });
    try {
      final f = widget.filter;
      final r = await widget.api.fetchFiltered(
        categoryIds: widget.categoryId == null ? null : [widget.categoryId!],
        subcategoryIds: f.subcategoryIds,
        searchTerm: widget.searchTerm,
        neighbourhood: f.neighbourhood,
        minPrice: f.minPrice,
        maxPrice: f.maxPrice,
        conditionFilter: f.condition,
        productSource: f.productSource,
        rentalStartDate: f.stayDates.isSet ? f.stayDates.startDate : null,
        rentalEndDate: f.stayDates.isSet ? f.stayDates.endDate : null,
        priceSort: widget.searchTerm == null &&
                f.neighbourhood.trim().isEmpty &&
                f.minPrice == null &&
                f.maxPrice == null &&
                f.condition == null &&
                f.productSource.isEmpty &&
                !f.stayDates.isSet
            ? 'SHUFFLE'
            : null,
        seed: f.seed,
        page: _page,
        size: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        final seen = _products.map((p) => p.productId).toSet();
        _products.addAll(r.products.where((p) => !seen.contains(p.productId)));
        _total = r.totalElements;
        _page += 1;
        _loadingMore = false;
      });
      _fillViewport();
    } catch (_) {
      if (!mounted) return;
      // Stop here with a Retry row rather than re-asking on every scroll.
      setState(() {
        _loadingMore = false;
        _moreFailed = true;
      });
    }
  }

  void _onScroll() {
    if (_moreFailed) return;
    if (_scroll.position.extentAfter < _prefetchExtent) _loadMore();
  }

  /// A page that does not fill the screen (sold items hidden, a tall
  /// tablet) never scrolls, so nothing would ask for the next one: check
  /// once the page has laid out.
  void _fillViewport() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients || _moreFailed) return;
      if (_scroll.position.extentAfter < _prefetchExtent) _loadMore();
    });
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _loadInitial,
      child: CustomScrollView(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: _slivers(),
      ),
    );
  }

  /// Lazily built: only the cards on screen exist, however far the shopper
  /// has scrolled.
  List<Widget> _slivers() {
    final body = _body();
    if (body != null) return [SliverToBoxAdapter(child: body)];
    final visible = _visible;
    return [
      widget.listMode
          ? SliverProductListRows(visible)
          : SliverProductGrid(visible),
      SliverToBoxAdapter(
        child: _loadingMore
            ? const Padding(
                padding: EdgeInsets.symmetric(vertical: 18),
                child: Center(
                  child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.4)),
                ),
              )
            : _moreFailed
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Center(
                      child: TextButton.icon(
                        key: const ValueKey('browse-load-more-retry'),
                        onPressed: _loadMore,
                        icon: const Icon(Icons.refresh_rounded, size: 18),
                        label: const Text("Couldn't load more. Retry"),
                      ),
                    ),
                  )
                : const SizedBox(height: 12),
      ),
    ];
  }

  /// The loading, error and empty states; null when there are products.
  Widget? _body() {
    if (_initialLoading) {
      return const SkeletonPage();
    }
    if (_error != null && _products.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(20),
        child:
            Center(child: Text('Could not load products. Please try again.')),
      );
    }
    final visible = _visible;
    if (visible.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('No products match your filters.',
                style: TextStyle(color: Colors.grey)),
            if (!widget.showSold)
              TextButton(
                onPressed: () => widget.onToggleShowSold(true),
                child: const Text('Show sold-out items'),
              ),
          ]),
        ),
      );
    }
    return null;
  }
}

/// Category listing: products within a category (paginated).
class CategoryScreen extends StatelessWidget {
  final Category category;
  final ApiClient? api;
  const CategoryScreen({super.key, required this.category, this.api});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(category.categoryName)),
      body: _PagedList(
        api: api ?? ApiClient(),
        categoryId: category.categoryId,
        filter: BrowseFilter(),
        showSold: false,
        sort: ProductSort.relevance,
        onToggleShowSold: (_) {},
      ),
    );
  }
}

/// Search: results for a query routed through `displayItem/filter`
/// (`searchTerm`) with paging — web-parity contract — plus client-side sorting.
class SearchScreen extends StatefulWidget {
  final String initialQuery;
  final ApiClient? api;
  const SearchScreen({super.key, this.initialQuery = '', this.api});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialQuery);
  final FocusNode _searchFocus = FocusNode();
  final List<Product> _results = [];
  int _page = 0;
  int _total = 0;
  bool _loading = false;
  Object? _error;
  ProductSort _sort = ProductSort.relevance;

  bool get _hasMore => _results.length < _total;

  @override
  void initState() {
    super.initState();
    _search();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _searchFocus.requestFocus();
    });
  }

  @override
  void dispose() {
    _zeroResultTimer?.cancel();
    _searchFocus.dispose();
    _controller.dispose();
    super.dispose();
  }

  Timer? _zeroResultTimer;

  Future<void> _search() async {
    _zeroResultTimer?.cancel();
    setState(() {
      _loading = true;
      _error = null;
      _page = 0;
    });
    try {
      final r = await _api.fetchFiltered(
        searchTerm: _controller.text.trim(),
        page: 0,
        size: 24,
      );
      if (!mounted) return;
      setState(() {
        _results
          ..clear()
          ..addAll(r.products);
        _total = r.totalElements;
        _page = 1;
        _loading = false;
      });
      // After the results land, so Matomo's Site Search report gets the hit
      // count and flags zero-result keywords (web parity: browse search).
      MatomoTracking.instance
          .trackSearch(_controller.text, resultCount: r.totalElements);
      // AU-048 zero-result tracking (web browse/page.tsx): when a search
      // settles at zero results, re-call the filter endpoint with
      // trackSearch:true after a 2s settle so admin sees the miss.
      if (_results.isEmpty && _controller.text.trim().isNotEmpty) {
        final term = _controller.text.trim();
        _zeroResultTimer = Timer(const Duration(seconds: 2), () {
          if (!mounted || _controller.text.trim() != term) return;
          _api
              .fetchFiltered(
                  searchTerm: term, page: 0, size: 1, trackSearch: true)
              .then((_) {}, onError: (_) {});
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _more() async {
    if (_loading || !_hasMore) return;
    setState(() => _loading = true);
    try {
      final r = await _api.fetchFiltered(
        searchTerm: _controller.text.trim(),
        page: _page,
        size: 24,
      );
      if (!mounted) return;
      setState(() {
        _results.addAll(r.products);
        _total = r.totalElements;
        _page += 1;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          focusNode: _searchFocus,
          textInputAction: TextInputAction.search,
          autofocus: true,
          decoration: const InputDecoration(
              hintText: 'Search…', border: InputBorder.none),
          onSubmitted: (_) => _search(),
        ),
        actions: [
          PopupMenuButton<ProductSort>(
            tooltip: 'Sort',
            icon: const Icon(Icons.sort),
            initialValue: _sort,
            onSelected: (s) => setState(() => _sort = s),
            itemBuilder: (_) => ProductSort.values
                .map((s) => PopupMenuItem(value: s, child: Text(s.label)))
                .toList(),
          ),
          IconButton(
              icon: const Icon(Icons.search),
              onPressed: _search,
              tooltip: 'Search'),
        ],
      ),
      body: Builder(builder: (context) {
        if (_loading && _results.isEmpty) {
          return const SkeletonPage();
        }
        if (_error != null) {
          return Center(
              child: Text('Search failed: ${friendlyApiError(_error!)}'));
        }
        if (_results.isEmpty) {
          return const Center(
              child: Text('No results found.',
                  style: TextStyle(color: Colors.grey)));
        }
        return NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n.metrics.extentAfter < 400) _more();
            return false;
          },
          child: SingleChildScrollView(
            child: Column(children: [
              ProductGrid(sortProducts(_results, _sort)),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(12),
                  child: SkeletonText(width: 120),
                ),
            ]),
          ),
        );
      }),
    );
  }
}
