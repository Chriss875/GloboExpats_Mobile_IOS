import 'package:intl/intl.dart';

import '../currency_controller.dart';
import '../domain/product_choices.dart'
    show ProductChoiceConfiguration, hasHalalChoice;

/// A product listing as returned by the GloboExpats API
/// (`/api/v1/displayItem/featured`, `/api/v1/products/get-all-products`, ...).
class Product {
  final int productId;
  final String productName;
  final String? productDescription;
  final double productAskingPrice;
  final double? productOriginalPrice;
  final String productCurrency;
  final String? productCondition;
  final int? productQuantity;
  final List<String> productImageUrls;
  final String? productRegion;
  final String? placeName;
  final String? sellerName;
  final String? sellerOrganization;
  final bool sellerVerified;
  final String? sellerType;
  final String? productSource;
  final String? vendorId;
  final String? categoryName;
  final String? subcategoryName;
  final double averageRating;
  final int totalRatingsCount;
  final double? deliveryFeeMin;
  final double? deliveryFeeMax;

  /// Total product clicks from `/products/{id}/clicks` tracking — the field the
  /// reference `trending` sort orders by (`(a as {views?: number}).views ?? 0`;
  /// the filter endpoint exposes it as `clickCount`).
  final int clickCount;

  /// The list payload carries `rentalConfiguration` on rentals; the card
  /// then books instead of adding to the cart (web product-card `isRental`).
  final bool isRental;

  /// The list payload's `choiceConfiguration` marks the listing Halal (web
  /// product-card `hasHalalChoice`), which puts the Halal badge on its card.
  final bool isHalal;

  /// When it was listed (`createdAtIso`, UTC), when the payload says.
  final DateTime? createdAt;

  const Product({
    required this.productId,
    required this.productName,
    this.productDescription,
    required this.productAskingPrice,
    this.productOriginalPrice,
    this.productCurrency = 'TZS',
    this.productCondition,
    this.productQuantity,
    this.productImageUrls = const [],
    this.productRegion,
    this.placeName,
    this.sellerName,
    this.sellerOrganization,
    this.sellerVerified = false,
    this.sellerType,
    this.productSource,
    this.vendorId,
    this.categoryName,
    this.subcategoryName,
    this.averageRating = 0,
    this.totalRatingsCount = 0,
    this.deliveryFeeMin,
    this.deliveryFeeMax,
    this.clickCount = 0,
    this.isRental = false,
    this.isHalal = false,
    this.createdAt,
  });

  String? get primaryImageUrl =>
      productImageUrls.isEmpty ? null : productImageUrls.first;

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      productId: (json['productId'] as num?)?.toInt() ?? 0,
      productName: json['productName'] as String? ?? '',
      productDescription: json['productDescription'] as String?,
      productAskingPrice: (json['productAskingPrice'] as num?)?.toDouble() ?? 0,
      productOriginalPrice: (json['productOriginalPrice'] as num?)?.toDouble(),
      productCurrency: json['productCurrency'] as String? ?? 'TZS',
      productCondition: json['productCondition'] as String?,
      productQuantity: (json['productQuantity'] as num?)?.toInt(),
      productImageUrls: _extractImageUrls(json['productImages']),
      productRegion: json['productRegion'] as String?,
      placeName: json['placeName'] as String?,
      sellerName: json['sellerName'] as String?,
      sellerOrganization: json['sellerOrganization'] as String?,
      sellerVerified: json['sellerVerified'] == true ||
          json['isVerified'] == true ||
          const {'VERIFIED', 'NATURAL_VERIFIED'}.contains(
              (json['sellerVerificationStatus'] ?? json['verificationStatus'])
                  ?.toString()
                  .toUpperCase()),
      sellerType: json['sellerType']?.toString(),
      productSource: json['productSource']?.toString(),
      vendorId: json['vendorId']?.toString(),
      categoryName: json['categoryName'] as String?,
      subcategoryName: json['subcategoryName'] as String?,
      averageRating: (json['averageRating'] as num?)?.toDouble() ?? 0,
      totalRatingsCount: (json['totalRatingsCount'] as num?)?.toInt() ?? 0,
      deliveryFeeMin: (json['sameRegionDeliveryFeeMin'] as num?)?.toDouble(),
      deliveryFeeMax: (json['sameRegionDeliveryFeeMax'] as num?)?.toDouble(),
      clickCount: (json['clickCount'] as num?)?.toInt() ?? 0,
      isRental: json['rentalConfiguration'] is Map,
      isHalal: json['choiceConfiguration'] is Map &&
          hasHalalChoice(ProductChoiceConfiguration.fromJson(
              (json['choiceConfiguration'] as Map).cast<String, dynamic>())),
      createdAt: DateTime.tryParse('${json['createdAtIso'] ?? ''}'),
    );
  }

  /// Newest first — web New Arrivals / `date-desc`: by listing time, falling
  /// back to the id (ids only ever grow) when a payload has no timestamp.
  static int newestFirst(Product a, Product b) {
    final at = a.createdAt, bt = b.createdAt;
    if (at != null && bt != null && at != bt) return bt.compareTo(at);
    return b.productId.compareTo(a.productId);
  }

  static List<String> _extractImageUrls(dynamic images) {
    if (images is! List) return const [];
    final urls = <String>[];
    for (final item in images) {
      if (item is Map && item['imageUrl'] is String) {
        urls.add(item['imageUrl'] as String);
      } else if (item is String) {
        urls.add(item);
      }
    }
    return urls;
  }

  /// Format a price the way the reference shows it: `TSh 1,234,567`, or in
  /// whatever currency the shopper picked in the header.
  ///
  /// Web parity `components/price-display.tsx`, which reads the currency
  /// context and re-denominates every displayed price. [currency] is the
  /// SOURCE the amount is stored in: TZS (everything the backend holds) is
  /// converted for display, and an amount already denominated in something
  /// else is left alone rather than double-converted.
  ///
  /// Display only — see [CurrencyController]; orders are charged in TZS.
  static String formatPrice(double amount, [String currency = 'TZS']) {
    if (currency == 'TZS') return CurrencyController.instance.format(amount);
    final s = NumberFormat('#,##0').format(amount);
    return '$s $currency';
  }
}
