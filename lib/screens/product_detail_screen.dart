import 'dart:async';

import 'package:flutter/material.dart';

import '../services/matomo_tracker.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../widgets/app_image.dart';
import '../widgets/fullscreen_image_viewer.dart';
import '../widgets/halal_badge.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../cart/cart_store.dart';
import '../cart/saved_products_store.dart';
import '../config.dart';
import '../domain/choice_pricing.dart';
import '../domain/description_parser.dart';
import '../domain/product_choices.dart'
    show ProductChoiceConfiguration, hasHalalChoice;
import '../domain/rental_calendar.dart';
import '../domain/rentals.dart';
import '../domain/stay_listing.dart';
import '../domain/seller_display.dart';
import '../domain/similar_products.dart';
import '../models/product.dart' show Product;
import '../models/product_detail.dart';
import '../theme.dart';
import 'checkout_screen.dart';
import 'seller_profile_screen.dart';
import '../widgets/error_text.dart';
import '../widgets/skeleton_loader.dart';
import '../widgets/navigation_boundary.dart';
import '../widgets/rental_date_range_calendar.dart';
import '../widgets/rental_location_sheet.dart';
import '../widgets/share_kit/share_sheets.dart';

/// Product detail screen (`/api/v1/displayItem/itemDetails/{id}`). Shows the
/// images, price, seller, description, delivery info, and action bar.
// ---- The purchase path -----------------------------------------------------
// One path for every Add to cart / Buy now in the app. The product page and
// the product cards (home rails, the marketplace grid and list) both go
// through these, so a listing cannot be bought one way from a card and
// another way from its own page.

/// The value recorded for each attribute: the only value of a fixed one, the
/// buyer's pick when it is still offered, else the listing's default.
///
/// An optional attribute with no pick and no default is left out, as the web
/// leaves it out (`resolveProductChoiceValue`). It used to fall back to the
/// first value, which recorded an extra the buyer never chose and, once
/// priced choices reprice the line, would have charged for it.
List<SelectedChoice> resolveSelectedChoices(
        ProductDetail d, Map<int, String> picked) =>
    [
      for (final c in d.choiceAttributes)
        if (_resolveChoiceValueId(c, picked) case final valueId?)
          SelectedChoice(definitionId: c.definitionId, valueId: valueId),
    ];

String? _resolveChoiceValueId(ChoiceAttribute c, Map<int, String> picked) {
  final active = c.activeValues;
  if (active.isEmpty) return null;
  if (active.length == 1) return active.first.id;
  final choice = picked[c.definitionId];
  if (choice != null && active.any((v) => v.id == choice)) return choice;
  final fallback = c.defaultValueId;
  if (fallback != null && active.any((v) => v.id == fallback)) return fallback;
  return null;
}

/// Web `getRentalTimeDetails`: pickup/return (or check-in/checkout) times
/// come from the listing's choice attributes, not from a time picker.
({String? pickupTime, String? returnTime}) rentalTimesFor(
    ProductDetail d, List<SelectedChoice> choices) {
  String? valueFor(Set<String> names) {
    for (final choice in choices) {
      for (final a in d.choiceAttributes) {
        if (a.definitionId != choice.definitionId) continue;
        if (!names.contains(a.name.trim().toLowerCase())) continue;
        for (final v in a.activeValues) {
          if (v.id == choice.valueId) return v.label;
        }
      }
    }
    return null;
  }

  return (
    pickupTime: valueFor(const {'pickup time', 'check-in time', 'checkin time'}),
    returnTime:
        valueFor(const {'return time', 'checkout time', 'check-out time'}),
  );
}

/// The AU-018 gate order shared by the sheet and the direct path:
/// own item → out of stock → signed in.
bool purchaseAllowed(BuildContext context, ProductDetail d,
    {required int? viewerUserId}) {
  final messenger = ScaffoldMessenger.of(context);
  if (viewerUserId != null && d.sellerId != null && viewerUserId == d.sellerId) {
    messenger.showSnackBar(const SnackBar(
      content: Text(
          'You cannot add your own listed items to the cart. Please browse other products from the community!'),
    ));
    return false;
  }
  if (d.isOutOfStock) {
    messenger.showSnackBar(
        const SnackBar(content: Text('This item is currently out of stock.')));
    return false;
  }
  final token = AuthStore.instance?.token;
  if (AuthStore.instance == null || token == null || token.isEmpty) {
    messenger.showSnackBar(const SnackBar(
      content: Text(
          'Login Required — please login to access this feature or create an account to get started!'),
    ));
    return false;
  }
  return true;
}

bool addDetailToCart(
BuildContext context,
ProductDetail d, {
required int? viewerUserId,
required bool buyNow,
required int quantity,
required List<SelectedChoice> choices,
RentalBooking? rentalBooking,
double? unitPrice,
}) {
  final messenger = ScaffoldMessenger.of(context);
  final navigator = Navigator.of(context);

  // Own item: never purchasable (web copy verbatim).
  if (viewerUserId != null &&
      d.sellerId != null &&
      viewerUserId == d.sellerId) {
    messenger.showSnackBar(const SnackBar(
      content: Text(
          'You cannot add your own listed items to the cart. Please browse other products from the community!'),
    ));
    return false;
  }
  // Out of stock: purchase buttons disabled AND this backstop toasts.
  if (d.isOutOfStock) {
    messenger.showSnackBar(const SnackBar(
        content: Text('This item is currently out of stock.')));
    return false;
  }
  // Sign-in gate: buying requires a signed-in account (canUserBuy parity —
  // verification NEVER blocks buying, only selling/contacting).
  // AU-016 skeptic fix (expired-token-silent-noop): an EMPTY OR BLANK token
  // counts as signed-out here; a truly expired JWT surfaces on the next API
  // call via AuthStore.handleUnauthorized instead of writing nothing quietly.
  final token = AuthStore.instance?.token;
  if (AuthStore.instance == null || token == null || token.isEmpty) {
    messenger.showSnackBar(const SnackBar(
      content: Text(
          'Login Required — please login to access this feature or create an account to get started!'),
    ));
    return false;
  }

  // AU-016 web parity (product-actions handleAddToCart): a rental MUST have
  // a COMPLETE picked range before add/buy; the booking rides the cart line.
  // The booking sheet only returns complete ranges; this is the backstop.
  final booking = rentalBooking;
  if (d.rentalConfiguration != null &&
      (booking == null || !booking.isComplete)) {
    messenger.showSnackBar(const SnackBar(
        content: Text('Select your rental dates to continue.')));
    return false;
  }

  final err = CartStore.instance.addDetail(
    productId: d.productId,
    sellerId: d.sellerId?.toString(),
    sellerName: d.sellerName,
    title: d.productName,
    // Web `completeChoicePurchase`: a rental line is priced at the booking's
    // total (quantity 1), a priced choice at its repriced unit.
    price: booking?.sellingTotal ?? unitPrice ?? d.productAskingPrice,
    originalPrice: d.productOriginalPrice,
    imageUrl: d.productImages.isNotEmpty ? d.productImages.first : null,
    condition: d.productCondition,
    category: d.categoryName,
    location: d.locationLabel,
    isVerified: false,
    currency: d.productCurrency,
    maxQuantity: d.productQuantity > 0 ? d.productQuantity : null,
    productionTimeDays: d.productionTimeDays,
    quantity: d.rentalConfiguration != null ? 1 : quantity,
    choices: choices,
    rentalBooking: booking,
  );
  if (err != null) {
    messenger.showSnackBar(SnackBar(content: Text(err)));
    return false;
  }
  if (buyNow) {
    navigator.push(MaterialPageRoute(
        settings: const RouteSettings(name: '/checkout?buyNow=1'),
        builder: (_) => const CheckoutScreen()));
  } else {
    // Reference copy (product-actions.tsx): "Added to cart".
    messenger.showSnackBar(const SnackBar(content: Text('Added to cart')));
  }
  return true;
}

class ProductDetailScreen extends StatefulWidget {
  const ProductDetailScreen(
      {super.key,
      required this.productId,
      this.api,
      this.initial,
      this.initialStayDates = StayDates.none});
  final int productId;
  final ApiClient? api;

  /// Check-in / checkout carried from a Short Stays search
  /// (`?checkIn=&checkOut=`): the booking sheet opens with them picked.
  final StayDates initialStayDates;

  /// Optional product summary to render immediately while detail loads.
  final Product? initial;

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  final SavedProductsStore _saved = SavedProductsStore.instance;
  late final ApiClient _api = widget.api ?? ApiClient();
  // Never completes: a loading placeholder until viewer resolution finishes
  // and the real detail load starts (the hidden-listing guard needs the
  // viewer id/role first). Replaced by setState in initState.
  Future<ProductDetail> _future = Completer<ProductDetail>().future;
  final Map<int, String> _choiceValues = {}; // definitionId -> valueId
  int _qty = 1;

  // AU-013 click stats (web parity: clickStats state on /product/[id]).
  ProductClickStats _clickStats = const ProductClickStats(total: 0, unique: 0);

  // Per-viewer analytics — only an admin (or, per the web app, the owner via
  // aggregate-only panel) gets data; the backend 403s everyone else.
  ProductClickAnalytics? _listingViewers;

  String? get _token => AuthStore.instance?.token;

  /// Resolved once per screen from `/userManagement/user-details` — the JWT
  /// carries no role claim (sandbox-proven), so admin status comes from the
  /// roles array like the web (`isAdminUser`).
  bool? _viewerIsAdmin;
  int? _viewerUserId;
  /// What travels to the cart line. Fixed attributes are included, exactly as
  /// the web's `buildSelectedChoiceSnapshot` includes them — they are part of
  /// what was bought even though the buyer never picked them.
  ///
  /// Resolution stays inside the ACTIVE values (web
  /// `resolveProductChoiceValue`): a value the seller switched off must never
  /// be the one the order records.
  List<SelectedChoice> _makeChoices(ProductDetail d) =>
      resolveSelectedChoices(d, _choiceValues);

  /// Web parity `product-actions.tsx` `handleAddToCart` / `handleBuyNow`:
  /// when the listing has something for the buyer to choose, the button
  /// opens the options sheet instead of acting, and the sheet's own buttons
  /// finish the job. A listing with nothing to choose goes straight through.
  ///
  /// Returns false from the button so the dock does not treat opening the
  /// sheet as a completed add; the sheet reports its own result.
  bool _startPurchase(BuildContext context, ProductDetail d,
      {required bool buyNow}) {
    // Web: a rental always opens the sheet — its dates are picked there.
    if (d.rentalConfiguration == null &&
        !d.choiceAttributes.any((a) => a.buyerSelectable)) {
      return _addToCart(context, d, buyNow: buyNow);
    }
    // The guards run before the sheet opens, as the web runs them before it
    // sets `choiceSelectorOpen`: an out-of-stock or signed-out buyer gets the
    // toast, not a sheet they cannot use.
    if (!_purchaseAllowed(context, d)) return false;
    unawaited(() async {
      final result = await showProductChoiceSheet(
        context,
        detail: d,
        initialChoices: _choiceValues,
        initialQuantity: _qty,
        initialDates: widget.initialStayDates,
        api: _api,
      );
      if (result == null || !context.mounted) return;
      setState(() {
        _choiceValues.addAll(result.choices);
        _qty = result.quantity;
      });
      addDetailToCart(context, d,
          viewerUserId: _viewerUserId,
          buyNow: result.buyNow,
          quantity: result.quantity,
          choices: _makeChoices(d),
          rentalBooking: result.rentalBooking,
          unitPrice: result.unitPrice);
    }());
    return false;
  }

  /// The AU-018 gate order shared by the sheet and the direct path:
  /// own item → out of stock → signed in.
  bool _purchaseAllowed(BuildContext context, ProductDetail d) =>
      purchaseAllowed(context, d, viewerUserId: _viewerUserId);

  /// Add the open listing to the cart, carrying seller + stock metadata so
  /// checkout can group lines per seller and quote delivery once per group
  /// (web parity `productToCartItem` in lib/cart-utils.ts).
  ///
  /// AU-018 reference guard order (product-actions.tsx handleAddToCart):
  /// own-item → out-of-stock → sign-in gate. Over-cap requests are REJECTED
  /// with the reference toast copy ("Only N units are available...").
  bool _addToCart(BuildContext context, ProductDetail d,
      {required bool buyNow}) =>
      addDetailToCart(context, d,
          viewerUserId: _viewerUserId,
          buyNow: buyNow,
          quantity: _qty,
          choices: _makeChoices(d));

  @override
  void initState() {
    super.initState();
    // The hidden-listing guard needs the viewer's id/role BEFORE the detail
    // is evaluated (web resolves the session first in /product/[id]), so the
    // viewer resolution gates the first load; anonymous viewers resolve
    // instantly and the load starts immediately.
    _resolveViewer().whenComplete(() {
      if (!mounted) return;
      final f = _loadDetail();
      // FutureBuilder below consumes this error and renders the not-found UI;
      // .ignore() only stops the "unhandled async error" path when the error
      // lands before the builder subscribes.
      f.ignore();
      setState(() {
        _future = f;
      });
    });
  }

  /// AU-013: resolve the signed-in viewer's id + admin role from
  /// `/api/v1/userManagement/user-details`. The JWT carries no role claim
  /// (sandbox-proven), so admin status must come from the roles array like
  /// the web (`isAdminUser`). Typed wrappers live in this file because no
  /// other lane owns the user-details endpoint. Goes through the injected
  /// [_api] client so tests (and any interceptor) see it like every call.
  Future<Map<String, dynamic>> _fetchUserDetails(String token) =>
      _api.getUserDetails(token);

  Future<void> _resolveViewer() async {
    final token = _token;
    if (token == null || token.isEmpty) return;
    try {
      final resp = await _fetchUserDetails(token);
      if (!mounted) return;
      setState(() {
        _viewerUserId = (resp['userId'] as num?)?.toInt();
        final roles = resp['roles'];
        _viewerIsAdmin = roles is List &&
            roles.any((r) => r is Map && r['roleName'] == 'ADMIN');
      });
    } catch (_) {
      // Viewer stays unknown → treated as anonymous by the guard.
    }
  }

  /// Detail load with the AU-013 hidden-listing guard. Mirrors the web
  /// /product/[id] flow: fetch itemDetails; when the listing is not public
  /// (`deliverySetupReady === false` and not public-ready), only its owner or
  /// an admin may see it — everyone else gets "Product not found".
  Future<ProductDetail> _loadDetail() async {
    ProductDetail d;
    try {
      d = await _api.fetchProductDetail(widget.productId, token: _token);
      MatomoTracking.instance.trackProductView(
          productId: d.productId,
          productName: d.productName,
          categoryName: d.categoryName,
          price: d.productAskingPrice);

    } on ApiException catch (e) {
      // 404 from itemDetails: try the owner fallback — the listing may be an
      // unlisted/incomplete item the signed-in viewer owns (web parity: the
      // catch-block user-listings search on /product/[id]).
      if (e.message.contains('404') && _viewerUserId != null) {
        final mine = await _findInMyListings();
        if (mine != null) return mine;
      }
      rethrow;
    }
    if (!_isPrivilegedViewer()) {
      if (d.requiresPrivilegedViewer) {
        throw ApiException('Product not found', unauthorized: false);
      }
    }
    _trackOpen(d.productId);
    return d;
  }

  /// Admin OR the listing's own seller (web `canInspectHiddenProduct`).
  bool _isPrivilegedViewer([ProductDetail? d]) {
    if (_viewerIsAdmin == true) return true;
    final uid = _viewerUserId;
    if (uid == null) return false;
    if (d != null) {
      return (d.sellerUserId != null && d.sellerUserId == uid) ||
          (d.sellerId != null && d.sellerId == uid);
    }
    return false;
  }

  /// Web parity: when itemDetails 404s, look for the product in the signed-in
  /// user's own listings (it might be unlisted/out of stock and owned by them).
  Future<ProductDetail?> _findInMyListings() async {
    final token = _token;
    if (token == null || token.isEmpty) return null;
    try {
      final me = await _fetchUserDetails(token);
      final products = me['products'];
      Map<String, dynamic>? mine;
      if (products is List) {
        for (final p in products) {
          if (p is! Map) continue;
          final pid = (p['productId'] as num?)?.toInt();
          if (pid == widget.productId) {
            mine = p.cast<String, dynamic>();
            break;
          }
        }
      }
      if (mine == null) return null;
      final d = ProductDetail.fromJson(mine);
      _trackOpen(d.productId);
      return d;
    } catch (_) {
      return null;
    }
  }

  /// Fire-and-forget tracking — must never block or fail rendering:
  /// POST clicks (+ refresh totals/unique), then admin analytics panel data.
  Future<void> _trackOpen(int productId) async {
    final token = _token;
    try {
      await _api.trackProductClick(productId, token: token);
    } catch (_) {}
    try {
      final total =
          _api.fetchProductTotalClicks(productId).catchError((_) => 0);
      final unique =
          _api.fetchProductUniqueViews(productId).catchError((_) => 0);
      final results = await Future.wait([total, unique]);
      if (!mounted) return;
      setState(() => _clickStats =
          ProductClickStats(total: results[0], unique: results[1]));
    } catch (_) {}
    if (token != null && token.isNotEmpty) {
      try {
        final analytics =
            await _api.fetchProductClickAnalytics(productId, token);
        if (!mounted) return;
        setState(() => _listingViewers = analytics);
      } catch (_) {
        if (!mounted) return;
        setState(() => _listingViewers = const ProductClickAnalytics());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ProductDetail>(
      future: _future,
      builder: (context, snap) {
        Widget body;
        if (snap.connectionState == ConnectionState.waiting) {
          body = const SkeletonPage();
        } else if (snap.hasError) {
          final error = snap.error;
          // AU-013 hidden-guard failure: reference copy is "Product not found"
          // with only a Back to Browse action — no commerce UI (dead buttons).
          // The backend ALSO 404s hidden listings directly (anon on a
          // delivery-not-ready fixture returns {"message":"Product not found"}),
          // so any not-found-flavoured failure renders the same not-found UI —
          // never the generic loader-error copy.
          final msg = error.toString().toLowerCase();
          final notFound = error is ApiException &&
              (error.message.toLowerCase().contains('product not found') ||
                  msg.contains('404'));
          if (notFound) {
            body = _ProductNotFound(onBackToBrowse: () {
              // Prefer the app router; fall back to the navigator when the
              // screen is hosted outside it (tests, embeds).
              try {
                GoRouter.of(context).go('/browse');
              } catch (_) {
                Navigator.of(context).maybePop();
              }
            });
          } else {
            body = Center(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                    'Could not load product: ${friendlyApiError(snap.error)}',
                    textAlign: TextAlign.center),
              ),
            );
          }
        } else {
          final d = snap.data!;
          body = _Detail(
            d,
            qty: _qty,
            // AU-014: the stepper never exceeds live stock — the + button is
            // disabled at the cap and this clamp backstops programmatic paths.
            onQty: (q) => setState(() {
              final d = snap.data;
              final cap = (d != null && snap.hasData) ? d.stockCap : 999;
              _qty = q.clamp(1, cap < 1 ? 1 : cap);
            }),
            clickStats: _clickStats,
            listingViewers: _listingViewers,
            isOwnProduct: _viewerIsAdmin != true && _isPrivilegedViewer(d),
            reviewsApi: _api,
          );
        }
        return Scaffold(
          backgroundColor: AppPalette.of(context).background,
          body: Stack(children: [
            Positioned.fill(child: body),
            if (snap.hasData)
              Positioned(
                left: 20,
                right: 20,
                top: 18,
                child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _ImageOverlayButton(
                        icon: Icons.arrow_back_rounded,
                        tooltip: 'Back',
                        onPressed: () => NavigationBoundary.back(
                          context,
                          fallbackLocation: '/browse',
                        ),
                      ),
                      _ImageOverlayButton(
                        icon: Icons.share_outlined,
                        tooltip: 'Share',
                        onPressed: () =>
                            _showProductShareSheet(context, snap.data),
                      ),
                    ]),
              ),
          ]),
          // Web parity: on a failed/missing product the reference shows only the
          // error message + "Back to Browse" — no commerce actions (dead buttons).
          bottomNavigationBar: snap.hasError
              ? null
              : _BottomBar(
                  saved: _saved.isSaved(widget.productId),
                  outOfStock: snap.data?.isOutOfStock ?? false,
                  isRental: snap.data?.rentalConfiguration != null,
                  onReserveDates: snap.data != null &&
                          snap.data!.rentalConfiguration != null &&
                          _isOwnListing(snap.data!)
                      ? () => context.push(
                          '/listing/${snap.data!.productId}/availability'
                          '?title=${Uri.encodeQueryComponent(snap.data!.productName)}')
                      : null,
                  onShowMap: snap.data != null &&
                          snap.data!.rentalConfiguration != null &&
                          snap.data!.hasValidCoordinates
                      ? () => showRentalLocationSheet(context,
                          productName: snap.data!.productName,
                          latitude: snap.data!.latitude!,
                          longitude: snap.data!.longitude!)
                      : null,
                  onToggleSave: () => _toggleSave(),
                  onAddToCart: () {
                    final d = snap.data;
                    if (d == null) return false;
                    return _startPurchase(context, d, buyNow: false);
                  },
                  onBuyNow: () {
                    final d = snap.data;
                    if (d == null) return false;
                    return _startPurchase(context, d, buyNow: true);
                  },
                ),
        );
      },
    );
  }

  /// The Share Kit (web `ShareProductModal`): branded pictures with a QR
  /// back to the listing, plus the caption and tracked link. The seller's own
  /// listing also offers the printable QR poster.
  bool _isOwnListing(ProductDetail d) {
    final uid = _viewerUserId;
    return uid != null &&
        ((d.sellerUserId ?? d.sellerId) == uid || d.sellerId == uid);
  }

  void _showProductShareSheet(BuildContext context, ProductDetail? d) {
    if (d == null) return;
    final uid = _viewerUserId;
    final isOwner = _isOwnListing(d);
    showProductShareKit(context,
        detail: d, isOwner: isOwner, sharerId: uid);
  }

  /// AU-050: real wishlist toggle — POST/DELETE /api/saved-products/{id};
  /// requires login like the reference.
  Future<void> _toggleSave() async {
    final auth = AuthStore.instance;
    final token = auth?.token;
    if (token == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Log in to save items to your wishlist.')));
      return;
    }
    try {
      await _saved.toggle(widget.productId, token);
      if (!mounted) return;
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(_saved.isSaved(widget.productId)
            ? 'Saved to your wishlist.'
            : 'Removed from your wishlist.'),
      ));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(friendlyApiError(e))));
    }
  }
}

class _ImageOverlayButton extends StatelessWidget {
  const _ImageOverlayButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });
  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Material(
        color: AppPalette.of(context).surface.withValues(alpha: .94),
        elevation: 3,
        shadowColor: Colors.black26,
        shape: const CircleBorder(),
        child: IconButton(
          tooltip: tooltip,
          onPressed: onPressed,
          icon: Icon(icon, color: AppPalette.of(context).textPrimary),
        ),
      );
}

class _Detail extends StatelessWidget {
  final ProductDetail d;
  final int qty;
  final ValueChanged<int> onQty;

  /// AU-013: aggregate click stats + privileged per-viewer analytics.
  final ProductClickStats clickStats;
  final ProductClickAnalytics? listingViewers;

  /// True when the signed-in viewer owns this listing but is not an admin
  /// (web parity: owner sees aggregate totals only, never identities).
  final bool isOwnProduct;

  /// AU-017: client used to fetch the seller's public ratings.
  final ApiClient reviewsApi;

  const _Detail(this.d,
      {this.qty = 1,
      required this.onQty,
      this.clickStats = const ProductClickStats(total: 0, unique: 0),
      this.listingViewers,
      this.isOwnProduct = false,
      required this.reviewsApi});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppPalette.of(context).surfaceMuted, AppPalette.of(context).infoFill],
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 112),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ImageCarousel(d),
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: _webSurfaceDecoration(context, 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(d.productName,
                              style: const TextStyle(
                                  fontFamily: 'Lexend',
                                  fontSize: 20,
                                  height: 1.18,
                                  fontWeight: FontWeight.w700)),
                          if (d.rentalConfiguration != null) ...[
                            const SizedBox(height: 8),
                            RentalAvailabilityLine(
                                productId: d.productId, api: reviewsApi),
                          ],
                          const SizedBox(height: 10),
                          _SellerCard(d, api: reviewsApi),
                          const SizedBox(height: 8),
                          Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('📍',
                                    style:
                                        TextStyle(fontSize: 16, height: 1.1)),
                                const SizedBox(width: 5),
                                Expanded(
                                  child: Text(d.locationLabel,
                                      style: TextStyle(
                                          fontSize: 13,
                                          color: AppPalette.of(context).textSecondary)),
                                ),
                              ]),
                          const SizedBox(height: 12),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [AppPalette.of(context).infoFill, AppPalette.of(context).infoFill],
                              ),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (d.productAskingPrice > 0)
                                    Text(
                                        Product.formatPrice(
                                            d.productAskingPrice),
                                        style: const TextStyle(
                                            fontFamily: 'Lexend',
                                            fontSize: 28,
                                            height: 1.05,
                                            fontWeight: FontWeight.w900,
                                            color: AppColors.price)),
                                  if (d.productOriginalPrice != null &&
                                      d.productOriginalPrice! >
                                          d.productAskingPrice) ...[
                                    const SizedBox(height: 5),
                                    Row(children: [
                                      Text(
                                          Product.formatPrice(
                                              d.productOriginalPrice!),
                                          style: TextStyle(
                                              color: AppPalette.of(context).textSecondary,
                                              decoration:
                                                  TextDecoration.lineThrough)),
                                      const SizedBox(width: 8),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 7, vertical: 3),
                                        decoration: BoxDecoration(
                                          color: AppPalette.of(context).successFill,
                                          borderRadius:
                                              BorderRadius.circular(6),
                                        ),
                                        child: Text(
                                          '${(((d.productOriginalPrice! - d.productAskingPrice) / d.productOriginalPrice!) * 100).round()}% OFF',
                                          style: TextStyle(
                                              color: AppPalette.of(context).successText,
                                              fontWeight: FontWeight.w700,
                                              fontSize: 11),
                                        ),
                                      ),
                                    ]),
                                  ],
                                  if (clickStats.total > 0 ||
                                      d.clickCount > 0) ...[
                                    const SizedBox(height: 9),
                                    Row(children: [
                                      Icon(Icons.visibility_outlined,
                                          size: 16, color: AppPalette.of(context).accentInk),
                                      const SizedBox(width: 5),
                                      Text(
                                          '${clickStats.total > 0 ? clickStats.total : d.clickCount.toInt()} total views',
                                          style: TextStyle(
                                              fontSize: 13,
                                              fontWeight: FontWeight.w600,
                                              color: AppPalette.of(context).accentInk)),
                                    ]),
                                  ],
                                ]),
                          ),
                          const SizedBox(height: 14),
                          // Rentals have no quantity: their dates are picked in
                          // the booking sheet "Book now" opens (web parity).
                          if (d.rentalConfiguration == null) ...[
                            const Divider(height: 24),
                            // AU-014 web parity (components/product-actions.tsx): the +
                            // button is disabled at the stock cap, and a "{n} available
                            // · {sold} sold" readout sits under the stepper when stock
                            // is known.
                            Row(children: [
                              const Text('Quantity',
                                  style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600)),
                              const Spacer(),
                              _QuantityControl(
                                quantity: qty,
                                canDecrease: qty > 1,
                                canIncrease: d.stockCap > 0 && qty < d.stockCap,
                                onDecrease: () => onQty(qty - 1),
                                onIncrease: () => onQty(qty + 1),
                              ),
                              if (d.productQuantity > 0) ...[
                                const SizedBox(width: 12),
                                // Flexible, not bare: at a large system font
                                // (or a narrow handset) this readout is what
                                // pushed the row past the card's edge.
                                Flexible(
                                  child: Text(
                                      '${d.productQuantity} available'
                                      '${d.soldQuantity > 0 ? ' · ${d.soldQuantity} sold' : ''}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      textAlign: TextAlign.right,
                                      style: TextStyle(
                                          fontSize: 13,
                                          color: AppPalette.of(context)
                                              .textSecondary)),
                                ),
                              ],
                            ]),
                          ],
                          const SizedBox(height: 16),
                          const _DeliveryPromise(),
                          // AU-013 "Who viewed this listing": admins get the per-viewer
                          // breakdown (identities are backend-gated), the non-admin
                          // owner gets aggregate totals only, everyone else nothing.
                          _ViewersPanel(
                            viewers: listingViewers?.viewers ?? const [],
                            isAdmin: listingViewers != null &&
                                listingViewers!.viewers.isNotEmpty,
                            isOwnProduct: isOwnProduct,
                            clickStats: clickStats,
                          ),
                          if (d.whatsappNumber != null &&
                              d.whatsappNumber!.isNotEmpty)
                            _WhatsAppRow(d.whatsappNumber!),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    _ProductInfoTabs(d: d, api: reviewsApi),
                    const SizedBox(height: 24),
                    const Text('You Might Also Like',
                        style: TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 16),
                    _RelatedRail(
                      current: Product(
                        productId: d.productId,
                        productName: d.productName,
                        productDescription: d.productDescription,
                        productAskingPrice: d.productAskingPrice,
                        categoryName: d.categoryName,
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ],
          ),
        ));
  }
}

BoxDecoration _webSurfaceDecoration(BuildContext context, double radius) =>
    BoxDecoration(
      color: AppPalette.of(context).surface,
      borderRadius: BorderRadius.circular(radius),
      boxShadow: const [
        BoxShadow(
          color: Color(0x1A0F172A),
          blurRadius: 18,
          offset: Offset(0, 6),
        ),
      ],
    );

class _QuantityControl extends StatelessWidget {
  const _QuantityControl({
    required this.quantity,
    required this.canDecrease,
    required this.canIncrease,
    required this.onDecrease,
    required this.onIncrease,
  });
  final int quantity;
  final bool canDecrease;
  final bool canIncrease;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;

  @override
  Widget build(BuildContext context) => Container(
        height: 54,
        decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          border: Border.all(color: AppPalette.of(context).borderStrong),
          borderRadius: BorderRadius.circular(12),
        ),
        clipBehavior: Clip.antiAlias,
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          _segment(context, Icons.remove, canDecrease ? onDecrease : null),
          Container(
            width: 52,
            height: double.infinity,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              border: Border.symmetric(
                  vertical: BorderSide(color: AppPalette.of(context).border)),
            ),
            child: Text('$quantity',
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ),
          _segment(context, Icons.add, canIncrease ? onIncrease : null),
        ]),
      );

  Widget _segment(
          BuildContext context, IconData icon, VoidCallback? onPressed) =>
      SizedBox(
        width: 52,
        height: 54,
        child: IconButton(
          onPressed: onPressed,
          icon: Icon(icon, size: 20),
          color: AppPalette.of(context).textSecondary,
          disabledColor: AppPalette.of(context).textMuted,
        ),
      );
}

class _DeliveryPromise extends StatelessWidget {
  const _DeliveryPromise();

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppPalette.of(context).infoFill,
          border: Border.all(color: AppPalette.of(context).infoFill),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(children: [
          SizedBox(
              width: 56,
              height: 56,
              child: Icon(Icons.local_shipping_outlined,
                  size: 38, color: AppPalette.of(context).accentInk)),
          SizedBox(width: 12),
          Expanded(
              child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('We handle delivery',
                  style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppPalette.of(context).textPrimary)),
              SizedBox(height: 4),
              Text('Fast. Safe. Reliable. Efficient',
                  style: TextStyle(fontSize: 14, color: AppPalette.of(context).textSecondary)),
            ],
          )),
        ]),
      );
}

class _ProductInfoTabs extends StatefulWidget {
  const _ProductInfoTabs({required this.d, required this.api});
  final ProductDetail d;
  final ApiClient api;

  @override
  State<_ProductInfoTabs> createState() => _ProductInfoTabsState();
}

class _ProductInfoTabsState extends State<_ProductInfoTabs> {
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    final d = widget.d;
    final parsed = parseProductDescription(d.productDescription);
    final labels = <String>['Description', 'Specs', 'Reviews'];
    final body = switch (_selected) {
      0 => _Section(
          'Product Description',
          parsed.description.isNotEmpty
              ? parsed.description
              : 'No description available for this product.',
        ),
      1 => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Technical Specifications',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          _specRow('Category', d.categoryName ?? 'Not specified'),
          if (d.productionTimeDays > 0)
            _specRow('Production time',
                'Up to ${d.productionTimeDays} calendar day${d.productionTimeDays == 1 ? '' : 's'}'),
          for (final entry in parsed.specifications.entries)
            _specRow(entry.key, entry.value),
          // Web parity `ProductAttributeDetails`: every configured attribute
          // that still has an active value belongs here — the fixed ones as
          // plain facts, the selectable ones listed with the note that the
          // pick happens at purchase.
          for (final attribute in d.choiceAttributes)
            if (attribute.activeValues.isNotEmpty)
              _specRow(
                attribute.name,
                attribute.activeValues.map((v) => v.label).join(', '),
                note: attribute.buyerSelectable ? 'Choose when purchasing' : null,
              ),
          if (parsed.specifications.isEmpty &&
              d.productionTimeDays <= 0 &&
              !d.choiceAttributes.any((a) => a.activeValues.isNotEmpty))
            Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(
                child: Text('No detailed specifications available.',
                    style: TextStyle(color: AppPalette.of(context).textSecondary)),
              ),
            ),
        ]),
      _ => _ReviewsSection(
          api: widget.api,
          sellerUserId: d.sellerUserId ?? d.sellerId,
          totalRatingsCount: d.totalRatingsCount,
          averageRating: d.averageRating,
        ),
    };
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(
              color: Color(0x120F172A), blurRadius: 18, offset: Offset(0, 6)),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: AppPalette.of(context).surfaceMuted,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(children: [
            for (var i = 0; i < labels.length; i++)
              Expanded(
                child: InkWell(
                  onTap: () => setState(() => _selected = i),
                  borderRadius: BorderRadius.circular(9),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: _selected == i
                          ? AppPalette.of(context).surface
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(9),
                      boxShadow: _selected == i
                          ? const [
                              BoxShadow(color: Color(0x140F172A), blurRadius: 5)
                            ]
                          : null,
                    ),
                    alignment: Alignment.center,
                    child: Text(labels[i],
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: _selected == i
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: _selected == i
                                ? AppPalette.of(context).textPrimary
                                : AppPalette.of(context).textSecondary)),
                  ),
                ),
              ),
          ]),
        ),
        const SizedBox(height: 16),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: KeyedSubtree(key: ValueKey(_selected), child: body),
        ),
      ]),
    );
  }

  Widget _specRow(String label, String value, {String? note}) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppPalette.of(context).background,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
                child: Text(label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 13))),
            const SizedBox(width: 12),
            Expanded(
                child: Text(value,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: 13,
                        color: AppPalette.of(context).textSecondary))),
          ]),
          if (note != null) ...[
            const SizedBox(height: 4),
            Text(note,
                textAlign: TextAlign.right,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppPalette.of(context).textMuted)),
          ],
        ]),
      );
}

/// Web `RentalListingAvailability`: one line under a rental's title —
/// "Available", or "Available from 12 November 2026" while it is booked
/// today. The booking calendar stays the place to pick dates.
class RentalAvailabilityLine extends StatefulWidget {
  const RentalAvailabilityLine({super.key, required this.productId, this.api});
  final int productId;
  final ApiClient? api;

  @override
  State<RentalAvailabilityLine> createState() => _RentalAvailabilityLineState();
}

class _RentalAvailabilityLineState extends State<RentalAvailabilityLine> {
  late final Future<RentalAvailability?> _load =
      (widget.api ?? ApiClient()).fetchRentalAvailability(widget.productId);

  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December',
  ];

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return FutureBuilder<RentalAvailability?>(
      future: _load,
      builder: (context, snap) {
        final loading = snap.connectionState != ConnectionState.done;
        final a = snap.data;
        final from = a?.availableFrom;
        final String text;
        final IconData icon;
        if (loading) {
          text = 'Checking availability...';
          icon = Icons.hourglass_empty_rounded;
        } else if (a == null) {
          text = 'Availability could not be checked';
          icon = Icons.event_busy_outlined;
        } else if (a.bookedToday) {
          text = from == null
              ? 'Currently unavailable'
              : 'Available from ${from.day} ${_months[from.month - 1]} ${from.year}';
          icon = Icons.event_repeat_outlined;
        } else {
          text = 'Available';
          icon = Icons.event_available_outlined;
        }
        return Row(
          key: const ValueKey('rental-availability-status'),
          children: [
            Icon(icon, size: 16, color: palette.textSecondary),
            const SizedBox(width: 6),
            Expanded(
              child: Text(text,
                  style: const TextStyle(
                      fontSize: 13.5, fontWeight: FontWeight.w700)),
            ),
          ],
        );
      },
    );
  }
}

class _ImageCarousel extends StatefulWidget {
  final ProductDetail d;
  const _ImageCarousel(this.d);
  @override
  State<_ImageCarousel> createState() => _ImageCarouselState();
}

class _ImageCarouselState extends State<_ImageCarousel> {
  int _idx = 0;
  int _thumbnailPage = 0;
  final PageController _controller = PageController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final imgs = widget.d.productImages;
    if (imgs.isEmpty) {
      return Container(
          height: 280,
          decoration: _webSurfaceDecoration(context, 16),
          child: Icon(Icons.image_not_supported_outlined,
              size: 60, color: AppPalette.of(context).textSecondary));
    }
    final pageStart = _thumbnailPage * 14;
    final thumbnails = imgs.skip(pageStart).take(14).toList();
    final pageCount = (imgs.length / 14).ceil();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _webSurfaceDecoration(context, 16),
      child: Column(children: [
        Stack(children: [
          AspectRatio(
              aspectRatio: 4 / 3,
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      AppPalette.of(context).surfaceMuted,
                      AppPalette.of(context).border,
                    ],
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                clipBehavior: Clip.antiAlias,
                child: PageView.builder(
                  controller: _controller,
                  itemCount: imgs.length,
                  onPageChanged: (i) => setState(() {
                    _idx = i;
                    _thumbnailPage = i ~/ 14;
                  }),
                  // A-19: tapping a photo opens the fullscreen, dismissible preview
                  // (with a page counter — no pinch-zoom) at that image's position.
                  itemBuilder: (_, i) => GestureDetector(
                    onTap: () => showFullscreenImagePreview(
                      context,
                      urls: [
                        for (final img in imgs) AppConfig.resolveAssetUrl(img)
                      ],
                      initialIndex: i,
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: AppImage(AppConfig.resolveAssetUrl(imgs[i]),
                          fit: BoxFit.contain),
                    ),
                  ),
                ),
              )),
          // Web parity product-page-client.tsx: the detail-size Halal badge
          // at the photo's top-left.
          if (hasHalalChoice(ProductChoiceConfiguration.fromJson(
              widget.d.rawChoiceConfiguration)))
            const Positioned(left: 12, top: 12, child: HalalBadge(size: 48)),
          if (imgs.length > 1) ...[
            Positioned(
              left: 8,
              top: 0,
              bottom: 0,
              child: Center(
                  child: _GalleryArrow(
                icon: Icons.chevron_left,
                onTap: () => _controller.animateToPage(
                  (_idx - 1 + imgs.length) % imgs.length,
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                ),
              )),
            ),
            Positioned(
              right: 8,
              top: 0,
              bottom: 0,
              child: Center(
                  child: _GalleryArrow(
                icon: Icons.chevron_right,
                onTap: () => _controller.animateToPage(
                  (_idx + 1) % imgs.length,
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                ),
              )),
            ),
          ],
          Positioned(
            right: 10,
            bottom: 10,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: .72),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('${_idx + 1} / ${imgs.length}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700)),
            ),
          ),
        ]),
        // Web 2026-10: a property's photos come in named groups (Bedroom,
        // Kitchen…); a chip jumps to the first photo of its group.
        if (widget.d.photoGroups.isNotEmpty) ...[
          const SizedBox(height: 10),
          SizedBox(
            height: 34,
            child: ListView(
              key: const ValueKey('product-photo-groups'),
              scrollDirection: Axis.horizontal,
              children: [
                for (final g in widget.d.photoGroups)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        foregroundColor: AppPalette.of(context).textPrimary,
                        side: BorderSide(color: AppPalette.of(context).border),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(6)),
                      ),
                      onPressed: () => _controller.animateToPage(g.firstIndex,
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOutCubic),
                      child: Text(g.name,
                          style: const TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                  ),
              ],
            ),
          ),
        ],
        ...[
          const SizedBox(height: 10),
          GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 7,
                crossAxisSpacing: 5,
                mainAxisSpacing: 5,
              ),
              itemCount: thumbnails.length,
              itemBuilder: (_, localIndex) {
                final i = pageStart + localIndex;
                return InkWell(
                  onTap: () => _controller.animateToPage(i,
                      duration: const Duration(milliseconds: 220),
                      curve: Curves.easeOutCubic),
                  borderRadius: BorderRadius.circular(6),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).surfaceMuted,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color:
                            i == _idx ? AppColors.brandBlue : AppPalette.of(context).border,
                        width: i == _idx ? 2 : 1,
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: AppImage(AppConfig.resolveAssetUrl(imgs[i]),
                          fit: BoxFit.cover),
                    ),
                  ),
                );
              }),
          if (pageCount > 1) ...[
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                  pageCount,
                  (page) => GestureDetector(
                        onTap: () => setState(() => _thumbnailPage = page),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          width: 12,
                          height: 12,
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: page == _thumbnailPage
                                ? AppColors.brandBlue
                                : AppPalette.of(context).borderStrong,
                          ),
                        ),
                      )),
            ),
          ],
        ],
      ]),
    );
  }
}

class _GalleryArrow extends StatelessWidget {
  const _GalleryArrow({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: AppPalette.of(context).surface.withValues(alpha: .95),
        elevation: 4,
        shape: CircleBorder(side: BorderSide(color: AppPalette.of(context).border)),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 34,
            height: 34,
            child: Icon(icon, size: 21, color: AppPalette.of(context).textSecondary),
          ),
        ),
      );
}

/// Per-seller summary cache for the [ProductDetail] seller card (LISTIN-31):
/// the 'Verified' trust label is computed from the seller-summary heuristic
/// (web page.tsx:255-264) instead of a static label for every seller. Keyed by
/// seller id so the FutureBuilder's future stays stable across rebuilds.
final Map<int, Future<Map<String, dynamic>>> _sellerSummaryCache = {};

Future<Map<String, dynamic>> _summaryForSeller(ApiClient api, int sellerId) =>
    _sellerSummaryCache.putIfAbsent(sellerId, () async {
      try {
        return await api.fetchSellerSummary(sellerId);
      } catch (_) {
        return const <String, dynamic>{};
      }
    });

class _SellerCard extends StatelessWidget {
  final ProductDetail d;
  final ApiClient api;
  const _SellerCard(this.d, {required this.api});
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: d.sellerId != null
          ? () => Navigator.of(context).push(
                MaterialPageRoute(
                    settings: RouteSettings(name: '/seller/${d.sellerId}'),
                    builder: (_) => SellerProfileScreen(sellerId: d.sellerId!, api: api)),
              )
          : null,
      borderRadius: BorderRadius.circular(8),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: AppPalette.of(context).infoFill,
            foregroundImage: d.profileImageUrl?.trim().isNotEmpty == true
                ? NetworkImage(AppConfig.resolveAssetUrl(d.profileImageUrl!))
                : null,
            // A missing or broken photo falls back to the person icon.
            onForegroundImageError: d.profileImageUrl?.trim().isNotEmpty == true
                ? (_, __) {}
                : null,
            child: Icon(Icons.person, color: AppPalette.of(context).accentInk),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 6,
              runSpacing: 3,
              children: [
                Text(publicSellerName(d.sellerName, fallback: 'Seller'),
                    key: const ValueKey('product-seller-name'),
                    style: TextStyle(
                        color: d.sellerId != null
                            ? AppPalette.of(context).accentInk
                            : AppPalette.of(context).textPrimary,
                        decoration: d.sellerId != null
                            ? TextDecoration.underline
                            : null,
                        fontWeight: FontWeight.w600,
                        fontSize: 14)),
                if (d.sellerId != null)
                  FutureBuilder<Map<String, dynamic>>(
                    future: _summaryForSeller(api, d.sellerId!),
                    builder: (context, snap) {
                      if (snap.hasData &&
                          sellerVerifiedFromSummary(snap.data!)) {
                        return const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.verified_outlined,
                                  size: 16, color: Color(0xFF059669)),
                              SizedBox(width: 3),
                              Text('Verified',
                                  style: TextStyle(
                                      color: Color(0xFF059669),
                                      fontWeight: FontWeight.w600,
                                      fontSize: 12)),
                            ]);
                      }
                      return const SizedBox.shrink();
                    },
                  ),
                if (d.averageRating > 0)
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.star_rounded,
                        size: 14, color: Color(0xFFF59E0B)),
                    const SizedBox(width: 3),
                    Text(
                        '${d.averageRating.toStringAsFixed(1)} (${d.totalRatingsCount})',
                        style: TextStyle(
                            fontSize: 11.5,
                            color: AppPalette.of(context).textSecondary)),
                  ]),
              ],
            ),
          ),
          if (d.sellerId != null) ...[
            const SizedBox(width: 8),
            Icon(Icons.chevron_right_rounded,
                size: 20, color: AppPalette.of(context).accentInk),
          ],
        ],
      ),
    );
  }
}
/// AU-019: contact-seller WhatsApp row — renders ONLY when the listing has a
/// `whatsappNumber` (block hidden entirely otherwise). Opens wa.me chat.
class _WhatsAppRow extends StatelessWidget {
  final String number;
  const _WhatsAppRow(this.number);

  Future<void> _open(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final cleaned = number.replaceAll(RegExp(r'[^0-9]'), '');
    final uri = Uri.parse('https://wa.me/$cleaned');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) {
        messenger.showSnackBar(
            const SnackBar(content: Text('Could not open WhatsApp.')));
      }
    } catch (_) {
      messenger.showSnackBar(
          const SnackBar(content: Text('Could not open WhatsApp.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: OutlinedButton.icon(
        onPressed: () => _open(context),
        icon: const Icon(Icons.chat_bubble_outline, size: 18),
        label: Text('WhatsApp seller · $number',
            style: const TextStyle(fontSize: 13)),
      ),
    );
  }
}

/// AU-017: real seller reviews from the public `/user-ratings/{userId}`
/// endpoint (web parity: Reviews tab on /product/[id]). Count badge + average
/// summary like the reference; honest empty state; failures render an inline
/// error, never placeholder copy.
class _ReviewsSection extends StatefulWidget {
  final ApiClient api;
  final int? sellerUserId;
  final int totalRatingsCount;
  final double averageRating;
  const _ReviewsSection({
    required this.api,
    this.sellerUserId,
    this.totalRatingsCount = 0,
    this.averageRating = 0,
  });
  @override
  State<_ReviewsSection> createState() => _ReviewsSectionState();
}

class _ReviewsSectionState extends State<_ReviewsSection> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.sellerUserId == null
        ? Future.value(const <Map<String, dynamic>>[])
        : widget.api
            .fetchUserRatings(widget.sellerUserId!)
            .catchError((Object _) => const <Map<String, dynamic>>[]);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snap) {
        final rawRows = snap.data ?? const <Map<String, dynamic>>[];
        // A star rating contributes to the summary, but it is not a written
        // review. The public endpoint can also repeat a row through joined
        // order items, so keep one visible comment per stable rating identity.
        final seen = <String>{};
        final rows = rawRows.where((r) {
          final text =
              ((r['reviewText'] ?? r['comment'] ?? r['review']) as Object?)
                      ?.toString()
                      .trim() ??
                  '';
          if (text.isEmpty) return false;
          final key = (r['id'] ??
                  r['ratingId'] ??
                  '${r['reviewerId'] ?? r['userId'] ?? r['authorName']}|$text')
              .toString();
          return seen.add(key);
        }).toList();
        final hasSummary =
            widget.averageRating > 0 && widget.totalRatingsCount > 0;
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
              color: AppPalette.of(context).background,
              borderRadius: BorderRadius.circular(20)),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Seller reviews',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            if (hasSummary)
              Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                Text(widget.averageRating.toStringAsFixed(1),
                    style: const TextStyle(
                        fontSize: 36, height: 1, fontWeight: FontWeight.w800)),
                const SizedBox(width: 12),
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(
                      children: List.generate(
                          5,
                          (i) => Icon(
                              i < widget.averageRating.round()
                                  ? Icons.star_rounded
                                  : Icons.star_outline_rounded,
                              size: 19,
                              color: const Color(0xFFF59E0B)))),
                  const SizedBox(height: 2),
                  Text(
                      '${widget.totalRatingsCount} verified rating${widget.totalRatingsCount == 1 ? '' : 's'}',
                      style: TextStyle(
                          fontSize: 12, color: AppPalette.of(context).textSecondary)),
                ]),
              ])
            else
              Text('Feedback from people who bought from this seller.',
                  style:
                      TextStyle(fontSize: 13, color: AppPalette.of(context).textSecondary)),
            const SizedBox(height: 14),
            if (snap.connectionState == ConnectionState.waiting)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: ListRowsSkeleton(itemCount: 2),
              )
            else if (rows.isEmpty)
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(vertical: 22, horizontal: 16),
                decoration: BoxDecoration(
                    color: AppPalette.of(context).surface,
                    borderRadius: BorderRadius.circular(16)),
                child: Column(children: [
                  Icon(Icons.chat_bubble_outline_rounded,
                      color: AppPalette.of(context).textSecondary),
                  SizedBox(height: 8),
                  Text('No reviews yet',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  SizedBox(height: 3),
                  Text('This seller has not received written feedback.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 12, color: AppPalette.of(context).textSecondary))
                ]),
              )
            else
              ...rows.map((r) {
                final stars = (r['stars'] as num?)?.toDouble() ??
                    (r['rating'] as num?)?.toDouble() ??
                    0;
                final author = (r['authorName'] as String?)?.trim();
                final text = (r['reviewText'] ?? r['comment'] ?? r['review'])
                    .toString()
                    .trim();
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                      color: AppPalette.of(context).surface,
                      borderRadius: BorderRadius.circular(16)),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Container(
                              width: 34,
                              height: 34,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                  color: AppColors.brandBlue
                                      .withValues(alpha: .09),
                                  borderRadius: BorderRadius.circular(11)),
                              child: Text(
                                  (author == null || author.isEmpty
                                          ? 'A'
                                          : author.substring(0, 1))
                                      .toUpperCase(),
                                  style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                      color: AppPalette.of(context).accentInk))),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                                author == null || author.isEmpty
                                    ? 'Anonymous'
                                    : author,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600, fontSize: 13)),
                          ),
                          const Icon(Icons.star_rounded,
                              size: 16, color: Color(0xFFF59E0B)),
                          const SizedBox(width: 4),
                          Text(stars.toStringAsFixed(1),
                              style: const TextStyle(fontSize: 13)),
                        ]),
                        if (text.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(text,
                              style: TextStyle(
                                  fontSize: 13,
                                  color: AppPalette.of(context).textSecondary)),
                        ],
                      ],
                    ),
                  ),
                );
              }),
          ]),
        );
      },
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String body;
  const _Section(this.title, this.body);
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(body,
            style: TextStyle(
                fontSize: 14, height: 1.5, color: AppPalette.of(context).textPrimary)),
      ],
    );
  }
}

typedef BoolCallback = bool Function();

class _BottomBar extends StatelessWidget {
  final bool Function() onAddToCart;
  final BoolCallback? onBuyNow;
  final bool saved;
  final VoidCallback? onToggleSave;

  /// AU-018 web parity: purchase buttons disable when out of stock and the
  /// add-to-cart label flips to "Out of Stock".
  final bool outOfStock;

  /// Web product-actions: a rental's one action is "Book now" (no cart
  /// button — its dates make it a booking, not a basket item), plus
  /// "See on map" when the listing has a pin.
  final bool isRental;
  final VoidCallback? onShowMap;

  /// The seller viewing their own rental: "Reserve dates" (web product-card
  /// `isOwnRental`) — block dates booked outside GloboExpats — instead of a
  /// "Book now" that would only refuse them.
  final VoidCallback? onReserveDates;
  const _BottomBar({
    required this.onAddToCart,
    this.onBuyNow,
    this.saved = false,
    this.onToggleSave,
    this.outOfStock = false,
    this.isRental = false,
    this.onShowMap,
    this.onReserveDates,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          border: Border.all(color: AppPalette.of(context).border),
          borderRadius: BorderRadius.circular(16),
          boxShadow: const [
            BoxShadow(
                color: Color(0x2E0F172A),
                blurRadius: 32,
                offset: Offset(0, 12)),
          ],
        ),
        child: Row(
          children: [
            if (onBuyNow != null) ...[
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 48),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    backgroundColor: AppColors.brandBlue,
                  ),
                  onPressed: onReserveDates ?? (outOfStock ? null : onBuyNow),
                  child: Text(
                      onReserveDates != null
                          ? 'Reserve dates'
                          : outOfStock
                              ? 'Out of stock'
                              : isRental
                                  ? 'Book now'
                                  : 'Buy now',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: 8),
            ],
            if (onBuyNow == null)
              Expanded(
                  child: FilledButton(
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 48),
                  backgroundColor: AppColors.brandBlue,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: outOfStock ? null : () => onAddToCart(),
                child: Text(outOfStock ? 'Out of stock' : 'Add to cart'),
              ))
            else if (!isRental) ...[
              _DockIconButton(
                tooltip: 'Add to cart',
                icon: Icons.shopping_cart_outlined,
                onPressed: outOfStock ? null : () => onAddToCart(),
              ),
            ],
            if (onShowMap != null) ...[
              if (onBuyNow == null || !isRental) const SizedBox(width: 8),
              _DockIconButton(
                tooltip: 'See on map',
                icon: Icons.map_outlined,
                onPressed: onShowMap,
              ),
            ],
            if (onBuyNow == null || !isRental || onShowMap != null)
              const SizedBox(width: 8),
            _DockIconButton(
              tooltip: saved ? 'Remove from saved items' : 'Save for later',
              icon: saved ? Icons.favorite : Icons.favorite_border,
              color: saved ? const Color(0xFFDC2626) : const Color(0xFF525252),
              onPressed: onToggleSave,
            ),
          ],
        ),
      ),
    );
  }
}

class _DockIconButton extends StatelessWidget {
  const _DockIconButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
    this.color = AppColors.brandBlue,
  });
  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;
  final Color color;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: tooltip,
        child: SizedBox(
          width: 48,
          height: 48,
          child: OutlinedButton(
            style: OutlinedButton.styleFrom(
              padding: EdgeInsets.zero,
              foregroundColor: color,
              backgroundColor: color == AppColors.brandBlue
                  ? const Color(0x0D1E40AF)
                  : AppPalette.of(context).surface,
              side: BorderSide(
                  color: color == AppColors.brandBlue
                      ? const Color(0x331E40AF)
                      : AppPalette.of(context).border),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: onPressed,
            child: Icon(icon, size: 21),
          ),
        ),
      );
}

/// Choice selector (reference parity: products with required choices show
/// selectable options; the pick is carried to cart/checkout/proforma).
/// What the buyer settled on in the choice sheet.
class ChoiceSheetResult {
  const ChoiceSheetResult({
    required this.buyNow,
    required this.quantity,
    required this.choices,
    this.unitPrice,
    this.rentalBooking,
  });

  /// True for "Buy now" (and "Book now"), false for "Add to cart".
  final bool buyNow;
  final int quantity;
  final Map<int, String> choices;

  /// The repriced unit when a priced choice moved the price, else null.
  final double? unitPrice;

  /// The booked range for a rental (always complete when present).
  final RentalBooking? rentalBooking;
}

/// The options sheet — web parity
/// `components/product-choices/product-choice-selector.tsx`, which the
/// desktop opens from Add to cart / Buy now rather than showing on the page.
///
/// Mobile had the picker inline in the buy box, so a listing with optional
/// extras (the internet packages on a router, say) pushed its price and its
/// buttons down the page behind a wall of chips. The sheet carries the same
/// content the desktop's does: the rental calendar (rentals only), the fixed
/// attributes as "Features", the selectable ones as chip groups, the
/// quantity (never for rentals), then the actions.
Future<ChoiceSheetResult?> showProductChoiceSheet(
  BuildContext context, {
  required ProductDetail detail,
  required Map<int, String> initialChoices,
  required int initialQuantity,
  StayDates initialDates = StayDates.none,
  ApiClient? api,
}) =>
    showModalBottomSheet<ChoiceSheetResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppPalette.of(context).surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => _ProductChoiceSheet(
        detail: detail,
        initialChoices: initialChoices,
        initialQuantity: initialQuantity,
        initialDates: initialDates,
        api: api,
      ),
    );

class _ProductChoiceSheet extends StatefulWidget {
  const _ProductChoiceSheet({
    required this.detail,
    required this.initialChoices,
    required this.initialQuantity,
    this.initialDates = StayDates.none,
    this.api,
  });

  final ProductDetail detail;
  final Map<int, String> initialChoices;
  final int initialQuantity;
  final StayDates initialDates;
  final ApiClient? api;

  @override
  State<_ProductChoiceSheet> createState() => _ProductChoiceSheetState();
}

class _ProductChoiceSheetState extends State<_ProductChoiceSheet> {
  late final Map<int, String> _choices = {...widget.initialChoices};
  late int _qty = widget.initialQuantity;

  // Rental dates start empty every time the sheet opens (web resets them),
  // unless a Short Stays search carried the guest's dates here.
  late RentalDateSelection _dates = widget.initialDates.isSet
      ? RentalDateSelection(
          start: parseRentalDate(widget.initialDates.startDate),
          end: parseRentalDate(widget.initialDates.endDate))
      : RentalDateSelection.empty;
  RentalAvailability? _availability;
  bool _availabilityLoading = false;
  bool _availabilityFailed = false;
  final DateTime _today = () {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }();

  RentalConfiguration? get _rental => widget.detail.rentalConfiguration;

  @override
  void initState() {
    super.initState();
    if (_rental != null) _loadAvailability();
  }

  Future<void> _loadAvailability() async {
    setState(() {
      _availabilityLoading = true;
      _availabilityFailed = false;
    });
    final result = await (widget.api ?? ApiClient())
        .fetchRentalAvailability(widget.detail.productId);
    if (!mounted) return;
    setState(() {
      _availability = result;
      _availabilityFailed = result == null;
      _availabilityLoading = false;
    });
  }

  List<ChoiceAttribute> get _selectable =>
      widget.detail.choiceAttributes.where((a) => a.buyerSelectable).toList();

  List<ChoiceAttribute> get _fixed =>
      widget.detail.choiceAttributes.where((a) => a.fixed).toList();

  /// Web `allRequiredSelected`: a required attribute with no pick blocks both
  /// actions. Optional ones may be left alone.
  bool get _ready => _selectable
      .where((a) => a.required)
      .every((a) => _selectedIdFor(a) != null);

  String? _selectedIdFor(ChoiceAttribute a) {
    final picked = _choices[a.definitionId];
    if (picked != null && a.activeValues.any((v) => v.id == picked)) {
      return picked;
    }
    final fallback = a.defaultValueId;
    if (fallback != null && a.activeValues.any((v) => v.id == fallback)) {
      return fallback;
    }
    return null;
  }

  /// Web `choose`: only one priced choice at a time — picking a value that
  /// moves the price drops the priced picks on the other attributes.
  void _choose(ChoiceAttribute attribute, ChoiceValue value) {
    setState(() {
      if (value.sellerPayoutAdjustment != 0) {
        for (final other in widget.detail.choiceAttributes) {
          if (other.definitionId == attribute.definitionId) continue;
          final pickedId = _choices[other.definitionId];
          final picked =
              other.activeValues.where((v) => v.id == pickedId).firstOrNull;
          if (picked != null && picked.sellerPayoutAdjustment != 0) {
            _choices.remove(other.definitionId);
          }
        }
      }
      _choices[attribute.definitionId] = value.id;
    });
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.detail;
    final palette = AppPalette.of(context);
    final rental = _rental;
    final resolved = resolveSelectedChoices(d, _choices);
    final adjustment = selectedSellerPayoutAdjustment(d, resolved);
    final unitPrice = unitSellingPriceFor(d, adjustment);

    RentalBooking? booking;
    String? bookingError;
    final start = _dates.start;
    final end = _dates.end;
    if (rental != null && start != null && end != null) {
      final times = rentalTimesFor(d, resolved);
      try {
        booking = buildRentalBooking(
          rental,
          start,
          end,
          sellerUnitRate: sellerUnitRateFor(d, adjustment, unitPrice),
          sellingUnitRate: unitPrice,
          pickupTime: times.pickupTime,
          returnTime: times.returnTime,
        );
      } on ArgumentError catch (e) {
        // Shown under the calendar: a stay below the host's minimum says
        // so rather than leaving Book now silently disabled.
        booking = null;
        bookingError = '${e.message}';
      }
    }
    final canContinue = _ready && (rental == null || booking != null);
    final shownPrice = booking?.sellingTotal ?? unitPrice;

    ChoiceSheetResult result({required bool buyNow}) => ChoiceSheetResult(
          buyNow: buyNow,
          quantity: rental != null ? 1 : _qty,
          choices: _choices,
          unitPrice: adjustment != 0 ? unitPrice : null,
          rentalBooking: booking,
        );

    return SizedBox(
      height: MediaQuery.of(context).size.height * .82,
      child: Column(children: [
        const SizedBox(height: 10),
        Container(
          width: 40,
          height: 4,
          decoration: BoxDecoration(
              color: palette.border, borderRadius: BorderRadius.circular(2)),
        ),
        // Header: thumbnail, name and the price the order will be placed at.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 64,
                height: 64,
                child: d.productImages.isEmpty
                    ? ColoredBox(
                        color: palette.surfaceMuted,
                        child: Icon(Icons.image_outlined,
                            color: palette.textSecondary))
                    : AppImage(AppConfig.resolveAssetUrl(d.productImages.first),
                        fit: BoxFit.cover),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(d.productName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 16,
                            height: 1.25,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text.rich(
                      TextSpan(
                        text: Product.formatPrice(
                            shownPrice, d.productCurrency),
                        children: [
                          if (rental != null && booking == null)
                            TextSpan(
                                text:
                                    '  per ${rental.ratePeriod.name.toLowerCase()}',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w400,
                                    color: palette.textSecondary)),
                        ],
                      ),
                      key: const ValueKey('choice-sheet-price'),
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w800),
                    ),
                  ]),
            ),
            IconButton(
              tooltip: 'Close',
              icon: const Icon(Icons.close_rounded, size: 20),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ]),
        ),
        Divider(height: 1, color: palette.border),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            children: [
              // Web: "Choose rental dates first, then review the included
              // features and required choices."
              if (rental != null) ...[
                if (rental.minimumStayLabel != null) ...[
                  Text(rental.minimumStayLabel!,
                      key: const ValueKey('rental-minimum-stay'),
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: palette.textSecondary)),
                  const SizedBox(height: 8),
                ],
                RentalDateRangeCalendar(
                  selection: _dates,
                  onChanged: (next) => setState(() => _dates = next),
                  period: rental.ratePeriod,
                  today: _today,
                  availability: _availability,
                  loading: _availabilityLoading,
                  loadFailed: _availabilityFailed,
                ),
                if (bookingError != null) ...[
                  const SizedBox(height: 8),
                  Text(bookingError,
                      key: const ValueKey('rental-booking-error'),
                      style: TextStyle(fontSize: 13, color: palette.dangerText)),
                ],
                if (booking != null) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: palette.infoFill,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '${booking.billableUnits} ${rental.ratePeriod.name.toLowerCase()}'
                      '${booking.billableUnits == 1 ? '' : 's'} selected.',
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                ],
                const SizedBox(height: 16),
              ],
              // Web "Features": the attributes the seller pinned to one
              // value. They are part of what is being bought, but they are
              // not a decision.
              if (_fixed.isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: palette.background,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: palette.border),
                  ),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Features',
                            style: TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        for (final a in _fixed)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Text(a.name,
                                        style: TextStyle(
                                            fontSize: 13,
                                            color: palette.textSecondary)),
                                  ),
                                  const SizedBox(width: 12),
                                  Flexible(
                                    child: Text(a.activeValues.first.label,
                                        textAlign: TextAlign.right,
                                        style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600)),
                                  ),
                                ]),
                          ),
                      ]),
                ),
                const SizedBox(height: 16),
              ],
              for (final a in _selectable) ...[
                Text.rich(TextSpan(text: a.name, children: [
                  a.required
                      ? const TextSpan(
                          text: ' *', style: TextStyle(color: Colors.red))
                      : TextSpan(
                          text: ' (optional)',
                          style: TextStyle(
                              fontWeight: FontWeight.w400,
                              color: palette.textSecondary)),
                ]), style: const TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final v in a.activeValues)
                      ChoiceChip(
                        label: Text(v.label),
                        selected: _selectedIdFor(a) == v.id,
                        onSelected: (_) => _choose(a, v),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
              ],
              if (rental == null) ...[
                const Text('Quantity',
                    style:
                        TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Row(children: [
                  _QuantityControl(
                    quantity: _qty,
                    canDecrease: _qty > 1,
                    canIncrease: d.stockCap > 0 && _qty < d.stockCap,
                    onDecrease: () => setState(() => _qty -= 1),
                    onIncrease: () => setState(() => _qty += 1),
                  ),
                  if (d.productQuantity > 0) ...[
                    const SizedBox(width: 12),
                    Text('${d.productQuantity} available',
                        style: TextStyle(
                            fontSize: 13, color: palette.textSecondary)),
                  ],
                ]),
              ],
            ],
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: palette.surface,
            border: Border(top: BorderSide(color: palette.border)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: Column(children: [
                if (!canContinue)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                        !_ready
                            ? 'Select all required choices to continue.'
                            : 'Choose a valid start and end date to continue.',
                        style: TextStyle(
                            fontSize: 12.5, color: Colors.amber.shade800)),
                  ),
                if (rental != null)
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: canContinue
                          ? () => Navigator.of(context)
                              .pop(result(buyNow: true))
                          : null,
                      style: FilledButton.styleFrom(
                          backgroundColor: AppColors.brandBlue,
                          padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: const Text('Book now'),
                    ),
                  )
                else
                  Row(children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: canContinue
                            ? () => Navigator.of(context)
                                .pop(result(buyNow: false))
                            : null,
                        style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 14)),
                        child: const Text('Add to cart'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed: canContinue
                            ? () => Navigator.of(context)
                                .pop(result(buyNow: true))
                            : null,
                        style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brandBlue,
                            padding: const EdgeInsets.symmetric(vertical: 14)),
                        child: const Text('Buy now'),
                      ),
                    ),
                  ]),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

/// "You Might Also Like" — the same two-column card grid used by the web
/// product page (this is intentionally not the marketplace card).
class _RelatedRail extends StatefulWidget {
  final Product current;
  const _RelatedRail({required this.current});
  @override
  State<_RelatedRail> createState() => _RelatedRailState();
}

class _RelatedRailState extends State<_RelatedRail> {
  final ApiClient _api = ApiClient();
  late final Future<List<Product>> _future = _api
      // Reference pool is getNewestListings(0,50) — displayItem/newest sorted
      // by createdAt desc, NOT get-all-products (AU-052 parity MAJOR), and the
      // reference slices the ranked list to 4.
      .fetchDisplay('newest', size: 50)
      .then((raw) => rankSimilarProducts(
          current: widget.current,
          candidates: raw.whereType<Product>().toList(),
          limit: 4))
      .catchError((Object _) => <Product>[]);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Product>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const SectionSkeleton(horizontal: true);
        }
        final products = snap.data ?? const <Product>[];
        if (products.isEmpty) return const SizedBox.shrink();
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: products.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: .72,
          ),
          itemBuilder: (context, i) => _RelatedProductCard(products[i]),
        );
      },
    );
  }
}

class _RelatedProductCard extends StatelessWidget {
  const _RelatedProductCard(this.product);
  final Product product;

  @override
  Widget build(BuildContext context) {
    final original = product.productOriginalPrice;
    final location = [product.placeName, product.productRegion]
        .where((value) => value?.trim().isNotEmpty == true)
        .join(', ');
    return Material(
      color: AppPalette.of(context).surface,
      borderRadius: BorderRadius.circular(12),
      elevation: 3,
      shadowColor: const Color(0x220F172A),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/product/${product.productId}'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 128,
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      AppPalette.of(context).surfaceMuted,
                      AppPalette.of(context).border,
                    ],
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: product.primaryImageUrl == null
                    ? Icon(Icons.image_outlined,
                        color: AppPalette.of(context).textMuted)
                    : AppImage(
                        AppConfig.resolveAssetUrl(product.primaryImageUrl!),
                        fit: BoxFit.contain,
                      ),
              ),
              const SizedBox(height: 10),
              Text(product.productName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontFamily: 'Lexend',
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppPalette.of(context).textPrimary)),
              const SizedBox(height: 5),
              Row(children: [
                Flexible(
                  child: Text(Product.formatPrice(product.productAskingPrice),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontFamily: 'Lexend',
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFFF59E0B))),
                ),
                if (original != null &&
                    original > product.productAskingPrice) ...[
                  const SizedBox(width: 5),
                  Flexible(
                      child: Text(Product.formatPrice(original),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 10,
                              color: AppPalette.of(context).textSecondary,
                              decoration: TextDecoration.lineThrough))),
                ],
              ]),
              const SizedBox(height: 6),
              Row(children: [
                const Icon(Icons.star_rounded,
                    size: 15, color: Color(0xFFFBBF24)),
                const SizedBox(width: 3),
                Text(product.averageRating.toStringAsFixed(1),
                    style: TextStyle(
                        fontSize: 11, color: AppPalette.of(context).textSecondary)),
                if (product.totalRatingsCount > 0)
                  Text(' (${product.totalRatingsCount})',
                      style: TextStyle(
                          fontSize: 11, color: AppPalette.of(context).textSecondary)),
                const Spacer(),
                if (product.sellerVerified)
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).successFill,
                      shape: BoxShape.circle,
                    ),
                    child: Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(Icons.verified_outlined,
                          size: 13, color: Color(0xFF059669)),
                    ),
                  ),
              ]),
              if (location.isNotEmpty) ...[
                const SizedBox(height: 7),
                Row(children: [
                  Icon(Icons.location_on_outlined,
                      size: 14, color: AppPalette.of(context).textSecondary),
                  const SizedBox(width: 3),
                  Expanded(
                      child: Text(location,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 11, color: AppPalette.of(context).textSecondary))),
                ]),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// AU-013 hidden-listing guard view. Web parity with /product/[id] when the
/// listing must not be shown: "Error: Product not found" copy plus a single
/// "Back to Browse" action — no images, no commerce buttons.
class _ProductNotFound extends StatelessWidget {
  final VoidCallback onBackToBrowse;
  const _ProductNotFound({required this.onBackToBrowse});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Error: Product not found',
                style: TextStyle(color: Color(0xFFDC2626), fontSize: 15)),
            const SizedBox(height: 16),
            FilledButton(
              style:
                  FilledButton.styleFrom(backgroundColor: AppColors.brandBlue),
              onPressed: onBackToBrowse,
              child: const Text('Back to Browse'),
            ),
          ],
        ),
      ),
    );
  }
}

/// AU-013 "Who viewed this listing" panel (web parity in /product/[id]):
/// - admins get the per-viewer breakdown (names/contacts, backend-gated);
/// - the non-admin owner gets aggregate totals only;
/// - everyone else gets nothing (panel hidden entirely).
class _ViewersPanel extends StatelessWidget {
  final List<ProductViewer> viewers;
  final bool isAdmin;
  final bool isOwnProduct;
  final ProductClickStats clickStats;
  const _ViewersPanel({
    required this.viewers,
    required this.isAdmin,
    required this.isOwnProduct,
    required this.clickStats,
  });

  @override
  Widget build(BuildContext context) {
    final named = viewers.where((v) => !v.anonymous).toList();
    if (isAdmin && named.isNotEmpty) {
      final anonViews = viewers
          .where((v) => v.anonymous || v.totalViews == 0)
          .fold<int>(0, (sum, v) => sum + v.totalViews);
      return Container(
        margin: const EdgeInsets.only(top: 16),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          border: Border.all(color: AppPalette.of(context).border),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.visibility_outlined,
                  size: 15, color: AppPalette.of(context).accentInk),
              const SizedBox(width: 6),
              const Text('Who viewed this listing',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
              const SizedBox(width: 8),
              Text(
                  '${named.length} ${named.length == 1 ? 'viewer' : 'viewers'}',
                  style: TextStyle(
                      fontSize: 12, color: AppPalette.of(context).textSecondary)),
            ]),
            const SizedBox(height: 8),
            for (final v in named)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(children: [
                  Expanded(
                    child: Text(v.fullName ?? 'Unnamed user',
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13)),
                  ),
                  Text('${v.totalViews} views',
                      style: TextStyle(
                          fontSize: 12, color: AppPalette.of(context).accentInk)),
                ]),
              ),
            if (anonViews > 0)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('+ $anonViews from anonymous visitors',
                    style: TextStyle(
                        fontSize: 11, color: AppPalette.of(context).textSecondary)),
              ),
          ],
        ),
      );
    }
    if (isOwnProduct && (clickStats.total > 0 || clickStats.unique > 0)) {
      return Container(
        margin: const EdgeInsets.only(top: 16),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          border: Border.all(color: AppPalette.of(context).border),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.visibility_outlined,
                  size: 15, color: AppPalette.of(context).accentInk),
              const SizedBox(width: 6),
              const Text('Who viewed this listing',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 6),
            Text(
                '${clickStats.total} total views · ${clickStats.unique} unique viewers',
                style:
                    TextStyle(fontSize: 13, color: AppPalette.of(context).accentInk)),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }
}
