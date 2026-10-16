import 'dart:async';

import 'package:flutter/foundation.dart';

import '../domain/commission_calculator.dart';
import '../domain/rentals.dart' as rentals;
import '../domain/stay_listing.dart';
import '../domain/delivery_fare.dart';
import '../domain/product_choices.dart';
import '../domain/currency.dart';
import '../domain/listing_submit_utils.dart';
import '../auth/auth_store.dart';
import '../config.dart';
import '../storage/kv_store.dart';

/// Whether the listing needs platform logistics (SELL_FLOW_SPEC §1).
enum TransportRequirement { required, optional, exempt }

/// Rental configuration carried on a listing (phase 1 subset: no calendar).
class RentalConfiguration {
  final bool enabled;
  final String listingType; // FOR_SALE | FOR_RENT
  final String ratePeriod; // HOUR | NIGHT | DAY | WEEK | MONTH

  /// Short-stay purpose (web 2026-10, backend V151) — set by the short-stays
  /// subcategory, independent of the rate period.
  final bool shortStay;

  /// The host's minimum stay per rate period; null means 1.
  final int? minimumNights;
  final int? minimumDays;
  final int? minimumMonths;
  const RentalConfiguration({
    this.enabled = false,
    this.listingType = 'FOR_SALE',
    this.ratePeriod = 'DAY',
    this.shortStay = false,
    this.minimumNights,
    this.minimumDays,
    this.minimumMonths,
  });

  /// Web `isShortStayConfiguration`.
  bool get isShortStay =>
      enabled &&
      (shortStay || listingType == 'SHORT_STAY' || ratePeriod == 'NIGHT');

  /// Which minimum this listing asks for (web rental-listing-editor): nights
  /// for a stay priced per night or week, days or months for a property
  /// priced that way; vehicles have none.
  String? minimumKind({required bool vehicle}) {
    if (!AppConfig.propertyRentals || !enabled || vehicle) return null;
    if (ratePeriod == 'DAY') return 'days';
    if (ratePeriod == 'MONTH') return 'months';
    if (isShortStay && ratePeriod != 'HOUR') return 'nights';
    return null;
  }

  RentalConfiguration copyWith({
    String? ratePeriod,
    int? minimumNights,
    int? minimumDays,
    int? minimumMonths,
  }) =>
      RentalConfiguration(
        enabled: enabled,
        listingType: listingType,
        ratePeriod: ratePeriod ?? this.ratePeriod,
        shortStay: shortStay,
        minimumNights: minimumNights ?? this.minimumNights,
        minimumDays: minimumDays ?? this.minimumDays,
        minimumMonths: minimumMonths ?? this.minimumMonths,
      );

  Map<String, dynamic> toJson() => {
        'enabled': enabled,
        'listingType': listingType,
        'ratePeriod': ratePeriod,
        // An older backend refuses the whole listing over unknown keys.
        if (AppConfig.propertyRentals) ...{
          if (shortStay) 'shortStay': true,
          if (minimumNights != null) 'minimumNights': minimumNights,
          if (minimumDays != null) 'minimumDays': minimumDays,
          if (minimumMonths != null) 'minimumMonths': minimumMonths,
        },
      };

  static RentalConfiguration fromJson(Map<String, dynamic> j) {
    int? count(String key) => (j[key] is num)
        ? (j[key] as num).toInt()
        : int.tryParse('${j[key] ?? ''}');
    return RentalConfiguration(
      enabled: j['enabled'] as bool? ?? false,
      listingType: j['listingType'] as String? ?? 'FOR_SALE',
      ratePeriod: j['ratePeriod'] as String? ?? 'DAY',
      shortStay: j['shortStay'] == true,
      minimumNights: count('minimumNights'),
      minimumDays: count('minimumDays'),
      minimumMonths: count('minimumMonths'),
    );
  }
}

/// Web sell validation for the minimum stay: whole numbers, 1-365 nights or
/// days, 1-120 months.
String? validateMinimumStay(RentalConfiguration c, {required bool vehicle}) {
  switch (c.minimumKind(vehicle: vehicle)) {
    case 'nights':
      final n = c.minimumNights ?? 1;
      return n < 1 || n > 365
          ? 'Minimum stay must be between 1 and 365 nights'
          : null;
    case 'days':
      final n = c.minimumDays ?? 1;
      return n < 1 || n > 365
          ? 'Minimum stay must be between 1 and 365 days'
          : null;
    case 'months':
      final n = c.minimumMonths ?? 1;
      return n < 1 || n > 120
          ? 'Minimum stay must be between 1 and 120 months'
          : null;
  }
  return null;
}

/// One picked photo pending upload. Bytes-based (AU-040 D1): the web build
/// has no dart:io File system, so a picked image is held as decoded bytes and
/// rendered with Image.memory — File(path) thumbnails never painted on web.
class PendingImage {
  final String name; // original file name, used as the multipart filename
  final Uint8List bytes;
  final bool isCover;

  /// A property photo's group — "Bedroom", "Kitchen"… (web 2026-10).
  final String? groupName;
  const PendingImage(
      {required this.name,
      required this.bytes,
      this.isCover = false,
      this.groupName});

  PendingImage copyWith({bool? isCover, String? groupName, bool clearGroup = false}) =>
      PendingImage(
        name: name,
        bytes: bytes,
        isCover: isCover ?? this.isCover,
        groupName: clearGroup ? null : (groupName ?? this.groupName),
      );
}

/// ChangeNotifier held by the wizard shell across all four steps — the Dart
/// mirror of the web `/sell` FormData (SELL_FLOW_SPEC §1).
/// Step 1's error for a profile with no WhatsApp number. The wizard reacts to
/// it by asking for the number right there instead of sending the seller to
/// Settings (where a saved number never made it back into an open wizard).
const String kSellMissingWhatsAppError =
    'Add your WhatsApp number so buyers can reach you about this listing.';

class SellFormState extends ChangeNotifier {
  // ---- Step 1: details ------------------------------------------------------
  String title = '';
  int? categoryId;
  int? subcategoryId;
  String categoryName = '';
  String categorySlug = '';
  String subcategorySlug = '';

  /// Human subcategory name kept for the review step (web review-step.tsx:159-162
  /// shows `selectedSubcategory.subcategoryName`). The payload only needs the
  /// id, so this is display-only state.
  String subcategoryName = '';
  double? categoryCommissionRate;
  String location = '';
  String street = '';
  int? selectedAddressId;
  double? latitude;
  double? longitude;
  String placeName = '';
  String neighbourhood = '';
  String whatsappNumber = '';
  RentalConfiguration rentalConfiguration = const RentalConfiguration();
  ProductChoiceConfiguration choiceConfiguration =
      ProductChoiceConfiguration.empty;

  // ---- Step 2: photos & description ----------------------------------------
  final List<PendingImage> images = [];
  String description = '';
  int quantity = 1;
  bool requiresProductionTime = false;

  /// Kept as text while typing so a half-entered value isn't silently coerced
  /// (web holds it as a string for the same reason); validated on Next.
  String productionTimeDays = '';
  String itemAge = '';

  // ---- Step 3: pricing & delivery ------------------------------------------
  /// The currency the seller is TYPING in. The backend only ever stores TZS,
  /// so the publish payload converts on the way out (web `askingPriceInTZS`).
  String currency = 'TZS';
  bool pricingForward = true; // true = typing payout, false = typing price
  double sellerPayout = 0;
  double price = 0;
  double originalPrice = 0;
  bool smartRounding = true;
  TransportRequirement transportRequirement = TransportRequirement.required;
  TransportMode? transportMode;
  DeliveryFeeBands? feeBands;

  /// Commission rates — defaults to the cached live platform settings when
  /// they have been fetched (see `currentCommissionRates`), otherwise the
  /// documented 0.18 / 0.02 / 0.02 defaults (FINANC-02 parity).
  CommissionRates rates = currentCommissionRates;

  bool get isRental => rentalConfiguration.enabled;

  /// Whether the chosen category/subcategory can carry a rental listing at all
  /// (web `RentalListingEditor supportsRentalListing`): every real-estate
  /// subcategory, plus vehicle-for-rent ones. This is broader than [isRental] —
  /// it also covers real-estate subcategories that default to FOR_SALE and let
  /// the seller opt into booking.
  bool get rentalCapable =>
      rentals.isRentalListingCategory(categorySlug, subcategorySlug);

  /// Whether the subcategory forces booking automatically (web
  /// `automaticConfiguration` non-null). A purpose dropdown on such a
  /// subcategory offers no 'For sale' option.
  bool get rentalAutomatic =>
      rentals.getDefaultRentalConfiguration(categorySlug, subcategorySlug) !=
      null;

  /// Vehicle-for-rent listings price by HOUR/DAY/WEEK/MONTH; every other
  /// rental by NIGHT/DAY/WEEK/MONTH (web `RentalListingEditor`).
  bool get isVehicleRental => categorySlug == 'vehicle-supplies';

  TransportRequirement get effectiveTransport =>
      isRental ? TransportRequirement.exempt : transportRequirement;

  bool get hasValidPin =>
      latitude != null &&
      longitude != null &&
      !(latitude == 0 && longitude == 0) &&
      latitude! >= -90 &&
      latitude! <= 90 &&
      longitude! >= -180 &&
      longitude! <= 180;

  CommissionCalculator get calc => CommissionCalculator(rates: rates);

  double get effectiveCategoryRate =>
      categoryCommissionRate ?? categoryCommissionRateFor(categoryName);

  // ---- Draft persistence (web sessionStorage parity) ------------------------
  static const _draftKey = 'sell_form_draft';

  /// The server and account a draft was written for. One phone holds one
  /// draft slot, so without this a draft started on the live app came back
  /// on a dev build (with a live-account address and pin), or under the
  /// next person to sign in.
  static String get draftScope =>
      '${AppConfig.apiBaseUrl}|${(AuthStore.instance?.email ?? '').trim().toLowerCase()}';

  /// Whether a stored draft was written for this server and account.
  static bool draftBelongsHere(Map<String, dynamic> draft) =>
      draft['_scope'] == draftScope;

  Map<String, dynamic> toDraftJson() => {
        '_scope': draftScope,
        'title': title,
        'categoryId': categoryId,
        'subcategoryId': subcategoryId,
        'categoryName': categoryName,
        'categorySlug': categorySlug,
        'subcategorySlug': subcategorySlug,
        'subcategoryName': subcategoryName,
        'location': location,
        'street': street,
        'selectedAddressId': selectedAddressId,
        'latitude': latitude,
        'longitude': longitude,
        'placeName': placeName,
        'neighbourhood': neighbourhood,
        'whatsappNumber': whatsappNumber,
        'description': description,
        'quantity': quantity,
        'requiresProductionTime': requiresProductionTime,
        'productionTimeDays': productionTimeDays,
        'itemAge': itemAge,
        'currency': currency,
        'pricingForward': pricingForward,
        'sellerPayout': sellerPayout,
        'price': price,
        'originalPrice': originalPrice,
        'transportRequirement': transportRequirement.name,
        'transportMode': transportMode?.apiName,
        'imageCount': images.length, // images themselves are NOT persisted
        if (isRental) 'rentalConfiguration': rentalConfiguration.toJson(),
        if (choiceConfiguration.hasChoices)
          'choiceConfiguration': choiceConfiguration.toJson(),
      };

  void restoreFromDraft(Map<String, dynamic> j) {
    title = j['title'] as String? ?? '';
    categoryId = (j['categoryId'] as num?)?.toInt();
    subcategoryId = (j['subcategoryId'] as num?)?.toInt();
    categoryName = j['categoryName'] as String? ?? '';
    categorySlug = j['categorySlug'] as String? ?? '';
    subcategorySlug = j['subcategorySlug'] as String? ?? '';
    subcategoryName = j['subcategoryName'] as String? ?? '';
    location = j['location'] as String? ?? '';
    street = j['street'] as String? ?? '';
    selectedAddressId = (j['selectedAddressId'] as num?)?.toInt();
    latitude = (j['latitude'] as num?)?.toDouble();
    longitude = (j['longitude'] as num?)?.toDouble();
    placeName = j['placeName'] as String? ?? '';
    neighbourhood = j['neighbourhood'] as String? ?? '';
    whatsappNumber = j['whatsappNumber'] as String? ?? '';
    description = j['description'] as String? ?? '';
    quantity = (j['quantity'] as num?)?.toInt() ?? 1;
    requiresProductionTime = j['requiresProductionTime'] as bool? ?? false;
    productionTimeDays = j['productionTimeDays'] as String? ?? '';
    itemAge = j['itemAge'] as String? ?? '';
    currency = j['currency'] as String? ?? 'TZS';
    pricingForward = j['pricingForward'] as bool? ?? true;
    sellerPayout = (j['sellerPayout'] as num?)?.toDouble() ?? 0;
    price = (j['price'] as num?)?.toDouble() ?? 0;
    originalPrice = (j['originalPrice'] as num?)?.toDouble() ?? 0;
    transportRequirement = TransportRequirement.values.firstWhere(
      (v) => v.name == j['transportRequirement'],
      orElse: () => TransportRequirement.required,
    );
    transportMode = transportModeFromName(j['transportMode'] as String?);
    if (j['rentalConfiguration'] is Map) {
      rentalConfiguration = RentalConfiguration.fromJson(
          (j['rentalConfiguration'] as Map).cast<String, dynamic>());
    }
    if (j['choiceConfiguration'] is Map) {
      // Images are never persisted in a draft, so any authoring-time
      // imageIndex reference in a restored draft is necessarily dangling.
      choiceConfiguration = withoutChoiceImages(
          ProductChoiceConfiguration.fromJson(
              (j['choiceConfiguration'] as Map).cast<String, dynamic>()));
    }
  }

  static Future<Map<String, dynamic>?> loadDraft(KvStore kv) async =>
      kv.getJson(_draftKey);
  Future<void> saveDraft(KvStore kv) => kv.setJson(_draftKey, toDraftJson());
  static Future<void> clearDraft(KvStore kv) => kv.remove(_draftKey);

  Timer? _debounce;
  void scheduleDraftSave(KvStore kv) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(seconds: 3), () {
      saveDraft(kv).catchError((_) {});
    });
  }

  /// Drops a pending autosave — after a publish it would write the listing
  /// that was just posted back as the next draft.
  void cancelPendingDraftSave() => _debounce?.cancel();

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  // ---- mutations ------------------------------------------------------------

  void setTitle(String v) {
    title = v;
    notifyListeners();
  }

  void setDescription(String v) {
    description = v;
    notifyListeners();
  }

  void setQuantity(int v) {
    quantity = v.clamp(1, 1000);
    notifyListeners();
  }

  /// Category cascade side-effects (exact, SELL_FLOW_SPEC §3 stage 1):
  /// reset subcategory + commission + transport default. Real-estate forces
  /// EXEMPT like the web.
  void setCategory({
    required int id,
    required String name,
    double? commissionRate,
    String? slug,
  }) {
    categoryId = id;
    categoryName = name;
    subcategoryId = null;
    subcategorySlug = '';
    subcategoryName = '';
    categoryCommissionRate = commissionRate;
    // The taxonomy slug when we have it; otherwise derived from the name, as
    // before, so an older cached payload still resolves transport.
    categorySlug = (slug != null && slug.isNotEmpty)
        ? slug
        : name.toLowerCase().replaceAll(RegExp(r'[^a-z]+'), '-');
    transportRequirement =
        categorySlug.contains('real-estate') || categorySlug == 'real-estate'
            ? TransportRequirement.exempt
            : TransportRequirement.required;
    transportMode = null;
    feeBands = null;
    // Choices are subcategory-scoped (web parity: both category and
    // subcategory changes reset `choiceConfiguration`).
    choiceConfiguration = ProductChoiceConfiguration.empty;
    // Changing category can only invalidate a rental default.
    _applyRentalDefault();
    notifyListeners();
  }

  void setSubcategory(int? id, {String? slug, String? name}) {
    subcategoryId = id;
    subcategorySlug = slug ?? '';
    subcategoryName = (id == null) ? '' : (name ?? '');
    choiceConfiguration = ProductChoiceConfiguration.empty;
    _applyRentalDefault();
    notifyListeners();
  }

  void setChoiceConfiguration(ProductChoiceConfiguration c) {
    choiceConfiguration = c;
    notifyListeners();
  }

  void setRequiresProductionTime(bool v) {
    requiresProductionTime = v;
    // Web clears the day count when the switch goes off, so a stale number
    // can never ride along in the payload.
    if (!v) productionTimeDays = '';
    notifyListeners();
  }

  void setProductionTimeDays(String v) {
    productionTimeDays = v;
    notifyListeners();
  }

  void setItemAge(String v) {
    itemAge = v;
    notifyListeners();
  }

  /// Item Age only applies to a listing that isn't brand new — web decides
  /// this from the configured "condition" choice, not a separate field.
  bool get showItemAge =>
      getActiveConfiguredChoiceLabels(choiceConfiguration, 'condition')
          .any((label) => !isNewProductCondition(label));

  String get listingCondition =>
      getFirstActiveConfiguredChoiceLabel(choiceConfiguration, 'condition') ??
      '';

  /// Switching the selector re-denominates every amount already entered so
  /// the TZS value each one represents stays put (web `handleCurrencyChange`),
  /// including per-choice price deltas.
  void setCurrency(String next) {
    if (next == currency) return;
    final from = currency;
    currency = next;
    sellerPayout = convertBetween(sellerPayout, from, next);
    price = convertBetween(price, from, next);
    originalPrice = convertBetween(originalPrice, from, next);
    final divisor =
        currencyFor(from).exchangeRate / currencyFor(next).exchangeRate;
    choiceConfiguration =
        convertChoicePriceAdjustments(choiceConfiguration, divisor);
    notifyListeners();
  }

  /// The subcategory decides whether this listing is a rental, and at what
  /// rate period - the seller never ticks a "this is a rental" box (web parity:
  /// `getDefaultRentalConfiguration`). Short stays land here as FOR_RENT at a
  /// NIGHT rate.
  ///
  /// A seller override made later through [setRatePeriod] is kept as long as
  /// the listing is still a rental; only a change that stops being one clears
  /// it.
  void _applyRentalDefault() {
    final byTaxonomy =
        rentals.getDefaultRentalConfiguration(categorySlug, subcategorySlug);
    if (byTaxonomy == null) {
      rentalConfiguration = const RentalConfiguration();
      return;
    }
    rentalConfiguration = RentalConfiguration(
      enabled: true,
      listingType: byTaxonomy.listingType,
      ratePeriod: byTaxonomy.ratePeriod.name.toUpperCase(),
      shortStay: byTaxonomy.shortStay,
      minimumNights: byTaxonomy.minimumNights,
    );
    // Rentals are single-unit and never ship through platform logistics.
    quantity = 1;
    transportMode = null;
    feeBands = null;
  }

  /// Seller override of the rate period on a rental listing.
  void setRatePeriod(String ratePeriod) {
    if (!isRental) return;
    rentalConfiguration = rentalConfiguration.copyWith(ratePeriod: ratePeriod);
    notifyListeners();
  }

  void setLocationFromAddress({
    required int addressId,
    required String region,
    required String country,
    required String streetName,
    double? lat,
    double? lng,
    String? place,
    String? hood,
  }) {
    selectedAddressId = addressId;
    location = '$region, $country';
    street = streetName;
    latitude = lat;
    longitude = lng;
    placeName = place ?? '';
    neighbourhood = hood ?? '';
    notifyListeners();
  }

  void addImage(String name, Uint8List bytes) {
    images.add(PendingImage(name: name, bytes: bytes, isCover: images.isEmpty));
    notifyListeners();
  }

  void makeCover(int index) {
    for (var i = 0; i < images.length; i++) {
      images[i] = images[i].copyWith(isCover: i == index);
    }
    notifyListeners();
  }

  void removeImage(int index) {
    images.removeAt(index);
    if (images.isNotEmpty && !images.any((im) => im.isCover)) {
      images[0] = images[0].copyWith(isCover: true);
    }
    notifyListeners();
  }

  /// Names a property photo's group (blank clears it).
  void setImageGroup(int index, String? group) {
    if (index < 0 || index >= images.length) return;
    final name = group?.trim() ?? '';
    images[index] = name.isEmpty
        ? images[index].copyWith(clearGroup: true)
        : images[index].copyWith(groupName: name);
    notifyListeners();
  }

  /// The groups in use, in first-photo order.
  List<String> get photoGroups {
    final out = <String>[];
    for (final im in images) {
      final g = im.groupName;
      if (g != null && !out.contains(g)) out.add(g);
    }
    return out;
  }

  /// Photo groups are for property listings (web: real estate only).
  bool get groupsPhotos =>
      AppConfig.propertyRentals && categorySlug == 'real-estate';

  /// A real-estate rental shows its property details first (web
  /// `isPropertyRental`).
  bool get isPropertyRental => categorySlug == 'real-estate' && isRental;

  /// Seller sets the minimum stay for the current rate period.
  void setMinimumStay(int? value) {
    final kind = rentalConfiguration.minimumKind(vehicle: isVehicleRental);
    if (kind == null) return;
    rentalConfiguration = RentalConfiguration(
      enabled: rentalConfiguration.enabled,
      listingType: rentalConfiguration.listingType,
      ratePeriod: rentalConfiguration.ratePeriod,
      shortStay: rentalConfiguration.shortStay,
      minimumNights: kind == 'nights' ? value : rentalConfiguration.minimumNights,
      minimumDays: kind == 'days' ? value : rentalConfiguration.minimumDays,
      minimumMonths: kind == 'months' ? value : rentalConfiguration.minimumMonths,
    );
    notifyListeners();
  }

  void moveImage(int from, int to) {
    if (from < 0 ||
        from >= images.length ||
        to < 0 ||
        to >= images.length ||
        from == to) {
      return;
    }
    final image = images.removeAt(from);
    images.insert(to, image);
    notifyListeners();
  }

  /// FORWARD: payout typed → price recomputed. REVERSE: price typed → payout.
  void setPricingAmount(double amount, {required bool forward}) {
    pricingForward = forward;
    final rate = effectiveCategoryRate;
    if (forward) {
      sellerPayout = amount;
      price = smartRounding
          ? calc.priceForPayout(amount, rate)
          : amount * calc.multiplier(rate);
    } else {
      price = amount;
      sellerPayout = smartRounding
          ? calc.payoutForPrice(amount, rate)
          : amount / calc.multiplier(rate);
    }
    notifyListeners();
  }

  void setOriginalPrice(double v) {
    originalPrice = v;
    notifyListeners();
  }

  void setTransportRequirement(TransportRequirement r) {
    transportRequirement = r;
    if (r == TransportRequirement.exempt) {
      transportMode = null;
      feeBands = null;
    }
    notifyListeners();
  }

  /// Mode change auto-fills the four legacy fee fields (web parity).
  void setTransportMode(TransportMode? m) {
    transportMode = m;
    feeBands = m == null ? null : DeliveryFeeBands.forMode(m);
    notifyListeners();
  }

  void setRental(RentalConfiguration r) {
    rentalConfiguration = r;
    if (r.enabled) {
      // rentals are qty 1 and never ship through platform logistics
      quantity = 1;
      transportMode = null;
      feeBands = null;
    }
    notifyListeners();
  }

  // ---- validation per step (SELL_FLOW_SPEC §2/§3/§8) -------------------------

  String? validateStep(int step) {
    switch (step) {
      case 1:
        if (title.trim().isEmpty) return 'Item title is required.';
        if (categoryId == null) return 'Choose a category.';
        // ProductTaxonomyService.resolveActiveSelection throws
        // "Subcategory is required" outright, so without this the seller only
        // finds out at publish time, as a server error.
        if (subcategoryId == null) return 'Please select a subcategory';
        if (selectedAddressId == null) {
          return 'Please choose a saved pickup address';
        }
        // Web parity (app/sell/page.tsx validateStep(1)): the listing's
        // WhatsApp number is the seller profile's. The wizard answers this
        // one by opening the add-number sheet in place.
        if (whatsappNumber.trim().isEmpty) return kSellMissingWhatsAppError;
        final minimum =
            validateMinimumStay(rentalConfiguration, vehicle: isVehicleRental);
        if (minimum != null) return minimum;
        return null;
      case 2:
        // Copy matches the web validateStep (app/sell/page.tsx case 2).
        if (images.isEmpty) return 'Please upload at least one image';
        if (description.trim().isEmpty) return 'Please add a description';
        // Web 2026-10: a short stay states each property detail once.
        if (AppConfig.propertyRentals &&
            categorySlug == 'real-estate' &&
            rentalConfiguration.isShortStay) {
          final missing =
              missingStayDetails(choiceConfiguration, subcategorySlug);
          if (missing.isNotEmpty) {
            return 'Choose one value for: ${missing.join(', ')}';
          }
        }
        if (requiresProductionTime) {
          final days = int.tryParse(productionTimeDays.trim());
          if (days == null || days < 1 || days > 365) {
            return 'Production time must be a whole number between 1 and 365 days';
          }
        }
        final nonPositive =
            getNonPositivePricedChoices(choiceConfiguration, sellerPayout);
        if (nonPositive.isNotEmpty) {
          return 'Enter an amount greater than zero for every available priced choice: '
              '${nonPositive.join(', ')}';
        }
        if (hasPricedChoices(choiceConfiguration) &&
            !meetsListingFloor(sellerPayout, currency)) {
          return 'Enter the amount you receive for at least one priced choice';
        }
        return null;
      case 3:
        // The floor is a TZS figure and the seller types in whatever currency
        // they picked, so it can only be judged on the CONVERTED amount. The
        // old check compared the typed number straight against 1000, which
        // told a seller pricing in dollars that $50 was under TSh 1,000 — it
        // is about TSh 131,000 — while letting UGX 1,000 (~TSh 714) through.
        if (!meetsListingFloor(askingPrice, currency)) {
          return 'Asking price must be at least ${listingFloorLabel(currency)}.';
        }
        if (!meetsListingFloor(sellerPayout, currency)) {
          return 'You receive must be at least ${listingFloorLabel(currency)}.';
        }
        if (!hasValidPin) {
          return 'Pick a valid map pin for the pickup address (lat/lng).';
        }
        if (effectiveTransport == TransportRequirement.required &&
            transportMode == null) {
          return 'Choose a delivery vehicle.';
        }
        return null;
      default:
        return null;
    }
  }

  double get askingPrice => price;

  /// The full `product` JSON part of the multipart publish payload — key-for-key
  /// with the web `buildProductJson` (SELL_FLOW_SPEC §4). Money in TZS only.
  Map<String, dynamic> buildProductJson() {
    // Money crosses into TZS BEFORE the breakdown is computed, exactly like
    // web (`askingPriceInTZS`/`sellerPayoutInTZS` feed
    // calculateCommissionBreakdownFromAmounts). Deriving commission from the
    // typed currency and converting afterwards would round differently.
    final payoutTzs = toTzs(sellerPayout, currency);
    final priceTzs = toTzs(price, currency);
    final originalPriceTzs = toTzs(originalPrice, currency);
    final b = calc.breakdown(
      sellerPayout: payoutTzs,
      price: priceTzs,
      categoryRate: effectiveCategoryRate,
    );
    final comma = location.indexOf(',');
    final region =
        comma > 0 ? location.substring(0, comma).trim() : location.trim();
    final country =
        comma > 0 ? location.substring(comma + 1).trim() : 'Tanzania';
    // Item Age is not a backend column - it rides inside the description
    // under a SPECIFICATIONS block, and only for a non-new listing.
    final specsBlock = StringBuffer(appendItemAgeToDescription(
        description.trim(), itemAge, listingCondition));
    final prepDays = (!isRental && requiresProductionTime)
        ? int.tryParse(productionTimeDays.trim())
        : null;
    return {
      'productName': title.trim(),
      'categoryId': categoryId,
      // Every key below is sent unconditionally, with an explicit null/0 when
      // unused, because that is what web sends and the backend DTO boxes all
      // of them (Double/Integer/Boolean) — an omitted key arrives as null,
      // which is NOT the same value as the 0 web sends for the money fields.
      'subcategoryId': subcategoryId,
      'productCountry': country,
      'productRegion': region,
      'productStreet': street.trim().isEmpty ? 'Not specified' : street.trim(),
      'productZipCode': 'Not specified',
      'whatsappNumber': whatsappNumber.trim(),
      'productDescription': specsBlock.toString(),
      'currency': 'TZS',
      'askingPrice': priceTzs,
      'categoryCommissionPercentage': b.categoryCommissionPercentage,
      'sellerPayout': payoutTzs,
      'finalTotalSellingPrice': priceTzs,
      'sellerFacingCommissionAmount': b.sellerFacingCommissionAmount,
      'grossPlatformCommission': b.grossPlatformCommission,
      'vat': b.vat,
      'selcomCommissionFee': b.selcomCommissionFee,
      'selcomTransactionFee': b.selcomTransactionFee,
      'platformNetProfitBeforeCuts': b.platformNetProfitBeforeCuts,
      // Same value web sends; written plainly so it cannot be copied wrong
      // (the edit screen inherited a version missing the subtraction).
      'platformNetProfit': b.platformNetProfitAfterCuts,
      'platformNetProfitAfterCuts': b.platformNetProfitAfterCuts,
      'roundingAdjustment': b.roundingAdjustment,
      'originalPrice': originalPriceTzs,
      'productQuantity': isRental ? 1 : quantity,
      // A rental is booked by date, so it never carries a prep period - web
      // forces both fields off for one, and always sends the day count key
      // (null when unused) rather than omitting it.
      //
      // The two are derived from ONE value so they can never disagree:
      // `requiresProductionTime: true` with a null day count is the exact
      // pair ProductionTimePolicy.resolveForCreate throws on, and step-2
      // validation is too fragile a thing to be the only guard against
      // emitting it.
      'requiresProductionTime': prepDays != null,
      'productionTimeDays': prepDays,
      'deliveryTransportMode': effectiveTransport == TransportRequirement.exempt
          ? null
          : transportMode?.apiName,
      // OPTIONAL passes straight through, as web does
      // (`resolveListingTransportRequirement` only rewrites the rental case) —
      // the backend enum has all three values.
      'transportRequirement':
          isRental ? 'EXEMPT' : effectiveTransport.name.toUpperCase(),
      'latitude': latitude,
      'longitude': longitude,
      'placeName': placeName.isEmpty ? null : placeName,
      'neighbourhood': neighbourhood.isEmpty ? null : neighbourhood,
      // Legacy per-region estimates. Web always sends all four, zeroed when
      // there is no vehicle, so an EXEMPT listing stores 0 rather than null.
      if (feeBands != null &&
          effectiveTransport != TransportRequirement.exempt) ...{
        'sameRegionDeliveryFeeMin': feeBands!.sameRegionMin,
        'sameRegionDeliveryFeeMax': feeBands!.sameRegionMax,
        'outsideRegionDeliveryFeeMin': feeBands!.outsideRegionMin,
        'outsideRegionDeliveryFeeMax': feeBands!.outsideRegionMax,
      } else ...{
        'sameRegionDeliveryFeeMin': 0,
        'sameRegionDeliveryFeeMax': 0,
        'outsideRegionDeliveryFeeMin': 0,
        'outsideRegionDeliveryFeeMax': 0,
      },
      'rentalConfiguration': isRental ? rentalConfiguration.toJson() : null,
      // Filters out attributes the seller toggled on but never gave a value
      // (web parity: `configuredAttributes`/"Add at least one choice" guard).
      // Images are never known yet at this point — the wizard's publish
      // sequence resolves and PATCHes them in once uploaded (see
      // resolveChoiceImageIndices).
      'choiceConfiguration':
          withoutChoiceImages(preparedChoiceConfiguration).toJson(),
    };
  }

  /// The subset of [choiceConfiguration] actually worth sending — web parity
  /// `configuredAttributes`: an attribute the seller enabled but never gave a
  /// value is dropped rather than sent empty.
  ProductChoiceConfiguration get preparedChoiceConfiguration =>
      choiceConfiguration.copyWith(
        attributes: choiceConfiguration.attributes
            .where((a) => a.values.isNotEmpty)
            .toList(),
      );
}
