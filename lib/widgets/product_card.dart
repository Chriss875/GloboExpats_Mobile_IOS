import '../widgets/app_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../config.dart';
import '../cart/saved_products_store.dart';
import '../domain/seller_display.dart';
import '../models/product.dart';
import '../screens/product_quick_add.dart';
import '../theme.dart';
import 'error_text.dart';
import 'halal_badge.dart';
import 'stay_dates_scope.dart';

/// The height a [ProductCard] of [width] needs to hold its own content.
///
/// Every grid and rail that shows these cards used a fixed aspect ratio
/// (0.55), which is a guess about content that is not constant: the price row
/// is pinned to the bottom of the cell (web parity `mt-auto`), so whatever
/// height the cell had spare showed up as one gap between the location line
/// and the price — ~26pt on a phone, and worse for the compact cards on Home,
/// whose type is smaller.
///
/// The split below is measured, not estimated: a card was rendered at both
/// 1.0x and 1.3x text scale, giving the part that tracks the font (the four
/// text rows) and the part that does not (paddings, the 4:3 image's margin,
/// and the save/cart buttons, which are icon-sized).
///
///   regular: 170.5pt of content at 1.0x, 184.5 at 1.3x
///   compact: 155.0pt at 1.0x, 167.5 at 1.3x
///
/// The cushion is the straight-line fit's margin of error — a font that
/// rounds up has to land in slack rather than in a clipped card.
double productCardHeight(
  BuildContext context, {
  required double width,
  bool compact = false,
}) {
  const cushion = 8.0;
  final fixed = compact ? 113.3 : 123.8;
  final scalable = compact ? 41.7 : 46.7;
  return width * 3 / 4 +
      fixed +
      MediaQuery.textScalerOf(context).scale(scalable) +
      cushion;
}

/// Tappable product listing card, mirrored on Home, Browse, Category and
/// Search screens. On tap it opens the product detail screen.
class ProductCard extends StatefulWidget {
  final Product product;
  final bool compact;
  const ProductCard(this.product, {super.key, this.compact = false});

  @override
  State<ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends State<ProductCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final compact = widget.compact;
    final seller = publicSellerName(product.sellerName, fallback: '');
    final initials = publicInitials(product.sellerName, fallback: '');
    final hasRating =
        product.averageRating > 0 && product.totalRatingsCount > 0;
    final outOfStock =
        product.productQuantity != null && product.productQuantity! <= 0;
    final verifiedLabel = _verifiedLabel(product);
    // Web parity `showVerification = product.isVerified && Boolean(shortName)`
    // — the badge belongs to a named seller, so a card with no seller line
    // shows nothing.
    final showVerification =
        listingVerificationBadgeVisible(product.sellerVerified) &&
            seller.isNotEmpty;
    final padding = compact ? 8.0 : 10.0;

    return AnimatedScale(
      scale: _pressed ? .985 : 1,
      duration: const Duration(milliseconds: 150),
      curve: Curves.easeOutCubic,
      child: Semantics(
        button: true,
        label: 'View ${product.productName}',
        child: Material(
          color: AppPalette.of(context).surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: AppPalette.of(context).borderStrong),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onHighlightChanged: (value) {
              if (_pressed != value) setState(() => _pressed = value);
            },
            onTap: () => context.push(
                StayDatesScope.productPath(context, product.productId),
                extra: product),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AspectRatio(
                  // Web parity: product-card.tsx image wrapper is `aspect-[4/3]`.
                  aspectRatio: 4 / 3,
                  child: Stack(fit: StackFit.expand, children: [
                    ColoredBox(
                      color: AppPalette.of(context).surfaceMuted,
                      child: Padding(
                        padding: const EdgeInsets.all(4),
                        child: product.primaryImageUrl != null
                            ? AppImage(
                                AppConfig.resolveAssetUrl(
                                    product.primaryImageUrl!),
                                fit: BoxFit.contain,
                                width: double.infinity,
                                height: double.infinity)
                            : Icon(Icons.image_not_supported_outlined,
                                size: 40, color: AppPalette.of(context).textSecondary),
                      ),
                    ),
                    // Web parity: the Halal badge takes the top-left corner
                    // and the out-of-stock label moves over beside it.
                    if (product.isHalal)
                      Positioned(
                        left: 6,
                        top: 6,
                        child: HalalBadge(size: compact ? 28 : 32),
                      ),
                    if (outOfStock)
                      Positioned(
                        left: product.isHalal ? (compact ? 40 : 44) : 8,
                        top: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 9, vertical: 5),
                          decoration: BoxDecoration(
                            color: const Color(0xFFDC2626),
                            borderRadius: BorderRadius.circular(7),
                            border: Border.all(
                                color: Colors.white.withValues(alpha: .2),
                                width: 2),
                          ),
                          child: const Text('OUT OF STOCK',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 9,
                                  fontWeight: FontWeight.w800)),
                        ),
                      ),
                    Positioned(
                      right: 6,
                      top: 6,
                      child: ProductSaveButton(product: product, compact: compact),
                    ),
                  ]),
                ),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.all(padding),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          height: compact ? 30 : 34,
                          child: Text(product.productName,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontFamily: 'Lexend',
                                  fontSize: compact ? 12 : 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppPalette.of(context).textPrimary,
                                  height: 1.25)),
                        ),
                        const SizedBox(height: 6),
                        if (seller.isNotEmpty)
                          Row(children: [
                            Container(
                              width: compact ? 20 : 24,
                              height: compact ? 20 : 24,
                              alignment: Alignment.center,
                              decoration: const BoxDecoration(
                                  color: AppColors.brandBlue,
                                  shape: BoxShape.circle),
                              child: Text(initials,
                                  style: TextStyle(
                                      color: Colors.white,
                                      fontSize: compact ? 8 : 9,
                                      fontWeight: FontWeight.w800)),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(seller,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: compact ? 11 : 12,
                                      fontWeight: FontWeight.w500,
                                      color: AppPalette.of(context).textSecondary)),
                            ),
                            if (product.clickCount > 0) ...[
                              const SizedBox(width: 4),
                              Icon(Icons.visibility_outlined,
                                  size: compact ? 11 : 12,
                                  color: AppPalette.of(context).textSecondary),
                              const SizedBox(width: 2),
                              Text('${product.clickCount}',
                                  style: TextStyle(
                                      fontSize: compact ? 10 : 11,
                                      color: AppPalette.of(context).textSecondary)),
                            ],
                          ]),
                        if (showVerification || hasRating) ...[
                          const SizedBox(height: 6),
                          // One reserved height for the trust row whether it
                          // carries the badge, the rating or both (web parity:
                          // each meta block reserves a `min-h`). The rating's
                          // star is taller than the badge's tick, so without
                          // this two neighbouring cards sat a few pixels out
                          // of line.
                          ConstrainedBox(
                            constraints: BoxConstraints(
                                minHeight:
                                    MediaQuery.textScalerOf(context).scale(20)),
                            child: Row(children: [
                            if (showVerification) ...[
                              Icon(Icons.verified_rounded,
                                  size: 14, color: AppPalette.of(context).successText),
                              const SizedBox(width: 3),
                              Expanded(
                                child: Text(verifiedLabel,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                        fontSize: 10,
                                        height: 1,
                                        fontWeight: FontWeight.w600,
                                        color: AppPalette.of(context).successText)),
                              ),
                            ] else
                              const Spacer(),
                            if (hasRating) ...[
                              const SizedBox(width: 5),
                              const Icon(Icons.star_rounded,
                                  size: 16, color: Color(0xFFF59E0B)),
                              const SizedBox(width: 2),
                              Text(product.averageRating.toStringAsFixed(1),
                                  style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600)),
                              Text(' (${product.totalRatingsCount})',
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: AppPalette.of(context).textSecondary)),
                            ]
                            ]),
                          ),
                        ],
                        if ((product.placeName ?? product.productRegion ?? '')
                            .isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(product.placeName ?? product.productRegion!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: compact ? 11 : 12,
                                  color: AppPalette.of(context).textSecondary)),
                        ],
                        const Spacer(),
                        Row(children: [
                          Expanded(
                            child: Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              spacing: 5,
                              children: [
                                Text(
                                    Product.formatPrice(
                                        product.productAskingPrice),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                        fontFamily: 'Lexend',
                                        fontSize: compact ? 17 : 18,
                                        height: 1.05,
                                        fontWeight: FontWeight.w800,
                                        color: AppColors.price)),
                                if (product.productOriginalPrice != null &&
                                    product.productOriginalPrice! >
                                        product.productAskingPrice)
                                  Text(
                                      Product.formatPrice(
                                          product.productOriginalPrice!),
                                      style: TextStyle(
                                          fontSize: 10,
                                          color: AppPalette.of(context).textSecondary,
                                          decoration:
                                              TextDecoration.lineThrough)),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          // The product page's purchase, from the card: the
                          // same guards, the options sheet when there is
                          // something to choose, the same cart line.
                          QuickAddCartButton(
                              product: product, size: compact ? 40 : 44),
                        ]),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _verifiedLabel(Product product) {
    final type = (product.sellerType ?? '').toUpperCase();
    final source = (product.productSource ?? '').toLowerCase();
    final shop = source == 'shops' ||
        (product.vendorId ?? '').isNotEmpty ||
        (product.sellerOrganization ?? '').isNotEmpty ||
        const [
          'SHOP',
          'VENDOR',
          'BUSINESS',
          'COMPANY',
          'ORGANIZATION',
          'MERCHANT'
        ].any(type.contains);
    return shop ? 'Verified Shop' : 'Verified Seller';
  }
}

/// Web parity: product-card.tsx's wishlist toggle in the top-right corner of
/// the image (`absolute right-2 top-2`, filled/red once saved). Reads and
/// writes the app-wide [SavedProductsStore.instance] so a heart toggled here
/// stays in sync with the detail screen and the saved-items list.
class ProductSaveButton extends StatelessWidget {
  const ProductSaveButton(
      {super.key, required this.product, this.compact = false});
  final Product product;
  final bool compact;

  Future<void> _toggle(BuildContext context) async {
    final token = AuthStore.instance?.token;
    final messenger = ScaffoldMessenger.of(context);
    if (token == null) {
      messenger.showSnackBar(const SnackBar(
          content: Text('Log in to save items to your wishlist.')));
      return;
    }
    try {
      final saved =
          await SavedProductsStore.instance.toggle(product.productId, token);
      messenger.showSnackBar(SnackBar(
          content: Text(saved
              ? 'Saved to your wishlist.'
              : 'Removed from your wishlist.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(friendlyApiError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: SavedProductsStore.instance,
      builder: (context, _) {
        final saved = SavedProductsStore.instance.isSaved(product.productId);
        final size = compact ? 26.0 : 30.0;
        return Semantics(
          button: true,
          label: saved ? 'Remove from wishlist' : 'Save to wishlist',
          child: Material(
            color: saved
                ? AppPalette.of(context).dangerFill
                // A translucent chip floating over an arbitrary photo: it
                // takes the theme's surface so it reads as a control in both
                // modes rather than a white dot on a dark card.
                : AppPalette.of(context).surface.withValues(alpha: .85),
            shape: CircleBorder(
                side: BorderSide(
                    color: saved
                        ? AppPalette.of(context).dangerBorder
                        : AppPalette.of(context).border)),
            elevation: 1,
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () => _toggle(context),
              child: SizedBox(
                width: size,
                height: size,
                child: Icon(
                  saved ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                  size: compact ? 14 : 16,
                  color: saved
                      ? const Color(0xFFDC2626)
                      : AppPalette.of(context).textSecondary,
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
