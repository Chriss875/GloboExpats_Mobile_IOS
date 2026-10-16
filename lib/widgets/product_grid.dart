import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../config.dart';
import '../models/product.dart';
import '../screens/product_quick_add.dart';
import '../theme.dart';
import 'app_image.dart';
import 'halal_badge.dart';
import 'product_card.dart';
import 'skeleton_loader.dart';
import 'stay_dates_scope.dart';

/// Non-scrolling 2-column grid of product cards, used inside scrollable pages
/// (Home, Browse, Category, Search). Rendering is bound to a plain sync
/// widget so the parent controls the data source / loading state.
class ProductGrid extends StatelessWidget {
  final List<Product> products;
  const ProductGrid(this.products, {super.key});

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(32),
        child: Center(
            child: Text('No products found.',
                style: TextStyle(color: Colors.grey))),
      );
    }
    // Cells are sized to what the card actually holds — see
    // [productCardHeight] for the measurement and for why a fixed ratio left
    // a gap between the location line and the price row.
    return LayoutBuilder(builder: (context, constraints) {
      const horizontalPadding = 12.0;
      const crossSpacing = 10.0;
      final cardWidth =
          (constraints.maxWidth - horizontalPadding * 2 - crossSpacing) / 2;
      final cardHeight = productCardHeight(context, width: cardWidth);

      return GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: horizontalPadding),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: cardWidth / cardHeight,
          crossAxisSpacing: crossSpacing,
          mainAxisSpacing: 12,
        ),
        itemCount: products.length,
        itemBuilder: (context, i) => ProductCard(products[i]),
      );
    });
  }
}

/// [ProductGrid] as a sliver for long, growing lists (the marketplace's
/// infinite scroll): only the cards on screen are built, instead of every
/// card loaded so far.
class SliverProductGrid extends StatelessWidget {
  final List<Product> products;
  const SliverProductGrid(this.products, {super.key});

  @override
  Widget build(BuildContext context) {
    return SliverLayoutBuilder(builder: (context, constraints) {
      const horizontalPadding = 12.0;
      const crossSpacing = 10.0;
      final cardWidth = (constraints.crossAxisExtent -
              horizontalPadding * 2 -
              crossSpacing) /
          2;
      final cardHeight = productCardHeight(context, width: cardWidth);
      return SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: horizontalPadding),
        sliver: SliverGrid(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            childAspectRatio: cardWidth / cardHeight,
            crossAxisSpacing: crossSpacing,
            mainAxisSpacing: 12,
          ),
          delegate: SliverChildBuilderDelegate(
            (context, i) => ProductCard(products[i]),
            childCount: products.length,
          ),
        ),
      );
    });
  }
}

/// [ProductListRows] as a lazily built sliver.
class SliverProductListRows extends StatelessWidget {
  final List<Product> products;
  const SliverProductListRows(this.products, {super.key});

  @override
  Widget build(BuildContext context) {
    return SliverList(
      delegate: SliverChildBuilderDelegate(
        (context, i) => Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          child: _ProductRow(products[i]),
        ),
        childCount: products.length,
      ),
    );
  }
}

/// Horizontal list-view rows of the same cards (browse `viewMode: 'list'`
/// parity — reference app/browse/page.tsx L1942-1961 toggle): thumbnail left,
/// title/price/seller/location right.
class ProductListRows extends StatelessWidget {
  final List<Product> products;
  const ProductListRows(this.products, {super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final p in products)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: _ProductRow(p),
          ),
      ],
    );
  }
}

class _ProductRow extends StatelessWidget {
  final Product product;
  const _ProductRow(this.product);

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.push(
          StayDatesScope.productPath(context, product.productId),
          extra: product),
      child: SizedBox(
        height: 132,
        child: Container(
          decoration: BoxDecoration(
            color: AppPalette.of(context).surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppPalette.of(context).border),
          ),
          clipBehavior: Clip.antiAlias,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 108,
                // Web parity product-card.tsx:872 — the list thumbnail is
                // `object-contain p-1` on a neutral panel, exactly like the
                // grid card. BoxFit.cover filled the box by cropping the
                // product out of its own frame: a wide photo lost both ends,
                // so glasses and similar items showed only their middle.
                child: Stack(fit: StackFit.expand, children: [
                  ColoredBox(
                    color: AppPalette.of(context).surfaceMuted,
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: product.primaryImageUrl != null
                          ? AppImage(
                              AppConfig.resolveAssetUrl(
                                  product.primaryImageUrl!),
                              fit: BoxFit.contain)
                          : Icon(Icons.image_not_supported_outlined,
                              size: 34,
                              color: AppPalette.of(context).textSecondary),
                    ),
                  ),
                  // The same badge and heart as the grid card, so switching
                  // the layout toggle keeps both.
                  if (product.isHalal)
                    const Positioned(
                        left: 5, top: 5, child: HalalBadge(size: 26)),
                  Positioned(
                    right: 5,
                    top: 5,
                    child: ProductSaveButton(product: product, compact: true),
                  ),
                ]),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(product.productName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13.5, fontWeight: FontWeight.w600)),
                      if (product.sellerName != null) ...[
                        const SizedBox(height: 3),
                        Text(product.sellerName!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 11, color: AppPalette.of(context).textSecondary)),
                      ],
                      if (product.placeName != null) ...[
                        const SizedBox(height: 1),
                        Row(children: [
                          Icon(Icons.place_outlined,
                              size: 12, color: AppPalette.of(context).textSecondary),
                          const SizedBox(width: 2),
                          Expanded(
                            child: Text(product.placeName!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 10.5,
                                    color: AppPalette.of(context).textSecondary)),
                          ),
                        ]),
                      ],
                      const Spacer(),
                      Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Expanded(
                              child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(children: [
                                      const Icon(Icons.star,
                                          size: 13, color: Colors.amber),
                                      const SizedBox(width: 2),
                                      Text(
                                          product.averageRating > 0
                                              ? product.averageRating
                                                  .toStringAsFixed(1)
                                              : 'New',
                                          style: TextStyle(
                                              fontSize: 11,
                                              color: AppPalette.of(context).textSecondary)),
                                    ]),
                                    const SizedBox(height: 2),
                                    Text(
                                        Product.formatPrice(
                                            product.productAskingPrice),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            fontFamily: 'Lexend',
                                            fontSize: 17,
                                            height: 1.05,
                                            fontWeight: FontWeight.w800,
                                            color: AppColors.price)),
                                  ]),
                            ),
                            // The grid card's add-to-cart button, exactly:
                            // same circle, same blue, same lift and the same
                            // out-of-stock state. Switching the layout toggle
                            // used to change the shape of the button too,
                            // which read as two different controls.
                            // The grid card's button, and the product page's
                            // purchase behind it — one path for both layouts.
                            QuickAddCartButton(product: product, size: 40),
                          ]),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shared loading + error + grid wrapper for the public catalog screens.
class CatalogGrid extends StatefulWidget {
  final Future<List<Product>> future;
  const CatalogGrid(this.future, {super.key});
  @override
  State<CatalogGrid> createState() => _CatalogGridState();
}

class _CatalogGridState extends State<CatalogGrid> {
  late Future<List<Product>> _future = widget.future;
  @override
  void didUpdateWidget(covariant CatalogGrid old) {
    super.didUpdateWidget(old);
    if (old.future != widget.future) _future = widget.future;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Product>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const ProductGridSkeleton();
        }
        if (snap.hasError) {
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Center(
                child: Text('Could not load products: ${snap.error}',
                    textAlign: TextAlign.center)),
          );
        }
        return ProductGrid(snap.data ?? const []);
      },
    );
  }
}
