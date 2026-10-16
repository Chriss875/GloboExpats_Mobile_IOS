import 'package:flutter/material.dart';

import '../../config.dart';
import '../../domain/product_choices.dart'
    show ProductChoiceConfiguration, hasHalalChoice;
import '../../domain/description_parser.dart';
import '../../domain/seller_display.dart';
import '../../domain/share_links.dart';
import '../../models/product.dart' show Product;
import '../../models/product_detail.dart';
import '../../theme.dart';
import '../app_image.dart';
import 'share_cards.dart';
import 'share_kit.dart';

/// The bottom sheet both share entry points open: a header, then the body.
Future<void> _showShareSheet(BuildContext context,
    {required Widget header, required Widget body}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    backgroundColor: AppPalette.of(context).surface,
    builder: (sheetContext) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.92,
      minChildSize: 0.5,
      maxChildSize: 0.96,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 28),
        children: [
          header,
          Divider(height: 28, color: AppPalette.of(context).border),
          body,
        ],
      ),
    ),
  );
}

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({required this.title, required this.subtitle, this.leading});
  final String title;
  final String subtitle;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Row(children: [
      if (leading != null) ...[leading!, const SizedBox(width: 12)],
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                    color: palette.textPrimary)),
            const SizedBox(height: 2),
            Text(subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: palette.textSecondary)),
          ],
        ),
      ),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Product (web components/share-product-modal.tsx)
// ---------------------------------------------------------------------------

/// Share a listing. Everyone gets Portrait, Story, Photo and QR-only; the
/// seller looking at their own listing also gets the printable QR poster.
Future<void> showProductShareKit(
  BuildContext context, {
  required ProductDetail detail,
  bool isOwner = false,
  int? sharerId,
}) {
  final d = detail;
  final name = d.productName.trim();
  final price =
      d.productAskingPrice > 0 ? Product.formatPrice(d.productAskingPrice) : null;
  final description = parseProductDescription(d.productDescription)
      .description
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ');
  final condition = shareConditionLabel(d.productCondition);
  final location = d.locationLabel;
  final sellerName = publicSellerName(d.sellerName, fallback: '').trim();
  final seller = sellerName.isEmpty ? 'GloboExpats seller' : sellerName;
  final image = d.productImages.isEmpty
      ? null
      : AppConfig.resolveAssetUrl(d.productImages.first);
  // A plain /product/{id} keeps the QR simple and the printed link short.
  final shortPath = '/product/${d.productId}';
  final city = sharePlaceLabel(d.productRegion);

  final data = ShareCardData(
        kind: ShareCardKind.product,
        title: name,
        price: price,
        description: description.length > 240
            ? description.substring(0, 240)
            : description,
        category: d.categoryName,
        condition: condition,
        area: city,
        imageUrl: image,
        specs: [
          if (condition != null) ('Condition', condition),
          if ((d.categoryName ?? '').trim().isNotEmpty)
            ('Category', d.categoryName!),
          if (location.trim().isNotEmpty) ('Location', location),
          if (sellerName.isNotEmpty) ('Seller', sellerName),
        ],
        seller: ShareCardSeller(name: seller, city: city),
        displayUrl: shareDisplayUrl(shortPath),
        qrUrl: buildTrackedShareUrl(shortPath, ShareChannel.qr, sharerId),
        reference: '${d.productId}',
        halal: hasHalalChoice(
            ProductChoiceConfiguration.fromJson(d.rawChoiceConfiguration)),
      );

  return _showShareSheet(
    context,
    header: _SheetHeader(title: 'Share Product', subtitle: name),
    body: ShareKitView(
      data: data,
      designs: isOwner
          ? const [
              ShareDesign.square,
              ShareDesign.story,
              ShareDesign.sheet,
              ShareDesign.qr,
              ShareDesign.poster,
            ]
          : const [
              ShareDesign.square,
              ShareDesign.story,
              ShareDesign.sheet,
              ShareDesign.qr,
            ],
      shareUrl: productSharePath(d.productId, name),
      sharerId: sharerId,
      fileBase: 'globoexpats-${shareFileSlug(name)}',
      buildCaption: (link, design) => buildProductShareCaption(
        title: name,
        link: link,
        details: design == ShareDesign.qr || design == ShareDesign.poster,
        price: price,
        condition: condition,
        description: description,
        city: city,
        country: d.productCountry,
        location: location,
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Seller profile (web components/seller/share-seller-profile-modal.tsx)
// ---------------------------------------------------------------------------

/// What the seller's own shop pictures need.
class SellerShareKitDetails {
  const SellerShareKitDetails({
    required this.sellerId,
    required this.listings,
    this.listingCount,
    this.verified = false,
    this.city,
    this.statsText,
  });
  final int sellerId;
  final bool verified;
  final String? city;

  /// e.g. "★ 4.8 · 12 reviews".
  final String? statsText;

  /// Up to six listings with photos for the collage.
  final List<ShareCardItem> listings;

  /// The whole catalogue's size ("+N more in the shop").
  final int? listingCount;
}

/// Share a seller profile: the Shop showcase (three layouts), QR poster and
/// QR-only pictures in every template — for the seller and for anyone else
/// passing the shop on. [sharerId] is the signed-in person sharing, credited
/// on the links (web `mtm_content`); null when signed out.
Future<void> showSellerShareSheet(
  BuildContext context, {
  required String sellerName,
  required String profilePath,
  required SellerShareKitDetails kit,
  String? profileImageUrl,
  int? sharerId,
}) {
  final message = sellerShareMessage(sellerName);
  final header = _SheetHeader(
    title: 'Share seller profile',
    subtitle: sellerName,
    leading: _SellerAvatar(name: sellerName, imageUrl: profileImageUrl),
  );
  final data = ShareCardData(
    kind: ShareCardKind.shop,
    title: sellerName,
    imageUrl: kit.listings.isEmpty ? null : kit.listings.first.imageUrl,
    items: kit.listings,
    itemCount: kit.listingCount,
    seller: ShareCardSeller(
      name: sellerName,
      verified: kit.verified,
      city: kit.city,
      statsText: kit.statsText,
    ),
    displayUrl: shareDisplayUrl(profilePath),
    qrUrl: buildTrackedShareUrl(profilePath, ShareChannel.qr, sharerId),
  );
  return _showShareSheet(
    context,
    header: header,
    body: ShareKitView(
      data: data,
      designs: const [ShareDesign.shop, ShareDesign.poster, ShareDesign.qr],
      shareUrl: profilePath,
      sharerId: sharerId,
      fileBase: 'globoexpats-${shareFileSlug(sellerName)}-shop',
      buildCaption: (link, _) => '$message\n$link',
    ),
  );
}

class _SellerAvatar extends StatelessWidget {
  const _SellerAvatar({required this.name, this.imageUrl});
  final String name;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: palette.infoFill,
        border: Border.all(color: palette.border),
      ),
      clipBehavior: Clip.antiAlias,
      alignment: Alignment.center,
      child: (imageUrl ?? '').isNotEmpty
          ? ClipOval(child: AppImage(imageUrl!, fit: BoxFit.cover))
          : Text(shareInitials(name),
              style: TextStyle(
                  fontWeight: FontWeight.w700, color: palette.accentInk)),
    );
  }
}
