import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/listing_events.dart';
import '../domain/product_choices.dart';
import '../domain/time_utils.dart';
import '../models/product.dart' show Product;
import '../theme.dart';
import '../widgets/app_image.dart';
import '../widgets/error_text.dart';
import '../widgets/seller_verification_gate.dart'
    show isVerifiedAccountDetails, isVerifiedSellerResponse;
import '../widgets/skeleton_loader.dart';

/// AU-054 — My Listings (web parity: /expat/dashboard "My Listings" tab).
///
/// Rows come from the seller's own `products[]` on
/// `/api/v1/userManagement/user-details`. Each row carries a derived status
/// key (web FE_SELL_FLOW "MY LISTINGS" model), filter tabs, per-status
/// guarded actions (PATCH `/api/v1/products/status/{id}`), inventory writes
/// (PATCH `/api/v1/products/{id}/inventory`), delete with confirm (DELETE
/// `/api/v1/products/delete/{id}`) and Edit → `/edit-listing/:id` — never the
/// null-id edit bug.
///
/// LISTIN-10/11/12/13/14/15/16/21 parity with the web dashboard:
/// - stock actions (Mark out of stock / Mark as available quantity dialog),
/// - per-status guards on the status menu,
/// - delivery-attention banner + per-card "Needs attention" overlay + repair CTA,
/// - Rejected-listings banner,
/// - text search + subcategory filter + per-category counts + Clear,
/// - 20-per-page cumulative reveal + "Showing 1 to X of Y listings" footer,
/// - "View Details", "You receive" chip, Halal badge, card tap-through,
/// - the "Verify your account to start selling" gate for unverified users.

/// A listing needs delivery attention when its setup is unfinished — the
/// seller has to fix it before buyers can order (web
/// `needsLogisticsConfirmation`, dashboard page.tsx:567-577). The explicit
/// `deliverySetupReady` flag wins when the backend sends one; otherwise the
/// two source fields have to say the seller really pinned a pickup point and
/// picked a transport mode.
bool listingNeedsAttention(Map<String, dynamic> p) {
  final issues = p['deliverySetupIssues'];
  final issueCount = issues is List ? issues.length : 0;
  final ready = p['deliverySetupReady'];
  if (ready == false || issueCount > 0) return true;
  if (ready == true) return false;

  final coordSource = p['coordinatesSource'] as String?;
  final modeSource = p['transportModeSource'] as String?;
  if (coordSource == null && modeSource == null) return false;
  return coordSource != 'PINNED' || modeSource != 'SELLER_SELECTED';
}

/// The repair CTA label under a needing-attention card — exact port of the
/// web `getLogisticsRepairLabel` (dashboard page.tsx:579-591).
String listingRepairLabel(Map<String, dynamic> p) {
  final issues = p['deliverySetupIssues'];
  final set =
      issues is List ? issues.map((e) => e.toString()).toSet() : <String>{};
  if (set.contains('TRANSPORT_MODE_MISSING') && set.length == 1) {
    return 'Select a mode of transport';
  }
  if (!set.contains('TRANSPORT_MODE_MISSING') &&
      (set.contains('PICKUP_LOCATION_MISSING') ||
          set.contains('PICKUP_LOCATION_NOT_CONFIRMED'))) {
    return 'Confirm the pickup pin';
  }
  return 'Fix pickup and transport details';
}

/// Web `hasHalalChoice` (lib/product-badges.ts) over a listing row's raw
/// `choiceConfiguration` block. The management card shows the Halal trust
/// badge when an ACTIVE "Halal" value is configured.
bool listingHasHalalChoice(Map<String, dynamic> p) {
  final raw = p['choiceConfiguration'];
  if (raw is! Map) return false;
  return hasHalalChoice(
    ProductChoiceConfiguration.fromJson(raw.cast<String, dynamic>()),
  );
}

/// Number of listings revealed per page — the dashboard's `itemsPerPage = 20`
/// (dashboard page.tsx:716). Rows accumulate as the seller scrolls.
const int _listingsPageSize = 20;

class SellerListingsScreen extends StatefulWidget {
  const SellerListingsScreen(
      {super.key,
      this.api,
      this.embedded = false,
      this.header = const [],
      this.initialFilter});
  final ApiClient? api;

  /// Opens on one status filter — the strip's "hidden from buyers" reminder
  /// lands on `attention`.
  final String? initialFilter;

  /// Rendered inside a MySpace tab, where the shared GloboAppBar and the tab
  /// bar are already on screen - a second AppBar would stack under them.
  final bool embedded;

  /// Widgets placed above the toolbar INSIDE this screen's scroll view — the
  /// MySpace "Selling" heading and workspace tabs live here so they scroll
  /// away with the listings instead of being pinned above them.
  final List<Widget> header;

  @override
  State<SellerListingsScreen> createState() => _SellerListingsScreenState();
}

class _SellerListingsScreenState extends State<SellerListingsScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<List<Map<String, dynamic>>> _future;
  late String _filter = widget.initialFilter ?? 'all';
  bool _busy = false;
  String _category = '';
  String _subcategory = '';
  String _sort = 'newest';
  final TextEditingController _searchCtrl = TextEditingController();
  String _search = '';

  /// Web parity: search is a control that expands over the filter row rather
  /// than a field that permanently occupies it.
  bool _searchOpen = false;
  int _revealed = _listingsPageSize;

  /// Whether the current user is a verified seller. Only used for the
  /// empty-state gate (LISTIN-21); rows are authoritative when present.
  bool _verifiedSeller = false;

  /// The last answer the SERVER gave, so a later lookup that fails does not
  /// downgrade a seller we already know is verified.
  bool _lastKnownVerified = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
    ListingEvents.instance.addListener(_onListingsChanged);
  }

  @override
  void dispose() {
    ListingEvents.instance.removeListener(_onListingsChanged);
    _searchCtrl.dispose();
    super.dispose();
  }

  /// Published, edited, archived or deleted anywhere: this panel stays
  /// mounted behind the dashboard tabs, so it has to be told.
  void _onListingsChanged() {
    if (mounted) setState(() => _future = _load());
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final token = AuthStore.instance?.token;
    if (token == null) return const [];
    // Web shows the whole Selling panel as a "verify to start selling" card for
    // users who cannot sell yet (dashboard page.tsx:2818-2836); we mirror that
    // on the empty state.
    final me = await _api.getUserDetails(token);
    // Web parity `canUserSell` (hooks/use-auth.ts): an account passes if
    // EITHER source says so. Reading only the seller application told a
    // verified seller — one with no application row, or whose application
    // lookup merely hiccuped — to "verify your account to start selling",
    // while the sell wizard's own gate let the same account straight in.
    _verifiedSeller = isVerifiedAccountDetails(me);
    if (!_verifiedSeller) {
      try {
        _verifiedSeller =
            isVerifiedSellerResponse(await _api.fetchSellerVerification(token));
      } catch (_) {
        // A failed lookup is not an answer. Claiming "unverified" from a
        // timeout accuses the seller of something the server never said, so
        // the panel keeps whatever it last knew; the wizard's gate is what
        // actually blocks listing.
        _verifiedSeller = _lastKnownVerified;
      }
    }
    _lastKnownVerified = _verifiedSeller;
    final products = me['products'];
    return products is List
        ? products.whereType<Map<String, dynamic>>().toList()
        : const <Map<String, dynamic>>[];
  }

  Future<void> _reload() async {
    setState(() => _future = _load());
    await _future.catchError((Object _) => const <Map<String, dynamic>>[]);
  }

  /// Derived status key — exact port of the reference `getListingStatusKey`
  /// (app/expat/dashboard/page.tsx): two-field model, approval
  /// (`productStatus`) takes precedence over availability
  /// (`availabilityStatus`), legacy single-field ARCHIVED honored on both.
  static String _statusKey(Map<String, dynamic> p) {
    final approval =
        ((p['productStatus'] as String?) ?? (p['status'] as String?) ?? '')
            .toUpperCase();
    final avail = ((p['availabilityStatus'] as String?) ?? '').toUpperCase();
    final available = (p['productQuantity'] as num?)?.toInt() ?? 0;
    final sold = (p['soldQuantity'] as num?)?.toInt() ?? 0;
    final rental = p['rentalConfiguration'] != null;

    // Approval-level states take precedence.
    if (approval == 'REJECTED' || approval == 'UNAPPROVED') return 'unapproved';
    if (approval == 'PENDING') return 'pending';

    // Legacy single-field values (data created before the two-field split).
    if (approval == 'ARCHIVED') return 'archived';
    if (avail == 'ARCHIVED') return 'archived';

    if (rental) return (p['rentalBookedToday'] == true) ? 'booked' : 'active';

    if (approval == 'SOLD') return 'sold';
    if (approval == 'OUT_OF_STOCK') return 'out_of_stock';

    // Approved (or legacy APPROVED/UNSOLD/ACTIVE): derive from availability.
    if (avail == 'OUT_OF_STOCK') return 'out_of_stock';
    if (avail == 'AVAILABLE') return available > 0 ? 'active' : 'out_of_stock';

    // No availability info: fall back to quantity.
    if (available > 0) return 'active';
    if (sold > 0) return 'sold';
    return 'out_of_stock';
  }

  static const Map<String, String> _filterLabels = {
    'all': 'All',
    'attention': 'Needs attention',
    'active': 'Available',
    'booked': 'Booked',
    'sold': 'Sold',
    'pending': 'Pending',
    'unapproved': 'Rejected',
    'archived': 'Archived',
    'out_of_stock': 'Out of Stock',
  };

  static const Map<String, String> _sortLabels = {
    'newest': 'Newest',
    'oldest': 'Oldest',
    'most-views': 'Most Views',
    'least-views': 'Least Views',
  };

  String _categoryOf(Map<String, dynamic> p) =>
      (p['categoryName'] as String?)?.trim() ?? '';

  String _subcategoryNameOf(Map<String, dynamic> p) =>
      (p['subcategoryName'] as String?)?.trim() ?? '';

  /// Views, then dates. The backend DTOs disagree on the created-at field
  /// name, so try each in the same order the web does.
  int _createdAt(Map<String, dynamic> p) {
    for (final key in const [
      'createdAt',
      'formattedCreatedAt',
      'productCreatedAt'
    ]) {
      final raw = p[key];
      if (raw is String && raw.isNotEmpty) {
        final parsed = DateTime.tryParse(raw);
        if (parsed != null) return parsed.millisecondsSinceEpoch;
      }
    }
    return 0;
  }

  int _views(Map<String, dynamic> p) => (p['clickCount'] as num?)?.toInt() ?? 0;

  List<Map<String, dynamic>> _sorted(List<Map<String, dynamic>> rows) {
    final out = [...rows];
    switch (_sort) {
      case 'most-views':
        out.sort((a, b) => _views(b).compareTo(_views(a)));
      case 'least-views':
        out.sort((a, b) => _views(a).compareTo(_views(b)));
      case 'oldest':
        out.sort((a, b) => _createdAt(a).compareTo(_createdAt(b)));
      default:
        out.sort((a, b) => _createdAt(b).compareTo(_createdAt(a)));
    }
    return out;
  }

  /// Web filter pipeline (dashboard page.tsx:884-947): search across
  /// name + description, then category, subcategory, status and sort.
  List<Map<String, dynamic>> _filtered(List<Map<String, dynamic>> inCategory) {
    var out = inCategory;
    final q = _search.trim().toLowerCase();
    if (q.isNotEmpty) {
      out = out.where((p) {
        final name =
            (p['productName'] ?? p['title'] ?? '').toString().toLowerCase();
        final desc = (p['productDescription'] ?? '').toString().toLowerCase();
        return name.contains(q) || desc.contains(q);
      }).toList();
    }
    if (_category.isNotEmpty) {
      out = out.where((p) => _categoryOf(p) == _category).toList();
    }
    if (_subcategory.isNotEmpty) {
      out = out.where((p) => _subcategoryNameOf(p) == _subcategory).toList();
    }
    out = switch (_filter) {
      'all' => out,
      'attention' => out.where(listingNeedsAttention).toList(),
      _ => out.where((p) => _statusKey(p) == _filter).toList(),
    };
    return _sorted(out);
  }

  bool get _filtersActive =>
      _search.trim().isNotEmpty ||
      _category.isNotEmpty ||
      _subcategory.isNotEmpty ||
      _filter != 'all' ||
      _sort != 'newest';

  void _selectFilter(String f) => setState(() {
        _filter = f;
        _revealed = _listingsPageSize;
      });

  void _selectCategory(String c) => setState(() {
        _category = c;
        _subcategory = '';
        _revealed = _listingsPageSize;
      });

  void _selectSubcategory(String s) => setState(() {
        _subcategory = s;
        _revealed = _listingsPageSize;
      });

  void _selectSort(String s) => setState(() {
        _sort = s;
        _revealed = _listingsPageSize;
      });

  void _clearAll() => setState(() {
        _filter = 'all';
        _category = '';
        _subcategory = '';
        _sort = 'newest';
        _search = '';
        _searchCtrl.clear();
        _revealed = _listingsPageSize;
      });

  Future<void> _changeStatus(Map<String, dynamic> p, String status) async {
    final token = AuthStore.instance?.token;
    if (token == null || _busy) return;
    final id = (p['productId'] as num).toInt();
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.updateProductStatus(token, id, status);
      // ignore: use_build_context_synchronously
      messenger.showSnackBar(SnackBar(
          content: Text(
              'Listing ${status == 'ARCHIVED' ? 'archived' : 'reactivated'}.')));
      // ignore: use_build_context_synchronously
      // Reloads this list (through the listener) and Home's rails too.
      ListingEvents.instance.changed();
      await _future.catchError((Object _) => const <Map<String, dynamic>>[]);
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      // ignore: use_build_context_synchronously
      messenger.showSnackBar(
          SnackBar(content: Text('Could not update: ${e.message}')));
    } catch (_) {
      // ignore: use_build_context_synchronously
      messenger.showSnackBar(const SnackBar(
          content: Text('Could not update the listing. Try again.')));
    }
    if (mounted) setState(() => _busy = false);
  }

  /// Web `saveInventory` (dashboard page.tsx:1586-1611): quantity > 0 flips the
  /// row to AVAILABLE, 0 marks it OUT_OF_STOCK via PATCH /products/{id}/inventory.
  Future<void> _setInventory(Map<String, dynamic> p,
      {required int quantity}) async {
    final token = AuthStore.instance?.token;
    if (token == null || _busy) return;
    final id = (p['productId'] as num).toInt();
    final name = (p['productName'] ?? 'Listing').toString();
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.updateProductInventory(token, id, quantity: quantity);
      // ignore: use_build_context_synchronously
      messenger.showSnackBar(SnackBar(
        content: Text(
          quantity > 0
              ? 'Listing available — $name now has $quantity available.'
              : 'Listing out of stock — $name is now hidden from in-stock results.',
        ),
      ));
      // ignore: use_build_context_synchronously
      // Reloads this list (through the listener) and Home's rails too.
      ListingEvents.instance.changed();
      await _future.catchError((Object _) => const <Map<String, dynamic>>[]);
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      // ignore: use_build_context_synchronously
      messenger.showSnackBar(
          SnackBar(content: Text('Could not update inventory: ${e.message}')));
    } catch (_) {
      // ignore: use_build_context_synchronously
      messenger.showSnackBar(const SnackBar(
          content: Text('Could not update the listing. Try again.')));
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _markOutOfStock(Map<String, dynamic> p) =>
      _setInventory(p, quantity: 0);

  /// Web's "Mark as available" dialog (dashboard page.tsx:4409-4479): ask for
  /// the available quantity (min 0.01) and PATCH it through the inventory endpoint.
  Future<void> _markAvailable(Map<String, dynamic> p) async {
    if (_busy) return;
    final name = (p['productName'] ?? 'this listing').toString();
    final controller = TextEditingController(text: '1');
    var error = '';
    final ok = await showDialog<double>(
      context: context,
      builder: (d) => StatefulBuilder(
        builder: (d, setDialogState) => AlertDialog(
          title: const Text('Mark as available'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Enter the quantity currently available for $name.'),
              const SizedBox(height: 14),
              TextField(
                controller: controller,
                autofocus: true,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: 'Available quantity',
                  border: const OutlineInputBorder(),
                  isDense: true,
                  errorText: error.isEmpty ? null : error,
                ),
                onChanged: (_) {
                  if (error.isNotEmpty) setDialogState(() => error = '');
                },
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(d),
              child: const Text('Cancel'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF059669)),
              onPressed: () {
                final qty = double.tryParse(controller.text.trim());
                if (qty == null || qty <= 0) {
                  setDialogState(
                      () => error = 'Quantity must be greater than zero');
                  return;
                }
                Navigator.pop(d, qty);
              },
              child: const Text('Update quantity'),
            ),
          ],
        ),
      ),
    );
    if (ok != null && ok > 0) {
      await _setInventory(p, quantity: ok.round());
    }
  }

  Future<void> _delete(Map<String, dynamic> p) async {
    final token = AuthStore.instance?.token;
    if (token == null || _busy) return;
    final id = (p['productId'] as num).toInt();
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Delete listing?'),
        content: Text(
            '"${p['productName'] ?? 'This listing'}" will be permanently removed.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(d, false),
              child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626)),
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    // ignore: use_build_context_synchronously
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.deleteProduct(token, id);
      // ignore: use_build_context_synchronously
      messenger.showSnackBar(const SnackBar(content: Text('Listing deleted.')));
      // ignore: use_build_context_synchronously
      // Reloads this list (through the listener) and Home's rails too.
      ListingEvents.instance.changed();
      await _future.catchError((Object _) => const <Map<String, dynamic>>[]);
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      // ignore: use_build_context_synchronously
      messenger.showSnackBar(
          SnackBar(content: Text('Could not delete: ${e.message}')));
    } catch (_) {
      // ignore: use_build_context_synchronously
      messenger.showSnackBar(const SnackBar(
          content: Text('Could not delete the listing. Try again.')));
    }
    if (mounted) setState(() => _busy = false);
  }

  /// Subcategories present among the rows of the chosen category (web
  /// `selectedListingSubcategories`, dashboard page.tsx:863-876).
  List<String> _subcategoriesFor(
      String category, List<Map<String, dynamic>> rows) {
    final set = <String>{};
    for (final p in rows) {
      if (_categoryOf(p) == category) {
        final s = _subcategoryNameOf(p);
        if (s.isNotEmpty) set.add(s);
      }
    }
    return set.toList()..sort();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.embedded ? null : AppBar(title: const Text('My listings')),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: FutureBuilder<List<Map<String, dynamic>>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const FeedSkeleton();
            }
            if (snap.hasError) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ErrorText(
                        error: snap.error,
                        context: 'Could not load your listings.'),
                    const SizedBox(height: 12),
                    OutlinedButton(
                        onPressed: _reload, child: const Text('Retry')),
                  ],
                ),
              );
            }
            final rows = snap.data ?? const <Map<String, dynamic>>[];
            if (rows.isEmpty) {
              // Hide-empty convention: no scaffolding when there is nothing.
              // LISTIN-21: a user who can't sell yet gets the web gate card
              // instead of a misleading "no listings" message.
              if (!_verifiedSeller) {
                return ListView(children: [
                  const SizedBox(height: 48),
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: AppPalette.of(context).infoFill,
                            border: Border.all(color: AppPalette.of(context).infoBorder),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Column(children: [
                            Icon(Icons.verified_user_outlined,
                                size: 44, color: AppPalette.of(context).accentInk),
                            const SizedBox(height: 12),
                            const Text('Verify your account to start selling',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                    fontSize: 17, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 8),
                            Text(
                              'Verify your organization email to create listings, receive orders, and get paid.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  fontSize: 13, color: AppPalette.of(context).textSecondary),
                            ),
                            const SizedBox(height: 16),
                            FilledButton(
                              onPressed: () =>
                                  context.push('/account/verification'),
                              child: const Text('Get Verified'),
                            ),
                          ]),
                        ),
                      ],
                    ),
                  ),
                ]);
              }
              return ListView(children: const [
                SizedBox(height: 120),
                Center(child: Text('You have no listings yet.')),
              ]);
            }

            final attentionCount = rows.where(listingNeedsAttention).length;
            // Only the categories/subcategories the seller actually has listings in.
            final categories = {for (final p in rows) _categoryOf(p)}
              ..removeWhere((c) => c.isEmpty);
            final counts = <String, int>{};
            for (final p in rows) {
              final c = _categoryOf(p);
              if (c.isNotEmpty) counts[c] = (counts[c] ?? 0) + 1;
            }
            final categoryList = categories.toList()..sort();
            final subcategories = _category.isEmpty
                ? const <String>[]
                : _subcategoriesFor(_category, rows);

            final filtered = _filtered(rows);
            final shown =
                _revealed < filtered.length ? _revealed : filtered.length;
            final hasMore = shown < filtered.length;
            final visible = filtered.take(shown).toList();

            // Web parity: nothing on My Space is sticky — the section header,
            // the toolbar and the banners all scroll away with the grid, so
            // this is one scroll view rather than pinned chrome above a list.
            return ListView(
              padding: EdgeInsets.zero,
              children: [
                ...widget.header,
                // Web parity dashboard page.tsx mobile toolbar: a stacked set
                // of 44px select buttons — search collapses to an icon, and
                // status is its own full-width row, rather than the chip rail
                // and loose dropdowns this used to show.
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (attentionCount > 0) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppPalette.of(context).warningFill,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: const Color(0xFFFCD34D)),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(Icons.warning_amber_rounded,
                                size: 14, color: AppPalette.of(context).warningText),
                            const SizedBox(width: 6),
                            Text('$attentionCount need attention',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: AppPalette.of(context).warningText)),
                          ]),
                        ),
                        const SizedBox(height: 8),
                      ],
                      Row(children: [
                        if (!_searchOpen) ...[
                          _ListingIconButton(
                            icon: Icons.search,
                            tooltip: 'Search your listings',
                            onTap: () => setState(() => _searchOpen = true),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _ListingSelect<String>(
                              icon: Icons.filter_list,
                              value: _category,
                              label: _category.isEmpty
                                  ? 'All (${rows.length})'
                                  : '$_category (${counts[_category] ?? 0})',
                              options: [
                                (value: '', label: 'All (${rows.length})'),
                                for (final c in categoryList)
                                  (value: c, label: '$c (${counts[c] ?? 0})'),
                              ],
                              onSelected: _selectCategory,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _ListingSelect<String>(
                              icon: Icons.swap_vert_rounded,
                              value: _sort,
                              label: _sortLabels[_sort] ?? 'Newest',
                              options: [
                                for (final e in _sortLabels.entries)
                                  (value: e.key, label: e.value),
                              ],
                              onSelected: _selectSort,
                            ),
                          ),
                        ] else ...[
                          Expanded(
                            child: SizedBox(
                              height: 44,
                              child: TextField(
                                controller: _searchCtrl,
                                autofocus: true,
                                onChanged: (v) => setState(() {
                                  _search = v;
                                  _revealed = _listingsPageSize;
                                }),
                                decoration: InputDecoration(
                                  isDense: true,
                                  hintText: 'Search listings',
                                  prefixIcon: Icon(Icons.search,
                                      size: 16, color: AppPalette.of(context).textSecondary),
                                  filled: true,
                                  fillColor:
                                      AppPalette.of(context).surface,
                                  contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 12),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: BorderSide(
                                        color: AppPalette.of(context).border),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: BorderSide(
                                        color: AppPalette.of(context).border),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed: () => setState(() {
                              _searchOpen = false;
                              _search = '';
                              _searchCtrl.clear();
                              _revealed = _listingsPageSize;
                            }),
                            style: TextButton.styleFrom(
                              minimumSize: const Size(0, 44),
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 12),
                              foregroundColor: AppPalette.of(context).accentInk,
                              textStyle: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                            child: const Text('Done'),
                          ),
                        ],
                      ]),
                      if (subcategories.length > 1) ...[
                        const SizedBox(height: 8),
                        _ListingSelect<String>(
                          value: subcategories.contains(_subcategory)
                              ? _subcategory
                              : '',
                          label: subcategories.contains(_subcategory)
                              ? _subcategory
                              : 'All subcategories',
                          options: [
                            (value: '', label: 'All subcategories'),
                            for (final s in subcategories) (value: s, label: s),
                          ],
                          onSelected: _selectSubcategory,
                        ),
                      ],
                      const SizedBox(height: 8),
                      Row(children: [
                        Expanded(
                          child: _ListingSelect<String>(
                            value: _filter,
                            label: _filter == 'all'
                                ? 'All statuses'
                                : _filter == 'attention'
                                    ? 'Needs attention ($attentionCount)'
                                    : _filterLabels[_filter] ?? 'All statuses',
                            options: [
                              (value: 'all', label: 'All statuses'),
                              (
                                value: 'attention',
                                label: 'Needs attention ($attentionCount)'
                              ),
                              for (final e in _filterLabels.entries)
                                if (e.key != 'all' && e.key != 'attention')
                                  (value: e.key, label: e.value),
                            ],
                            onSelected: _selectFilter,
                          ),
                        ),
                        if (_filtersActive) ...[
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed: _clearAll,
                            style: TextButton.styleFrom(
                              minimumSize: const Size(0, 44),
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 12),
                              foregroundColor: AppPalette.of(context).accentInk,
                              textStyle: const TextStyle(
                                  fontSize: 12, fontWeight: FontWeight.w600),
                            ),
                            child: const Text('Reset'),
                          ),
                        ],
                      ]),
                      const SizedBox(height: 6),
                      Text(
                          'Showing ${visible.length} of ${filtered.length} listing${filtered.length == 1 ? '' : 's'}',
                          style: TextStyle(
                              fontSize: 12, color: AppPalette.of(context).textSecondary)),
                    ],
                  ),
                ),
                // LISTIN-12: amber banner explaining listings are hidden from
                // buyers (web dashboard page.tsx:3187-3219), with the
                // Show affected / Show all listings toggle.
                if (attentionCount > 0)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 2, 12, 2),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppPalette.of(context).warningFill,
                        border: Border.all(color: const Color(0xFFFCD34D)),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.warning_amber_rounded,
                              size: 20, color: AppPalette.of(context).warningText),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                    'Delivery information needs attention',
                                    style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: AppPalette.of(context).warningText)),
                                const SizedBox(height: 2),
                                Text(
                                  attentionCount == 1
                                      ? '1 listing is hidden from buyers until its pickup location and mode of transport are confirmed.'
                                      : '$attentionCount listings are hidden from buyers until their pickup locations and modes of transport are confirmed.',
                                  style: TextStyle(
                                      fontSize: 12, color: AppPalette.of(context).warningText),
                                ),
                              ],
                            ),
                          ),
                          TextButton(
                            onPressed: () => _selectFilter(
                                _filter == 'attention' ? 'all' : 'attention'),
                            child: Text(_filter == 'attention'
                                ? 'Show all listings'
                                : 'Show affected'),
                          ),
                        ],
                      ),
                    ),
                  ),
                // LISTIN-13: red banner when the Rejected filter is active (web
                // dashboard page.tsx:3221-3239).
                if (_filter == 'unapproved' && filtered.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 2, 12, 2),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppPalette.of(context).dangerFill,
                        border: Border.all(color: AppPalette.of(context).dangerBorder),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.flag_circle_outlined,
                              size: 20, color: Color(0xFFDC2626)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Rejected Listings',
                                    style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: AppPalette.of(context).dangerText)),
                                SizedBox(height: 2),
                                Text(
                                  'These listings have been flagged and removed from the '
                                  'Marketplace and Home page. They may require edits or '
                                  'corrections before they can be re-approved. Please review '
                                  'each listing and make necessary changes, then save to '
                                  'resubmit for review.',
                                  style: TextStyle(
                                      fontSize: 12, color: AppPalette.of(context).dangerText),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (filtered.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 80),
                    child: Center(child: Text('No listings in this group.')),
                  )
                else
                  // Web parity: listings are a two-column grid of picture
                  // cards, not a list of thumbnail rows.
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      children: [
                        // Rows of two rather than a fixed-ratio GridView:
                        // a card's height depends on which optional pieces
                        // it draws (payout strip, archive note, repair
                        // CTA), so any single ratio either clips the busy
                        // cards or leaves the plain ones half empty. This
                        // sizes each row to its tallest card, which is
                        // what the web's CSS grid does.
                        for (var row = 0; row < (shown / 2).ceil(); row++)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: IntrinsicHeight(
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  for (var col = 0; col < 2; col++) ...[
                                    if (col > 0) const SizedBox(width: 12),
                                    Expanded(
                                      child: row * 2 + col < shown
                                          ? _ListingCard(
                                              visible[row * 2 + col],
                                              busy: _busy,
                                              needsAttention:
                                                  listingNeedsAttention(
                                                      visible[row * 2 + col]),
                                              repairLabel: listingRepairLabel(
                                                  visible[row * 2 + col]),
                                              onArchive: (lp) =>
                                                  _changeStatus(lp, 'ARCHIVED'),
                                              onStockOut: _markOutOfStock,
                                              onRestock: _markAvailable,
                                              onDelete: _delete,
                                            )
                                          : const SizedBox.shrink(),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        const SizedBox(height: 12),
                        if (hasMore)
                          Center(
                            child: TextButton(
                              onPressed: () => setState(
                                  () => _revealed += _listingsPageSize),
                              child: const Text('Load more listings'),
                            ),
                          ),
                        const SizedBox(height: 4),
                        Text(
                          'Showing 1 to $shown of ${filtered.length} listings',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 12, color: AppPalette.of(context).textSecondary),
                        ),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Web parity: the square 44px control that holds the collapsed search.
class _ListingIconButton extends StatelessWidget {
  const _ListingIconButton(
      {required this.icon, required this.tooltip, required this.onTap});
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppPalette.of(context).border),
            ),
            child: Icon(icon,
                size: 16, color: AppPalette.of(context).textPrimary),
          ),
        ),
      ),
    );
  }
}

/// Web parity: a 44px-tall select — optional leading icon, the current value,
/// and a trailing chevron — used for the category, sort, subcategory and
/// status filters on the listings toolbar.
class _ListingSelect<T> extends StatelessWidget {
  const _ListingSelect({
    super.key,
    this.icon,
    required this.value,
    required this.label,
    required this.options,
    required this.onSelected,
  });

  final IconData? icon;
  final T value;
  final String label;
  final List<({T value, String label})> options;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<T>(
      initialValue: value,
      onSelected: onSelected,
      position: PopupMenuPosition.under,
      constraints: const BoxConstraints(minWidth: 220),
      tooltip: label,
      itemBuilder: (_) => [
        for (final option in options)
          PopupMenuItem<T>(
            value: option.value,
            height: 44,
            child: Text(option.label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: option.value == value
                      ? AppPalette.of(context).infoText
                      : AppPalette.of(context).textPrimary,
                )),
          ),
      ],
      child: Container(
        height: 44,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppPalette.of(context).border),
        ),
        child: Row(children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: AppPalette.of(context).textSecondary),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14, color: AppPalette.of(context).textPrimary)),
          ),
          Icon(Icons.keyboard_arrow_down_rounded,
              size: 16, color: AppPalette.of(context).textPrimary.withValues(alpha: .5)),
        ]),
      ),
    );
  }
}

/// Web parity: the translucent "Edit" pill floated over the listing picture.
class _OverlayPill extends StatelessWidget {
  const _OverlayPill(
      {required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppPalette.of(context).surface.withValues(alpha: .92),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: BorderSide(color: AppPalette.of(context).infoFill),
      ),
      elevation: 2,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          height: 28,
          padding: const EdgeInsets.only(left: 8, right: 10),
          alignment: Alignment.center,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 13, color: AppPalette.of(context).accentInk),
            const SizedBox(width: 4),
            Text(label,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppPalette.of(context).accentInk)),
          ]),
        ),
      ),
    );
  }
}

/// Web parity: the circular overflow control beside the Edit pill, holding the
/// per-status actions the web keeps in its dropdown.
class _OverlayMenu extends StatelessWidget {
  const _OverlayMenu({
    required this.isRental,
    required this.canMarkAvailable,
    required this.canMarkOutOfStock,
    required this.canArchive,
    required this.busy,
    required this.onSelected,
  });

  final bool isRental;
  final bool canMarkAvailable;
  final bool canMarkOutOfStock;
  final bool canArchive;
  final bool busy;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppPalette.of(context).surface.withValues(alpha: .92),
      shape: CircleBorder(side: BorderSide(color: AppPalette.of(context).surfaceMuted)),
      elevation: 2,
      child: PopupMenuButton<String>(
        tooltip: 'More actions',
        onSelected: onSelected,
        position: PopupMenuPosition.under,
        itemBuilder: (_) => [
          const PopupMenuItem(value: 'view', child: Text('View Details')),
          if (isRental)
            const PopupMenuItem(value: 'dates', child: Text('Reserve dates')),
          if (canMarkAvailable)
            const PopupMenuItem(
                value: 'restock', child: Text('Mark as available')),
          if (canMarkOutOfStock)
            const PopupMenuItem(value: 'out', child: Text('Mark out of stock')),
          if (canArchive) ...[
            const PopupMenuDivider(),
            const PopupMenuItem(value: 'archive', child: Text('Archive')),
          ],
          if (!busy) ...[
            const PopupMenuDivider(),
            const PopupMenuItem(
              value: 'delete',
              child: Text('Delete', style: TextStyle(color: Color(0xFFDC2626))),
            ),
          ],
        ],
        child: SizedBox(
          width: 28,
          height: 28,
          child: Icon(Icons.more_horiz, size: 15, color: AppPalette.of(context).textSecondary),
        ),
      ),
    );
  }
}

class _ListingCard extends StatelessWidget {
  final Map<String, dynamic> p;
  final bool busy;
  final bool needsAttention;
  final String repairLabel;
  final void Function(Map<String, dynamic>) onArchive;
  final void Function(Map<String, dynamic>) onStockOut;
  final void Function(Map<String, dynamic>) onRestock;
  final void Function(Map<String, dynamic>) onDelete;
  const _ListingCard(this.p,
      {required this.busy,
      required this.needsAttention,
      required this.repairLabel,
      required this.onArchive,
      required this.onStockOut,
      required this.onRestock,
      required this.onDelete});

  /// A rental carries a `rentalConfiguration` block; a plain sale does not.
  /// Read straight off the listing JSON, which is what this card holds.
  bool get _isRental {
    final config = p['rentalConfiguration'];
    return config is Map && (config['enabled'] as bool? ?? true);
  }

  String get _title => (p['productName'] ?? p['title'] ?? '').toString();
  int get _id => (p['productId'] as num).toInt();
  String get _statusKeyValue => _SellerListingsScreenState._statusKey(p);

  /// Chip label — exact port of reference `getListingStatusLabel`.
  String get _key {
    final key = _SellerListingsScreenState._statusKey(p);
    final sold = (p['soldQuantity'] as num?)?.toInt() ?? 0;
    final left = (p['productQuantity'] as num?)?.toInt() ?? 0;

    switch (key) {
      case 'archived':
        return 'Archived';
      case 'pending':
        return 'Pending';
      case 'unapproved':
        return 'Rejected';
      case 'booked':
        return p['rentalBookedToday'] == true ? 'Booked' : 'Available';
      case 'out_of_stock':
        return sold > 0 ? 'Sold' : 'Out of Stock';
      case 'sold':
        return 'Sold';
      case 'active':
        if (p['rentalConfiguration'] != null) return 'Available';
        if (sold > 0 && left > 0) return '$sold sold / $left left';
        return 'Available';
      default:
        return (p['productStatus'] as String?) ?? 'Unknown';
    }
  }

  /// Web parity `getListingStatusBadgeClass` (product-card.tsx): the solid
  /// badge fill for each status label.
  Color get _statusColor {
    switch (_key) {
      case 'Archived':
        return const Color(0xFF64748B); // slate-500
      case 'Sold':
        return const Color(0xFF334155); // neutral-800
      case 'Pending':
      case 'Booked':
        return const Color(0xFFF59E0B); // amber-500
      case 'Rejected':
      case 'Out of Stock':
        return const Color(0xFFDC2626); // red-600
      default: // Available, and the "n sold / m left" variant
        return const Color(0xFF10B981); // emerald-500
    }
  }

  /// A-15: the "Archives {date}" footnote under an ACTIVE/BOOKED card that has
  /// a scheduled auto-archive (web dashboard page.tsx:3800-3810). Null for
  /// every other state, so the footnote is genuinely absent — never blank.
  String? get _archivesOnDate {
    final raw = p['archiveDate'];
    if (raw == null) return null;
    final dt = TimeUtils.tryParseBackendTimestamp(raw);
    if (dt == null) return null;
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
      'Dec',
    ];
    return 'Archives ${dt.day} ${months[dt.month - 1]} ${dt.year}';
  }

  /// The created-at line the web card shows under the seller block when
  /// `showDate` is set, formatted the same short way as "Jun 12, 2026".
  String? get _dateLabel {
    for (final key in const [
      'createdAt',
      'formattedCreatedAt',
      'productCreatedAt'
    ]) {
      final raw = p[key];
      if (raw == null) continue;
      final dt = TimeUtils.tryParseBackendTimestamp(raw);
      if (dt == null) continue;
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
        'Dec',
      ];
      return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
    }
    return null;
  }

  /// LISTIN-11 per-status guards (web product-card.tsx:945, :980-1028).
  bool get _canEdit => _key != 'Sold';
  bool get _isSoldStatus => _statusKeyValue == 'sold';
  bool get _isOutOfStock => _statusKeyValue == 'out_of_stock';
  bool get _canMarkOutOfStock =>
      !_isRental && _statusKeyValue == 'active' && !_isSoldStatus;
  bool get _canMarkAvailable => !_isRental && _isOutOfStock;
  bool get _canArchive => !const {'archived', 'pending', 'unapproved', 'sold'}
      .contains(_statusKeyValue);

  @override
  Widget build(BuildContext context) {
    final images = p['productImages'];
    final img = images is List && images.isNotEmpty && images.first is Map
        ? (images.first as Map)['imageUrl'] as String?
        : null;
    final clicks = (p['clickCount'] as num?)?.toInt() ?? 0;
    final asking = (p['productAskingPrice'] as num?)?.toDouble() ?? 0;
    final quantity = (p['productQuantity'] as num?)?.toInt() ?? 0;
    final sellerReceives = (p['sellerPayout'] ?? p['whatSellerReceives']);
    final showYouReceive = sellerReceives is num && sellerReceives > 0;
    final halal = listingHasHalalChoice(p);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: AppPalette.of(context).surface,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: AppPalette.of(context).border),
          ),
          child: InkWell(
            // LISTIN-16: the whole management card is tappable through to
            // the product detail, like the web card's onClick.
            onTap: () => context.push('/product/$_id'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // LISTIN-12 per-card overlay: a buyer-hidden listing carries
                // the amber "Needs attention / Hidden from buyers" header
                // (web dashboard page.tsx:3264-3272).
                if (needsAttention)
                  Container(
                    width: double.infinity,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    color: AppPalette.of(context).warningFill,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(children: [
                          Icon(Icons.warning_amber_rounded,
                              size: 12, color: AppPalette.of(context).warningText),
                          SizedBox(width: 4),
                          Expanded(
                            child: Text('Needs attention',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: AppPalette.of(context).warningText)),
                          ),
                        ]),
                        Text('Hidden from buyers',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w600,
                                color: AppPalette.of(context).warningText)),
                      ],
                    ),
                  ),
                // Picture with the status badge and the Edit / overflow
                // controls laid over it, exactly as the web card does.
                AspectRatio(
                  aspectRatio: 3 / 2,
                  child: Stack(fit: StackFit.expand, children: [
                    ColoredBox(
                      color: AppPalette.of(context).background,
                      child: Padding(
                        padding: const EdgeInsets.all(4),
                        child: img != null
                            ? AppImage(img, fit: BoxFit.contain)
                            : Icon(Icons.image_outlined,
                                size: 32, color: AppPalette.of(context).textSecondary),
                      ),
                    ),
                    Positioned(
                      left: 8,
                      top: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                          color: _statusColor,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                              color: Colors.white.withValues(alpha: .2),
                              width: 2),
                        ),
                        child: Text(_key.toUpperCase(),
                            style: const TextStyle(
                                fontSize: 9,
                                height: 1.2,
                                fontWeight: FontWeight.w700,
                                color: Colors.white)),
                      ),
                    ),
                    if (halal)
                      Positioned(
                        right: 8,
                        top: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            color: const Color(0xFF059669),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text('Halal',
                              style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white)),
                        ),
                      ),
                    Positioned(
                      right: 6,
                      bottom: 6,
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        if (_canEdit)
                          _OverlayPill(
                            icon: Icons.edit_outlined,
                            label: 'Edit',
                            onTap: () => context.push('/edit-listing/$_id'),
                          ),
                        const SizedBox(width: 6),
                        _OverlayMenu(
                          isRental: _isRental,
                          canMarkAvailable: _canMarkAvailable,
                          canMarkOutOfStock: _canMarkOutOfStock,
                          canArchive: _canArchive,
                          busy: busy,
                          onSelected: (value) {
                            switch (value) {
                              case 'view':
                                context.push('/product/$_id');
                              case 'dates':
                                context.push(
                                    '/listing/$_id/availability?title=${Uri.encodeQueryComponent(_title)}');
                              case 'restock':
                                onRestock(p);
                              case 'out':
                                onStockOut(p);
                              case 'archive':
                                onArchive(p);
                              case 'delete':
                                onDelete(p);
                            }
                          },
                        ),
                      ]),
                    ),
                  ]),
                ),
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        height: 32,
                        child: Text(p['productName']?.toString() ?? '',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 12,
                                height: 1.25,
                                fontWeight: FontWeight.w600,
                                color: AppPalette.of(context).textPrimary)),
                      ),
                      const SizedBox(height: 6),
                      Text(Product.formatPrice(asking),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontFamily: 'Lexend',
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppColors.price)),
                      // LISTIN-16: the emerald "You receive" payout strip
                      // (web product-card.tsx:1094-1112).
                      if (showYouReceive) ...[
                        const SizedBox(height: 8),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppPalette.of(context).successFill,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: AppPalette.of(context).successFill),
                          ),
                          child: Row(children: [
                            Expanded(
                              child: Text('You receive',
                                  style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: AppPalette.of(context).successText)),
                            ),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                  Product.formatPrice(
                                      sellerReceives.toDouble()),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: AppPalette.of(context).successText)),
                            ),
                          ]),
                        ),
                      ],
                      const SizedBox(height: 8),
                      Row(children: [
                        Expanded(
                          child: Text('$quantity in stock',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 11, color: AppPalette.of(context).textSecondary)),
                        ),
                        Icon(Icons.visibility_outlined,
                            size: 12, color: AppPalette.of(context).textMuted),
                        const SizedBox(width: 3),
                        Text('$clicks',
                            style: TextStyle(
                                fontSize: 11, color: AppPalette.of(context).textSecondary)),
                      ]),
                      if (_dateLabel != null) ...[
                        const SizedBox(height: 6),
                        Row(children: [
                          Icon(Icons.calendar_today_outlined,
                              size: 11, color: AppPalette.of(context).borderStrong),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(_dateLabel!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 10, color: AppPalette.of(context).textMuted)),
                          ),
                        ]),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        // A-15: scheduled auto-archive footnote (web "Archives {date}").
        if ((_statusKeyValue == 'active' || _statusKeyValue == 'booked') &&
            _archivesOnDate != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              _archivesOnDate!,
              key: const ValueKey('listing-archives-on'),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary),
            ),
          ),
        // LISTIN-12 repair CTA — deep-links straight into the editor.
        if (needsAttention)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppPalette.of(context).warningText,
                  side: const BorderSide(color: Color(0xFFFCD34D)),
                  backgroundColor: AppPalette.of(context).warningFill,
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  minimumSize: const Size(0, 30),
                ),
                onPressed: () => context.push('/edit-listing/$_id'),
                icon: const Icon(Icons.place_outlined, size: 13),
                label: Text('$repairLabel - update now',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 10, fontWeight: FontWeight.w700)),
              ),
            ),
          ),
      ],
    );
  }
}
