import '../domain/rentals.dart';

/// A product image as listed by itemDetails (`productImages[]` items carry an
/// `imageId` plus `imageUrl`). Kept alongside [ProductDetail.productImages]
/// (plain URLs) so edit-listing can delete / re-cover individual photos by id.
class ProductImageRef {
  final int imageId;
  final String url;

  /// The photo's group on a property listing — "Bedroom", "Kitchen"… (web
  /// 2026-10, backend V152). Null when the seller grouped nothing.
  final String? groupName;
  const ProductImageRef(
      {required this.imageId, required this.url, this.groupName});
}

/// Full product detail from `/api/v1/displayItem/itemDetails/{id}` — the
/// product card fields plus description, seller, delivery and review extras.
class ProductDetail {
  final int productId;
  final int? sellerId;
  final String productName;
  final String productDescription;
  final double productAskingPrice;
  final double? productOriginalPrice;
  final String productCurrency;
  final String? productCondition;
  final int productQuantity;

  /// Calendar days the seller needs to prepare this item before it can be
  /// delivered. Buyer-facing delivery windows must start AFTER this period.
  final int productionTimeDays;

  /// AU-053 edit-listing prefill fields (carried by the itemDetails payload).
  final int? categoryId;
  final int? subcategoryId;
  final double? sellerPayout;

  /// The listing's own pricing snapshot (web passes these to
  /// `calculateCommissionPricing` when a priced choice or a rental reprices
  /// the line). Null means "use the defaults", exactly as on the web.
  final double? categoryCommissionPercentage;
  final double? vatRate;
  final double? selcomCommissionRate;
  final double? selcomTransactionRate;
  final String? productStreet;
  final String? transportRequirement;

  /// AU-014 web parity (`soldQuantity` on the detail payload): units already
  /// sold, rendered as "· N sold" next to the availability line when > 0.
  final int soldQuantity;
  final List<String> productImages;

  /// The same images as [productImages] but carrying their server ids (web
  /// `ProductImage[]`) — the edit screen deletes / re-covers by id.
  final List<ProductImageRef> imageRefs;

  /// Raw `choiceConfiguration` / `rentalConfiguration` blocks from the detail
  /// payload, kept verbatim so edit-listing can round-trip priced choices and
  /// rental periods it has no dedicated editor for (web re-sends both).
  final Map<String, dynamic>? rawChoiceConfiguration;
  final Map<String, dynamic>? rawRentalConfiguration;

  final String? productCountry;
  final String? productRegion;
  final String? placeName;
  final String? sellerName;
  final String? sellerOrganization;
  final String? profileImageUrl;
  final String? whatsappNumber;
  final String? categoryName;
  final String? subcategoryName;
  final String? formattedCreatedAt;
  final double averageRating;
  final int totalRatingsCount;
  final double? deliveryFeeMin;
  final double? deliveryFeeMax;

  /// AU-016 web parity: present on FOR_RENT listings; presence switches the
  /// purchase panel from quantity+add-to-cart to a date-range booking picker
  /// whose output is a `rentalBooking` joined to the cart line id.
  final RentalConfiguration? rentalConfiguration;
  final String? warranty;
  final List<ChoiceAttribute> choiceAttributes;
  // AU-013 hidden-guard + tracking fields (web parity: itemDetails payload).
  final int? sellerUserId;
  final int clickCount;
  final bool? deliverySetupReady;
  final bool deliverySetupGrandfathered;
  final double? latitude;
  final double? longitude;
  final String? deliveryTransportMode;
  final String? transportModeSource;
  final String? coordinatesSource;

  /// Computed at parse time from the raw payload (web parity
  /// `isPublicDeliveryReadyProduct` in lib/image-utils.ts).
  final bool publiclyDeliveryReady;

  const ProductDetail({
    required this.productId,
    this.sellerId,
    this.sellerUserId,
    this.clickCount = 0,
    this.deliverySetupReady,
    this.deliverySetupGrandfathered = false,
    this.latitude,
    this.longitude,
    this.deliveryTransportMode,
    this.transportModeSource,
    this.coordinatesSource,
    this.publiclyDeliveryReady = true,
    required this.productName,
    this.productDescription = '',
    required this.productAskingPrice,
    this.productOriginalPrice,
    this.productCurrency = 'TZS',
    this.productCondition,
    this.productQuantity = 0,
    this.productionTimeDays = 0,
    this.categoryId,
    this.subcategoryId,
    this.sellerPayout,
    this.categoryCommissionPercentage,
    this.vatRate,
    this.selcomCommissionRate,
    this.selcomTransactionRate,
    this.productStreet,
    this.transportRequirement,
    this.soldQuantity = 0,
    this.productImages = const [],
    this.imageRefs = const [],
    this.rawChoiceConfiguration,
    this.rawRentalConfiguration,
    this.productCountry,
    this.productRegion,
    this.placeName,
    this.sellerName,
    this.sellerOrganization,
    this.profileImageUrl,
    this.whatsappNumber,
    this.categoryName,
    this.subcategoryName,
    this.formattedCreatedAt,
    this.averageRating = 0,
    this.totalRatingsCount = 0,
    this.deliveryFeeMin,
    this.deliveryFeeMax,
    this.rentalConfiguration,
    this.warranty,
    this.choiceAttributes = const [],
  });

  factory ProductDetail.fromJson(Map<String, dynamic> json) {
    return ProductDetail(
      productId: (json['productId'] as num?)?.toInt() ?? 0,
      sellerId: (json['sellerId'] as num?)?.toInt(),
      productName: json['productName'] as String? ?? '',
      productDescription: json['productDescription'] as String? ?? '',
      productAskingPrice: (json['productAskingPrice'] as num?)?.toDouble() ?? 0,
      productOriginalPrice: (json['productOriginalPrice'] as num?)?.toDouble(),
      productCurrency: json['productCurrency'] as String? ?? 'TZS',
      productCondition: json['productCondition'] as String?,
      productQuantity: (json['productQuantity'] as num?)?.toInt() ?? 0,
      productionTimeDays: (json['requiresProductionTime'] == true)
          ? ((json['productionTimeDays'] as num?)?.toInt() ?? 0)
          : 0,
      categoryId: (json['categoryId'] as num?)?.toInt(),
      subcategoryId: (json['subcategoryId'] as num?)?.toInt(),
      sellerPayout: (json['sellerPayout'] as num?)?.toDouble(),
      categoryCommissionPercentage:
          (json['categoryCommissionPercentage'] as num?)?.toDouble(),
      vatRate: (json['vatRate'] as num?)?.toDouble(),
      selcomCommissionRate: (json['selcomCommissionRate'] as num?)?.toDouble(),
      selcomTransactionRate:
          (json['selcomTransactionRate'] as num?)?.toDouble(),
      productStreet: json['productStreet'] as String?,
      transportRequirement:
          (json['transportRequirement'] as String?)?.toUpperCase(),
      soldQuantity: (json['soldQuantity'] as num?)?.toInt() ?? 0,
      productImages: _images(json['productImages']),
      imageRefs: _imageRefs(json['productImages']),
      rawChoiceConfiguration: json['choiceConfiguration'] is Map
          ? (json['choiceConfiguration'] as Map).cast<String, dynamic>()
          : null,
      rawRentalConfiguration: json['rentalConfiguration'] is Map
          ? (json['rentalConfiguration'] as Map).cast<String, dynamic>()
          : null,
      productCountry: json['productCountry'] as String?,
      productRegion: json['productRegion'] as String?,
      placeName: json['placeName'] as String?,
      sellerName: json['sellerName'] as String?,
      sellerOrganization: json['sellerOrganization'] as String?,
      profileImageUrl: json['profileImageUrl'] as String?,
      whatsappNumber: json['whatsappNumber'] as String?,
      categoryName: json['categoryName'] as String?,
      subcategoryName: json['subcategoryName'] as String?,
      formattedCreatedAt: json['formattedCreatedAt'] as String?,
      averageRating: (json['productRating'] as num?)?.toDouble() ?? 0,
      totalRatingsCount: (json['totalRatingsCount'] as num?)?.toInt() ?? 0,
      deliveryFeeMin: (json['sameRegionDeliveryFeeMin'] as num?)?.toDouble(),
      deliveryFeeMax: (json['sameRegionDeliveryFeeMax'] as num?)?.toDouble(),
      rentalConfiguration:
          RentalConfiguration.fromJson(json['rentalConfiguration'] is Map
              ? (json['rentalConfiguration'] as Map).cast<String, dynamic>()
              : null),
      warranty: json['productWarranty'] as String?,
      choiceAttributes: _parseChoices(json['choiceConfiguration']),
      sellerUserId: (json['sellerUserId'] as num?)?.toInt(),
      clickCount: (json['clickCount'] as num?)?.toInt() ?? 0,
      // Compact list DTOs omit logistics fields — absence is NOT invalid, so
      // only an explicit `false` counts as not-ready (web filterPublicProducts).
      deliverySetupReady: json['deliverySetupReady'] as bool?,
      deliverySetupGrandfathered: json['deliverySetupGrandfathered'] as bool? ?? false,
      latitude: _coord(json['latitude']),
      longitude: _coord(json['longitude']),
      deliveryTransportMode: (json['deliveryTransportMode'] as String?)?.toUpperCase(),
      transportModeSource: json['transportModeSource'] as String?,
      coordinatesSource: json['coordinatesSource'] as String?,
      publiclyDeliveryReady:
          _isPubliclyDeliveryReady(json),
    );
  }

  static double? _coord(dynamic v) => (v is num) ? v.toDouble() : null;

  /// Web parity `isPublicDeliveryReadyProduct` (lib/image-utils.ts): a listing
  /// is buyer-visible when grandfathered, or explicitly ready, or (when the
  /// payload omits the ready flag) it carries a complete pickup pin +
  /// seller-selected transport mode.
  static bool _isPubliclyDeliveryReady(Map<String, dynamic> j) {
    if (j['deliverySetupGrandfathered'] == true) return true;
    final ready = j['deliverySetupReady'];
    if (ready is bool) return ready;
    final issues = j['deliverySetupIssues'];
    if (issues is List && issues.isNotEmpty) return false;
    final lat = _coord(j['latitude']);
    final lng = _coord(j['longitude']);
    final hasPin = _validCoords(lat, lng);
    final mode = (j['deliveryTransportMode'] as String?)?.trim().toUpperCase();
    final hasMode = const {'BODA', 'BAJAJI', 'GUTA', 'CAR', 'MINI_TRUCK', 'SEMI_TRUCK'}
        .contains(mode);
    final source = j['coordinatesSource'] as String?;
    final modeSource = j['transportModeSource'] as String?;
    if (!hasPin || !hasMode) return false;
    if (source != null && source != 'PINNED') return false;
    if (modeSource != null && modeSource != 'SELLER_SELECTED') return false;
    return true;
  }

  /// True when the listing carries a usable map pin (web `hasRentalMap`).
  bool get hasValidCoordinates => _validCoords(latitude, longitude);

  /// Web parity `isValidCoordinates` (lib/location-utils.ts).
  static bool _validCoords(double? lat, double? lng) {
    if (lat == null || lng == null) return false;
    if (lat == 0 && lng == 0) return false;
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  /// AU-013 hidden-guard predicate. True when the viewer must be the owner or
  /// an admin to see this listing (web app/product/[id]/page.tsx guard):
  /// `deliverySetupReady === false` AND the payload is not public-ready.
  bool get requiresPrivilegedViewer =>
      deliverySetupReady == false && !publiclyDeliveryReady;

  static List<ChoiceAttribute> _parseChoices(dynamic cfg) {
    if (cfg is! Map) return const [];
    final attrs = cfg['attributes'];
    if (attrs is! List) return const [];
    return attrs.whereType<Map<String, dynamic>>().map(ChoiceAttribute.fromJson).toList();
  }

  static List<String> _images(dynamic images) {
    if (images is! List) return const [];
    final out = <String>[];
    for (final item in images) {
      if (item is Map && item['imageUrl'] is String) out.add(item['imageUrl']);
    }
    return out;
  }

  static List<ProductImageRef> _imageRefs(dynamic images) {
    if (images is! List) return const [];
    final out = <ProductImageRef>[];
    for (final item in images) {
      if (item is Map && item['imageUrl'] is String) {
        final group = '${item['groupName'] ?? ''}'.trim();
        out.add(ProductImageRef(
          imageId: (item['imageId'] as num?)?.toInt() ?? 0,
          url: item['imageUrl'] as String,
          groupName: group.isEmpty || group == 'null' ? null : group,
        ));
      }
    }
    return out;
  }

  /// Location "Region, Street (place)" or fallback, as the reference shows.
  String get locationLabel {
    final parts = [placeName, productRegion, productCountry]
        .where((e) => e != null && e.isNotEmpty)
        .toList();
    return parts.join(', ');
  }

  /// AU-014 web parity (`quantityLimit` in components/product-actions.tsx):
  /// the quantity stepper/add-to-cart cap. Live stock when known, else the
  /// absolute ceiling (999).
  int get stockCap => productQuantity > 0 ? productQuantity : 999;

  /// AU-018 web parity (`isOutOfStock`): known stock that has hit zero.
  bool get isOutOfStock => productQuantity <= 0;

  /// Named photo groups on a property, each with the index of its first
  /// photo (web product-page-client `photoGroups`). Real estate only.
  List<({String name, int firstIndex})> get photoGroups {
    if ((categoryName ?? '').trim().toLowerCase() != 'real estate') {
      return const [];
    }
    final seen = <String>{};
    final out = <({String name, int firstIndex})>[];
    for (var i = 0; i < imageRefs.length; i++) {
      final name = imageRefs[i].groupName;
      if (name != null && seen.add(name)) out.add((name: name, firstIndex: i));
    }
    return out;
  }
}

/// A selectable value within a choice attribute.
class ChoiceValue {
  final String id;
  final String label;
  final bool active;

  /// What picking this value adds to (or takes off) the seller's payout. The
  /// buyer price follows through the commission maths (web
  /// `getSelectedSellerPayoutAdjustment`).
  final double sellerPayoutAdjustment;
  const ChoiceValue(
      {required this.id,
      required this.label,
      this.active = true,
      this.sellerPayoutAdjustment = 0});
  factory ChoiceValue.fromJson(Map<String, dynamic> j) {
    final adjustment = (j['sellerPayoutAdjustment'] as num?)?.toDouble() ?? 0;
    return ChoiceValue(
        id: (j['id'] ?? '').toString(),
        label: (j['label'] ?? '').toString(),
        active: j['active'] as bool? ?? true,
        sellerPayoutAdjustment: adjustment.isFinite ? adjustment : 0);
  }
}

/// A choice attribute the buyer must/can select for a product (e.g. "Pack Size").
class ChoiceAttribute {
  final int definitionId;
  final String name;
  final bool required;
  final String? defaultValueId;
  final List<ChoiceValue> values;
  const ChoiceAttribute({required this.definitionId, required this.name, required this.required, this.defaultValueId, this.values = const []});
  /// Values the seller left switched on. Web parity
  /// `getActiveProductChoiceValues` (lib/product-choices.ts:133).
  List<ChoiceValue> get activeValues =>
      values.where((v) => v.active).toList(growable: false);

  /// True when the buyer actually has something to pick. Web parity
  /// `isBuyerSelectableChoiceAttribute`: more than one active value.
  ///
  /// An attribute the seller pinned to a single value ("Material: Cotton") is
  /// a fact about the product, not a decision — the web shows it in the
  /// Specifications tab and never in the buy-box picker.
  bool get buyerSelectable => activeValues.length > 1;

  /// The counterpart: one active value, so it belongs with the specs
  /// (`getFixedProductChoiceAttributes`).
  bool get fixed => activeValues.length == 1;

  factory ChoiceAttribute.fromJson(Map<String, dynamic> j) => ChoiceAttribute(
        definitionId: (j['definitionId'] as num?)?.toInt() ?? 0,
        name: (j['name'] ?? '').toString(),
        required: j['required'] as bool? ?? false,
        defaultValueId: j['defaultValueId']?.toString(),
        values: (j['values'] is List ? j['values'] as List : const [])
            .whereType<Map<String, dynamic>>()
            .map(ChoiceValue.fromJson)
            .toList(),
      );
}

/// A picked choice carried to checkout (`{definitionId, valueId}`).
class SelectedChoice {
  final int definitionId;
  final String valueId;
  const SelectedChoice({required this.definitionId, required this.valueId});
  Map<String, dynamic> toJson() => {'definitionId': definitionId, 'valueId': valueId};
}

/// AU-013: aggregate click stats for a listing (web parity `clickStats` on
/// app/product/[id]/page.tsx — total views + unique viewers line).
class ProductClickStats {
  final int total;
  final int unique;
  const ProductClickStats({required this.total, required this.unique});

  static int _count(dynamic body, String key) {
    if (body is! Map) return 0;
    return (body[key] as num?)?.toInt() ?? 0;
  }

  factory ProductClickStats.fromTotalJson(dynamic body) =>
      ProductClickStats(total: _count(body, 'totalClickCount'), unique: _uniqueFallback(body));
  factory ProductClickStats.fromUniqueJson(dynamic body) =>
      ProductClickStats(total: _totalFallback(body), unique: _count(body, 'uniqueViewCount'));

  /// When only one of the two endpoints answers, keep the other side at 0
  /// rather than inventing a number.
  static int _totalFallback(dynamic body) => 0;
  static int _uniqueFallback(dynamic body) => 0;
}

/// AU-013: privileged per-viewer analytics (`/products/{id}/clicks/analytics`,
/// admin-gated by the backend — a non-admin gets 403 and the panel stays hidden).
class ProductClickAnalytics {
  final List<ProductViewer> viewers;
  const ProductClickAnalytics({this.viewers = const []});

  factory ProductClickAnalytics.fromJson(Map<String, dynamic> json) {
    final raw = json['viewers'];
    return ProductClickAnalytics(
      viewers: raw is List
          ? raw.whereType<Map<String, dynamic>>().map(ProductViewer.fromJson).toList()
          : const [],
    );
  }
}

class ProductViewer {
  final int? userId;
  final bool anonymous;
  final String? fullName;
  final String? email;
  final int totalViews;
  const ProductViewer({
    this.userId,
    required this.anonymous,
    this.fullName,
    this.email,
    this.totalViews = 0,
  });

  factory ProductViewer.fromJson(Map<String, dynamic> json) => ProductViewer(
        userId: (json['userId'] as num?)?.toInt(),
        anonymous: json['anonymous'] as bool? ?? false,
        fullName: json['fullName'] as String?,
        email: json['email'] as String?,
        totalViews: (json['totalViews'] as num?)?.toInt() ?? 0,
      );
}
