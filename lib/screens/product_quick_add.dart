import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../models/product.dart' show Product;
import '../models/product_detail.dart';
import '../theme.dart';
import 'product_detail_screen.dart';

/// Add to cart from a product card — the product page's purchase, started
/// from the card (web `product-card.tsx` `handleAddToCart`).
///
/// The cards used to put the listing straight into the cart with nothing
/// chosen. For a listing with options that is a different purchase from the
/// one its own page makes: the Cudy 4G router's internet packages (10–100
/// Mbps, TSh 100,000–240,000 on top) were never offered, and it went in at
/// the bare TSh 171,000. It also skipped the own-item and sign-in guards.
///
/// Now, as on the web, the card loads the listing and hands it to the same
/// path the page uses: the same guards in the same order, the same options
/// sheet when there is something to choose, the same cart line.
Future<void> quickAddToCart(BuildContext context, Product product,
    {ApiClient? api}) async {
  final loaded = await loadForPurchase(context, product, api: api);
  if (loaded == null || !context.mounted) return;
  await completePurchase(context, product, loaded, api: api);
}

/// The full listing and who is looking at it — everything the purchase needs
/// that a card does not carry. Null (after telling the buyer) when the
/// listing could not be read.
Future<({ProductDetail detail, int? viewerUserId})?> loadForPurchase(
    BuildContext context, Product product,
    {ApiClient? api}) async {
  final messenger = ScaffoldMessenger.of(context);
  final client = api ?? ApiClient();
  final token = AuthStore.instance?.token;

  // The card only carries a summary; the choices, the stock and the seller
  // live on the full listing (web `loadChoiceConfiguration`).
  final ProductDetail detail;
  try {
    detail = await client.fetchProductDetail(product.productId, token: token);
  } catch (_) {
    messenger.showSnackBar(const SnackBar(
        content: Text('Could not load product choices — please try again '
            'before adding this item.')));
    return null;
  }

  int? viewerUserId;
  if (token != null && token.isNotEmpty) {
    try {
      final me = await client.getUserDetails(token);
      viewerUserId = (me['userId'] as num?)?.toInt();
    } catch (_) {
      // Unknown viewer: the own-item guard simply cannot fire, exactly as on
      // the product page when its own lookup fails.
    }
  }
  return (detail: detail, viewerUserId: viewerUserId);
}

/// The product page's purchase, from what [loadForPurchase] read.
Future<void> completePurchase(BuildContext context, Product product,
    ({ProductDetail detail, int? viewerUserId}) loaded,
    {ApiClient? api}) async {
  final detail = loaded.detail;
  final viewerUserId = loaded.viewerUserId;
  if (!purchaseAllowed(context, detail, viewerUserId: viewerUserId)) return;

  // Web product-card `handleBuyOnPlatform`: a rental (its dates) or a
  // listing with something to choose opens the same sheet the product page
  // opens; nothing undated or unchosen reaches the cart.
  if (detail.rentalConfiguration != null ||
      detail.choiceAttributes.any((a) => a.buyerSelectable)) {
    final result = await showProductChoiceSheet(context,
        detail: detail,
        initialChoices: const {},
        initialQuantity: 1,
        api: api);
    if (result == null || !context.mounted) return;
    addDetailToCart(context, detail,
        viewerUserId: viewerUserId,
        buyNow: result.buyNow,
        quantity: result.quantity,
        choices: resolveSelectedChoices(detail, result.choices),
        rentalBooking: result.rentalBooking,
        unitPrice: result.unitPrice);
    return;
  }

  addDetailToCart(context, detail,
      viewerUserId: viewerUserId,
      buyNow: false,
      quantity: 1,
      choices: resolveSelectedChoices(detail, const {}));
}

/// The round add-to-cart button on every product card, grid and list alike.
///
/// Shows a spinner while the listing loads — on a slow connection that takes
/// long enough to tap twice — and ignores taps until it is done.
class QuickAddCartButton extends StatefulWidget {
  const QuickAddCartButton({
    super.key,
    required this.product,
    this.size = 44,
    this.api,
  });

  final Product product;
  final double size;
  final ApiClient? api;

  @override
  State<QuickAddCartButton> createState() => _QuickAddCartButtonState();
}

class _QuickAddCartButtonState extends State<QuickAddCartButton> {
  bool _busy = false;

  Future<void> _tap() async {
    if (_busy) return;
    setState(() => _busy = true);
    ({ProductDetail detail, int? viewerUserId})? loaded;
    try {
      loaded = await loadForPurchase(context, widget.product, api: widget.api);
    } finally {
      // The spinner covers the loading only. Once the options sheet is up,
      // the buyer is choosing, not waiting — a button still spinning behind
      // it would say otherwise.
      if (mounted) setState(() => _busy = false);
    }
    if (loaded == null || !mounted) return;
    await completePurchase(context, widget.product, loaded, api: widget.api);
  }

  @override
  Widget build(BuildContext context) {
    final quantity = widget.product.productQuantity;
    final outOfStock = quantity != null && quantity <= 0;
    return Material(
      key: ValueKey('quick-add-${widget.product.productId}'),
      color: outOfStock
          ? AppPalette.of(context).textMuted
          : const Color(0xFF2563EB),
      shape: const CircleBorder(),
      elevation: outOfStock ? 0 : 2,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: outOfStock || _busy ? null : _tap,
        child: SizedBox(
          width: widget.size,
          height: widget.size,
          child: Center(
            child: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                // A rental books dates rather than filling a basket.
                : Icon(
                    widget.product.isRental
                        ? Icons.event_available_outlined
                        : Icons.shopping_cart_outlined,
                    size: 19,
                    color: Colors.white,
                    semanticLabel:
                        widget.product.isRental ? 'Book now' : 'Add to cart'),
          ),
        ),
      ),
    );
  }
}
