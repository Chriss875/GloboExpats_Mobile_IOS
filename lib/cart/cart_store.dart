import 'package:flutter/foundation.dart';

import '../services/matomo_tracker.dart';

import '../models/product.dart';
import '../domain/rentals.dart';
import '../models/product_detail.dart' show SelectedChoice;
import '../storage/kv_store.dart';

/// A cart line item (client-side cart mirroring the web's localStorage cart).
///
/// Line identity is `productId + choiceSelection + rentalBookingSignature`
/// (web parity `buildChoiceCartItemId` in `lib/product-choices.ts`): two
/// variants of one product are SEPARATE lines — the web never merges by
/// productId alone (BUYER_FLOW_SPEC §2.2).
class CartItem {
  final int productId;

  /// Backend seller user id (`sellerId`/`expatId`) used for seller grouping
  /// and delivery quoting — delivery is charged once per seller group.
  final String? sellerId;

  /// Seller display name (`sellerName`/`expatName`).
  final String? sellerName;

  final String title;

  /// Unit price in TZS. Final to the outside world; the price guard (§5.3)
  /// updates it in place through [CartStore.resyncPrices] only.
  double price;
  final double? originalPrice;
  final String? imageUrl;
  final String? condition;
  final String? category;
  final String? location;

  /// Listing region/country, carried from itemDetails for the cross-region
  /// delivery policy (web `productRegion`/`productCountry` on the cart item).
  final String? productRegion;
  final String? productCountry;

  /// Seller-declared delivery-logistics requirement (REQUIRED|OPTIONAL|EXEMPT).
  /// Rentals/EXEMPT lines never use delivery logistics (web
  /// `transport-requirements.ts`); OPTIONAL needs a transport mode too.
  final String? transportRequirement;
  final String? deliveryTransportMode;

  final bool isVerified;
  final String currency;
  final String? productSource;

  /// Stock ceiling carried from the listing (`productQuantity`); the absolute
  /// cap when absent is 999 (web parity `MAX_ITEM_QUANTITY`).
  final int? maxQuantity;

  /// Seller prep period in calendar days (0 = none). Checkout shifts the
  /// offered delivery windows past the LONGEST one in the cart, so a buyer
  /// can never pick a date the seller already said they cannot meet.
  final int productionTimeDays;
  final bool isAvailable;

  int quantity;

  /// True when the user has ticked this line for checkout (web parity:
  /// `toggleItemSelection`; summary + checkout gate count only selected lines).
  bool selected;

  /// Choice-aware line id (`p{productId}|d{def}:{value}...` sorted by def id,
  /// plus the rental booking signature when present).
  final String lineId;

  final List<SelectedChoice> selectedChoices;

  /// AU-016: rental booking for FOR_RENT lines (null on ordinary goods).
  /// Its range joins [lineId] so two different date ranges are separate cart
  /// lines (web parity rentalBookingSignature).
  final RentalBooking? rentalBooking;

  CartItem({
    required this.productId,
    this.sellerId,
    this.sellerName,
    required this.title,
    required this.price,
    this.originalPrice,
    this.imageUrl,
    this.condition,
    this.category,
    this.location,
    this.productRegion,
    this.productCountry,
    this.transportRequirement,
    this.deliveryTransportMode,
    this.isVerified = false,
    this.currency = 'TZS',
    this.productSource,
    this.maxQuantity,
    this.productionTimeDays = 0,
    this.isAvailable = true,
    this.quantity = 1,
    this.selectedChoices = const [],
    this.rentalBooking,
    bool? selected,
    String? lineId,
  })  : lineId = lineId ??
            buildLineId(productId, selectedChoices, rental: rentalBooking),
        selected = selected ?? true;

  /// Stable identity for a cart line: product + choice selection + the
  /// rental booking's date-range signature when present.
  static String buildLineId(int productId, List<SelectedChoice> choices,
      {RentalBooking? rental}) {
    final sorted = [...choices]
      ..sort((a, b) => a.definitionId.compareTo(b.definitionId));
    final base = sorted.isEmpty
        ? 'p$productId'
        : 'p$productId|${sorted.map((c) => 'd${c.definitionId}:${c.valueId}').join(';')}';
    if (rental == null) return base;
    return '$base|r${rental.signature}';
  }

  double get subtotal => price * quantity;

  /// Effective stock ceiling: item maxQuantity else the 999 absolute cap.
  static const int absoluteMaxQuantity = 999;
  int get effectiveMax => maxQuantity ?? absoluteMaxQuantity;

  factory CartItem.fromProduct(Product p, {List<SelectedChoice> choices = const []}) =>
      CartItem(
        productId: p.productId,
        title: p.productName,
        price: p.productAskingPrice,
        imageUrl: p.primaryImageUrl,
        maxQuantity: p.productQuantity,
        selectedChoices: choices,
        lineId: CartItem.buildLineId(p.productId, choices),
      );

  Map<String, dynamic> toJson() => {
        'lineId': lineId,
        'productId': productId,
        if (sellerId != null) 'sellerId': sellerId,
        if (sellerName != null) 'sellerName': sellerName,
        'title': title,
        'price': price,
        if (originalPrice != null) 'originalPrice': originalPrice,
        if (imageUrl != null) 'imageUrl': imageUrl,
        if (condition != null) 'condition': condition,
        if (category != null) 'category': category,
        if (location != null) 'location': location,
        if (productRegion != null) 'productRegion': productRegion,
        if (productCountry != null) 'productCountry': productCountry,
        if (transportRequirement != null)
          'transportRequirement': transportRequirement,
        if (deliveryTransportMode != null)
          'deliveryTransportMode': deliveryTransportMode,
        'isVerified': isVerified,
        'currency': currency,
        if (productSource != null) 'productSource': productSource,
        if (maxQuantity != null) 'maxQuantity': maxQuantity,
        'isAvailable': isAvailable,
        'quantity': quantity,
        'selected': selected,
        if (productionTimeDays > 0) 'productionTimeDays': productionTimeDays,
        'choices': [for (final c in selectedChoices) c.toJson()],
        if (rentalBooking != null) 'rentalBooking': rentalBooking!.toJson(),
      };

  factory CartItem.fromJson(Map<String, dynamic> j) => CartItem(
        productId: (j['productId'] as num).toInt(),
        sellerId: (j['sellerId'] ?? j['expatId'])?.toString(),
        sellerName: (j['sellerName'] ?? j['expatName']) as String?,
        title: j['title'] as String? ?? '',
        price: (j['price'] as num?)?.toDouble() ?? 0,
        originalPrice: (j['originalPrice'] as num?)?.toDouble(),
        imageUrl: j['imageUrl'] as String?,
        condition: j['condition'] as String?,
        category: j['category'] as String?,
        location: j['location'] as String?,
        productRegion: j['productRegion'] as String?,
        productCountry: j['productCountry'] as String?,
        transportRequirement: j['transportRequirement'] as String?,
        deliveryTransportMode: j['deliveryTransportMode'] as String?,
        // toJson writes `isVerified`; `verified` is the web's key.
        isVerified: (j['isVerified'] ?? j['verified']) as bool? ?? false,
        currency: j['currency'] as String? ?? 'TZS',
        productSource: j['productSource'] as String?,
        maxQuantity: (j['maxQuantity'] as num?)?.toInt(),
        productionTimeDays: (j['productionTimeDays'] as num?)?.toInt() ?? 0,
        isAvailable: j['isAvailable'] as bool? ?? true,
        quantity: (j['quantity'] as num?)?.toInt() ?? 1,
        selected: j['selected'] as bool? ?? true,
        rentalBooking: j['rentalBooking'] is Map
            ? RentalBooking.fromJson(
                Map<String, dynamic>.from(j['rentalBooking'] as Map))
            : null,
        selectedChoices: [
          for (final c in (j['choices'] as List<dynamic>? ?? []))
            SelectedChoice(
              definitionId: (c['definitionId'] as num).toInt(),
              valueId: c['valueId'] as String,
            ),
        ],
        lineId: j['lineId'] as String?,
      );
}

/// Client-side cart. Mirrors the web app's CartProvider (which is also
/// client-side and never calls the backend cart API — see memory
/// `cart-checkout-contract`). Persisted per-user through [KvStore]
/// (web parity: localStorage key `expatCartItems_{userId}`), keyed by the
/// signed-in email; guest carts stay in memory only.
class CartStore extends ChangeNotifier {
  /// App-wide singleton (client-side cart; mirrors the web CartProvider).
  static final CartStore instance = CartStore();

  /// Email of the user whose cart is currently loaded (null → guest cart).
  String? _userId;

  /// True when [userId] is the user whose cart is currently loaded.
  bool isLoadedFor(String userId) => _userId == userId && _loadedForUser;
  final Map<String, CartItem> _items = {};
  bool _loadedForUser = false;

  List<CartItem> get items => _items.values.toList();
  Iterable<CartItem> get selectedItems =>
      _items.values.where((i) => i.selected);
  int get count => _items.values.fold(0, (s, i) => s + i.quantity);

  /// Count of distinct selected lines (what checkout will submit).
  int get selectedCount => _items.values.where((i) => i.selected).length;
  bool get isEmpty => _items.isEmpty;

  /// Subtotal of SELECTED items only (web parity: `selectedSubtotal`,
  /// Σ selected(item.price × item.quantity)).
  double get total =>
      selectedItems.fold(0, (s, i) => s + i.subtotal);

  double get grandTotalAll => _items.values.fold(0, (s, i) => s + i.subtotal);

  /// Load the persisted cart belonging to [userId]. Call on login and at app
  /// start when a session is restored. Guest items are dropped (the web keeps
  /// carts strictly per-user under `expatCartItems_{userId}`).
  Future<void> loadForUser(String userId) async {
    _userId = userId;
    final raw = KvStore.instance.getJsonList(KvStore.cartKey(userId));
    _items
      ..clear()
      ..addEntries({
        for (final e in raw ?? const [])
          if (e is Map && e['lineId'] is String)
            MapEntry(
              e['lineId'] as String,
              CartItem.fromJson(Map<String, dynamic>.from(e)),
            ),
      });
    _loadedForUser = true;
    notifyListeners();
  }

  /// Swap to another user's cart (login switch) or the empty guest cart.
  Future<void> reset() async {
    _userId = null;
    _items.clear();
    _loadedForUser = false;
    notifyListeners();
  }

  void _persist() {
    final uid = _userId;
    if (uid == null) return; // guest cart: memory only
    KvStore.instance.setJson(
      KvStore.cartKey(uid),
      [for (final i in _items.values) i.toJson()],
    );
  }

  void _put(CartItem incoming, {required int quantity, required bool overwrite}) {
    final existing = _items[incoming.lineId];
    if (existing != null) {
      // Merge semantics per BUYER_FLOW_SPEC §3 / cart-provider addItem:
      // existing.quantity + qty; Buy Now overwrites to the exact quantity.
      existing.quantity = overwrite ? quantity : existing.quantity + quantity;
      existing.selected = true; // re-adding auto-selects the line
    } else {
      incoming
        ..quantity = quantity
        ..selected = true; // new items auto-selected
      _items[incoming.lineId] = incoming;
    }
    _persist();
    notifyListeners();
  }

  /// Merge semantics per BUYER_FLOW_SPEC §3: same choice-aware line adds
  /// quantity; a different selection of the same product is a NEW line.
  /// Quantity caps at the item's stock ceiling (maxQuantity else 999) — an
  /// over-cap request is rejected and reported via the returned message so the
  /// UI can toast "Only N units are available for this item." (web parity
  /// `updateQuantity`'s "Quantity Limit Reached").
  String? add(Product product, {int quantity = 1}) =>
      addWithChoices(product, quantity: quantity);

  /// Add a product with explicit selected choices (for products with choices).
  String? addWithChoices(Product product,
      {int quantity = 1, List<SelectedChoice> choices = const []}) {
    final item =
        CartItem.fromProduct(product, choices: choices);
    return _addValidated(item, quantity);
  }

  /// Add a fully-populated line (detail screen path carries seller + stock).
  String? addDetail({
    required int productId,
    String? sellerId,
    String? sellerName,
    required String title,
    required double price,
    double? originalPrice,
    String? imageUrl,
    String? condition,
    String? category,
    String? location,
    String? productRegion,
    String? productCountry,
    String? transportRequirement,
    String? deliveryTransportMode,
    bool isVerified = false,
    String currency = 'TZS',
    String? productSource,
    int? maxQuantity,
    int productionTimeDays = 0,
    int quantity = 1,
    List<SelectedChoice> choices = const [],
    RentalBooking? rentalBooking,
  }) {
    final item = CartItem(
      productId: productId,
      sellerId: sellerId,
      sellerName: sellerName,
      title: title,
      price: price,
      originalPrice: originalPrice,
      imageUrl: imageUrl,
      condition: condition,
      category: category,
      location: location,
      productRegion: productRegion,
      productCountry: productCountry,
      transportRequirement: transportRequirement,
      deliveryTransportMode: deliveryTransportMode,
      isVerified: isVerified,
      currency: currency,
      productSource: productSource,
      maxQuantity: maxQuantity,
      productionTimeDays: productionTimeDays,
      selectedChoices: choices,
      rentalBooking: rentalBooking,
    );
    return _addValidated(item, quantity);
  }

  /// Matomo ecommerce cart update with the whole cart, plus the
  /// Product/AddToCart event for [added] (web parity: trackAddToCart).
  void _trackCartUpdate(CartItem added, int quantity) {
    MatomoEcommerceItem line(CartItem i, int qty) => MatomoEcommerceItem(
          sku: '${i.productId}',
          name: i.title,
          category: i.category,
          price: i.price,
          quantity: qty,
        );
    final lines = items;
    MatomoTracking.instance.trackCartUpdate(
      items: [for (final i in lines) line(i, i.quantity)],
      cartTotal: lines.fold<double>(0, (sum, i) => sum + i.subtotal),
      added: line(added, quantity),
    );
  }

  String? _addValidated(CartItem item, int quantity) {
    final limit = item.effectiveMax;
    if (quantity > limit) {
      return 'Only $limit ${limit == 1 ? 'unit is' : 'units are'} available for this item.';
    }
    _put(item, quantity: quantity, overwrite: false);
    _trackCartUpdate(item, quantity);
    return null;
  }

  /// Buy Now parity: replace the line's quantity with [quantity] exactly and
  /// leave it selected. Returns a rejection message on over-cap requests.
  String? addOverwrite(Product product, {int quantity = 1}) {
    final item = CartItem.fromProduct(product);
    final limit = item.effectiveMax;
    if (quantity > limit) {
      return 'Only $limit ${limit == 1 ? 'unit is' : 'units are'} available for this item.';
    }
    _put(item, quantity: quantity, overwrite: true);
    _trackCartUpdate(item, quantity);
    return null;
  }

  /// Hard clamp used by the fresh-stock revalidation (AU-021): silently pulls
  /// the stored quantity down to live stock (never above), removing lines that
  /// dropped to zero. Returns the lines that changed so the screen can explain.
  List<CartItem> applyStockCaps(Map<int, int> stockByProductId) {
    final adjusted = <CartItem>[];
    for (final item in _items.values.toList()) {
      final stock = stockByProductId[item.productId];
      if (stock == null) continue;
      if (item.quantity > stock) {
        item.quantity = stock.clamp(0, item.effectiveMax);
        adjusted.add(item);
        if (item.quantity <= 0) _items.remove(item.lineId);
      }
    }
    if (adjusted.isNotEmpty) {
      _persist();
      notifyListeners();
    }
    return adjusted;
  }

  /// Fill in what a line is missing from the live listing — lines added by
  /// older builds (or restored from an old snapshot) can lack the seller,
  /// the photo or the location, and the cart then showed a nameless
  /// "Seller" with an empty picture. Never touches price, quantity, choices
  /// or the booking: those are what the buyer agreed to.
  void backfillFromListing(
    int productId, {
    String? sellerId,
    String? sellerName,
    String? imageUrl,
    String? location,
    String? productRegion,
    String? productCountry,
    String? category,
    String? transportRequirement,
  }) {
    String? blank(String? v) => (v == null || v.trim().isEmpty) ? null : v;
    var changed = false;
    for (final entry in _items.entries.toList()) {
      final i = entry.value;
      if (i.productId != productId) continue;
      final next = CartItem(
        productId: i.productId,
        sellerId: blank(i.sellerId) ?? sellerId,
        sellerName: blank(i.sellerName) ?? sellerName,
        title: i.title,
        price: i.price,
        originalPrice: i.originalPrice,
        imageUrl: blank(i.imageUrl) ?? imageUrl,
        condition: i.condition,
        category: blank(i.category) ?? category,
        location: blank(i.location) ?? location,
        productRegion: blank(i.productRegion) ?? productRegion,
        productCountry: blank(i.productCountry) ?? productCountry,
        transportRequirement:
            blank(i.transportRequirement) ?? transportRequirement,
        deliveryTransportMode: i.deliveryTransportMode,
        isVerified: i.isVerified,
        currency: i.currency,
        productSource: i.productSource,
        maxQuantity: i.maxQuantity,
        productionTimeDays: i.productionTimeDays,
        isAvailable: i.isAvailable,
        quantity: i.quantity,
        selectedChoices: i.selectedChoices,
        rentalBooking: i.rentalBooking,
        selected: i.selected,
        lineId: i.lineId,
      );
      if (next.sellerId != i.sellerId ||
          next.sellerName != i.sellerName ||
          next.imageUrl != i.imageUrl ||
          next.location != i.location ||
          next.productRegion != i.productRegion ||
          next.productCountry != i.productCountry ||
          next.category != i.category ||
          next.transportRequirement != i.transportRequirement) {
        _items[entry.key] = next;
        changed = true;
      }
    }
    if (changed) {
      _persist();
      notifyListeners();
    }
  }

  void remove(String lineId) {
    _items.remove(lineId);
    _persist();
    notifyListeners();
  }

  /// Web parity `updateQuantity`: ≤0 removes; above the stock ceiling is
  /// rejected (returns the message) rather than clamped, matching the toast.
  String? updateQuantityCapped(String lineId, int quantity) {
    final item = _items[lineId];
    if (item == null) return null;
    if (quantity <= 0) {
      remove(lineId);
      return null;
    }
    final limit = item.effectiveMax;
    if (quantity > limit) {
      return 'Only $limit ${limit == 1 ? 'unit is' : 'units are'} available for this item.';
    }
    item.quantity = quantity;
    _persist();
    notifyListeners();
    return null;
  }

  /// Legacy uncapped setter kept for callers that pre-validate (tests, and
  /// the stock-revalidation path which writes already-clamped values).
  void updateQuantity(String lineId, int quantity) {
    final item = _items[lineId];
    if (item == null) return;
    if (quantity <= 0) {
      _items.remove(lineId);
    } else {
      item.quantity = quantity;
    }
    _persist();
    notifyListeners();
  }

  void toggleSelected(String lineId) {
    final item = _items[lineId];
    if (item == null) return;
    item.selected = !item.selected;
    _persist();
    notifyListeners();
  }

  void selectAll() {
    for (final i in _items.values) {
      i.selected = true;
    }
    _persist();
    notifyListeners();
  }

  void deselectAll() {
    for (final i in _items.values) {
      i.selected = false;
    }
    _persist();
    notifyListeners();
  }

  /// Re-sync line prices from the backend's authoritative unit prices
  /// (BUYER_FLOW_SPEC §5.3 price guard, AU-028): the created proforma's
  /// `sellerGroups[].items[].unitPrice` wins over possibly-stale cart prices.
  /// Matched lines are updated in place; the cart is re-persisted + notified
  /// only when something actually changed.
  void resyncPrices(Map<int, double> authoritativeByProductId) {
    var changed = false;
    for (final item in _items.values) {
      final p = authoritativeByProductId[item.productId];
      if (p != null && p != item.price) {
        item.price = p;
        changed = true;
      }
    }
    if (changed) {
      _persist();
      notifyListeners();
    }
  }

  /// Restore a durable proforma cart snapshot (CARTCH-03 / APISUR-05): called
  /// when an invoice expires/cancels so the buyer does not lose the confirmed
  /// items. Merges by line id (web `restoreExpiredCart` re-adds every item).
  /// Lines are re-selected so a restored cart can go straight back to checkout.
  Future<void> restoreSnapshot(List<Map<String, dynamic>> snapshot) async {
    if (snapshot.isEmpty) return;
    var changed = false;
    for (final e in snapshot) {
      if (e['lineId'] is! String) continue;
      final incoming = CartItem.fromJson(e);
      if (incoming.quantity <= 0) continue;
      final existing = _items[incoming.lineId];
      if (existing != null) {
        existing.quantity = (existing.quantity + incoming.quantity)
            .clamp(1, existing.effectiveMax);
        existing.selected = true;
      } else {
        incoming.selected = true;
        _items[incoming.lineId] = incoming;
      }
      changed = true;
    }
    if (changed) {
      _persist();
      notifyListeners();
    }
  }

  void clear() {
    _items.clear();
    _persist();
    notifyListeners();
  }
}
