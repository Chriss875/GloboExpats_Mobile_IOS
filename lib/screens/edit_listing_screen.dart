import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../config.dart';
import '../domain/commission_calculator.dart';
import '../domain/delivery_fare.dart';
import '../domain/image_upload.dart';
import '../domain/description_parser.dart';
import '../domain/listing_submit_utils.dart';
import '../domain/product_choices.dart';
import '../domain/rentals.dart' as rentals_domain;
import '../models/category.dart';
import '../models/product_detail.dart';
import '../models/sell_form_state.dart';
import '../services/geocoding_service.dart';
import '../theme.dart';
import '../domain/listing_events.dart';
import '../widgets/account_ui.dart' show AccountFormTheme, AccountSection;
import '../widgets/map_location_picker.dart';
import '../widgets/skeleton_loader.dart';
import 'sell/product_choice_editor.dart';
import 'sell/sell_wizard_screen.dart' show MinimumStayField, TransportModeGrid;
import '../domain/stay_listing.dart' show missingStayDetails;

/// AU-053: single-page edit-listing editor (web /edit-listing/[id], SELL_FLOW
/// SPEC §7). Replaces the legacy SellScreen edit route whose empty form wiped
/// unchanged fields on submit (AU-054 D2).
///
/// Differences vs the create wizard (§7): one long scroll; prefills every field
/// from itemDetails (SPECIFICATIONS parsed back out of the description);
/// WhatsApp read-only with a hard validation; promotional price must EXCEED the
/// asking price (inverse of create); unchanged prices are sent as loaded — no
/// recomputation churn. Phase 1A parity closes the edit gaps: the stored
/// transportRequirement/rental/choice/choice-fee config now round-trips, the
/// SPECIFICATIONS block is re-emitted, images can be added/removed/re-covered,
/// and the pickup pin can be set/confirmed from a map picker or a saved address.
class EditListingScreen extends StatefulWidget {
  const EditListingScreen({super.key, required this.listingId, this.api});
  final int listingId;
  final ApiClient? api;

  @override
  State<EditListingScreen> createState() => _EditListingScreenState();
}

/// A current (server-side) product photo held in the editor. [id] is the
/// backend image id used to delete / re-cover it.
class _ListingImage {
  final int id;
  final String url;
  const _ListingImage({required this.id, required this.url});
}

/// A newly picked photo waiting to be uploaded (bytes-based; AU-040 D1).
class _NewListingImage {
  final String name;
  final Uint8List bytes;
  const _NewListingImage({required this.name, required this.bytes});
}

class _EditListingScreenState extends State<EditListingScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();

  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _payout = TextEditingController();
  final _originalPrice = TextEditingController();
  final _quantity = TextEditingController();
  final _street = TextEditingController();
  final _whatsapp = TextEditingController();
  final _productionTimeDays = TextEditingController();
  final _itemAge = TextEditingController();
  // Read-only display of the listing's place name. Owned here (not inline
  // initialValue) so the text survives setState after a map-pin pick.
  final _placeNameController = TextEditingController();

  List<Category> _categories = const [];
  int? _categoryId;
  int? _subcategoryId;
  String _categorySlug = '';
  String _subcategorySlug = '';
  double? _loadedPayout; // sellerPayout as loaded from the payload
  double? _latitude;
  double? _longitude;
  String? _neighbourhood;
  String? _placeName;
  String _loadedStreet = '';
  String _region = '';
  String _country = 'Tanzania';

  // Delivery / rental / choice state (Phase 1A parity — round-trips the whole
  // record instead of only the handful of fields the old form carried).
  bool _isRental = false;
  Map<String, dynamic>? _rentalRaw;
  Map<String, dynamic>? _choiceRaw;
  String _condition = '';
  String? _transportRequirement; // REQUIRED | OPTIONAL | EXEMPT (loaded/kept)
  TransportMode? _transportMode;
  bool _requiresProductionTime = false;
  Map<String, String> _specifications = const {};

  // Phase 6a: interactive product-choice editor on edit (LISTIN-02 residual).
  // The editor is coupled to SellFormState, so the edit screen owns a
  // lightweight sub-state seeded from the loaded listing. Only when the seller
  // actually changes something is the serialized model written back — an
  // untouched save still round-trips the raw block verbatim.
  late final SellFormState _choiceState = SellFormState();
  ProductChoiceConfiguration _originalChoiceConfig =
      ProductChoiceConfiguration.empty;

  // Phase 6a: fixed-order validation summary + promo-inversion toast (LISTIN-30
  // / LISTIN-32 residuals) mirroring the web edit page.
  List<String> _validationSummary = const [];
  bool _promoWarnShown = false;

  // Photo management state.
  final List<_ListingImage> _images = []; // retained current photos, in order
  final List<int> _originalImageIds = []; // every id as loaded (for re-cover)
  int? _originalFirstImageId;
  final List<int> _removedImageIds = [];
  final List<_NewListingImage> _newImages = [];
  int? _newCoverIndex; // index in _newImages that must become the cover

  // Saved-address picker state.
  List<Map<String, dynamic>> _addresses = const [];

  bool _loading = true;
  bool _saving = false;
  String? _error;

  /// Set when the listing itself could not be read. The editor then shows
  /// why and a Retry — never an empty form that looks editable and would
  /// save blanks over the real listing.
  String? _loadError;

  // A-17 unsaved-changes guard: a snapshot of every editable field taken when
  // the listing finishes loading. PopScope warns before leaving whenever the
  // live state no longer matches it ("Discard your changes?").
  String _baselineSignature = '';
  bool _allowLeave = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [
      _title,
      _description,
      _price,
      _payout,
      _originalPrice,
      _quantity,
      _street,
      _whatsapp,
      _productionTimeDays,
      _itemAge,
      _placeNameController,
    ]) {
      c.dispose();
    }
    _choiceState.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final token = AuthStore.instance?.token;
    if (token == null) {
      setState(() {
        _loading = false;
        _error = 'Log in to edit your listing.';
      });
      return;
    }
    if (_loadError != null || !_loading) {
      setState(() {
        _loading = true;
        _loadError = null;
      });
    }
    try {
      // Parallel load (§7): itemDetails + categories. Categories only fill
      // the pickers, so their failure must not sink the whole editor.
      final results = await Future.wait([
        _fetchDetail(token),
        _api
            .fetchCategories()
            .catchError((Object _) => const <Category>[]),
      ]);
      final detail = results[0] as ProductDetail;
      final cats = results[1] as List<Category>;
      // Parse the SPECIFICATIONS block back out of the description so the
      // submitted description round-trips without duplicating specs. Item Age
      // is treated as its own editable field (web parses it out on load and
      // re-appends on save), the remaining rows stay in the block untouched.
      final parsed = parseProductDescription(detail.productDescription);
      final specs = Map<String, String>.from(parsed.specifications);
      final itemAgeKey =
          specs.keys.where((k) => k.toLowerCase() == 'item age').toList();
      if (itemAgeKey.isNotEmpty) {
        final key = itemAgeKey.first;
        _itemAge.text = specs.remove(key) ?? '';
      }

      final isRental = _detailIsRental(detail);
      final rentalRaw = detail.rawRentalConfiguration;
      final rawPeriod =
          (rentalRaw?['ratePeriod'] as String?)?.toUpperCase() ?? 'MONTH';
      // If a compact DTO omitted the config object entirely but still signals a
      // rental via the parsed block, keep a usable enabled default.
      Map<String, dynamic>? rentalForRoundTrip = rentalRaw;
      if (isRental && rentalForRoundTrip == null) {
        rentalForRoundTrip = {
          'enabled': true,
          'listingType': 'FOR_RENT',
          'ratePeriod': rawPeriod,
        };
      }

      if (!mounted) return;
      setState(() {
        _categories = cats;
        _title.text = detail.productName;
        _description.text = parsed.description.trim();
        _categoryId = detail.categoryId;
        _subcategoryId = detail.subcategoryId;
        _specifications = specs;
        _isRental = isRental;
        _rentalRaw = rentalForRoundTrip;
        _choiceRaw = detail.rawChoiceConfiguration;
        _condition = detail.productCondition ?? '';
        _price.text = detail.productAskingPrice == 0
            ? ''
            : _trimNum(detail.productAskingPrice);
        _loadedPayout = detail.sellerPayout;
        // Web parity: payout loaded from product floor-rounded to 1000s.
        if (detail.sellerPayout != null) {
          _payout.text =
              ((detail.sellerPayout! / 1000).floor() * 1000).toStringAsFixed(0);
        }
        if (detail.productOriginalPrice != null &&
            detail.productOriginalPrice! > 0) {
          _originalPrice.text = _trimNum(detail.productOriginalPrice!);
        }
        _quantity.text = (isRental ? 1 : detail.productQuantity).toString();
        if (detail.whatsappNumber != null)
          _whatsapp.text = detail.whatsappNumber!;
        _street.text = detail.productStreet ?? '';
        _loadedStreet = detail.productStreet ?? '';
        _region = detail.productRegion ?? '';
        _country = detail.productCountry?.isNotEmpty == true
            ? detail.productCountry!
            : 'Tanzania';
        _latitude = detail.latitude;
        _longitude = detail.longitude;
        _placeName = detail.placeName;
        _neighbourhood = null;
        _placeNameController.text = _placeName ?? '';
        _transportRequirement =
            isRental ? 'EXEMPT' : (detail.transportRequirement ?? 'REQUIRED');
        _transportMode = transportModeFromName(detail.deliveryTransportMode);
        _requiresProductionTime = !isRental && detail.productionTimeDays > 0;
        _productionTimeDays.text =
            detail.productionTimeDays > 0 ? '${detail.productionTimeDays}' : '';
        _images
          ..clear()
          ..addAll(detail.imageRefs
              .where((r) => r.imageId > 0)
              .map((r) => _ListingImage(id: r.imageId, url: r.url)));
        _originalImageIds
          ..clear()
          ..addAll(
              detail.imageRefs.map((r) => r.imageId).where((id) => id > 0));
        _originalFirstImageId = _images.isNotEmpty ? _images.first.id : null;
        _setSlugsFor(cats, detail.categoryId, detail.subcategoryId);
        _seedChoiceState();
        _loading = false;
      });
      // Everything is prefilled now — snapshot it so an untouched back press
      // never warns, while ANY later edit does (A-17).
      _baselineSignature = _stateSignature();
    } catch (e) {
      if (!mounted) return;
      final reason = e is ApiException ? e.message : '$e';
      setState(() {
        _loading = false;
        _loadError = reason.contains('404')
            ? 'Could not load this listing. It may be hidden or deleted.'
            : 'Could not load this listing. Check your connection and try '
                'again. ($reason)';
      });
      return;
    }
    _loadAddresses(token);
  }

  /// The seller's own listing, read with their session so a listing that is
  /// still hidden from the public opens for its owner. A session the server
  /// no longer accepts gets one plain read before giving up.
  Future<ProductDetail> _fetchDetail(String token) async {
    try {
      return await _api.fetchProductDetail(widget.listingId, token: token);
    } on ApiException catch (e) {
      if (e.message.contains('HTTP 401') || e.message.contains('HTTP 403')) {
        return _api.fetchProductDetail(widget.listingId);
      }
      rethrow;
    }
  }

  /// Rental presence follows the raw block: an explicit `enabled: false` (what
  /// the web stores on a non-rental after edit) is NOT a rental; a missing
  /// `enabled` key in a compact DTO still means rental (web parity).
  static bool _detailIsRental(ProductDetail d) {
    final raw = d.rawRentalConfiguration;
    if (raw == null) return d.rentalConfiguration?.enabled == true;
    return raw['enabled'] as bool? ?? true;
  }

  void _setSlugsFor(List<Category> cats, int? categoryId, int? subcategoryId) {
    _categorySlug = '';
    _subcategorySlug = '';
    for (final c in cats) {
      if (c.categoryId != categoryId) continue;
      _categorySlug = c.slug;
      for (final s in c.subcategories) {
        if (s.subcategoryId == subcategoryId) _subcategorySlug = s.slug;
      }
    }
  }

  /// Seeds the choice-editor sub-state from the loaded listing. The editor is
  /// coupled to SellFormState (wizard parity), so the edit screen feeds it a
  /// dedicated instance whose fields mirror the loaded taxonomy + pricing.
  void _seedChoiceState() {
    final parsed = ProductChoiceConfiguration.fromJson(_choiceRaw);
    _originalChoiceConfig = parsed;
    _choiceState
      ..subcategoryId = _subcategoryId
      ..categorySlug = _categorySlug
      ..subcategorySlug = _subcategorySlug
      ..choiceConfiguration = parsed
      ..sellerPayout =
          _loadedPayout ?? double.tryParse(_payout.text.trim()) ?? 0;
  }

  /// A category/subcategory change resets the choice configuration exactly as
  /// the web edit page does (choices are subcategory-scoped).
  void _resetChoiceStateForTaxonomy() {
    _choiceState
      ..subcategoryId = _subcategoryId
      ..categorySlug = _categorySlug
      ..subcategorySlug = _subcategorySlug
      ..choiceConfiguration = ProductChoiceConfiguration.empty;
  }

  /// Listing condition the SPECIFICATIONS Item-Age decision keys off: the
  /// active configured "condition" choice when one exists, else the legacy
  /// productCondition field (web edit page.tsx:258-267, 1029-1031).
  String get _listingCondition {
    final fromChoices = getFirstActiveConfiguredChoiceLabel(
        _choiceState.choiceConfiguration, 'condition');
    if (fromChoices != null && fromChoices.isNotEmpty) return fromChoices;
    return _condition;
  }

  /// Whether the seller actually changed the choice configuration. An
  /// untouched save round-trips the raw block verbatim (payload parity); only a
  /// real edit serializes the editor's model.
  bool get _choiceConfigChanged => !_jsonEq(_originalChoiceConfig.toJson(),
      _choiceState.choiceConfiguration.toJson());

  /// Fixed-order validation errors mirroring the web `getEditListingValidationErrors`
  /// (lib/edit-listing-validation.ts:22-84) — the web edit screen's error list
  /// and blocked-submit toast are driven off this exact order.
  List<String> _validationErrors() {
    final errs = <String>[];
    final price = double.tryParse(_price.text.trim());
    final promoRaw = _originalPrice.text.trim();
    final promo = promoRaw.isEmpty ? null : double.tryParse(promoRaw);
    if (_title.text.trim().isEmpty) errs.add('Product name is required');
    if (_categoryId == null) errs.add('Category is required');
    // Only when the category actually offers subcategories to choose from; a
    // subcategory-less taxonomy can't require one.
    if (_subcategoryId == null && _subs.isNotEmpty) {
      errs.add('Subcategory is required');
    }
    if (_street.text.trim().isEmpty) {
      errs.add('Please select a saved pickup address');
    } else if (!_hasValidPin) {
      errs.add(
          'Please select a saved pickup address with a map pin so delivery '
          'can be calculated automatically');
    }
    if (!_isRental &&
        (_transportRequirement ?? 'REQUIRED') == 'REQUIRED' &&
        _transportMode == null) {
      errs.add('Please choose the transport needed to deliver this product');
    }
    // Web 2026-10: the minimum stay, and a short stay's six property facts.
    final minimum =
        validateMinimumStay(_rentalConfig, vehicle: _vehicleRental);
    if (minimum != null) errs.add(minimum);
    if (AppConfig.propertyRentals &&
        _categorySlug == 'real-estate' &&
        _rentalConfig.isShortStay) {
      final missing = missingStayDetails(
          _choiceState.choiceConfiguration, _subcategorySlug);
      if (missing.isNotEmpty) {
        errs.add('Choose one value for: ${missing.join(', ')}');
      }
    }
    if (!_isRental && _requiresProductionTime) {
      final days = int.tryParse(_productionTimeDays.text.trim());
      if (days == null || days < 1 || days > 365) {
        errs.add(
            'Production time must be a whole number between 1 and 365 days');
      }
    }
    if (_description.text.trim().isEmpty && _specifications.isEmpty) {
      errs.add('Description is required');
    }
    if (price == null || !price.isFinite) {
      errs.add('Valid asking price is required');
    }
    if (promoRaw.isNotEmpty) {
      if (promo == null || !promo.isFinite || promo < 0) {
        errs.add('Promotional price must be a valid amount');
      } else if (price != null && price.isFinite && promo <= price) {
        errs.add(
            'Promotional price must be higher than the Final Total Asking Price');
      }
    }
    return errs;
  }

  /// `formatEditListingValidationToast` (web lib/edit-listing-validation.ts:86-96):
  /// first error + "Review N more field(s) below." when more than one remains.
  static String _validationSummaryMessage(List<String> errors) {
    if (errors.isEmpty) return 'Review the highlighted fields and try again.';
    final remaining = errors.length - 1;
    if (remaining <= 0) return errors.first;
    final noun = remaining == 1 ? 'field' : 'fields';
    return '${errors.first}. Review $remaining more $noun below.';
  }

  static bool _jsonEq(dynamic a, dynamic b) {
    if (a is Map && b is Map) {
      if (a.length != b.length) return false;
      for (final k in a.keys) {
        if (!b.containsKey(k) || !_jsonEq(a[k], b[k])) return false;
      }
      return true;
    }
    if (a is List && b is List) {
      if (a.length != b.length) return false;
      for (var i = 0; i < a.length; i++) {
        if (!_jsonEq(a[i], b[i])) return false;
      }
      return true;
    }
    return a == b;
  }

  Future<void> _loadAddresses(String token) async {
    try {
      final list = await _api.getAddresses(token);
      if (!mounted) return;
      setState(() => _addresses = list);
    } catch (_) {
      // Saved-address select is an enhancement; a fetch failure must not block
      // the editor (the map-pin picker remains available).
    }
  }

  static String _trimNum(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

  bool get _hasValidPin =>
      _latitude != null &&
      _longitude != null &&
      _latitude!.abs() <= 90 &&
      _longitude!.abs() <= 180 &&
      !(_latitude == 0 && _longitude == 0);

  int get _totalImageCount => _images.length + _newImages.length;

  /// Promotional/original price must exceed the asking price on edit
  /// (SELL_FLOW_SPEC §7 — inverse rule of create).
  String? _validateOriginal(String? v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return null;
    final orig = double.tryParse(t);
    if (orig == null || orig < 0) return 'Enter a valid amount.';
    final asking = double.tryParse(_price.text.trim()) ?? 0;
    if (asking > 0 && orig <= asking) {
      return 'Promotional price must be HIGHER than the final asking price.';
    }
    return null;
  }

  /// Change-time warning toast for a promotional price that is not strictly
  /// above the asking price (web edit page warnIfPromotionalPriceIsNotHigher,
  /// §2.15). Fires once per entry into the inverted state.
  void _maybeWarnPromo() {
    final p = double.tryParse(_price.text.trim());
    final t = _originalPrice.text.trim();
    final o = t.isEmpty ? null : double.tryParse(t);
    final inverted =
        t.isNotEmpty && o != null && p != null && p.isFinite && o <= p;
    if (inverted && !_promoWarnShown) {
      _promoWarnShown = true;
      _toast(
          'Promotional price must be higher',
          "Use the product's previous asking price here, then set a lower "
              'Final Total Asking Price above.');
    } else if (!inverted) {
      _promoWarnShown = false;
    }
  }

  /// Keeps the choice editor's base payout aligned with the payout the seller
  /// sees/edits in the form.
  void _syncChoicePayout() {
    final v = double.tryParse(_payout.text.trim());
    if (v != null && v != _choiceState.sellerPayout) {
      setState(() => _choiceState.sellerPayout = v);
    }
  }

  void _onCategoryChanged(int? v) {
    setState(() {
      _categoryId = v;
      _subcategoryId = null;
      final cat = _categories.firstWhere((c) => c.categoryId == v,
          orElse: () => const Category(categoryId: -1, categoryName: ''));
      _categorySlug = cat.slug;
      _subcategorySlug = '';
      _applyTaxonomyRental();
      _resetChoiceStateForTaxonomy();
    });
  }

  void _onSubcategoryChanged(int? v) {
    setState(() {
      _subcategoryId = v;
      _subcategorySlug = _subs
          .firstWhere((s) => s.subcategoryId == v,
              orElse: () =>
                  const Subcategory(subcategoryId: -1, subcategoryName: ''))
          .slug;
      _applyTaxonomyRental();
      _resetChoiceStateForTaxonomy();
    });
  }

  /// The listing's rental terms as the sell form reads them (short-stay
  /// flag, minimum stay). The raw map round-trips every key on save.
  RentalConfiguration get _rentalConfig => _isRental
      ? RentalConfiguration.fromJson({...?_rentalRaw, 'enabled': true})
      : const RentalConfiguration();

  bool get _vehicleRental => _categorySlug == 'vehicle-supplies';

  /// The rental block to save. An older backend refuses the whole listing
  /// over keys it does not know, so the new terms go only to one that does.
  Map<String, dynamic> _rentalForSave() {
    final raw = Map<String, dynamic>.from(_rentalRaw ??
        const {'enabled': true, 'listingType': 'FOR_RENT', 'ratePeriod': 'MONTH'});
    if (!AppConfig.propertyRentals) {
      for (final k in const [
        'shortStay', 'minimumNights', 'minimumDays', 'minimumMonths',
      ]) {
        raw.remove(k);
      }
    }
    return raw;
  }

  /// A subcategory switch can flip a listing between rental and sale (web edit
  /// re-derives rental from the taxonomy). Keeping the stale rental flag would
  /// save a rental quantity / EXEMPT delivery against an ordinary category.
  void _applyTaxonomyRental() {
    final def = rentals_domain.getDefaultRentalConfiguration(
        _categorySlug, _subcategorySlug);
    final nowRental = def != null;
    if (nowRental == _isRental) return;
    _isRental = nowRental;
    final period = _ratePeriodWire(def?.ratePeriod);
    _rentalRaw = nowRental
        ? {
            'enabled': true,
            'listingType': 'FOR_RENT',
            'ratePeriod': period,
            if (def.shortStay) 'shortStay': true,
            if (def.minimumNights != null) 'minimumNights': def.minimumNights,
          }
        : null;
    if (nowRental) {
      _quantity.text = '1';
      _transportRequirement = 'EXEMPT';
      _transportMode = null;
      _requiresProductionTime = false;
      _productionTimeDays.text = '';
    } else {
      // A category flip from rental to sale re-enters the normal delivery
      // setup (the wizard default: REQUIRED + seller picks a vehicle).
      _transportRequirement = 'REQUIRED';
      _transportMode = null;
    }
  }

  static String _ratePeriodWire(rentals_domain.RentalRatePeriod? p) {
    switch (p) {
      case rentals_domain.RentalRatePeriod.hour:
        return 'HOUR';
      case rentals_domain.RentalRatePeriod.night:
        return 'NIGHT';
      case rentals_domain.RentalRatePeriod.day:
        return 'DAY';
      case rentals_domain.RentalRatePeriod.week:
        return 'WEEK';
      case rentals_domain.RentalRatePeriod.month:
        return 'MONTH';
      case null:
        return 'MONTH';
    }
  }

  String? _validateProductionDays(String? v) {
    if (!_requiresProductionTime) return null;
    final n = int.tryParse(v?.trim() ?? '');
    if (n == null || n < 1 || n > 365) {
      return 'Production time must be between 1 and 365 days.';
    }
    return null;
  }

  // ---- photo management ---------------------------------------------------

  Future<void> _pickNewImages() async {
    final remaining = 50 - _totalImageCount;
    if (remaining <= 0) {
      _toast('Photo limit reached', 'A listing can have at most 50 photos.');
      return;
    }
    try {
      final picked = await ImagePicker().pickMultiImage(imageQuality: 100);
      if (picked.isEmpty) return;
      var added = 0;
      var skipped = 0;
      for (final f in picked) {
        if (added >= remaining) break;
        if (await f.length() > kMaxSourceImageBytes) {
          skipped++;
          continue;
        }
        // Same pipeline as the sell wizard (and the web's canvas compressor):
        // 1440px, WebP, quality 82. Edit used to upload the picker's own
        // bytes untouched, so replacing a photo here cost several times what
        // adding the same photo through the wizard did.
        Uint8List bytes;
        try {
          bytes = await FlutterImageCompress.compressWithList(
              await f.readAsBytes(),
              minHeight: 1440,
              minWidth: 1440,
              quality: 82,
              format: CompressFormat.webp);
        } catch (_) {
          bytes = await f.readAsBytes();
        }
        final mime = sniffImageMime(bytes);
        if (bytes.isEmpty ||
            mime == null ||
            !kAllowedUploadMimeTypes.contains(mime) ||
            bytes.length > kMaxUploadImageBytes) {
          skipped++;
          continue;
        }
        final name = renameForMime(
            f.name.isNotEmpty ? f.name : 'photo_$added.jpg', mime);
        if (!mounted) return;
        setState(
            () => _newImages.add(_NewListingImage(name: name, bytes: bytes)));
        added++;
      }
      if (skipped > 0 && mounted) {
        _toast('Some photos were skipped',
            '$skipped photo${skipped == 1 ? '' : 's'} could not be used — '
                'each one must be a JPEG, PNG or WebP under '
                '${formatBytes(kMaxSourceImageBytes)}.');
      }
    } catch (_) {
      _toast('Could not load photos', 'Please try again.');
    }
  }

  void _removeCurrentImage(int id) {
    setState(() {
      _images.removeWhere((e) => e.id == id);
      if (!_removedImageIds.contains(id)) _removedImageIds.add(id);
      if (_newCoverIndex != null) _newCoverIndex = null;
    });
  }

  void _makeCurrentCover(int id) {
    setState(() {
      final i = _images.indexWhere((e) => e.id == id);
      if (i > 0) {
        final img = _images.removeAt(i);
        _images.insert(0, img);
      }
      _newCoverIndex = null; // a current photo leads, so no new-cover reorder
    });
  }

  void _removeNewImage(int index) {
    setState(() {
      _newImages.removeAt(index);
      if (_newCoverIndex != null && _newCoverIndex! >= index) {
        _newCoverIndex = _newCoverIndex! - 1;
      }
      if (_newCoverIndex != null && _newCoverIndex! >= _newImages.length) {
        _newCoverIndex = null;
      }
    });
  }

  void _makeNewCover(int index) {
    setState(() {
      // A new image can only lead when every current image is dropped first —
      // the cover is re-built delete-all + re-upload in save order either way.
      _newCoverIndex = index;
    });
  }

  void _toast(String title, String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('$title\n$message')));
  }

  // ---- save ---------------------------------------------------------------

  Future<void> _save() async {
    final token = AuthStore.instance?.token;
    if (token == null) {
      setState(() => _error = 'Log in to edit your listing.');
      return;
    }
    setState(() {
      _validationSummary = const [];
      _error = null;
    });
    // Per-field inline validators first (red text under each field), then the
    // web-ordered error list + blocked-submit summary toast (LISTIN-30).
    final inlineOk = _form.currentState!.validate();
    final ordered = _validationErrors();
    if (ordered.isNotEmpty) {
      setState(() => _validationSummary = List.of(ordered));
      // The summary banner is prepended as the ListView's leading child, which
      // reindexes the lazy children and disposes the FormFieldStates that just
      // captured inline errors from validate() above. Re-validate next frame so
      // the inline red text persists alongside the banner (web shows both —
      // LISTIN-30).
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _form.currentState?.validate();
      });
      _toast('Please complete the required fields',
          _validationSummaryMessage(ordered));
      return;
    }
    if (!inlineOk) return;
    // A degenerate zero-image state is a hard block, but AFTER field validation
    // so specific inline errors surface first (web has no image block on edit —
    // existing images always persist server-side).
    if (_totalImageCount == 0) {
      setState(() => _error = 'Product must have at least one image.');
      return;
    }
    // Web parity: an enabled choices block must carry at least one value
    // (web edit page.tsx:1056-1065 'Add at least one choice').
    final populatedAttributes = _choiceState.choiceConfiguration.attributes
        .where((a) => a.values.isNotEmpty);
    if (_choiceState.choiceConfiguration.hasChoices &&
        populatedAttributes.isEmpty) {
      _toast('Add at least one choice',
          'Select available values or turn off product choices before saving.');
      return;
    }
    final loaded = _loadedPayout;
    final payoutTyped = double.tryParse(_payout.text.trim());
    // Unchanged prices are sent as loaded (§7): only recompute when the seller
    // actually edited the payout. The field is pre-filled floor-rounded to
    // 1000s, so "unchanged" means typed == the floored value, not the raw
    // loaded payout (e.g. loaded 21977.777 displays 21000; an untouched save
    // must keep 21977.777, not silently write the floor back).
    final displayedFloor =
        loaded == null ? null : (loaded / 1000).floorToDouble() * 1000.0;
    final edited = payoutTyped != null &&
        (displayedFloor == null || (payoutTyped - displayedFloor).abs() > 0.5);
    final payoutOut = edited ? payoutTyped : (loaded ?? payoutTyped);
    if (payoutOut == null || payoutOut < 1000) {
      setState(() => _error = 'You receive must be at least TSh 1,000.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final rate = _categoryRate(_categoryId);
      // Breakdown-from-amounts keeps the platform fee fields consistent with
      // whatever price/payout pair is being submitted (web parity). Reads the
      // live platform-settings rates when a fetch has succeeded (Phase 4B).
      final b = CommissionCalculator(rates: currentCommissionRates).breakdown(
        sellerPayout: payoutOut,
        price: double.tryParse(_price.text.trim()) ?? 0,
        categoryRate: rate,
      );

      final body = _buildBody(payoutOut, b);
      await _api.updateListing(token, widget.listingId, body);
      await _saveImages(token);
      ListingEvents.instance.changed();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Listing updated.')));
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Could not save your changes. Please try again.';
      });
    }
  }

  /// Web parity `updateData` (app/edit-listing/[id]/page.tsx): every key the
  /// web round-trips is sent, so a mobile save no longer wipes config the
  /// editor has no field for.
  Map<String, dynamic> _buildBody(double payoutOut, CommissionBreakdown b) {
    final price = double.tryParse(_price.text.trim()) ?? 0;
    final prepDays = (!_isRental && _requiresProductionTime)
        ? int.tryParse(_productionTimeDays.text.trim())
        : null;
    final effectiveRequirement =
        _isRental ? 'EXEMPT' : (_transportRequirement ?? 'REQUIRED');
    final noTransport = _isRental || effectiveRequirement == 'EXEMPT';
    final mode = noTransport ? null : _transportMode;
    final bands = mode == null ? null : DeliveryFeeBands.forMode(mode);

    final specs = Map<String, String>.from(_specifications);
    if (_itemAge.text.trim().isNotEmpty &&
        !isNewProductCondition(_listingCondition)) {
      specs['Item Age'] = _itemAge.text.trim();
    }
    final enhancedDescription =
        formatDescriptionWithSpecifications(_description.text.trim(), specs);

    return {
      'productName': _title.text.trim(),
      'categoryId': _categoryId,
      if (_subcategoryId != null) 'subcategoryId': _subcategoryId,
      'productCountry': _country,
      'productRegion': _region,
      'productStreet':
          _street.text.trim().isEmpty ? 'Not specified' : _street.text.trim(),
      'productZipCode': 'Not specified',
      'whatsappNumber': _whatsapp.text.trim(),
      'productDescription': enhancedDescription,
      'currency': 'TZS',
      'askingPrice': price,
      'categoryCommissionPercentage': b.categoryCommissionPercentage,
      'sellerPayout': payoutOut,
      'finalTotalSellingPrice': price,
      'sellerFacingCommissionAmount': b.sellerFacingCommissionAmount,
      'grossPlatformCommission': b.grossPlatformCommission,
      'vat': b.vat,
      'selcomCommissionFee': b.selcomCommissionFee,
      'selcomTransactionFee': b.selcomTransactionFee,
      'platformNetProfitBeforeCuts': b.platformNetProfitBeforeCuts,
      // Web sends platformNetProfitAfterCuts verbatim. Adding the Selcom fee
      // back here overstated platform profit on every edit.
      'platformNetProfit': b.platformNetProfitAfterCuts,
      'platformNetProfitAfterCuts': b.platformNetProfitAfterCuts,
      'roundingAdjustment': b.roundingAdjustment,
      if (_originalPrice.text.trim().isNotEmpty)
        'originalPrice': double.tryParse(_originalPrice.text.trim()),
      'productQuantity':
          _isRental ? 1 : int.tryParse(_quantity.text.trim()) ?? 1,
      'requiresProductionTime': prepDays != null,
      'productionTimeDays': prepDays,
      'deliveryTransportMode': noTransport ? null : mode?.apiName,
      'transportRequirement': effectiveRequirement,
      'latitude': _latitude,
      'longitude': _longitude,
      if ((_placeName ?? '').trim().isNotEmpty) 'placeName': _placeName!.trim(),
      if ((_neighbourhood ?? '').trim().isNotEmpty)
        'neighbourhood': _neighbourhood!.trim(),
      if (bands != null && !_isRental && effectiveRequirement != 'EXEMPT') ...{
        'sameRegionDeliveryFeeMin': bands.sameRegionMin,
        'sameRegionDeliveryFeeMax': bands.sameRegionMax,
        'outsideRegionDeliveryFeeMin': bands.outsideRegionMin,
        'outsideRegionDeliveryFeeMax': bands.outsideRegionMax,
      } else ...{
        'sameRegionDeliveryFeeMin': 0,
        'sameRegionDeliveryFeeMax': 0,
        'outsideRegionDeliveryFeeMin': 0,
        'outsideRegionDeliveryFeeMax': 0,
      },
      'rentalConfiguration': _isRental
          ? _rentalForSave()
          : const {
              'enabled': false,
              'listingType': 'FOR_RENT',
              'ratePeriod': 'MONTH',
            },
      'choiceConfiguration': _choiceConfigForSave(),
    };
  }

  /// Sends the raw loaded choiceConfiguration verbatim when untouched (so a
  /// plain edit never disturbs stored choice data), and the editor's prepared
  /// model when the seller actually changed it (LISTIN-02).
  Map<String, dynamic> _choiceConfigForSave() {
    if (!_choiceConfigChanged) {
      return _choiceRaw ??
          const {'hasChoices': false, 'attributes': <dynamic>[]};
    }
    return _choiceState.preparedChoiceConfiguration.toJson();
  }

  Future<void> _saveImages(String token) async {
    final retained = List<_ListingImage>.of(_images);
    final newImages = List<_NewListingImage>.of(_newImages);
    final removed = List<int>.of(_removedImageIds);
    final newCoverIdx = _newCoverIndex;
    final newCoverFirst = newCoverIdx != null && newCoverIdx < newImages.length;

    final originalFirstRetained = _originalFirstImageId == null ||
        !removed.contains(_originalFirstImageId);
    final currentCoverChanged = retained.isNotEmpty &&
        originalFirstRetained &&
        _originalFirstImageId != null &&
        retained.first.id != _originalFirstImageId;
    final fullRebuild = currentCoverChanged || newCoverFirst;

    if (fullRebuild) {
      // Cover is the first uploaded image id; reordering retained images (or
      // putting a brand-new upload first) needs the delete-all + re-upload in
      // the new save order that the web performs.
      final ordered = <PendingImageRef>[];
      if (newCoverFirst) {
        final c = newImages[newCoverIdx];
        ordered.add(PendingImageRef(bytes: c.bytes, filename: c.name));
      }
      for (final img in retained) {
        final bytes = await _api.getBytes(img.url);
        ordered.add(
            PendingImageRef(bytes: bytes, filename: _fileNameFromUrl(img.url)));
      }
      for (var i = 0; i < newImages.length; i++) {
        if (i == newCoverIdx) continue;
        final c = newImages[i];
        ordered.add(PendingImageRef(bytes: c.bytes, filename: c.name));
      }
      for (final id in _originalImageIds) {
        await _api.deleteProductImage(token, id);
      }
      await _uploadInBatches(token, widget.listingId, ordered);
      return;
    }

    if (removed.isNotEmpty) {
      for (final id in removed) {
        try {
          await _api.deleteProductImage(token, id);
        } catch (_) {
          // A photo may already be gone server-side; deletion is best-effort.
        }
      }
    }
    if (newImages.isNotEmpty) {
      await _uploadInBatches(token, widget.listingId, [
        for (final n in newImages)
          PendingImageRef(bytes: n.bytes, filename: n.name),
      ]);
    }
  }

  static String _fileNameFromUrl(String url) {
    final seg = Uri.tryParse(url)?.pathSegments;
    if (seg != null && seg.isNotEmpty) {
      final last = seg.last;
      if (last.contains('.')) return last;
    }
    return 'image.jpg';
  }

  Future<void> _uploadInBatches(
      String token, int productId, List<PendingImageRef> images) async {
    const batchSize = 5;
    for (var i = 0; i < images.length; i += batchSize) {
      final end =
          (i + batchSize) > images.length ? images.length : i + batchSize;
      await _api.addProductImages(token, productId, images.sublist(i, end));
    }
  }

  double _categoryRate(int? categoryId) {
    // Name-table fallback (SELL_FLOW_SPEC §3 targetNetRate defaults); the
    // backend commissionRate is authoritative when present.
    for (final c in _categories) {
      if (c.categoryId == categoryId) return c.commissionRate ?? 0.10;
    }
    return 0.10;
  }

  List<Subcategory> get _subs {
    for (final c in _categories) {
      if (c.categoryId == _categoryId) return c.subcategories;
    }
    return const [];
  }

  /// A-17: true once the user has edited anything from the loaded baseline.
  bool _hasUnsavedChanges() =>
      !_allowLeave && _stateSignature() != _baselineSignature;

  /// Serializes every editable field so an abandoned edit can be detected by
  /// comparison against the load-time [_baselineSignature]. Deliberately broad:
  /// a missed field would let unsaved work silently drop (A-17).
  String _stateSignature() {
    final buf = StringBuffer();
    void wv(Object? s) {
      buf.write('\u0001');
      buf.write(s);
    }

    buf.write(_title.text);
    wv(_description.text);
    wv(_price.text);
    wv(_payout.text);
    wv(_originalPrice.text);
    wv(_quantity.text);
    wv(_street.text);
    wv(_whatsapp.text);
    wv(_productionTimeDays.text);
    wv(_itemAge.text);
    wv(_placeNameController.text);
    wv('$_categoryId');
    wv('$_subcategoryId');
    wv('$_isRental');
    wv(_condition);
    wv('$_transportRequirement');
    wv(_transportMode?.name ?? '');
    wv('$_requiresProductionTime');
    wv('$_latitude');
    wv('$_longitude');
    wv('$_placeName');
    wv('$_neighbourhood');
    wv(_region);
    wv(_country);
    for (final img in _images) {
      wv('i${img.id}');
    }
    for (final id in [..._removedImageIds]..sort()) {
      wv('r$id');
    }
    for (final img in _newImages) {
      wv('n${img.name}');
    }
    wv('cover$_newCoverIndex');
    wv(_jsonEq(_originalChoiceConfig.toJson(),
        _choiceState.choiceConfiguration.toJson()));
    final specKeys = _specifications.keys.toList()..sort();
    for (final k in specKeys) {
      wv('$k=${_specifications[k]}');
    }
    return buf.toString();
  }

  /// A-17: shows the "Discard your changes?" prompt; only a confirmed Discard
  /// actually leaves (the current route is popped once the guard is lowered).
  Future<void> _confirmDiscard() async {
    final messenger = ScaffoldMessenger.of(context);
    final discard = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Discard your changes?'),
        content:
            const Text('You have unsaved changes. Leaving now will lose them.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep editing'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    if (discard != true || !mounted) return;
    setState(() => _allowLeave = true);
    // Close the prompt's route first if it somehow stayed on top, then pop the
    // editor itself (now that the guard is lowered).
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop();
    } else {
      messenger.showSnackBar(
          const SnackBar(content: Text('No changes were saved.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    // The guard decision is made LIVE in onPopInvokedWithResult rather than
    // via canPop: controller edits don't rebuild this State (only the focused
    // TextField rebuilds), so a canPop snapshot taken at build time would stay
    // stale — an unsaved change would slip straight past the first back press.
    // canPop is therefore always false and _onBackPressed decides: clean ->
    // pop immediately, dirty -> "Discard your changes?".
    return PopScope<Object?>(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (!_hasUnsavedChanges()) {
          Navigator.of(context).pop();
          return;
        }
        _confirmDiscard();
      },
      child: _buildScreen(context),
    );
  }

  Widget _buildScreen(BuildContext context) {
    final palette = AppPalette.of(context);
    if (_loading || _loadError != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Edit listing')),
        body: _loading ? const SkeletonPage() : _loadFailedView(),
      );
    }
    final subs = _subs;
    const gap = SizedBox(height: 14);
    return AccountFormTheme(
      child: Scaffold(
        backgroundColor: palette.background,
        appBar: AppBar(title: const Text('Edit listing')),
        bottomNavigationBar: _saveBar(),
        body: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              _editingHeader(),
              gap,
                      if (_validationSummary.isNotEmpty)
                        Container(
                          key: const ValueKey('edit-listing-errors'),
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppPalette.of(context).dangerFill,
                            border: Border.all(color: AppPalette.of(context).dangerBorder),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Please complete the required fields',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                      color: AppPalette.of(context).dangerText)),
                              const SizedBox(height: 6),
                              for (final e in _validationSummary)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text('•  $e',
                                      style: TextStyle(
                                          fontSize: 12.5,
                                          color: AppPalette.of(context).dangerText)),
                                ),
                            ],
                          ),
                        ),
              AccountSection(
                title: 'Photos',
                icon: Icons.photo_library_outlined,
                subtitle: 'The first photo is the cover buyers see',
                trailing: Text('$_totalImageCount/50',
                    style:
                        TextStyle(fontSize: 12, color: palette.textSecondary)),
                child: _photosSection(),
              ),
              gap,
              AccountSection(
                title: 'About the item',
                icon: Icons.inventory_2_outlined,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                          TextFormField(
                            controller: _title,
                            maxLength: 255,
                            decoration: const InputDecoration(
                                labelText: 'Item title *',
                                border: OutlineInputBorder(),
                                counterText: ''),
                            validator: (v) => (v == null || v.trim().isEmpty)
                                ? 'Item title is required.'
                                : null,
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<int?>(
                            isExpanded: true,
                            // A category the list did not return (it failed
                            // to load, or was retired) would crash the picker.
                            value: _categories
                                    .any((c) => c.categoryId == _categoryId)
                                ? _categoryId
                                : null,
                            decoration: const InputDecoration(
                                labelText: 'Category', border: OutlineInputBorder()),
                            items: [
                              for (final c in _categories)
                                DropdownMenuItem(
                                    value: c.categoryId,
                                    child: Text(c.categoryName,
                                        overflow: TextOverflow.ellipsis))
                            ],
                            onChanged: _onCategoryChanged,
                            validator: (v) => v == null ? 'Choose a category.' : null,
                          ),
                          if (subs.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            DropdownButtonFormField<int?>(
                              isExpanded: true,
                              value: _subs.any((s) => s.subcategoryId == _subcategoryId)
                                  ? _subcategoryId
                                  : null,
                              decoration: const InputDecoration(
                                  labelText: 'Subcategory',
                                  border: OutlineInputBorder()),
                              items: [
                                for (final s in subs)
                                  DropdownMenuItem(
                                      value: s.subcategoryId,
                                      child: Text(s.subcategoryName,
                                          overflow: TextOverflow.ellipsis))
                              ],
                              onChanged: _onSubcategoryChanged,
                              validator: (v) =>
                                  v == null ? 'Please select a subcategory' : null,
                            ),
                          ],
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _description,
                            maxLines: 5,
                            maxLength: 2500,
                            decoration: const InputDecoration(
                                labelText: 'Description *',
                                border: OutlineInputBorder(),
                                alignLabelWithHint: true),
                            validator: (v) {
                              final empty = (v == null || v.trim().isEmpty) &&
                                  _specifications.isEmpty;
                              return empty ? 'Please add a description' : null;
                            },
                          ),
                          if (_specifications.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                'Category details (${_specifications.keys.join(', ')}) will be kept under --- SPECIFICATIONS ---.',
                                style: TextStyle(
                                    fontSize: 11.5, color: AppPalette.of(context).textSecondary),
                              ),
                            ),
                          const SizedBox(height: 12),
                          _itemAgeField(),
                          if (!_isRental) ...[
                            const SizedBox(height: 12),
                            _productionTimeField(),
                          ],
                          const SizedBox(height: 12),
                          _conditionReadout(),
                  ],
                ),
              ),
              gap,
              // The choice editor is already its own titled card.
              _choiceEditorSection(),
              gap,
              AccountSection(
                title: 'Price & stock',
                icon: Icons.sell_outlined,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                          _pricingRow(),
                          const SizedBox(height: 12),
                          Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                            SizedBox(
                              child: TextFormField(
                                key: const ValueKey('edit-original'),
                                controller: _originalPrice,
                                keyboardType: TextInputType.number,
                                decoration: const InputDecoration(
                                    labelText: 'Promotional price (optional)',
                                    border: OutlineInputBorder(),
                                    helperText: 'Must be HIGHER than asking price'),
                                validator: _validateOriginal,
                                onChanged: (_) => _maybeWarnPromo(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              child: TextFormField(
                                controller: _quantity,
                                readOnly: _isRental,
                                keyboardType: TextInputType.number,
                                decoration: InputDecoration(
                                    labelText:
                                        _isRental ? 'Quantity' : 'Available quantity *',
                                    border: const OutlineInputBorder(),
                                    helperText: _isRental
                                        ? 'Rentals are always quantity 1'
                                        : null),
                                validator: _isRental
                                    ? null
                                    : (v) {
                                        final n = int.tryParse(v?.trim() ?? '');
                                        if (n == null || n < 0 || n > 1000) {
                                          return 'Quantity must be between 0 and 1000.';
                                        }
                                        return null;
                                      },
                              ),
                            ),
                          ]),
                    const SizedBox(height: 16),
                    _commissionPanel(),
                  ],
                ),
              ),
              gap,
              AccountSection(
                title: 'Pickup location',
                icon: Icons.place_outlined,
                subtitle: 'Where the item is collected for delivery',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                          _savedAddressSelect(),
                          const SizedBox(height: 8),
                          TextFormField(
                            controller: _street,
                            decoration: const InputDecoration(
                                labelText: 'Pickup street address *',
                                border: OutlineInputBorder()),
                            validator: (v) =>
                                (v == null || v.trim().isEmpty) ? 'Required' : null,
                          ),
                          const SizedBox(height: 8),
                          TextFormField(
                            controller: _placeNameController,
                            enabled: false,
                            decoration: const InputDecoration(
                                labelText: 'Place name',
                                border: OutlineInputBorder(),
                                helperText: 'Auto-filled from the map pin'),
                          ),
                          const SizedBox(height: 6),
                          _pinStatus(),
                          const SizedBox(height: 8),
                          OutlinedButton.icon(
                            key: const ValueKey('edit-pick-pin'),
                            onPressed: _openMapPicker,
                            icon: const Icon(Icons.place_outlined, size: 18),
                            label: const Text('Set pickup pin on map'),
                          ),
                  ],
                ),
              ),
              gap,
              AccountSection(
                title: 'Delivery & contact',
                icon: Icons.local_shipping_outlined,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                          _transportFields(),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _whatsapp,
                            readOnly: true,
                            decoration: const InputDecoration(
                              labelText: 'WhatsApp number',
                              border: OutlineInputBorder(),
                              helperText:
                                  'WhatsApp number cannot be changed from the edit listing page',
                            ),
                            validator: (v) => (v == null || v.trim().isEmpty)
                                ? 'WhatsApp number cannot be changed from the edit listing page'
                                : null,
                          ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Whether the pickup pin is set. Without one the listing is hidden from
  /// buyers (the backend's delivery-setup rule), so that case is a warning
  /// box rather than a line of small print.
  Widget _pinStatus() {
    final palette = AppPalette.of(context);
    if (_hasValidPin) {
      return Row(children: [
        Icon(Icons.check_circle_rounded, size: 16, color: palette.successText),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
              'Map pin set (${_latitude!.toStringAsFixed(4)}, '
              '${_longitude!.toStringAsFixed(4)}).',
              style: TextStyle(fontSize: 12, color: palette.successText)),
        ),
      ]);
    }
    return Container(
      key: const ValueKey('edit-pin-missing'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.dangerFill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.dangerBorder),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.location_off_outlined,
            size: 18, color: palette.dangerTextStrong),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
              'No pickup pin yet — buyers cannot see or order this listing '
              'until you set one on the map below.',
              style: TextStyle(
                  fontSize: 12.5,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                  color: palette.dangerTextStrong)),
        ),
      ]),
    );
  }

  /// Says plainly which listing is open and that this is an edit of it.
  Widget _editingHeader() {
    final palette = AppPalette.of(context);
    final cover = _images.isNotEmpty ? _images.first.url : null;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.infoFill,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: palette.infoBorder),
      ),
      child: Row(children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 52,
            height: 52,
            child: cover == null
                ? ColoredBox(
                    color: palette.surfaceMuted,
                    child: Icon(Icons.image_outlined,
                        color: palette.textSecondary))
                : Image.network(AppConfig.resolveAssetUrl(cover),
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => ColoredBox(
                        color: palette.surfaceMuted,
                        child: Icon(Icons.image_outlined,
                            color: palette.textSecondary))),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Editing your listing',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: palette.infoText)),
              const SizedBox(height: 2),
              ListenableBuilder(
                listenable: _title,
                builder: (context, _) => Text(
                  _title.text.trim().isEmpty ? 'Untitled' : _title.text.trim(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: palette.textPrimary),
                ),
              ),
            ],
          ),
        ),
      ]),
    );
  }

  /// Always on screen, so saving is never something to scroll for: says
  /// whether anything is unsaved, or what stopped the last save.
  Widget _saveBar() {
    final palette = AppPalette.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge([
        _title,
        _description,
        _price,
        _payout,
        _originalPrice,
        _quantity,
        _street,
        _productionTimeDays,
        _itemAge,
      ]),
      builder: (context, _) {
        final dirty = _hasUnsavedChanges();
        final (IconData icon, Color tone, String status) = _error != null
            ? (Icons.error_outline_rounded, palette.dangerText, _error!)
            : dirty
                ? (
                    Icons.edit_note_rounded,
                    palette.warningText,
                    'You have unsaved changes'
                  )
                : (
                    Icons.info_outline_rounded,
                    palette.textSecondary,
                    'Change anything above, then save.'
                  );
        return Material(
          color: palette.surface,
          elevation: 10,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Row(children: [
                  Icon(icon, size: 17, color: tone),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(status,
                        key: const ValueKey('edit-save-status'),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: tone,
                            fontWeight: FontWeight.w600,
                            fontSize: 12.5)),
                  ),
                ]),
                const SizedBox(height: 10),
                FilledButton.icon(
                  key: const ValueKey('edit-save-btn'),
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandBlue,
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.check_rounded, size: 18),
                  label: Text(_saving ? 'Saving…' : 'Save changes',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ]),
            ),
          ),
        );
      },
    );
  }

  Widget _loadFailedView() {
    final palette = AppPalette.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          key: const ValueKey('edit-load-failed'),
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.inventory_2_outlined,
                size: 44, color: palette.textSecondary),
            const SizedBox(height: 12),
            Text('We couldn’t open this listing',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: palette.textPrimary)),
            const SizedBox(height: 6),
            Text(_loadError ?? '',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 13, height: 1.4, color: palette.textSecondary)),
            const SizedBox(height: 18),
            FilledButton.icon(
              key: const ValueKey('edit-load-retry'),
              onPressed: _load,
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brandBlue),
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _photosSection() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (_images.isEmpty && _newImages.isEmpty)
        Container(
          padding: const EdgeInsets.all(14),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border.all(color: AppPalette.of(context).dangerBorder),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text('Add at least one photo.',
              style: TextStyle(
                  fontSize: 12.5, color: AppPalette.of(context).dangerText)),
        ),
      SizedBox(
        height: 116,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: _totalImageCount + 1,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, index) {
            if (index == _totalImageCount) {
              return _addPhotoTile();
            }
            if (index < _images.length) {
              return _currentPhotoTile(_images[index], index);
            }
            final newIndex = index - _images.length;
            return _newPhotoTile(_newImages[newIndex], newIndex);
          },
        ),
      ),
    ]);
  }

  Widget _currentPhotoTile(_ListingImage img, int index) {
    final isMain = index == 0 && _newCoverIndex == null;
    return _photoTileFrame(
      isMain: isMain,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              AppConfig.resolveAssetUrl(img.url),
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => Container(
                color: AppPalette.of(context).surfaceMuted,
                alignment: Alignment.center,
                child: Icon(Icons.broken_image_outlined,
                    size: 22, color: AppPalette.of(context).textSecondary),
              ),
            ),
          ),
          Positioned(
            top: 2,
            right: 2,
            child: _smallRoundButton(
              icon: Icons.close,
              color: const Color(0xCC000000),
              onTap: () => _removeCurrentImage(img.id),
            ),
          ),
          Positioned(
            bottom: 2,
            left: 2,
            child: _smallRoundButton(
              icon: Icons.star,
              color: isMain ? AppColors.accentGreen : const Color(0xAA000000),
              onTap: () => _makeCurrentCover(img.id),
            ),
          ),
          if (isMain)
            Positioned(
              bottom: 2,
              right: 2,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                    color: AppColors.brandBlue,
                    borderRadius: BorderRadius.circular(4)),
                child: const Text('MAIN',
                    style: TextStyle(color: Colors.white, fontSize: 8)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _newPhotoTile(_NewListingImage img, int index) {
    final isMain = _images.isEmpty || _newCoverIndex == index;
    return _photoTileFrame(
      isMain: isMain,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.memory(img.bytes, fit: BoxFit.cover),
          ),
          Positioned(
            top: 2,
            right: 2,
            child: _smallRoundButton(
              icon: Icons.close,
              color: const Color(0xCC000000),
              onTap: () => _removeNewImage(index),
            ),
          ),
          Positioned(
            bottom: 2,
            left: 2,
            child: _smallRoundButton(
              icon: Icons.star,
              color: isMain ? AppColors.accentGreen : const Color(0xAA000000),
              onTap: () => _makeNewCover(index),
            ),
          ),
          if (isMain)
            Positioned(
              bottom: 2,
              right: 2,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                    color: AppColors.brandBlue,
                    borderRadius: BorderRadius.circular(4)),
                child: const Text('MAIN',
                    style: TextStyle(color: Colors.white, fontSize: 8)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _photoTileFrame({required Widget child, required bool isMain}) {
    return Container(
      width: 92,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
            color: isMain ? AppColors.accentGreen : AppPalette.of(context).border,
            width: isMain ? 2 : 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
  }

  Widget _smallRoundButton({
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        child: Icon(icon, size: 13, color: Colors.white),
      ),
    );
  }

  Widget _addPhotoTile() {
    return InkWell(
      key: const ValueKey('edit-add-photo'),
      onTap: _pickNewImages,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 92,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppPalette.of(context).border, style: BorderStyle.solid),
          color: AppPalette.of(context).background,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.add_a_photo_outlined,
                size: 22, color: AppPalette.of(context).textSecondary),
            SizedBox(height: 4),
            Text('Add photo',
                style: TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary)),
          ],
        ),
      ),
    );
  }

  Widget _itemAgeField() {
    return TextFormField(
      key: const ValueKey('edit-item-age'),
      controller: _itemAge,
      decoration: const InputDecoration(
        labelText: 'Item Age (optional)',
        border: OutlineInputBorder(),
        helperText: 'Saved under --- SPECIFICATIONS --- for non-new items',
      ),
    );
  }

  /// The listing's current condition, when known. Condition itself is edited
  /// through the Product attributes and buyer choices editor below (web stores
  /// it as the active configured "condition" choice); legacy listings keep a
  /// productCondition read-out here for transparency.
  Widget _conditionReadout() {
    final condition = _listingCondition;
    if (condition.isEmpty) return const SizedBox.shrink();
    return Container(
      key: const ValueKey('edit-condition-readout'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppPalette.of(context).background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Row(children: [
        Icon(Icons.verified_outlined,
            size: 16, color: AppPalette.of(context).textSecondary),
        const SizedBox(width: 8),
        Expanded(
          child: Text('Condition: $condition',
              style: TextStyle(
                  fontSize: 12.5, color: AppPalette.of(context).textSecondary)),
        ),
      ]),
    );
  }

  /// Reuses the create wizard's choice editor (LISTIN-02 residual). The editor
  /// is SellFormState-coupled, so the screen feeds it the dedicated _choiceState
  /// seeded from the loaded listing; onChanged only repaints the parent.
  Widget _choiceEditorSection() {
    // The editor shows a property's key facts from the rental terms.
    _choiceState.rentalConfiguration = _rentalConfig;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ProductChoiceEditor(
        state: _choiceState,
        onChanged: () {
          if (mounted) setState(() {});
        },
        api: _api,
      ),
    ]);
  }

  Widget _productionTimeField() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Expanded(
            child: Text('Production time (prepare before delivery)',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
        Switch(
          value: _requiresProductionTime,
          onChanged: (v) => setState(() => _requiresProductionTime = v),
        ),
      ]),
      if (_requiresProductionTime)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: TextFormField(
            key: const ValueKey('edit-production-days'),
            controller: _productionTimeDays,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Days needed *',
              border: OutlineInputBorder(),
            ),
            validator: _validateProductionDays,
          ),
        ),
    ]);
  }

  Widget _pricingRow() {
    // Stacked, not side by side: two columns cut the labels and helper
    // text off on a phone ("Final buyer price (TS…").
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SizedBox(
        child: TextFormField(
          key: const ValueKey('edit-price'),
          controller: _price,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
              labelText: 'Final buyer price (TSh)',
              border: OutlineInputBorder()),
          validator: (v) {
            final n = double.tryParse(v?.trim() ?? '');
            if (n == null || n < 1000) {
              return 'Asking price must be at least TSh 1,000.';
            }
            return null;
          },
          onChanged: (_) => _maybeWarnPromo(),
        ),
      ),
      const SizedBox(height: 12),
      SizedBox(
        child: TextFormField(
          key: const ValueKey('edit-payout'),
          controller: _payout,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
              labelText: 'You receive (TSh)',
              border: OutlineInputBorder(),
              helperText: 'Loaded from the listing'),
          onChanged: (_) => _syncChoicePayout(),
        ),
      ),
    ]);
  }

  Widget _commissionPanel() {
    final price = double.tryParse(_price.text.trim());
    final payout = double.tryParse(_payout.text.trim());
    if (price == null || payout == null) return const SizedBox.shrink();
    try {
      final b = CommissionCalculator(rates: currentCommissionRates).breakdown(
          sellerPayout: payout,
          price: price,
          categoryRate: _categoryRate(_categoryId));
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppPalette.of(context).background,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppPalette.of(context).border),
        ),
        child: Column(children: [
          _moneyRow('You receive', payout),
          _moneyRow(
              'GloboExpats commission',
              b.sellerFacingCommissionAmount +
                  b.vat +
                  b.selcomCommissionFee +
                  b.selcomTransactionFee),
          _moneyRow('Final buyer price', price),
        ]),
      );
    } catch (_) {
      return const SizedBox.shrink();
    }
  }

  Widget _moneyRow(String label, double amount) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(children: [
        Expanded(
            child: Text(label,
                style: TextStyle(
                    fontSize: 12.5, color: AppPalette.of(context).textSecondary))),
        Text('TSh ${amount.toStringAsFixed(0)}',
            style:
                const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
      ]),
    );
  }

  Widget _savedAddressSelect() {
    if (_addresses.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: DropdownButtonFormField<int?>(
        value: null,
        decoration: const InputDecoration(
          labelText: 'Use a saved pickup address',
          border: OutlineInputBorder(),
        ),
        items: [
          for (final a in _addresses)
            if ((a['addressId'] as num?) != null)
              DropdownMenuItem(
                value: (a['addressId'] as num).toInt(),
                child: Text(_addressLabel(a), overflow: TextOverflow.ellipsis),
              ),
        ],
        onChanged: (v) {
          if (v == null) return;
          final a = _addresses.firstWhere(
              (x) => (x['addressId'] as num?)?.toInt() == v,
              orElse: () => const {});
          if (a.isEmpty) return;
          setState(() {
            final street = (a['street'] ?? a['address'] ?? '').toString();
            if (street.isNotEmpty) _street.text = street;
            final region = (a['region'] ?? a['city'] ?? '').toString();
            if (region.isNotEmpty) _region = region;
            final country = (a['country'] ?? '').toString();
            if (country.isNotEmpty) _country = country;
            final place = (a['placeName'] ?? a['label'] ?? '').toString();
            if (place.isNotEmpty) _placeName = place;
            final lat = a['latitude'];
            final lng = a['longitude'];
            if (lat is num && lng is num) {
              _latitude = lat.toDouble();
              _longitude = lng.toDouble();
            }
            _placeNameController.text = _placeName ?? '';
          });
        },
      ),
    );
  }

  String _addressLabel(Map<String, dynamic> a) {
    final place = (a['placeName'] ?? '').toString().trim();
    final label = (a['label'] ?? '').toString().trim();
    final street = (a['street'] ?? a['address'] ?? '').toString().trim();
    final name = label.isNotEmpty
        ? label
        : place.isNotEmpty
            ? place
            : street;
    final region = (a['region'] ?? a['city'] ?? '').toString().trim();
    final country = (a['country'] ?? '').toString().trim();
    final loc = [region, country].where((e) => e.isNotEmpty).join(', ');
    return [name, loc].where((e) => e.isNotEmpty).join(' — ');
  }

  Widget _transportFields() {
    if (_isRental) {
      return _rentalRateRow();
    }
    final requirement = _transportRequirement ?? 'REQUIRED';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      DropdownButtonFormField<String>(
        value: requirement,
        decoration: const InputDecoration(
            labelText: 'Transport requirement', border: OutlineInputBorder()),
        items: const [
          DropdownMenuItem(
              value: 'REQUIRED', child: Text('Delivery setup required')),
          DropdownMenuItem(
              value: 'OPTIONAL', child: Text('Optional transport')),
          DropdownMenuItem(value: 'EXEMPT', child: Text('No transport needed')),
        ],
        onChanged: (v) => setState(() {
          _transportRequirement = v ?? 'REQUIRED';
          if (v == 'EXEMPT') {
            _transportMode = null;
          }
        }),
      ),
      if (requirement != 'EXEMPT') ...[
        const SizedBox(height: 8),
        const SizedBox(height: 4),
        Text('Delivery vehicle',
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppPalette.of(context).textPrimary)),
        const SizedBox(height: 8),
        // The same picture cards the sell wizard uses (it was a bare text
        // dropdown here, with none of the vehicle artwork).
        TransportModeGrid(
          key: const ValueKey('edit-transport-grid'),
          selected: _transportMode,
          onSelected: (m) => setState(() => _transportMode = m),
        ),
      ],
    ]);
  }

  Widget _rentalRateRow() {
    final period =
        (_rentalRaw?['ratePeriod'] as String?)?.toUpperCase() ?? 'MONTH';
    final config = _rentalConfig;
    final kind = config.minimumKind(vehicle: _vehicleRental);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _rentalPeriodDropdown(period),
      if (kind != null) ...[
        const SizedBox(height: 12),
        MinimumStayField(
          key: ValueKey('edit-minimum-$kind'),
          configuration: config,
          vehicle: _vehicleRental,
          onChanged: (v) => setState(() {
            final raw = Map<String, dynamic>.from(_rentalRaw ?? const {});
            final key = switch (kind) {
              'nights' => 'minimumNights',
              'days' => 'minimumDays',
              _ => 'minimumMonths',
            };
            if (v == null) {
              raw.remove(key);
            } else {
              raw[key] = v;
            }
            _rentalRaw = raw;
          }),
        ),
      ],
    ]);
  }

  Widget _rentalPeriodDropdown(String period) {
    return DropdownButtonFormField<String>(
      value: period,
      decoration: const InputDecoration(
          labelText: 'Rental rate period', border: OutlineInputBorder()),
      items: const [
        DropdownMenuItem(value: 'HOUR', child: Text('per hour')),
        DropdownMenuItem(value: 'NIGHT', child: Text('per night')),
        DropdownMenuItem(value: 'DAY', child: Text('per day')),
        DropdownMenuItem(value: 'WEEK', child: Text('per week')),
        DropdownMenuItem(value: 'MONTH', child: Text('per month')),
      ],
      onChanged: (v) => setState(() {
        if (v == null) return;
        final raw = Map<String, dynamic>.from(_rentalRaw ?? const {});
        raw['enabled'] = true;
        raw['listingType'] = 'FOR_RENT';
        raw['ratePeriod'] = v;
        _rentalRaw = raw;
      }),
    );
  }

  Future<void> _openMapPicker() async {
    final initial = (_latitude != null && _longitude != null)
        ? Coordinates(_latitude!, _longitude!)
        : null;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppPalette.of(context).surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Pick the pickup pin',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 8),
                SizedBox(
                  height: 470,
                  child: MapLocationPicker(
                    coordinates: initial,
                    savedLocationLabel: (_placeName?.isNotEmpty ?? false)
                        ? _placeName
                        : _street.text.trim(),
                    height: 260,
                    onChanged: (coords, address) {
                      _applyPin(coords, address);
                    },
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.of(sheetContext).pop(),
                    child: const Text('Done'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _applyPin(Coordinates coords, ReverseGeocodedAddress? address) {
    setState(() {
      _latitude = coords.latitude;
      _longitude = coords.longitude;
      if (address != null) {
        final streetRaw = address.street?.trim() ?? '';
        if (streetRaw.isNotEmpty &&
            (_street.text.trim().isEmpty ||
                _street.text.trim() == _loadedStreet)) {
          _street.text = streetRaw;
        }
        if ((address.city?.trim().isNotEmpty ?? false)) {
          _region = address.city!.trim();
        }
        if ((address.country?.trim().isNotEmpty ?? false)) {
          _country = address.country!.trim();
        }
        if ((address.placeName?.trim().isNotEmpty ?? false)) {
          _placeName = address.placeName!.trim();
        }
      }
      _placeNameController.text = _placeName ?? '';
    });
  }
}
