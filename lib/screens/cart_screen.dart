import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../cart/cart_store.dart';
import '../cart/saved_products_store.dart';
import '../cart/seller_grouping.dart';
import '../config.dart';
import '../domain/rentals.dart' show RentalBooking, formatRentalDate;
import '../models/product.dart' show Product;
import '../models/product_detail.dart' show ProductDetail;
import '../theme.dart';
import '../widgets/navigation_boundary.dart';
import 'checkout_screen.dart';

/// Client-side cart (mirrors the reference /cart page). Lists lines grouped by
/// seller, lets the buyer select lines / change quantities (capped by FRESH
/// stock from itemDetails) / remove, and proceeds to checkout gated on ≥1
/// selected line.
///
/// AU-020: per-choice distinct lines + selection checkbox driving subtotal
/// math. AU-021: quantity revalidated against fresh stock + visible seller
/// grouping; delivery fee quoted once per seller group at checkout.
class CartScreen extends StatefulWidget {
  final CartStore? cart;

  /// Injectable detail fetcher (tests stub this; production hits the sandbox).
  final Future<ProductDetail> Function(int productId)? fetchDetail;
  const CartScreen({super.key, this.cart, this.fetchDetail});

  CartStore get store => cart ?? CartStore.instance;

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  late final CartStore _cart = widget.store;

  /// Fresh stock per productId fetched on open (web parity `stockLimits`):
  /// caps the qty stepper and shrinks stored quantities that exceed stock.
  final Map<int, int> _stockLimits = {};

  /// The live listings read on open — also the source of the choice labels
  /// (a line stores only ids) and of any seller/photo a line is missing.
  final Map<int, ProductDetail> _details = {};
  bool _revalidating = false;
  String? _stockNotice;
  final Set<String> _removedTitles = {};

  ApiClient get _api => ApiClient();

  Future<ProductDetail> _defaultFetch(int id) =>
      _api.fetchProductDetail(id).then((d) {
        // itemDetails may be served wrapped in a `data` envelope; the parser
        // already unwraps it — nothing to do here beyond surfacing errors.
        return d;
      });

  @override
  void initState() {
    super.initState();
    _revalidateStock();
  }

  /// BUYER_FLOW_SPEC §3 "Quantity re-check": on cart open, cap the stepper by
  /// fresh GET /displayItem/itemDetails/{productId} → productQuantity.
  Future<void> _revalidateStock() async {
    if (_cart.isEmpty || _revalidating) return;
    setState(() => _revalidating = true);
    try {
      final ids = _cart.items.map((i) => i.productId).toSet();
      for (final id in ids) {
        try {
          final d = await (widget.fetchDetail ?? _defaultFetch)(id);
          _details[id] = d;
          _cart.backfillFromListing(id,
              sellerId: d.sellerId?.toString(),
              sellerName: d.sellerName,
              imageUrl:
                  d.productImages.isNotEmpty ? d.productImages.first : null,
              location: d.locationLabel,
              productRegion: d.productRegion,
              productCountry: d.productCountry,
              category: d.categoryName,
              transportRequirement: d.transportRequirement);
          final stock = d.productQuantity;
          if (mounted && stock > 0) setState(() => _stockLimits[id] = stock);
        } on ApiException {
          // Network/detail failure: keep the persisted cap, never invent one.
        }
      }
      final adjusted = _cart.applyStockCaps(_stockLimits);
      for (final a in adjusted) {
        _removedTitles.add(a.title);
      }
      if (mounted) {
        setState(() {
          _revalidating = false;
          _stockNotice = adjusted.isEmpty ? null : _noticeFor(adjusted);
        });
      }
    } catch (_) {
      if (mounted) setState(() => _revalidating = false);
    }
  }

  String _noticeFor(List<CartItem> adjusted) {
    final zeroed = adjusted.where((a) => !_cart.items.contains(a)).toList();
    final reduced = adjusted.where((a) => _cart.items.contains(a)).toList();
    final parts = <String>[
      if (zeroed.isNotEmpty)
        '${zeroed.map((z) => z.title).join(', ')} '
            '${zeroed.length == 1 ? 'was' : 'were'} removed — no longer in stock',
      if (reduced.isNotEmpty)
        'Quantities reduced to current stock for ${reduced.map((r) => r.title).join(', ')}',
    ];
    return parts.join(' · ');
  }

  int? _capFor(CartItem item) => _stockLimits[item.productId] ?? item.maxQuantity;

  /// The cart is a full-screen page over the app. However it was reached,
  /// it always has a way back: the arrow and the phone's back button return
  /// to the previous screen, or home when nothing is underneath — it used to
  /// close the app and lose its arrow after checkout replaced the history.
  @override
  Widget build(BuildContext context) =>
      NavigationBoundary(fallbackLocation: '/', child: _page(context));

  Widget _page(BuildContext context) {
    final cart = _cart;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          key: const ValueKey('cart-back'),
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () =>
              NavigationBoundary.back(context, fallbackLocation: '/'),
        ),
        title: ListenableBuilder(
          listenable: cart,
          builder: (context, _) => Text(cart.items.isEmpty
              ? 'Cart'
              : 'Cart (${cart.count} ${cart.count == 1 ? 'item' : 'items'})'),
        ),
        actions: [
          ListenableBuilder(
            listenable: cart,
            builder: (context, _) => cart.isEmpty
                ? const SizedBox.shrink()
                : TextButton(
                    onPressed: () => cart.clear(),
                    child: const Text('Clear all items',
                        style: TextStyle(fontSize: 12)),
                  ),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: cart,
        builder: (context, _) {
          if (cart.isEmpty) {
            // Web parity (app/cart/page.tsx empty state): subtitle + a
            // "Start Shopping" CTA back to /browse (CARTCH-18).
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.shopping_cart_outlined,
                        size: 56, color: Colors.grey),
                    const SizedBox(height: 12),
                    const Text('Your cart is empty',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 16, color: Colors.grey)),
                    const SizedBox(height: 4),
                    Text("Ready to find some amazing local expat deals? "
                        "Start exploring what's available today!",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 13,
                            color: AppPalette.of(context).textSecondary)),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                          backgroundColor: AppColors.brandBlue,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 32, vertical: 14),
                          shape: const StadiumBorder()),
                      onPressed: () {
                        try {
                          context.go('/browse');
                        } catch (_) {
                          // No GoRouter ancestor (widget tests): pop instead.
                          Navigator.of(context).maybePop();
                        }
                      },
                      icon: const Icon(Icons.storefront_outlined, size: 18),
                      label: const Text('Start Shopping',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
            );
          }
          final groups = groupCartItemsBySeller(cart.selectedItems.isEmpty
              ? cart.items
              : cart.items); // grouping is display-only; selection is per line
          return Column(
            children: [
              if (_revalidating)
                const LinearProgressIndicator(minHeight: 2),
              if (_stockNotice != null)
                Material(
                  color: AppPalette.of(context).background,
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Row(children: [
                      Icon(Icons.inventory_2_outlined,
                          size: 16, color: AppPalette.of(context).accentInk),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(_stockNotice!,
                            style: const TextStyle(fontSize: 12)),
                      ),
                    ]),
                  ),
                ),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: groups.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 14),
                  itemBuilder: (context, i) =>
                      _SellerGroupCard(group: groups[i], state: this),
                ),
              ),
              if (cart.selectedCount == 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    'Select at least one item to check out',
                    style: TextStyle(
                        fontSize: 12, color: AppPalette.of(context).textSecondary),
                  ),
                ),
            ],
          );
        },
      ),
      bottomNavigationBar: ListenableBuilder(
        listenable: cart,
        builder: (context, _) => SafeArea(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
                color: AppPalette.of(context).surface,
                border: Border(top: BorderSide(color: AppPalette.of(context).border))),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(children: [
                  Expanded(
                    child: Text('Item (${cart.selectedCount})',
                        style: TextStyle(
                            fontSize: 13, color: AppPalette.of(context).textSecondary)),
                  ),
                  Text(Product.formatPrice(cart.total),
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w700)),
                ]),
                const SizedBox(height: 4),
                Row(children: [
                  Expanded(
                    child: Text('Shipping',
                        style: TextStyle(
                            fontSize: 13, color: AppPalette.of(context).textSecondary)),
                  ),
                  Text('Calculated at checkout',
                      style: TextStyle(
                          fontSize: 12, color: AppPalette.of(context).textSecondary)),
                ]),
                const Divider(height: 16),
                Row(children: [
                  Expanded(
                    child: Text(
                        'Subtotal (${cart.selectedCount} ${cart.selectedCount == 1 ? 'item' : 'items'}): ${Product.formatPrice(cart.total)}',
                        style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: AppColors.price)),
                  ),
                ]),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brandBlue,
                        padding: const EdgeInsets.symmetric(vertical: 14)),
                    onPressed: cart.selectedCount == 0
                        ? null
                        : () => Navigator.of(context).push(MaterialPageRoute(
                            settings: const RouteSettings(name: '/checkout'),
                            builder: (_) =>
                                const CheckoutScreen(fromCart: true))),
                    child: const Text('Go to checkout',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SellerGroupCard extends StatelessWidget {
  final SellerGroup group;
  final _CartScreenState state;
  const _SellerGroupCard({required this.group, required this.state});

  @override
  Widget build(BuildContext context) {
    final cart = state._cart;
    return Container(
      decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppPalette.of(context).border)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
                border:
                    Border(bottom: BorderSide(color: AppPalette.of(context).border))),
            child: Row(children: [
              CircleAvatar(
                radius: 12,
                backgroundColor: AppPalette.of(context).infoFill,
                child: Text(
                  group.sellerName.isEmpty
                      ? '?'
                      : group.sellerName.characters.first.toUpperCase(),
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: AppPalette.of(context).accentInk),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(group.sellerName,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w800)),
              ),
              if (group.isVerified)
                const Icon(Icons.verified_user_outlined,
                    size: 15, color: AppColors.accentGreen),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  group.location == null || group.location!.isEmpty
                      ? 'Sold by this seller'
                      : 'Ships from ${group.location}',
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 11, color: AppPalette.of(context).textSecondary),
                ),
              ),
            ]),
          ),
          ...group.items.map((item) => _CartTile(
                item: item,
                cart: cart,
                cap: state._capFor(item),
                detail: state._details[item.productId],
                onError: (msg) => ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text(msg))),
              )),
        ],
      ),
    );
  }
}

class _CartTile extends StatelessWidget {
  final CartItem item;
  final CartStore cart;
  final int? cap;
  final ProductDetail? detail;
  final void Function(String message) onError;
  const _CartTile({
    required this.item,
    required this.cart,
    this.cap,
    this.detail,
    required this.onError,
  });

  /// "Attribute: Label" for each pick (web `formatSelectedChoices`). A line
  /// stores only ids, so labels come from the live listing; a pick that can
  /// no longer be resolved is left out rather than shown as a raw id.
  String _choiceText() {
    final d = detail;
    if (d == null) return '';
    final parts = <String>[];
    for (final c in item.selectedChoices) {
      for (final a in d.choiceAttributes) {
        if (a.definitionId != c.definitionId) continue;
        for (final v in a.values) {
          if (v.id == c.valueId) parts.add('${a.name}: ${v.label}');
        }
      }
    }
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final choiceText = _choiceText();
    final condition = _conditionLabel(item.condition);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
          border: Border(top: BorderSide(color: AppPalette.of(context).border))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Checkbox(
            value: item.selected,
            onChanged: (_) => cart.toggleSelected(item.lineId),
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 64,
              height: 64,
              child: item.imageUrl != null
                  ? Image.network(
                      AppConfig.resolveAssetUrl(item.imageUrl!),
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                          color: AppPalette.of(context).border,
                          child: const Icon(Icons.image_outlined)))
                  : Container(
                      color: AppPalette.of(context).border,
                      child: const Icon(Icons.image_outlined)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (condition != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 3),
                    child: _ConditionBadge(label: condition),
                  ),
                Text(item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 13)),
                if (choiceText.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      choiceText,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 11, color: AppPalette.of(context).textSecondary),
                    ),
                  ),
                const SizedBox(height: 4),
                Text(Product.formatPrice(item.subtotal),
                    style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.price,
                        fontSize: 13)),
                if (item.quantity > 1)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text('${Product.formatPrice(item.price)} each',
                        style: TextStyle(
                            fontSize: 11, color: AppPalette.of(context).textSecondary)),
                  ),
                const SizedBox(height: 4),
                if (item.rentalBooking case final b?)
                  _CartRentalSummary(booking: b),
                // Rentals are never shipped (web hides shipping under the
                // rental booking line); ordinary goods show the quote note.
                if (item.rentalBooking == null)
                  Text('Shipping calculated at checkout',
                      style: TextStyle(
                          fontSize: 11, color: AppPalette.of(context).textSecondary)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    // Rental units are fixed by the booking — the qty stepper
                    // is hidden for them (web `!item.rentalBooking`).
                    if (item.rentalBooking == null) ...[
                      Text('Qty ',
                          style: TextStyle(
                              fontSize: 12, color: AppPalette.of(context).textSecondary)),
                      _QtyButton(
                        icon: Icons.remove,
                        onTap: item.quantity <= 1
                            ? null
                            : () => cart.updateQuantityCapped(
                                item.lineId, item.quantity - 1),
                      ),
                      Padding(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 10),
                        child: Text('${item.quantity}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w700)),
                      ),
                      Builder(builder: (context) {
                        final limit = cap ?? item.effectiveMax;
                        return _QtyButton(
                          icon: Icons.add,
                          onTap: item.quantity >= limit
                              ? null
                              : () {
                                  final err = cart.updateQuantityCapped(
                                      item.lineId, item.quantity + 1);
                                  if (err != null) onError(err);
                                },
                        );
                      }),
                      if (cap != null && cap! < item.effectiveMax)
                        Padding(
                          padding: const EdgeInsets.only(left: 8),
                          child: Text('$cap available',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: AppPalette.of(context).textSecondary)),
                        ),
                    ],
                    const Spacer(),
                    // AU-050 web parity (app/cart/page.tsx save-for-later):
                    // move the line into the persisted wishlist, then remove
                    // it from the cart. Login required like the reference.
                    IconButton(
                      icon: Icon(Icons.bookmark_border,
                          size: 20, color: AppPalette.of(context).textSecondary),
                      tooltip: 'Save for later',
                      onPressed: () async {
                        final auth = AuthStore.instance;
                        final token = auth?.token;
                        final messenger = ScaffoldMessenger.of(context);
                        if (token == null) {
                          messenger.showSnackBar(const SnackBar(
                              content:
                                  Text('Log in to save items to your wishlist.')));
                          return;
                        }
                        try {
                          await SavedProductsStore.instance
                              .toggle(item.productId, token);
                          cart.remove(item.lineId);
                          // ignore: use_build_context_synchronously
                          messenger.showSnackBar(const SnackBar(
                              content: Text('Saved for later — moved to your wishlist.')));
                        } on ApiException catch (e) {
                          AuthStore.instance?.handleUnauthorized();
                          // ignore: use_build_context_synchronously
                          messenger.showSnackBar(SnackBar(
                              content: Text('Could not save for later: ${e.message}')));
                        } catch (_) {
                          messenger.showSnackBar(const SnackBar(
                              content: Text('Could not save for later. Try again.')));
                        }
                      },
                    ),
                    IconButton(
                      icon: Icon(Icons.delete_outline,
                          size: 20,
                          color: AppPalette.of(context).textSecondary),
                      onPressed: () => cart.remove(item.lineId),
                      tooltip: 'Remove',
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Buyer-facing condition label (web `ITEM_CONDITIONS` slug → label map with a
/// raw fallback, mirroring `find(...)?.label || item.condition`).
String? _conditionLabel(String? condition) {
  if (condition == null || condition.trim().isEmpty) return null;
  final key =
      condition.trim().toLowerCase().replaceAll(RegExp(r'[\s_]+'), '-');
  const labels = <String, String>{
    'new': 'New',
    'like-new': 'Like New',
    'excellent': 'Excellent',
    'very-good': 'Very Good',
    'good': 'Good',
    'fair': 'Fair',
  };
  return labels[key] ?? condition.trim();
}

/// Compact grey condition chip shown above the cart line title (web cart tile
/// condition badge). CARTCH-19.
class _ConditionBadge extends StatelessWidget {
  final String label;
  const _ConditionBadge({required this.label});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
          color: AppPalette.of(context).surfaceMuted,
          borderRadius: BorderRadius.circular(4)),
      child: Text(label.toUpperCase(),
          style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              color: AppPalette.of(context).textPrimary)),
    );
  }
}

/// Compact rental booking chip on a cart line (web cart `RentalBookingSummary`)
/// — dates/times plus the billable unit count. CARTCH-07.
class _CartRentalSummary extends StatelessWidget {
  final RentalBooking booking;
  const _CartRentalSummary({required this.booking});

  String get _durationText {
    final units = booking.billableUnits;
    final singular = switch (booking.ratePeriod.toLowerCase()) {
      'hour' => 'hour',
      'night' => 'night',
      'day' => 'day',
      'week' => 'week',
      'month' => 'month',
      _ => 'day',
    };
    return '$units ${units == 1 ? singular : '${singular}s'}';
  }

  @override
  Widget build(BuildContext context) {
    final start = booking.startDate;
    final end = booking.endDate;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: AppPalette.of(context).infoFill, // blue-50
        border: Border.all(color: AppPalette.of(context).infoBorder), // blue-100
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.calendar_month_outlined,
                size: 13, color: AppPalette.of(context).accentInk),
            const SizedBox(width: 6),
            Text('Rental booking',
                style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 11,
                    color: AppPalette.of(context).accentInk)),
          ]),
          if (start != null || end != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                '${start != null ? formatRentalDate(start) : '?'}'
                '${booking.pickupTime != null ? ' at ${booking.pickupTime}' : ''}'
                ' to ${end != null ? formatRentalDate(end) : '?'}'
                '${booking.returnTime != null ? ' at ${booking.returnTime}' : ''}',
                style: TextStyle(fontSize: 11, color: AppPalette.of(context).accentInk),
              ),
            ),
          if (booking.billableUnits > 0)
            Text(_durationText,
                style:
                    TextStyle(fontSize: 11, color: AppPalette.of(context).infoText)),
        ],
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _QtyButton({required this.icon, this.onTap});
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
            color: AppPalette.of(context).background,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: AppPalette.of(context).border)),
        child: Icon(icon,
            size: 16, color: onTap == null ? Colors.grey : Colors.black),
      ),
    );
  }
}
