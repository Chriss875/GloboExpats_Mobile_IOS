import 'package:go_router/go_router.dart';
import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../services/matomo_tracker.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../cart/cart_store.dart';
import '../cart/seller_grouping.dart';
import '../config.dart';
import '../domain/checkout_proforma.dart';
import '../domain/countdown.dart';
import '../domain/delivery_quote.dart';
import '../domain/delivery_region.dart';
import '../domain/delivery_windows.dart';
import '../domain/pending_actions.dart' show requestPendingActionsRefresh;
import '../domain/rentals.dart'
    show
        RentalBooking,
        RentalRatePeriod,
        formatRentalDate,
        isShortStayCheckout,
        ratePeriodFromJson,
        ratePeriodLabel;
import '../domain/saved_address.dart';
import '../domain/selcom_payment.dart';
import '../services/directions_service.dart';
import '../services/geocoding_service.dart' show Coordinates;
import '../domain/transport_requirements.dart';
import '../domain/time_utils.dart';
import '../models/product.dart' show Product;
import '../storage/kv_store.dart';
import '../theme.dart';
import '../widgets/api_error_view.dart';
import '../widgets/scroll_reveal.dart';
import '../widgets/skeleton_loader.dart' show SkeletonBox;
import '../widgets/app_image.dart';
import '../widgets/payment_result_screen.dart';
import 'orders_screen.dart';

/// Checkout — 4-step machine (BUYER_FLOW_SPEC §4–§7; AUs 022–028):
///
/// 1. ADDRESS & FULFILLMENT — profile fields readOnly, saved-address dropdown
///    locking the delivery pin to its lat/lng, SELLER_DELIVERY (default) /
///    BUYER_PICKUP radio.
/// 2. REVIEW — destination block, server delivery quote per seller group
///    (20 s watchdog → CALCULATION_TIMEOUT), the six EAT delivery-window
///    composites, Subtotal/Delivery/Total and the required terms tick.
///    Confirming creates the proforma (stock reserved) — with a grand-total
///    price guard that cancels + resyncs on mismatch.
/// 3. PAYMENT — method picker (Lipa Namba default / Bank Account), Selcom
///    receiving details with reference = proformaNumber, screenshot proof,
///    confirmation tick gating submit, expiry
///    countdown. Success branches ONLY on status == PAYMENT_SUBMITTED.
/// 4. COMPLETION — View Order Details → /orders/{id}, Continue Shopping;
///    snapshot persisted before the cart is cleared.
///
/// From step 3 the items are locked (no qty edits) and "Back" is replaced by
/// "Cancel invoice" (POST /proformas/{id}/cancel → stock released).
class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({
    super.key,
    this.cart,
    this.auth,
    this.api,
    this.nowUtc,
    this.proformaId,
    this.pickReceiptFile,
    this.fromCart = false,
  });

  final CartStore? cart;

  /// Opened from the cart page, which is still underneath: "Cart" just
  /// steps back to it.
  final bool fromCart;

  /// Test seam: null falls back to [AuthStore.instance].
  final AuthStore? auth;
  final ApiClient? api;

  /// Test seam for the proof picker. Under `flutter test` image_picker has no
  /// platform handler, so the real pick resolves to nothing; tests that must
  /// attach a screenshot inject a fake XFile here (CARTCH-12 receipts-only
  /// proof gate makes the screenshot a hard requirement, web parity).
  final Future<XFile?> Function()? pickReceiptFile;

  /// Injectable clock for tests (defaults to real UTC now).
  final DateTime? nowUtc;

  /// Resume an existing PENDING_PAYMENT proforma (`?proforma=<id>` deep link,
  /// web parity /checkout?proforma= — CARTCH-02 / FINANC-01 / APISUR-01).
  /// When set the machine skips Address/Review and lands on the PAYMENT step
  /// with the invoiced amounts, exactly like web's useProforma resume.
  final String? proformaId;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

enum CheckoutStep { address, review, payment, completion }

/// Opens the addresses screen and comes back. Checkout reloads its list on
/// return so an address added mid-checkout can be picked immediately.
Future<void> _openAddresses(BuildContext context) async {
  await context.push('/account/addresses');
}

/// Receipt guardrails, identical to the API's and to web's uploader.
const int _kMaxReceipts = 5;
const int _kMaxReceiptBytes = 5 * 1024 * 1024;

/// Official support line (web `payment-confirmation-step.tsx:32`
/// OFFICIAL_SUPPORT_PHONE). Rendered on the payment step so a buyer whose
/// transfer or proof is stuck can escalate on the exact screen (CARTCH-13).
const String _kSupportPhone = '+255693749306';

/// Web polls the proforma every 30s while its status is PENDING_PAYMENT /
/// PAYMENT_SUBMITTED (hooks/use-proforma.ts POLL_INTERVAL_MS) so a server-side
/// expiry is never hidden behind a stale payable-looking invoice (CARTCH-09).
const Duration _kProformaPollInterval = Duration(seconds: 30);

class _CheckoutScreenState extends State<CheckoutScreen>
    with WidgetsBindingObserver {
  late final CartStore _cart = widget.cart ?? CartStore.instance;
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  late final ApiClient _api = widget.api ?? ApiClient();

  DateTime get _nowUtc => widget.nowUtc ?? DateTime.now().toUtc();

  CheckoutStep _step = CheckoutStep.address;

  // ---- Step 1 state -------------------------------------------------------
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  List<Map<String, dynamic>> _addresses = const [];
  bool _loadingAddresses = true;

  /// Non-fatal: addresses are an enhancement; the buyer can still type one.
  String? _addressesError;
  String? _selectedAddressId;
  double? _lat;
  double? _lng;
  String _fulfillmentType = 'SELLER_DELIVERY';

  // ---- Step 2 state -------------------------------------------------------
  Map<String, dynamic>? _quote;
  bool _quoteLoading = false;
  Timer? _quoteWatchdog;
  List<SellerQuoteFailure> _quoteFailures = const [];
  final Set<String> _selectedWindows = {};
  List<Map<String, dynamic>> _availabilityWindows = const [];
  List<Map<String, dynamic>> _sellerScheduleNotices = const [];
  bool _availabilityLoading = false;
  String? _availabilityError;

  /// Seller pickup pins for the review map, keyed by seller group key. The
  /// cart line does not carry the listing's coordinates (the web reads them
  /// from the product details it fetches per item), so checkout looks them up
  /// once when the review step opens.
  Map<String, Coordinates> _sellerOrigins = const {};

  /// 30 s review-step clock (see [_startReviewClock]).
  Timer? _reviewClock;

  /// Seller keys whose delivery is cross-region and therefore deferred
  /// ("Arranged after checkout"). Filled by the same pass that applies
  /// [applyCrossRegionDeliveryPolicy] to [_quote] (CARTCH-05 / APISUR-02).
  final Set<String> _crossRegionSellerKeys = {};

  // ---- Proforma resume state (?proforma=<id>) -----------------------------
  bool _resumingProforma = false;

  /// Non-null → the resume was refused (expired/cancelled/already submitted)
  /// and a status-specific message replaces the whole step machine.
  String? _resumeUnavailable;

  /// The resume failed on the way (a timeout or a network error) rather than
  /// finding an invoice that can no longer be paid, so trying again is worth
  /// offering — web "Retry payment".
  bool _resumeRetryable = false;

  /// The order can only start moving once its slowest item is ready, so every
  /// offered delivery window shifts past the LONGEST prep period in the cart
  /// (web `maximumProductionTimeDays`). Without this a buyer could pick a
  /// slot the seller has already said they cannot meet.
  int get _productionTimeDays => maximumProductionTimeDays(
      _cart.selectedItems.map((i) => i.productionTimeDays));

  /// Prep period captured when the proforma was created. The payment step
  /// runs AFTER the cart is cleared, so [_productionTimeDays] reads 0 there —
  /// the invoice has to remember what it was invoiced for.
  int _invoiceProductionDays = 0;

  /// The chosen windows that are still selectable right now — web parity
  /// `getAvailableDeliveryWindowValues`.
  Iterable<String> get _availableSelectedWindows {
    if (_availabilityWindows.isNotEmpty) {
      final valid = <String>{
        for (final raw in _availabilityWindows)
          if (_availabilityWindowIsOpen(raw)) '${raw['key'] ?? ''}',
      };
      return _selectedWindows.where(valid.contains);
    }
    return _selectedWindows.where((v) {
      final option = deliveryWindowOptionFromValue(v);
      return option != null && !option.isPast(_nowUtc, _productionTimeDays);
    });
  }

  bool _agree = false;

  // ---- Proforma + payment -------------------------------------------------
  Map<String, dynamic>? _proforma;
  String _paymentMethod = 'MOBILE_MONEY';

  /// Receipts the buyer attached. Web's rule (CARTCH-12 / FINANC-12,
  /// payment-confirmation-step.tsx:98) is `hasProof = receiptFiles.length > 0`
  /// — a screenshot is REQUIRED; a typed reference alone is not proof. Several
  /// receipts are allowed (a buyer paying in two transfers can evidence both).
  final List<({Uint8List bytes, String name})> _receipts = [];

  /// The active web checkout is upload-only: typed transaction references are
  /// not accepted as proof without at least one receipt image.
  bool get _hasProof => _receipts.isNotEmpty;
  bool _paymentConfirmed = false;
  bool _submittingPayment = false;
  bool _creatingProforma = false;
  String? _error;

  /// Where each step begins, and where its error appears. Checkout keeps one
  /// scroll view per step inside an IndexedStack, so all three exist at once
  /// and each needs its own anchor. Without them a step opened at whatever
  /// offset it was last left at, and an error set below the fold — the
  /// delivery-window and terms failures both are — left the buyer looking at
  /// a button that did nothing.
  late final Map<CheckoutStep, ScrollController> _stepScroll = {
    for (final s in CheckoutStep.values) s: ScrollController(),
  };
  late final Map<CheckoutStep, GlobalKey> _errorAnchors = {
    for (final s in CheckoutStep.values) s: GlobalKey(),
  };

  /// The error the view has already scrolled to, so a rebuild for any other
  /// reason does not yank the page back.
  String? _revealedError;

  /// Bumped on each arrival at the Payment step; keys its method picker.
  int _paymentVisit = 0;

  /// Which payment method row is open. The bank transfer's proof upload,
  /// confirmation and submit live inside the open Bank Account row, so the
  /// payment error shows there too while it is open.
  String? _openPaymentMethod;
  bool get _bankProofOpen =>
      _openPaymentMethod == 'BANK_TRANSFER' &&
      !isAutomatedPaymentMethod(_paymentMethod);
  String? _placedOrderId;

  /// CARTCH-09/APISUR-06: web polls the proforma every 30s while it is
  /// payable so a server-side expiry is discovered without waiting for the
  /// submit attempt. Started on the payment step, cancelled on dispose/leave.
  Timer? _proformaPollTimer;

  /// Tracks the [showDialog] used for the CARTCH-23 'Processing Order' blocker
  /// so show/hide stay paired across _confirmReview/_submitPayment.
  bool _processingDialogVisible = false;

  /// Web parity (`review-step.tsx:200-203`): the review step re-reads the
  /// clock on a 30 s tick, and a `useEffect` drops any selection that has
  /// since passed. Without this the screen keeps whatever clock it was built
  /// with, so a window that closes while the buyer is deciding stays tickable
  /// and a stale choice is still submitted — the reported "I can still pick a
  /// window whose time has passed".
  ///
  /// Skipped when [CheckoutScreen.nowUtc] is injected: a caller that supplies
  /// a fixed clock wants it fixed (and a live periodic timer would keep
  /// widget tests from ever settling).
  void _startReviewClock() {
    if (widget.nowUtc != null) return;
    _reviewClock = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      setState(() {
        // Materialise the keep-set BEFORE mutating: `_availableSelectedWindows`
        // is a lazy view over `_selectedWindows`.
        _selectedWindows.retainAll(_availableSelectedWindows.toSet());
      });
    });
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadProfileAndAddresses();
    _startReviewClock();
    if (widget.proformaId != null && widget.proformaId!.isNotEmpty) {
      _maybeResumeProforma();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _first.dispose();
    _last.dispose();
    _email.dispose();
    _phone.dispose();
    _walletPhone.dispose();
    _quoteWatchdog?.cancel();
    _proformaPollTimer?.cancel();
    _reviewClock?.cancel();
    _walletPoll?.cancel();
    for (final c in _stepScroll.values) {
      c.dispose();
    }
    super.dispose();
  }

  /// True while an order-affecting request is in flight. Mirrors web's
  /// `isProcessing`: the submit controls disable AND a non-dismissable
  /// 'Processing Order' dialog blocks navigation (CARTCH-23).
  bool get _processing => _creatingProforma || _submittingPayment;

  /// Web parity 'Processing Order' blocker (checkout-content.tsx:4015-4043):
  /// shown while a proforma is created or a payment submitted so a stray back
  /// gesture cannot orphan a 1-hour stock reservation mid-flight.
  void _showProcessingDialog() {
    if (_processingDialogVisible || !mounted) return;
    _processingDialogVisible = true;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      useRootNavigator: false,
      builder: (_) => PopScope(
        canPop: false,
        child: Dialog(
          backgroundColor: AppPalette.of(context).surface,
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              SizedBox(
                width: 36,
                height: 36,
                child: CircularProgressIndicator(strokeWidth: 3),
              ),
              SizedBox(height: 18),
              Text('Processing Your Order',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              SizedBox(height: 8),
              Text("Please don't close this window or click back.",
                  textAlign: TextAlign.center,
                  style:
                      TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 13)),
            ]),
          ),
        ),
      ),
    );
  }

  void _hideProcessingDialog() {
    if (!_processingDialogVisible || !mounted) return;
    _processingDialogVisible = false;
    Navigator.of(context, rootNavigator: false).pop();
  }

  Future<void> _loadProfileAndAddresses() async {
    final token = _auth.token;
    if (token == null) return;
    try {
      final profile = await _api
          .getUserDetails(token)
          .catchError((_) => <String, dynamic>{});
      final addresses = await _api.getAddresses(token);
      if (!mounted) return;
      // Read-only prefill from the profile (edit happens in Account settings).
      if (_first.text.isEmpty && _email.text.isEmpty) {
        _first.text = (profile['firstName'] ?? '').toString();
        _last.text = (profile['lastName'] ?? '').toString();
        _email.text = (_auth.email ??
                profile['loggingEmail'] ??
                profile['organizationalEmail'] ??
                '')
            .toString();
      }
      // Phone autofill: whatsAppPhoneNumber || phoneNumber (web parity).
      if (_phone.text.isEmpty) {
        _phone.text =
            ((profile['whatsAppPhoneNumber'] ?? profile['phoneNumber']) ?? '')
                .toString();
      }
      setState(() {
        _addresses = addresses;
        _loadingAddresses = false;
      });
      _applyDefaultAddress();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        // Addresses are an enhancement — the buyer can still type an address;
        // quote/proforma will simply lack a pin until one is chosen.
        _loadingAddresses = false;
        _addressesError = e.toString();
      });
    }
  }

  /// Default = isDefault else first; locks the shipping coordinates to its
  /// lat/lng (AU-023 lockstep).
  void _applyDefaultAddress() {
    if (_selectedAddressId != null || _addresses.isEmpty) return;
    final def = _addresses.firstWhere(
      savedAddressIsDefault,
      orElse: () => _addresses.first,
    );
    _selectAddress(def);
  }

  void _selectAddress(Map<String, dynamic>? address) {
    setState(() {
      if (address == null) {
        _selectedAddressId = null;
        _lat = null;
        _lng = null;
        return;
      }
      _selectedAddressId = '${address['addressId'] ?? address['id'] ?? ''}';
      _lat = (address['latitude'] as num?)?.toDouble();
      _lng = (address['longitude'] as num?)?.toDouble();
      final street = (address['street'] ?? address['address'] ?? '').toString();
      if (street.isNotEmpty) _addressText = street;
      final region = (address['region'] ?? address['city'] ?? '').toString();
      if (region.isNotEmpty) _cityText = region;
      _countryText = (address['country'] ?? 'Tanzania').toString();
    });
  }

  // Free-text fallbacks for buyers without a usable saved address (the web
  // also keeps these editable); when an address is selected they mirror it.
  final _addressController = TextEditingController();
  final _cityController = TextEditingController(text: 'Dar es Salaam');
  String _countryText = 'Tanzania';
  String get _addressText => _addressController.text.trim();
  set _addressText(String v) {
    if (_addressController.text == v) return;
    _addressController.text = v;
  }

  String get _cityText => _cityController.text.trim();
  set _cityText(String v) {
    if (_cityController.text == v) return;
    _cityController.text = v;
  }

  List<SellerGroup> get _sellerGroups =>
      groupCartItemsBySeller(_cart.selectedItems);

  /// A checkout of short stays only (web `isShortStayCheckout`): it reads as
  /// a booking — guest details, "Your stay", host confirmation. Wording only:
  /// the invoice, totals, payment and address handling are unchanged (an
  /// all-rental cart already needs no delivery address).
  bool get _stayOnly {
    final groups = _proforma?['sellerGroups'];
    if (groups is List && groups.isNotEmpty) {
      return isShortStayCheckout([
        for (final g in groups)
          if (g is Map)
            for (final i in (g['items'] as List? ?? const []))
              i is Map && i['rentalBooking'] is Map
                  ? (i['rentalBooking'] as Map).cast<String, dynamic>()
                  : null,
      ]);
    }
    return isShortStayCheckout([
      for (final i in _cart.selectedItems)
        i.rentalBooking == null
            ? null
            : {
                'listingType': i.rentalBooking!.listingType,
                'ratePeriod': i.rentalBooking!.ratePeriod,
              },
    ]);
  }

  /// Selected lines that actually travel with GloboExpats delivery logistics
  /// (web `itemUsesDeliveryLogistics`): rentals and EXEMPT handoff lines are
  /// booked or collected, never routed or delivery-quoted (CARTCH-06 /
  /// APISUR-09). Only these lines go in the delivery-quote payload.
  Iterable<CartItem> get _deliveryLogisticsItems =>
      _cart.selectedItems.where((i) => itemUsesDeliveryLogistics(
            isRentalBooking: i.rentalBooking != null,
            transportRequirement: i.transportRequirement,
            deliveryTransportMode: i.deliveryTransportMode,
          ));

  bool get _hasDeliveryLogisticsItems => _deliveryLogisticsItems.isNotEmpty;

  /// True when a GloboExpats delivery was actually chosen AND the cart has at
  /// least one line that can be delivered (an all-rental/EXEMPT cart has no
  /// delivery fee or windows even if the stale default is SELLER_DELIVERY).
  bool get _deliverySelected =>
      _fulfillmentType == 'SELLER_DELIVERY' && _hasDeliveryLogisticsItems;

  /// One line's logistics test, reused by the review-step group cards
  /// (web `group.items.some(itemUsesDeliveryLogistics)`).
  static bool _lineUsesDeliveryLogistics(CartItem i) =>
      itemUsesDeliveryLogistics(
        isRentalBooking: i.rentalBooking != null,
        transportRequirement: i.transportRequirement,
        deliveryTransportMode: i.deliveryTransportMode,
      );

  double get _subtotal => _cart.selectedItems.fold(0, (s, i) => s + i.subtotal);

  double get _quotedDeliveryTotal {
    if (!_deliverySelected) return 0;
    final t = _quote?['deliveryTotal'];
    return t is num ? t.toDouble() : 0;
  }

  double get _reviewedTotal => round2(_subtotal + _quotedDeliveryTotal);

  /// Buyer destination region/country → which seller groups are cross-region
  /// (web `getCrossRegionSellerKeys(items, {region: city, country})`). The
  /// numeric seller id is also the group key, so each line contributes it as
  /// both `sellerId` and `sellerKey` for the quote-group match.
  Set<String> _clientCrossRegionSellerKeys(Iterable<CartItem> items) =>
      getCrossRegionSellerKeys(
        [
          for (final i in items)
            CrossRegionItem(
              sellerId: i.sellerId,
              sellerKey: i.sellerId,
              expatName: i.sellerName,
              location: i.location,
              productRegion: i.productRegion,
              productCountry: i.productCountry,
            ),
        ],
        buyerRegion: _cityText,
        buyerCountry: _countryText,
      );

  /// Items can no longer be edited once the proforma exists (web
  /// `itemsLocked = logisticsV2 && currentStep >= 3`).
  bool get _itemsLocked =>
      _step == CheckoutStep.payment || _step == CheckoutStep.completion;

  bool get _hasSelectedItems => _cart.selectedCount > 0;

  // ---- Proforma resume (?proforma=<id>) -----------------------------------
  // Web parity: only a PENDING_PAYMENT invoice resumes — any later state gets
  // the reference's exact "can't continue" copy (proforma-utils.ts).

  Future<void> _maybeResumeProforma() async {
    final id = widget.proformaId;
    final token = _auth.token;
    if (id == null || id.isEmpty || token == null) return;
    setState(() {
      _resumingProforma = true;
      _resumeRetryable = false;
      _resumeUnavailable = null;
      _error = null;
    });
    try {
      // Web use-proforma.ts RESUME_TIMEOUT_MS: never leave the buyer on
      // "Loading your invoice" indefinitely — after 12s the retry screen
      // takes over, rather than the shared client's longer network deadline.
      final p = await _api.getProforma(token, id).timeout(
          proformaResumeTimeout,
          onTimeout: () => throw TimeoutException(
              proformaResumeTimeoutMessage, proformaResumeTimeout));
      if (!mounted) return;
      final status = '${p['status'] ?? ''}'.toUpperCase();
      // Paid through Selcom while the app was away (or killed while the
      // buyer approved in the Selcom App): show the success result, not
      // "already submitted" — the money is in.
      if ((status == 'PAYMENT_SUBMITTED' || status == 'CONFIRMED') &&
          await _selcomPaid(id)) {
        if (!mounted) return;
        setState(() {
          _resumingProforma = false;
          _proforma = p;
          _fulfillmentType = 'SELLER_DELIVERY';
          _placedOrderId = firstProformaOrderId(p);
          _selcomResult = PaymentResultKind.success;
          _step = CheckoutStep.completion;
        });
        KvStore.instance.remove(KvStore.kProformaCartSnapshot);
        requestPendingActionsRefresh();
        return;
      }
      if (status == 'PENDING_PAYMENT') {
        // Land straight on the PAYMENT step with the invoiced totals; the
        // items were locked when the invoice was created. Production days
        // are unknown from here — the invoice itself is authoritative.
        setState(() {
          _resumingProforma = false;
          _proforma = p;
          _fulfillmentType = 'SELLER_DELIVERY';
          _step = CheckoutStep.payment;
        });
        _syncProformaPoll();
        return;
      }
      setState(() {
        _resumingProforma = false;
        _resumeUnavailable = _resumeUnavailableCopy(status);
      });
    } on TimeoutException {
      if (!mounted) return;
      setState(() {
        _resumingProforma = false;
        _resumeRetryable = true;
        _resumeUnavailable = proformaResumeTimeoutMessage;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _resumingProforma = false;
        // A fetch that failed is worth another go; an invoice that is no
        // longer payable (the branch above) is not.
        _resumeRetryable = true;
        _resumeUnavailable =
            'We could not reopen this payment. ${friendlyErrorMessage('$e')}';
      });
    }
  }

  /// Web `getProformaResumeUnavailableMessage` — exact copy per status.
  String _resumeUnavailableCopy(String status) => switch (status) {
        'EXPIRED' => 'This payment window has expired. Return to My Payments '
            'to review its status.',
        'CANCELLED' =>
          'This payment was cancelled and can no longer be continued.',
        'PAYMENT_SUBMITTED' =>
          'This payment has already been submitted and is under review.',
        'CONFIRMED' => 'This payment has already been verified.',
        _ => 'We could not reopen this payment. Retry, or return to My '
            'Payments and contact support if it continues.',
      };

  /// True when this build runs under a GoRouter ancestor (real app). Widget
  /// tests pump CheckoutScreen inside a bare MaterialApp, where context.go
  /// would throw — keep those test paths on the in-widget fallback.
  /// Back to the cart WITHOUT wiping the history. This used `go('/cart')`,
  /// which replaced the whole stack: the cart then had nothing under it, so
  /// the phone's back button closed the app and the AppBar lost its arrow.
  void _backToCart() {
    final nav = Navigator.of(context);
    if (widget.fromCart && nav.canPop()) {
      nav.pop();
      return;
    }
    if (!_hasRouter) {
      if (nav.canPop()) nav.pop();
      return;
    }
    final router = GoRouter.of(context);
    if (nav.canPop()) {
      // Buy now → checkout → Cart: the cart opens where checkout was, so
      // back from it returns to the product.
      nav.pop();
      router.push('/cart');
    } else {
      // A cold link straight into checkout: the cart's own boundary gives
      // it a way home.
      router.go('/cart');
    }
  }

  bool get _hasRouter {
    try {
      GoRouter.of(context);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Leaves checkout to My Payments (resume-unavailable exit) via the router.
  void _goToMyPayments() {
    if (_hasRouter) {
      context.go('/account/payments');
      return;
    }
    setState(() {
      _resumeUnavailable = null;
      _proforma = null;
      _step = CheckoutStep.address;
    });
  }

  /// When a deep-linked resume finds an expired invoice whose cart snapshot is
  /// still on this device, hand the confirmed items back and start a fresh
  /// review so the buyer is not forced to re-add everything (APISUR-05).
  Future<void> _resumeRestoreCartAndStartOver() async {
    final snapshot = _readCartSnapshot();
    if (snapshot.isNotEmpty) {
      await _cart.restoreSnapshot(snapshot);
      KvStore.instance.remove(KvStore.kProformaCartSnapshot);
    }
    if (!mounted) return;
    _quoteWatchdog?.cancel();
    setState(() {
      _proforma = null;
      _placedOrderId = null;
      _invoiceProductionDays = 0;
      _receipts.clear();
      _paymentConfirmed = false;
      _selectedWindows.clear();
      _quote = null;
      _quoteFailures = const [];
      _crossRegionSellerKeys.clear();
      _error = null;
      _resumeUnavailable = null;
      _step = CheckoutStep.review;
    });
    if (_deliverySelected) _fetchQuote();
  }

  // ---- Step navigation ----------------------------------------------------

  void _goTo(CheckoutStep s) {
    setState(() {
      _error = null;
      _step = s;
      // Web remounts Step 03 on every visit, so it always reopens with every
      // method collapsed. Checkout keeps its steps alive here, so a new key
      // does what the remount does.
      if (s == CheckoutStep.payment) {
        _paymentVisit++;
        _openPaymentMethod = null;
      }
    });
    scrollToStart(_stepScroll[s]!);
    _syncProformaPoll();
  }

  /// Starts/stops the web-parity 30s proforma poll as the step machine moves
  /// (use-proforma.ts POLL_INTERVAL_MS). Active only while a payable proforma
  /// is on screen, so leaving the step or a finished payment cancels it.
  void _syncProformaPoll() {
    final active = _step == CheckoutStep.payment &&
        _proforma != null &&
        _isPayableProformaStatus('${_proforma?['status'] ?? ''}');
    if (!active) {
      _proformaPollTimer?.cancel();
      _proformaPollTimer = null;
      return;
    }
    _proformaPollTimer ??= Timer.periodic(_kProformaPollInterval, (_) {
      if (mounted && _step == CheckoutStep.payment) _refreshProforma();
    });
  }

  bool _isPayableProformaStatus(String status) =>
      status == 'PENDING_PAYMENT' || status == 'PAYMENT_SUBMITTED';

  /// Web `refresh()` — one server re-check of the payable proforma. An
  /// EXPIRED/CANCELLED answer surfaces the same expired-invoice dialog the
  /// submit path shows (the confirmed cart snapshot is restored); any other
  /// state change just replaces the local snapshot so stale money never stays
  /// on screen (CARTCH-09 / APISUR-06).
  Future<void> _refreshProforma() async {
    final proformaId = '${_proforma?['proformaId'] ?? ''}';
    final token = _auth.token;
    if (!mounted || token == null || proformaId.isEmpty) return;
    if (_processing) return; // a submit is in flight — never race it
    final Map<String, dynamic> latest;
    try {
      latest = await _api.getProforma(token, proformaId);
    } catch (_) {
      return; // transient network failure: keep the recovery handle
    }
    if (!mounted || _step != CheckoutStep.payment) return;
    final status = '${latest['status'] ?? ''}'.toUpperCase();
    if (status == 'EXPIRED' || status == 'CANCELLED') {
      _proformaPollTimer?.cancel();
      _proformaPollTimer = null;
      setState(() => _proforma = latest);
      await _showExpiredDialog();
      return;
    }
    final currentStatus = '${_proforma?['status'] ?? ''}'.toUpperCase();
    if (status != currentStatus) {
      setState(() => _proforma = latest);
      _syncProformaPoll();
      // Selcom's webhook marks the invoice paid on the server. When that is
      // what changed, finish the payment here instead of leaving the buyer
      // on a payment page for money that has already arrived.
      if (_selcomAttempted &&
          (status == 'PAYMENT_SUBMITTED' || status == 'CONFIRMED')) {
        await _settleIfSelcomPaid();
      }
    }
  }

  void _nextFromAddress() {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    // An all-rental / EXEMPT cart can't travel with a GloboExpats transporter
    // — pickup (or arranging with the seller) is the only fulfillment option.
    _fulfillmentType =
        _hasDeliveryLogisticsItems ? 'SELLER_DELIVERY' : 'BUYER_PICKUP';
    if (_deliverySelected && ((_lat == null || _lng == null))) {
      setState(() => _error =
          'Choose a saved delivery address with a map pin so we can calculate '
              'the delivery fee.');
      return;
    }
    if (!_hasSelectedItems) {
      setState(() => _error = 'Your cart is empty.');
      return;
    }
    _goTo(CheckoutStep.review);
    if (_deliverySelected) {
      _fetchQuote();
      _fetchAvailability();
      _fetchSellerOrigins();
    }
  }

  /// Resolve one pickup pin per seller group for the delivery-route map (web
  /// `deliveryRoutePreviews`, which takes the first product coordinate it
  /// finds in the group). Best-effort: a listing without a pin simply has no
  /// S marker, and a failed lookup leaves the map showing the rest.
  Future<void> _fetchSellerOrigins() async {
    final wanted = <String, int>{};
    for (final group in _sellerGroups) {
      for (final line in group.items) {
        if (!_lineUsesDeliveryLogistics(line)) continue;
        wanted.putIfAbsent(group.sellerKey, () => line.productId);
      }
    }
    if (wanted.isEmpty) return;
    final origins = <String, Coordinates>{};
    await Future.wait(wanted.entries.map((entry) async {
      try {
        final detail = await _api.fetchProductDetail(entry.value);
        final lat = detail.latitude, lng = detail.longitude;
        if (lat != null && lng != null && (lat != 0 || lng != 0)) {
          origins[entry.key] = Coordinates(lat, lng);
        }
      } catch (_) {/* the map degrades to the pins it does have */}
    }));
    if (!mounted || origins.isEmpty) return;
    setState(() => _sellerOrigins = origins);
  }

  bool _availabilityWindowIsOpen(Map<String, dynamic> raw) {
    final parsed = parseSellerAvailabilityWindows([raw]);
    return parsed.isNotEmpty && parsed.first.endUtc.isAfter(_nowUtc);
  }

  Future<void> _fetchAvailability() async {
    final token = _auth.token;
    if (token == null || !_deliverySelected) return;
    setState(() {
      _availabilityLoading = true;
      _availabilityError = null;
    });
    try {
      final result = await _api.fetchCheckoutAvailabilitySummary(
        token,
        _deliveryLogisticsItems.map((line) => line.productId).toSet().toList(),
      );
      if (!mounted) return;
      final windows = result['windows'];
      final notices = result['sellerNotices'];
      setState(() {
        _availabilityWindows = windows is List
            ? windows
                .whereType<Map>()
                .map((entry) => entry.cast<String, dynamic>())
                .toList(growable: false)
            : const [];
        _sellerScheduleNotices = notices is List
            ? notices
                .whereType<Map>()
                .map((entry) => entry.cast<String, dynamic>())
                .toList(growable: false)
            : const [];
        _selectedWindows.retainAll(_availableSelectedWindows.toSet());
        _availabilityLoading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _availabilityLoading = false;
        _availabilityError = 'Could not load seller availability.';
      });
    }
  }

  void _fetchQuote() {
    final token = _auth.token;
    if (token == null) return;
    // Quote ONLY the lines that use GloboExpats delivery logistics. Rentals and
    // EXEMPT handoffs have no transport mode — routing them fabricates fees and
    // windows the seller never offered (CARTCH-06 / APISUR-09 parity).
    final deliveryItems = _deliveryLogisticsItems.toList();
    if (deliveryItems.isEmpty) {
      _quoteWatchdog?.cancel();
      setState(() {
        _quoteLoading = false;
        _quote = null;
        _quoteFailures = const [];
        _crossRegionSellerKeys.clear();
      });
      return;
    }
    _quoteWatchdog?.cancel();
    setState(() {
      _quoteLoading = true;
      _quoteFailures = const [];
      _crossRegionSellerKeys.clear();
    });
    final groups = groupCartItemsBySeller(deliveryItems);
    final items = buildItemsPayload(deliveryItems.map(cartLineToCheckoutLine));
    // 20 s watchdog → every group becomes CALCULATION_TIMEOUT (§4.2).
    _quoteWatchdog = Timer(kDeliveryQuoteTimeout, () {
      if (!mounted) return;
      setState(() {
        _quoteLoading = false;
        _quote = null;
        _quoteFailures = [
          for (final g in groups)
            SellerQuoteFailure(
              sellerKey: g.sellerKey,
              sellerName: g.sellerName,
              reason: DeliveryQuoteFailureReason.CALCULATION_TIMEOUT,
            ),
        ];
      });
    });
    _api
        .deliveryQuote(
      token,
      city: _cityText,
      country: _countryText,
      latitude: _lat,
      longitude: _lng,
      items: items,
    )
        .then((quote) {
      if (!mounted) return;
      _quoteWatchdog?.cancel();
      // Cross-region delivery is NOT priced at checkout — the fee is arranged
      // after checkout and is excluded from the amount due. Force-null those
      // groups' quoted fees before anything reads them (APISUR-02).
      final keys = _clientCrossRegionSellerKeys(deliveryItems);
      setState(() {
        _quoteLoading = false;
        _quote = applyCrossRegionDeliveryPolicy(quote, keys);
        _crossRegionSellerKeys
          ..clear()
          ..addAll(keys);
        _quoteFailures = const [];
      });
    }).catchError((Object e) {
      if (!mounted) return;
      _quoteWatchdog?.cancel();
      setState(() {
        _quoteLoading = false;
        _quote = null;
        _quoteFailures = [
          for (final g in groups)
            SellerQuoteFailure(
              sellerKey: g.sellerKey,
              sellerName: g.sellerName,
              reason: DeliveryQuoteFailureReason.ROUTE_UNAVAILABLE,
            ),
        ];
        _error = e.toString();
      });
    });
  }

  // ---- Step 2 -> 3: proforma creation -------------------------------------

  Future<void> _confirmReview() async {
    setState(() {
      _error = null;
      if (_deliverySelected && _selectedWindows.isEmpty) {
        _error = 'Select at least one available Today or Tomorrow window for '
            'the seller.';
      } else if (_deliverySelected && _availableSelectedWindows.isEmpty) {
        // Sitting on this step long enough can retire the chosen slot. Web
        // re-checks availability here; without it buildBuyDetails throws a
        // raw StateError that surfaces as a Dart error string.
        _error = 'Your selected delivery time has passed. Please choose '
            'another window.';
      } else if (!_agree) {
        _error = 'Please agree to the Terms & Conditions to continue.';
      } else if (_deliverySelected && _quoteLoading && _quote == null) {
        _error = 'Calculating delivery fees — please wait a moment.';
      } else if (_deliverySelected && _quote == null) {
        _error = explainQuoteFailures(_quoteFailures).description;
      }
    });
    if (_error != null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: Icon(Icons.check_circle_outline,
            color: AppPalette.of(context).accentInk, size: 30),
        title: const Text('Confirm your order'),
        content: const Text(
          "We'll generate a proforma invoice and take you to payment. "
          "Your cart will be cleared and you won't be able to change these "
          'items while the invoice is active.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Review again'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Generate invoice'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final token = _auth.token;
    if (token == null) {
      setState(() => _error = 'You need to be logged in to checkout.');
      return;
    }
    setState(() => _creatingProforma = true);
    _showProcessingDialog();
    try {
      final resolvedAvailabilityWindows = _availabilityWindows.isEmpty
          ? null
          : <Map<String, dynamic>>[
              for (final raw in _availabilityWindows)
                if (_selectedWindows.contains('${raw['key'] ?? ''}') &&
                    _availabilityWindowIsOpen(raw))
                  {
                    'date': '${raw['date'] ?? ''}',
                    'slot': '${raw['slot'] ?? ''}',
                  },
            ];
      final buyDetails = buildBuyDetails(
        address: CheckoutAddressInput(
          firstName: _first.text,
          lastName: _last.text,
          emailAddress: _email.text,
          phoneNumber: _phone.text,
          address: _addressText,
          label: (_addresses
                          .where((a) =>
                              '${a['addressId'] ?? a['id'] ?? ''}' ==
                              _selectedAddressId)
                          .isEmpty
                      ? null
                      : (_addresses.firstWhere((a) =>
                          '${a['addressId'] ?? a['id'] ?? ''}' ==
                          _selectedAddressId)['label']))
                  ?.toString() ??
              '',
          placeName: _selectedPlaceName,
          neighbourhood: _selectedNeighbourhood,
          city: _cityText,
          country: _countryText,
          latitude: _lat,
          longitude: _lng,
        ),
        fulfillmentType: _fulfillmentType,
        paymentMethodType: _paymentMethod,
        deliveryFee: _quotedDeliveryTotal,
        subtotal: _subtotal,
        selectedWindowValues: _selectedWindows,
        productionTimeDays: _productionTimeDays,
        nowUtc: _nowUtc,
        resolvedDeliveryWindows: resolvedAvailabilityWindows,
      );
      final items =
          buildItemsPayload(_cart.selectedItems.map(cartLineToCheckoutLine));
      final created = await _api.createProforma(token,
          buyDetails: buyDetails, items: items);
      if (!mounted) return;

      // Price guard (§5.3): never let the buyer pay a stale total.
      final grand = created['grandTotal'];
      if (grandTotalMismatch(
          grandTotal: grand is num ? grand : null,
          reviewedTotal: _reviewedTotal)) {
        try {
          await _api.cancelProforma(token, '${created['proformaId'] ?? ''}');
        } catch (_) {/* cancel best-effort; guard still applies */}
        _resyncPrices(created);
        // The quote is stale too — refetch so the reviewed total matches the
        // resynced prices before the buyer confirms again.
        _fetchQuote();
        if (!mounted) return;
        _hideProcessingDialog();
        setState(() {
          _creatingProforma = false;
          _error =
              'The authoritative price changed while you were reviewing. We '
              'refreshed the prices; please review and confirm again.';
        });
        return;
      }

      // Snapshot BEFORE clearing the cart — durable first, clear after (§5.5).
      // The proforma itself is kept under its own key so a killed app can
      // resume payment from My Payments.
      await KvStore.instance.setJson(
        KvStore.kProformaCartSnapshot,
        [for (final i in _cart.selectedItems) i.toJson()],
      );
      await KvStore.instance.setJson(
        'proforma_${created['proformaId'] ?? ''}',
        created,
      );
      // Read it BEFORE the cart is emptied — it is derived from the cart.
      final invoicedPrepDays = _productionTimeDays;
      _cart.clear();
      if (!mounted) return;
      _hideProcessingDialog();
      setState(() {
        _creatingProforma = false;
        _proforma = created;
        _invoiceProductionDays = invoicedPrepDays;
        // Web prefills the wallet number from the phone captured at
        // checkout; it stays editable.
        if (_walletPhone.text.trim().isEmpty) {
          _walletPhone.text = _phone.text.trim();
        }
      });
      _goTo(CheckoutStep.payment);
    } catch (e) {
      if (!mounted) return;
      _hideProcessingDialog();
      setState(() {
        _creatingProforma = false;
        _error = proformaFailureMessage(e);
      });
    }
  }

  String get _selectedPlaceName {
    for (final a in _addresses) {
      if ('${a['addressId'] ?? a['id'] ?? ''}' == _selectedAddressId) {
        return '${a['placeName'] ?? ''}';
      }
    }
    return '';
  }

  String get _selectedNeighbourhood {
    for (final a in _addresses) {
      if ('${a['addressId'] ?? a['id'] ?? ''}' == _selectedAddressId) {
        return '${a['neighbourhood'] ?? ''}';
      }
    }
    return '';
  }

  void _resyncPrices(Map<String, dynamic> created) {
    _cart.resyncPrices(authoritativeUnitPrices(created));
  }

  // ---- Step 3: payment ----------------------------------------------------

  Future<void> _submitPayment() async {
    final proformaId = '${_proforma?['proformaId'] ?? ''}';
    final token = _auth.token;
    if (token == null || proformaId.isEmpty) {
      setState(() => _error = 'You need to be logged in.');
      return;
    }
    if (!_hasProof) {
      setState(() => _error = 'Upload a payment screenshot first.');
      return;
    }
    if (!_paymentConfirmed) {
      setState(() =>
          _error = 'Tick "I have completed the payment" to enable submission.');
      return;
    }
    setState(() {
      _submittingPayment = true;
      _error = null;
    });
    _showProcessingDialog();
    try {
      if (_receipts.isNotEmpty) {
        await _api.uploadProformaReceipts(
          token,
          proformaId,
          files: [
            for (final r in _receipts)
              (bytes: r.bytes, filename: r.name, contentType: 'image/png'),
          ],
        );
      }
      final updated = await _api.submitProformaPayment(token, proformaId,
          transactionReferences: const [], paymentMethodType: _paymentMethod);
      if (!mounted) return;
      // Success branches ONLY on the authoritative status field (§6) — never
      // on body-emptiness.
      if ((updated['status'] ?? '').toString() != 'PAYMENT_SUBMITTED') {
        _hideProcessingDialog();
        setState(() {
          _submittingPayment = false;
          _error = 'The payment was not accepted yet (status '
              '${updated['status'] ?? 'unknown'}). Please check your proof.';
        });
        return;
      }
      final grandTotal = _proforma?['grandTotal'];
      MatomoTracking.instance.trackOrder(
          orderId: proformaId,
          grandTotal: grandTotal is num ? grandTotal : 0);
      await _onPaymentSubmitted(updated);
    } catch (e) {
      if (!mounted) return;
      _hideProcessingDialog();
      final msg = '$e'.replaceFirst(RegExp(r'^ApiException:\s*'), '');
      if (msg.toUpperCase().contains('PAYMENT_PROOF_REQUIRED')) {
        setState(() {
          _submittingPayment = false;
          _error = friendlyErrorMessage(msg);
        });
      } else if (msg.toUpperCase().contains('PROFORMA_EXPIRED')) {
        setState(() => _submittingPayment = false);
        _showExpiredDialog();
      } else {
        setState(() {
          _submittingPayment = false;
          _error = msg;
        });
      }
    }
  }

  Future<void> _onPaymentSubmitted(Map<String, dynamic> updated) async {
    final orderId = firstProformaOrderId(updated);
    // The proforma number is a fine KEY for the local snapshot, but it is NOT
    // an order id: routing to /orders/<proforma number> finds no order, and an
    // empty one routes to /orders — the buyer's order LIST — which renders as
    // a blank My Space. Navigation only ever uses a real order id now.
    final snapshotKey = orderId ??
        '${updated['proformaNumber'] ?? updated['proformaId'] ?? ''}';
    if (snapshotKey.isNotEmpty) {
      // Order snapshot durable BEFORE anything is dropped (§5.5).
      await KvStore.instance.setJson(KvStore.orderKey(snapshotKey), updated);
      await KvStore.instance.setString(KvStore.kLastOrderId, snapshotKey);
    }
    KvStore.instance.remove(KvStore.kProformaCartSnapshot);
    if (!mounted) return;
    _hideProcessingDialog();
    setState(() {
      _submittingPayment = false;
      _proforma = updated;
      _placedOrderId = orderId;
    });
    _goTo(CheckoutStep.completion);
  }

  /// The cart snapshot written when the proforma was created (§5.5). It is the
  /// buyer's confirmed items; restoring it means an expired/cancelled invoice
  /// never silently loses the order (CARTCH-03 / APISUR-05 / FINANC-02).
  List<Map<String, dynamic>> _readCartSnapshot() => [
        for (final e
            in KvStore.instance.getJsonList(KvStore.kProformaCartSnapshot) ??
                const [])
          if (e is Map) Map<String, dynamic>.from(e),
      ];

  Future<void> _showExpiredDialog() async {
    final snapshot = _readCartSnapshot();
    final canRestore = snapshot.isNotEmpty;
    final choice = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Invoice expired'),
        content: Text(canRestore
            ? 'This payment window has expired and your reserved items were '
                'released. Your cart has been restored so you can review the '
                'updated prices and check out again.'
            : 'This payment window expired. Start a fresh checkout to get '
                'updated prices.'),
        actions: [
          if (canRestore)
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop('cart'),
              child: const Text('Back to cart'),
            ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.brandBlue),
            onPressed: () => Navigator.of(dialogContext).pop('review'),
            child: Text(canRestore ? 'Start over' : 'Start fresh checkout'),
          ),
        ],
      ),
    );
    if (choice == null || !mounted) return;
    // Hand the confirmed items back to the cart BEFORE leaving the step, then
    // start a fresh checkout from them. The snapshot is consumed either way.
    if (snapshot.isNotEmpty) {
      await _cart.restoreSnapshot(snapshot);
      KvStore.instance.remove(KvStore.kProformaCartSnapshot);
    }
    if (!mounted) return;
    _restartCheckoutState();
    if (choice == 'cart' && _hasRouter) {
      _backToCart();
      return;
    }
    _goTo(CheckoutStep.review);
    if (_deliverySelected) _fetchQuote();
  }

  void _restartCheckoutState() {
    _quoteWatchdog?.cancel();
    setState(() {
      _proforma = null;
      _placedOrderId = null;
      _invoiceProductionDays = 0;
      _receipts.clear();
      _paymentConfirmed = false;
      _selectedWindows.clear();
      _quote = null;
      _quoteFailures = const [];
      _crossRegionSellerKeys.clear();
      _error = null;
    });
  }

  // ---- Cancel invoice (replaces Back from step >= 3) -----------------------

  Future<void> _cancelInvoice() async {
    final token = _auth.token;
    final proformaId = '${_proforma?['proformaId'] ?? ''}';
    if (token == null || proformaId.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Row(children: [
          Icon(Icons.error_outline,
              color: AppPalette.of(dialogContext).textPrimary),
          SizedBox(width: 8),
          Expanded(child: Text('Cancel this invoice?')),
        ]),
        content: const Text(
            'Your reserved items will be released and this proforma invoice '
            'will be cancelled. The confirmed cart was already cleared, so '
            "you'll need to add the items again to reorder."),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep invoice'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: inkFill(dialogContext),
                foregroundColor: Colors.white),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Cancel invoice'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.cancelProforma(token, proformaId);
      KvStore.instance.remove(KvStore.kProformaCartSnapshot);
      if (!mounted) return;
      messenger.showSnackBar(const SnackBar(
        content: Text(
            'Invoice cancelled — your reserved items were released. You can order again anytime.'),
      ));
      // The confirmed cart was cleared when the invoice was created. Review
      // now has no lines to review; return to the cart's empty state instead.
      _backToCart();
    } catch (e) {
      messenger.showSnackBar(SnackBar(
          content: Text(
              'Could not cancel the invoice: ${friendlyErrorMessage('$e')}')));
    }
  }

  /// Web parity support affordance (payment-confirmation-step.tsx:310-328):
  /// `tel:` link to the official support line.
  Future<void> _callSupport() async {
    try {
      await launchUrl(Uri(scheme: 'tel', path: _kSupportPhone));
    } catch (_) {/* tests / no tel handler */}
  }

  /// Web parity support affordance: `https://wa.me/<digits>` deep link.
  Future<void> _messageSupportWhatsApp() async {
    try {
      await launchUrl(Uri.parse(
          "https://wa.me/${_kSupportPhone.replaceAll(RegExp(r'\D'), '')}"));
    } catch (_) {/* tests / no handler */}
  }

  /// Opens an in-app legal page. Plain-Navigator test hosts have no /terms or
  /// /privacy route, so a missing GoRouter is swallowed (sell_wizard pattern).
  void _openLegalRoute(String path) {
    try {
      context.push(path);
    } catch (_) {/* no GoRouter in the test host */}
  }

  // ---- Build ---------------------------------------------------------------

  PreferredSizeWidget _checkoutAppBar() => AppBar(
        centerTitle: true,
        title: Text(_stayOnly ? 'Book your stay' : 'Checkout',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        leadingWidth: 82,
        leading: TextButton.icon(
          onPressed: _processing ? null : _backToCart,
          icon: const Icon(Icons.arrow_back, size: 17),
          label: const Text('Cart'),
        ),
      );

  @override
  Widget build(BuildContext context) {
    if (!_auth.isAuthenticated) {
      return Scaffold(
        appBar: _checkoutAppBar(),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('Please log in to checkout.',
                  textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandBlue),
                onPressed: () => Navigator.of(context).pushNamed('/login'),
                child: const Text('Log in'),
              ),
            ]),
          ),
        ),
      );
    }

    if (_resumingProforma) {
      return Scaffold(
        appBar: _checkoutAppBar(),
        body: const Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Loading your invoice…'),
          ]),
        ),
      );
    }
    if (_resumeUnavailable != null) {
      final hasExpiredSnapshot = _readCartSnapshot().isNotEmpty;
      return Scaffold(
        appBar: _checkoutAppBar(),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.info_outline,
                    size: 40, color: AppPalette.of(context).accentInk),
                const SizedBox(height: 12),
                Text(_resumeUnavailable!, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                if (_resumeRetryable) ...[
                  FilledButton.icon(
                    key: const ValueKey('resume-retry'),
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brandBlue),
                    onPressed: _maybeResumeProforma,
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    label: const Text('Retry payment'),
                  ),
                  const SizedBox(height: 8),
                ],
                if (hasExpiredSnapshot) ...[
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brandBlue),
                    onPressed: _resumeRestoreCartAndStartOver,
                    icon: const Icon(Icons.restart_alt, size: 18),
                    label: const Text('Restore my cart & check out again'),
                  ),
                  const SizedBox(height: 8),
                ],
                OutlinedButton.icon(
                  onPressed: _goToMyPayments,
                  icon: const Icon(Icons.receipt_long_outlined, size: 18),
                  label: const Text('Return to My Payments'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // One hook for every path that sets _error: whichever method raised it,
    // the buyer is shown it rather than left to find it.
    if (_error == null) {
      _revealedError = null;
    } else if (_error != _revealedError) {
      _revealedError = _error;
      revealAnchor(_errorAnchors[_step]!, _stepScroll[_step]!,
          alignment: 0.12);
    }

    final stepIndex = CheckoutStep.values.indexOf(_step);
    return Scaffold(
      appBar: _checkoutAppBar(),
      body: Column(children: [
        _StepIndicator(current: stepIndex, stayOnly: _stayOnly),
        Expanded(
          child: IndexedStack(index: stepIndex, children: [
            Form(key: _form, child: _buildAddressStep()),
            _buildReviewStep(),
            _buildPaymentStep(),
            // Web Step 04: a wallet payment's outcome takes the place of the
            // "Payment submitted" card; a bank transfer still gets the card.
            _selcomResult != null
                ? ListView(padding: const EdgeInsets.all(16), children: [
                    PaymentResultScreen(
                      kind: _selcomResult!,
                      amountLabel: _resultAmountLabel(),
                      reference:
                          '${_proforma?['proformaNumber'] ?? ''}'.trim(),
                      phoneLabel: _selcomResultPhone,
                      onPrimaryAction: _selcomResult == PaymentResultKind.success
                          ? () => context.go('/browse')
                          : _retrySelcomPayment,
                      // A paid order is worth checking on straight away, as
                      // the bank-transfer completion card already lets you.
                      viewOrderLabel: _selcomResult == PaymentResultKind.success
                          ? ((_placedOrderId ?? '').isEmpty
                              ? 'View my orders'
                              : _stayOnly
                                  ? 'View booking details'
                                  : 'View Order Details')
                          : null,
                      onViewOrder: _selcomResult == PaymentResultKind.success
                          ? () => openPlacedOrder(context, _placedOrderId)
                          : null,
                    ),
                  ])
                : _CompletionStep(
                    orderId: _placedOrderId,
                    proforma: _proforma,
                    stayOnly: _stayOnly),
          ]),
        ),
      ]),
    );
  }

  Widget _buildAddressStep() {
    return ListView(
        controller: _stepScroll[CheckoutStep.address],
        padding: const EdgeInsets.all(16),
        children: [
      ListenableBuilder(
        listenable: _cart,
        builder: (context, _) => _OrderSummary(
          lines: _cart.selectedItems.toList(),
          cart: _cart,
          locked: _itemsLocked,
          stayOnly: _stayOnly,
        ),
      ),
      const SizedBox(height: 20),
      // Web parity `app/checkout/checkout-content.tsx:2459` — one "Delivery
      // Address" card: a header strip that says what the step is for, the
      // locked contact fields, then the saved-address picker in its own
      // tinted box. Mobile used to stack two unlabelled containers, so the
      // buyer met a bare form with no heading telling them what it was for.
      _CheckoutCard(
        title: _stayOnly ? 'Guest details' : 'Delivery Address',
        subtitle: _stayOnly
            ? 'Contact details for your booking and check-in.'
            : 'Where should we deliver your items?',
        child: AnimatedSwitcher(
          // While the profile and saved addresses load, a still outline —
          // not empty fields that fill in one by one and a dropdown that
          // pops in underneath, which is what made the page jump after
          // "Buy now". Display only: nothing about the order changes.
          duration: const Duration(milliseconds: 220),
          child: _loadingAddresses
              ? const _CheckoutAddressSkeleton(
                  key: ValueKey('checkout-address-loading'))
              : KeyedSubtree(
                  key: const ValueKey('checkout-address-ready'),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
                child: _CheckoutContactField(
                    controller: _first,
                    label: 'First name',
                    icon: Icons.person_outline_rounded)),
            const SizedBox(width: 8),
            Expanded(
                child: _CheckoutContactField(
                    controller: _last,
                    label: 'Last name',
                    icon: Icons.person_outline_rounded)),
          ]),
          const SizedBox(height: 10),
          _CheckoutContactField(
              controller: _email,
              label: 'Email',
              icon: Icons.mail_outline_rounded,
              keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 10),
          _CheckoutContactField(
              controller: _phone,
              label: 'WhatsApp phone number',
              icon: Icons.chat_bubble_outline_rounded,
              keyboardType: TextInputType.phone,
              validator: (v) => (v == null || v.isEmpty) ? 'Required' : null),
          // A stay is not delivered: no address to choose (web parity).
          if (!_stayOnly) ...[
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppPalette.of(context).background,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppPalette.of(context).border),
            ),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Web shows the same tip above the picker; tapping it here
              // opens the address book, which is where a default is set.
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () async {
                  await _openAddresses(context);
                  if (mounted) _loadProfileAndAddresses();
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.lightbulb_outline_rounded,
                            size: 16,
                            color: AppPalette.of(context).textSecondary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text.rich(
                            TextSpan(children: [
                              TextSpan(
                                  text: 'Tip: ',
                                  style:
                                      TextStyle(fontWeight: FontWeight.w700)),
                              TextSpan(text: 'update your defaults in '),
                              TextSpan(
                                  text: 'Profile Settings',
                                  style: TextStyle(
                                      color: AppPalette.of(context).accentInk,
                                      fontWeight: FontWeight.w700)),
                              TextSpan(text: '.'),
                            ]),
                            style: TextStyle(
                                fontSize: 12.5,
                                height: 1.35,
                                color: AppPalette.of(context).textSecondary),
                          ),
                        ),
                      ]),
                ),
              ),
              const SizedBox(height: 12),
              Text('Select From Saved Addresses',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppPalette.of(context).textSecondary)),
              const SizedBox(height: 8),
              if (_loadingAddresses)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: LinearProgressIndicator(minHeight: 2),
                )
              else ...[
                if (_addressesError != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                        'Could not load your saved addresses. Retry or open '
                        'Profile Settings.',
                        style: TextStyle(
                            color: Colors.amber.shade800, fontSize: 12)),
                  ),
                if (_addresses.isNotEmpty) ...[
                  DropdownButtonFormField<String>(
                    value: _selectedAddressId,
                    // Without this the button takes the intrinsic width of its
                    // widest entry, so a long address runs straight through
                    // the field's border instead of ellipsising inside it.
                    isExpanded: true,
                    itemHeight: null,
                    decoration: InputDecoration(
                        hintText: 'Choose a delivery address…',
                        prefixIcon: const Icon(Icons.location_on_outlined),
                        filled: true,
                        fillColor: AppPalette.of(context).surface,
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12))),
                    // The closed field shows one line; the two-line shape
                    // below belongs to the open menu only.
                    selectedItemBuilder: (context) => [
                      for (final a in _addresses)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Text(savedAddressPrimaryLabel(a),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w600)),
                        ),
                    ],
                    items: [
                      for (final a in _addresses)
                        DropdownMenuItem(
                          value: '${a['addressId'] ?? a['id'] ?? ''}',
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(savedAddressPrimaryLabel(a),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600)),
                                Text(savedAddressSecondaryLabel(a),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                        fontSize: 11.5,
                                        color: AppPalette.of(context)
                                            .textSecondary)),
                              ],
                            ),
                          ),
                        ),
                    ],
                    onChanged: (v) {
                      Map<String, dynamic>? match;
                      for (final a in _addresses) {
                        if ('${a['addressId'] ?? a['id'] ?? ''}' == v) {
                          match = a;
                        }
                      }
                      _selectAddress(match);
                    },
                  ),
                ] else ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).infoFill,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: AppColors.brandBlue.withValues(alpha: .2)),
                    ),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                              "You don't have a saved delivery address yet.",
                              style: TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          Text('Add one with a map pin to continue.',
                              style: TextStyle(
                                  fontSize: 12,
                                  color:
                                      AppPalette.of(context).textSecondary)),
                          const SizedBox(height: 10),
                          FilledButton.icon(
                            onPressed: () async {
                              await _openAddresses(context);
                              if (mounted) _loadProfileAndAddresses();
                            },
                            icon: const Icon(Icons.add_location_alt_outlined,
                                size: 18),
                            label: const Text('Add a delivery address'),
                          ),
                        ]),
                  ),
                ],
              ],
            ]),
          ),
          ],
        ])),
        ),
      ),
      const SizedBox(height: 14),
      if (!_hasDeliveryLogisticsItems && !_stayOnly)
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppPalette.of(context).background,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppPalette.of(context).border),
          ),
          child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.storefront_outlined, size: 20),
                SizedBox(width: 10),
                Expanded(
                    child: Text(
                        'Direct handoff\nThese items are picked up or arranged directly with the seller.',
                        style: TextStyle(fontSize: 12.5, height: 1.4))),
              ]),
        ),
      ScrollAnchor(_errorAnchors[CheckoutStep.address]!),
      if (_error != null) ...[
        const SizedBox(height: 8),
        Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
      ],
      const SizedBox(height: 16),
      FilledButton(
        style: FilledButton.styleFrom(
            backgroundColor: AppColors.brandBlue,
            padding: const EdgeInsets.symmetric(vertical: 16)),
        onPressed: _nextFromAddress,
        child: const Text('Continue to review',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    ]);
  }

  /// One of the six composite delivery-window tiles on the review step.
  ///
  /// A window whose EAT end-hour has already passed (web `isDeliveryWindowPast`)
  /// renders disabled with a "Time passed" caption, but stays in its visual
  /// slot — it is never dropped from the grid (A-11). Web parity
  /// (`review-step.tsx:600-625`): the whole row is the tap target, selection is
  /// a filled checkbox on a brand-tinted bordered card, and its day comes from
  /// the group header above it rather than being repeated per row.
  Widget _windowTile(DeliveryWindowOption option) {
    final past = option.isPast(_nowUtc, _productionTimeDays);
    final selected = !past && _selectedWindows.contains(option.value);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: past
            ? AppPalette.of(context).surfaceMuted
            : selected
                ? AppPalette.of(context).infoFill
                : AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: selected ? AppColors.brandBlue : AppPalette.of(context).border,
            width: selected ? 2 : 1),
      ),
      child: CheckboxListTile(
        key: ValueKey('window-${option.value}'),
        dense: true,
        value: selected,
        onChanged: past
            ? null
            : (v) => setState(() {
                  if (v == true) {
                    _selectedWindows.add(option.value);
                  } else {
                    _selectedWindows.remove(option.value);
                  }
                }),
        controlAffinity: ListTileControlAffinity.leading,
        activeColor: AppColors.brandBlue,
        checkboxShape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        title: Text(option.slotLabel,
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: past ? AppPalette.of(context).textSecondary : AppPalette.of(context).textPrimary)),
        subtitle: Text(past ? 'Time passed' : option.hours,
            style: TextStyle(
                fontSize: 12,
                color:
                    past ? AppPalette.of(context).textMuted : AppPalette.of(context).textSecondary)),
      ),
    );
  }

  /// The delivery-window section, laid out like the desktop one (web
  /// `review-step.tsx:529-660`): the CalendarClock header, the seller's
  /// working-hours notice, the "Preferred time windows / Choose one or more"
  /// label row, the picker itself, "Refresh available times", and the blue
  /// note.
  ///
  /// The header and the note used to live in the fallback branch only, so a
  /// buyer on the live server — where the backend DOES return availability
  /// windows — saw a bare list of times with none of the surrounding copy.
  Widget _windowPicker() {
    final palette = AppPalette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
                color: palette.surfaceMuted,
                borderRadius: BorderRadius.circular(10)),
            child: Icon(Icons.calendar_month_rounded,
                size: 18, color: AppPalette.of(context).accentInk),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('When should we deliver?',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text('Select every time window that works for you.',
                    style:
                        TextStyle(color: palette.textSecondary, fontSize: 12.5)),
              ],
            ),
          ),
        ]),
        const SizedBox(height: 14),
        // A seller's working-hours notice explains the times below it, so it
        // belongs here rather than on the item list further up the page.
        for (final group in _sellerGroups)
          if (_scheduleNoticeFor(group) != null) ...[
            _SellerScheduleNoticeCard(
                notice: _scheduleNoticeFor(group)!,
                sellerName: group.sellerName,
                nowUtc: _nowUtc),
            const SizedBox(height: 10),
          ],
        if (_availabilityError != null) ...[
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: palette.warningFill,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(children: [
              Expanded(
                child: Text(
                    'Seller working hours could not be refreshed. Showing standard delivery windows.',
                    style:
                        TextStyle(fontSize: 12, color: palette.warningText)),
              ),
              TextButton(
                  onPressed: _fetchAvailability, child: const Text('Retry')),
            ]),
          ),
          const SizedBox(height: 10),
        ],
        Row(children: [
          const Expanded(
            child: Text('Preferred time windows',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          ),
          Text('Choose one or more',
              style: TextStyle(fontSize: 11.5, color: palette.textSecondary)),
        ]),
        const SizedBox(height: 8),
        if (_availabilityLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 18),
            child: Row(children: [
              SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2)),
              SizedBox(width: 10),
              Text('Checking seller working hours…'),
            ]),
          )
        else if (_availabilityWindows.isNotEmpty)
          _SellerAvailabilityPicker(
            windows: _availabilityWindows,
            selected: _selectedWindows,
            nowUtc: _nowUtc,
            onChanged: (key, selected) => setState(() {
              selected ? _selectedWindows.add(key) : _selectedWindows.remove(key);
            }),
          )
        else
          _compositeWindowGrid(),
        if (!_availabilityLoading)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: _fetchAvailability,
              style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  visualDensity: VisualDensity.compact),
              child: const Text('Refresh available times'),
            ),
          ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: palette.infoFill,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: palette.infoBorder),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.info_outline_rounded, size: 16, color: palette.infoText),
            const SizedBox(width: 8),
            Expanded(
              // Web `DELIVERY_WINDOW_NOTE`, and its made-to-order variant,
              // verbatim.
              child: Text(
                  _productionTimeDays > 0
                      ? 'Made to order: allow up to $_productionTimeDays calendar '
                          '${_productionTimeDays == 1 ? 'day' : 'days'} for '
                          'preparation. Delivery options begin afterward; choose '
                          'multiple windows to give the seller alternatives.'
                      : 'Delivery follows the available windows shown above '
                          'after payment confirmation. Selecting more than one '
                          'window gives the seller alternatives within their '
                          'working schedule.',
                  style: TextStyle(
                      fontSize: 12, height: 1.4, color: palette.infoText)),
            ),
          ]),
        ),
      ],
    );
  }

  /// The six composite TODAY/TOMORROW × MORNING/AFTERNOON/EVENING options —
  /// the fallback used when the backend returns no seller availability.
  Widget _compositeWindowGrid() {
    // LinkedHashSet over the canonical order → Today before Tomorrow.
    final days = kDeliveryWindowOptions.map((o) => o.day).toSet();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final day in days) ...[
          Expanded(
            child: Column(children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                    kDeliveryWindowOptions
                        .firstWhere((o) => o.day == day)
                        .dayLabelFor(_nowUtc, _productionTimeDays),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w700)),
              ),
              for (final option
                  in kDeliveryWindowOptions.where((o) => o.day == day))
                _windowTile(option),
            ]),
          ),
          if (day != days.last) const SizedBox(width: 8),
        ],
      ],
    );
  }

  /// The backend's working-hours notice for [group], when it has one.
  Map<String, dynamic>? _scheduleNoticeFor(SellerGroup group) {
    for (final notice in _sellerScheduleNotices) {
      if ('${notice['sellerId'] ?? ''}' == (group.sellerId ?? '')) {
        return notice;
      }
    }
    return null;
  }

  Widget _buildReviewStep() {
    final groups = _sellerGroups;
    final deferredCrossRegion =
        _deliverySelected && quoteHasDeferredCrossRegion(_quote);
    return ListView(
        controller: _stepScroll[CheckoutStep.review],
        padding: const EdgeInsets.all(16),
        children: [
      _CheckoutCardHeader(
        icon: Icons.check_circle_outline,
        title: _stayOnly ? 'Review your stay' : 'Review Your Order',
        subtitle: _stayOnly
            ? 'Review your dates and total before generating your payment '
                'invoice. Your booking still requires payment verification and '
                'host confirmation.'
            : 'Confirming this review generates an invoice. Your items will be reserved for 1 hour while you complete payment.',
      ),
      const SizedBox(height: 14),
      _DestinationBlock(
        name: '${_first.text} ${_last.text}'.trim(),
        address: _addressText,
        city: _cityText,
        country: _countryText,
        phone: _phone.text,
        pickup: !_deliverySelected,
        stay: _stayOnly,
        latitude: _lat,
        longitude: _lng,
      ),
      // Web parity `review-step.tsx:276`: the route sits between the
      // destination and the seller groups.
      if (_deliverySelected && _lat != null && _lng != null) ...[
        for (final routeOrigins in [
          [
            for (final g in groups)
              if (_sellerOrigins[g.sellerKey] != null)
                _RouteOrigin(
                    sellerName: g.sellerName,
                    origin: _sellerOrigins[g.sellerKey]!),
          ]
        ])
          if (routeOrigins.isNotEmpty) ...[
            const SizedBox(height: 14),
            _DeliveryRouteCard(
                destination: Coordinates(_lat!, _lng!),
                origins: routeOrigins),
          ],
      ],
      const SizedBox(height: 14),
      for (final g in groups)
        _SellerGroupCard(
          group: g,
          fee: quotedFeeForSeller(_quote,
              sellerKey: g.sellerKey, sellerId: g.sellerId),
          failure: failureForGroup(_quoteFailures, g),
          loading: _quoteLoading,
          locked: _itemsLocked,
          // A group with only rentals/EXEMPT lines is never delivery-quoted —
          // it is booked or handed over ("Arrange with seller", CARTCH-06).
          arrangeWithSeller: !g.items.any(_lineUsesDeliveryLogistics),
          crossRegion: sellerGroupIsCrossRegion(
            _quote,
            sellerKey: g.sellerKey,
            sellerId: g.sellerId,
            crossRegionSellerKeys: _crossRegionSellerKeys,
          ),
        ),
      const SizedBox(height: 14),
      _TotalsCard(
        subtotal: _subtotal,
        delivery: _quotedDeliveryTotal,
        total: _reviewedTotal,
        loading: _quoteLoading,
        quoteMissing: _deliverySelected && _quote == null,
        pickup: !_deliverySelected,
        deferred: deferredCrossRegion,
        stayOnly: _stayOnly,
      ),
      // Cross-region delivery cost is discussed + arranged AFTER checkout and
      // is NOT included in the amount due (web review-step copy, APISUR-02).
      if (deferredCrossRegion) ...[
        const SizedBox(height: 12),
        const _CrossRegionInfoBox(),
      ],
      if (_deliverySelected) ...[
        const SizedBox(height: 18),
        // Only the composite fallback can run out: when the backend has
        // returned real availability windows they are the offer, and they
        // routinely start tomorrow.
        if (_availabilityWindows.isEmpty &&
            !_availabilityLoading &&
            !kDeliveryWindowOptions
                .any((o) => !o.isPast(_nowUtc, _productionTimeDays)))
          const Text(
              'No delivery windows left today or tomorrow — please try '
              'again tomorrow morning.',
              style: TextStyle(color: Colors.red))
        else
          // Web parity (A-11): ALL six composite options stay in the picker — a
          // window whose EAT end-hour has passed renders DISABLED with a
          // "Time passed" caption instead of being filtered out (web
          // review-step.tsx:600-625), keeping slot positions stable.
          _windowPicker(),
      ],
      const SizedBox(height: 12),
      _CheckoutReadinessCard(
        loading: _quoteLoading,
        ready: !_deliverySelected ||
            (_quote != null &&
                _quoteFailures.isEmpty &&
                _availableSelectedWindows.isNotEmpty),
        needsAddress: _deliverySelected && (_lat == null || _lng == null),
        hasWindow: !_deliverySelected || _availableSelectedWindows.isNotEmpty,
        onFixAddress: () => _openAddresses(context),
      ),
      if (_quoteFailures.isNotEmpty && !_quoteLoading) ...[
        const SizedBox(height: 12),
        _QuoteFailureBox(
          explanation: explainQuoteFailures(_quoteFailures),
          onRetry: _fetchQuote,
        ),
      ],
      const SizedBox(height: 14),
      CheckboxListTile(
        key: const ValueKey('terms-checkbox'),
        value: _agree,
        onChanged: (v) => setState(() => _agree = v ?? false),
        // Web parity: the legal names are links to /terms and /privacy
        // (checkout-content.tsx renders them as anchors), not just bold text.
        title: Text.rich(TextSpan(text: 'I agree to the ', children: [
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: GestureDetector(
              onTap: () => _openLegalRoute('/terms'),
              child: Text('Terms & Conditions',
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppPalette.of(context).accentInk)),
            ),
          ),
          const TextSpan(text: ' and '),
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: GestureDetector(
              onTap: () => _openLegalRoute('/privacy'),
              child: Text('Privacy Policy',
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppPalette.of(context).accentInk)),
            ),
          ),
        ])),
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: EdgeInsets.zero,
      ),
      ScrollAnchor(_errorAnchors[CheckoutStep.review]!),
      if (_error != null) ...[
        const SizedBox(height: 8),
        ErrorBox(message: _error!),
      ],
      const SizedBox(height: 14),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppPalette.of(context).background,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppPalette.of(context).border),
        ),
        child: Column(children: [
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              key: const ValueKey('confirm-review'),
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brandBlue,
                  padding: const EdgeInsets.symmetric(vertical: 16)),
              onPressed: _creatingProforma ? null : _confirmReview,
              iconAlignment: IconAlignment.end,
              icon: const Icon(Icons.arrow_forward, size: 18),
              label: _creatingProforma
                  ? SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppPalette.of(context).surface))
                  : const Text('Confirm & Proceed to Payment',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _goTo(CheckoutStep.address),
              icon: const Icon(Icons.arrow_back, size: 18),
              label: const Text('Previous Step'),
            ),
          ),
        ]),
      ),
      const SizedBox(height: 8),
      Text(
          'Confirming generates an invoice and reserves your items for 1 hour '
          'while you complete payment.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 12)),
    ]);
  }

  Widget _buildPaymentStep() {
    final proforma = _proforma ?? const <String, dynamic>{};
    final number =
        (proforma['proformaNumber'] ?? proforma['proformaId'] ?? '').toString();
    final itemsTotal = proforma['itemsTotal'];
    final deliveryTotal = proforma['deliveryTotal'];
    final grandTotal = proforma['grandTotal'];
    return ListView(
        controller: _stepScroll[CheckoutStep.payment],
        padding: const EdgeInsets.all(16),
        children: [
      _CheckoutCardHeader(
        icon: Icons.account_balance_wallet_outlined,
        title: 'Complete Your Payment',
        subtitle: _stayOnly
            ? 'Choose how you pay — a bank transfer needs a screenshot of the '
                'payment, Mobile Money and the Selcom App confirm themselves. '
                'Once payment is verified, your host must confirm the booking '
                'for your dates.'
            : 'Your items are reserved while this invoice is valid. Choose how you pay — a bank transfer needs a screenshot of the payment, Mobile Money and the Selcom App confirm themselves.',
      ),
      const SizedBox(height: 14),
      // Web parity: a made-to-order invoice says so up front, so the buyer is
      // not left wondering why delivery has not started.
      if (_invoiceProductionDays > 0) ...[
        Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppPalette.of(context).infoFill,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppPalette.of(context).infoBorder),
          ),
          child: RichText(
            text: TextSpan(
              style: TextStyle(
                  fontSize: 11.5,
                  color: AppPalette.of(context).infoText,
                  height: 1.35),
              children: [
                TextSpan(
                  text:
                      'Made-to-order production: up to $_invoiceProductionDays '
                      'calendar ${_invoiceProductionDays == 1 ? 'day' : 'days'}. ',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const TextSpan(
                    text:
                        'The seller needs this time to make or prepare the item and '
                        'is expected to complete production within that allocated time. '
                        'Delivery begins after production is complete.'),
              ],
            ),
          ),
        ),
      ],
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: AppPalette.of(context).surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppPalette.of(context).border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Expanded(
                child: Text('Amount due',
                    style: TextStyle(fontWeight: FontWeight.w800))),
            Text(
                Product.formatPrice(
                    grandTotal is num ? grandTotal.toDouble() : _reviewedTotal),
                style:
                    const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
          ]),
          const SizedBox(height: 6),
          Text('Invoice $number',
              style: TextStyle(
                  color: AppPalette.of(context).textSecondary, fontSize: 13)),
          const Divider(height: 18),
          Row(children: [
            const Expanded(child: Text('Subtotal')),
            Text(Product.formatPrice(
                itemsTotal is num ? itemsTotal.toDouble() : _subtotal)),
          ]),
          const SizedBox(height: 4),
          Row(children: [
            const Expanded(child: Text('Delivery fee')),
            Text(Product.formatPrice(deliveryTotal is num
                ? deliveryTotal.toDouble()
                : _quotedDeliveryTotal)),
          ]),
        ]),
      ),
      const SizedBox(height: 14),
      _ProformaCountdown(
          expiresAt: proforma['expiresAt'],
          status: proforma['status'],
          nowUtc: _nowUtc),
      const SizedBox(height: 14),
      const Text('CHOOSE PAYMENT METHOD',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
      const SizedBox(height: 8),
      _PaymentMethodAccordion(
        key: ValueKey('payment-methods-$_paymentVisit'),
        selected: _paymentMethod,
        reference: number,
        onChanged: (method) {
          // Switching away from the wallet releases any pending Selcom order
          // rather than leaving it to expire against the invoice.
          if (isAutomatedPaymentMethod(_paymentMethod) &&
              !isAutomatedPaymentMethod(method)) {
            unawaited(_cancelWalletPayment());
          }
          setState(() => _paymentMethod = method);
        },
        // Mobile Wallet and Selcom Wallet are completed in the app: Selcom
        // sends the request and the order confirms itself, so there is no
        // screenshot to upload and nothing for an admin to verify (web
        // AUTOMATED_METHODS).
        walletBody: (method) => _mobileWalletCard(
            grandTotal is num ? grandTotal.toDouble() : _reviewedTotal,
            channelForMethod(method) ?? SelcomPushChannel.mobileWallet),
        // Only a bank transfer is checked by hand, so its proof sits right
        // under the account it was paid to — not below the other methods.
        manualBody: (_) => _bankTransferProof(),
        onOpenChanged: (id) => setState(() => _openPaymentMethod = id),
      ),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: AppPalette.of(context).successFill,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppPalette.of(context).successBorder)),
        child: Text(
            _stayOnly
                ? 'Payment verification and host confirmation are required '
                    'before check-in. Follow the progress in your booking '
                    'details, or contact support for help.'
                : 'Your payment is protected — money is held by GloboExpats until '
                    'your order is delivered. If an item is unavailable you are '
                    'refunded in full.',
            style: TextStyle(
                color: AppPalette.of(context).successText, fontSize: 13)),
      ),
      // Web parity support line (payment-confirmation-step.tsx:310-328).
      const SizedBox(height: 10),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: EdgeInsets.only(top: 1),
          child: Icon(Icons.phone_outlined,
              size: 14, color: AppPalette.of(context).textSecondary),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text.rich(
            TextSpan(
              style:
                  TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary),
              children: [
                const TextSpan(text: 'Need help? Call '),
                WidgetSpan(
                  alignment: PlaceholderAlignment.baseline,
                  baseline: TextBaseline.alphabetic,
                  child: GestureDetector(
                    onTap: _callSupport,
                    child: Text(_kSupportPhone,
                        style: TextStyle(
                            color: AppPalette.of(context).accentInk,
                            fontWeight: FontWeight.w600,
                            decoration: TextDecoration.underline,
                            fontSize: 12)),
                  ),
                ),
                const TextSpan(text: ' or message us on '),
                WidgetSpan(
                  alignment: PlaceholderAlignment.baseline,
                  baseline: TextBaseline.alphabetic,
                  child: GestureDetector(
                    onTap: _messageSupportWhatsApp,
                    child: Text('WhatsApp',
                        style: TextStyle(
                            color: AppPalette.of(context).accentInk,
                            fontWeight: FontWeight.w600,
                            decoration: TextDecoration.underline,
                            fontSize: 12)),
                  ),
                ),
                const TextSpan(text: '.'),
              ],
            ),
          ),
        ),
      ]),
      if (!_bankProofOpen) ...[
        ScrollAnchor(_errorAnchors[CheckoutStep.payment]!),
        if (_error != null) ...[
          const SizedBox(height: 10),
          ErrorBox(message: _error!),
        ],
      ],
      const SizedBox(height: 16),
      // From step >= 3 "Back" is gone (the proforma locked the order) —
      // "Cancel invoice" is the only way out (AU-032).
      const SizedBox(height: 8),
      TextButton.icon(
        icon: const Icon(Icons.cancel_outlined, size: 18),
        label: const Text('Cancel invoice'),
        onPressed: _submittingPayment ? null : _cancelInvoice,
      ),
    ]);
  }

  /// A bank transfer's steps after the account details, in the order the
  /// buyer does them: attach the screenshot, tick the confirmation, submit.
  /// Mobile Money and the Selcom App confirm themselves and have none of it.
  Widget _bankTransferProof() {
    Widget stepLabel(int n, String text) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(children: [
            Container(
              width: 20,
              height: 20,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                  color: AppColors.brandBlue, shape: BoxShape.circle),
              child: Text('$n',
                  style: TextStyle(
                      color: BrandStage.ink,
                      fontSize: 11,
                      fontWeight: FontWeight.w800)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(text,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w800)),
            ),
          ]),
        );
    return Column(
        key: const ValueKey('bank-transfer-proof'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
      const SizedBox(height: 14),
      stepLabel(2, 'Attach your payment screenshot'),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.brandBlue.withValues(alpha: .05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.brandBlue, width: 2),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [
            Icon(Icons.camera_alt_outlined, size: 18),
            SizedBox(width: 8),
            Text('Upload screenshot',
                style: TextStyle(fontWeight: FontWeight.w700)),
          ]),
          const Divider(height: 24),
          for (var i = 0; i < _receipts.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(children: [
                Icon(Icons.image_outlined,
                    size: 16, color: AppPalette.of(context).textSecondary),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(_receipts[i].name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5)),
                ),
                IconButton(
                  key: ValueKey('remove-receipt-$i'),
                  icon: const Icon(Icons.close, size: 16),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  // Web parity: ANY receipt change (add or remove) drops the
                  // confirmation tick — the proof set differs from what the buyer
                  // confirmed (web checkout-content.tsx resets paymentConfirmed
                  // on every files change, not only when the last file is
                  // removed).
                  onPressed: () => setState(() {
                    _receipts.removeAt(i);
                    _paymentConfirmed = false;
                  }),
                ),
              ]),
            ),
          OutlinedButton.icon(
            key: const ValueKey('add-receipt'),
            icon: const Icon(Icons.attach_file, size: 18),
            label: Text(_receipts.isEmpty
                ? 'Add screenshot'
                : 'Add another screenshot'),
            onPressed: _pickReceipt,
          ),
        ]),
      ),
      const SizedBox(height: 14),
      stepLabel(3, 'Confirm and submit'),
      AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: _paymentConfirmed
              ? AppPalette.of(context).successFill
              : AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color:
                _paymentConfirmed
                    ? AppPalette.of(context).successBorder
                    : AppPalette.of(context).border,
            width: 2,
          ),
        ),
        child: CheckboxListTile(
          key: const ValueKey('payment-confirmed'),
          value: _paymentConfirmed,
          onChanged: !_hasProof
              ? null
              : (v) => setState(() => _paymentConfirmed = v ?? false),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          title:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text(
                'I have completed the payment and attached my proof. I confirm '
                'the information provided is true.',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            const SizedBox(height: 3),
            Text(
              !_hasProof
                  ? 'Upload a payment screenshot first.'
                  : 'Tick to enable "Submit Payment for Verification" below.',
              style:
                  TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary),
            ),
          ]),
        ),
      ),
      ScrollAnchor(_errorAnchors[CheckoutStep.payment]!),
      if (_error != null) ...[
        const SizedBox(height: 10),
        ErrorBox(message: _error!),
      ],
      const SizedBox(height: 12),
      FilledButton(
        key: const ValueKey('submit-payment'),
        style: FilledButton.styleFrom(
            backgroundColor: AppColors.brandBlue,
            padding: const EdgeInsets.symmetric(vertical: 16)),
        onPressed: _submittingPayment ? null : _submitPayment,
        child: _submittingPayment
            ? SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: AppPalette.of(context).surface))
            : const Text('Submit Payment for Verification',
                style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    ]);
  }

  /// The body of an automated method — web
  /// `components/checkout/mobile-wallet-payment.tsx`, one card for both
  /// channels. A visual state machine over the Selcom request: confirm the
  /// number, send it, wait for approval.
  ///
  /// It has no terminal panels any more. The web stopped showing success or
  /// failure inside the card: every final outcome — paid, declined, or a
  /// wait that ran out — moves checkout on to Step 04 and its result screen
  /// ([PaymentResultScreen]), where "Try again" brings the buyer back here.
  Widget _mobileWalletCard(double amount, SelcomPushChannel channel) {
    final palette = AppPalette.of(context);
    final phone = _walletPhone.text.trim();
    final amountLabel = Product.formatPrice(amount);
    final selcomWallet = channel == SelcomPushChannel.selcomPesa;
    // One request is in flight at a time, like the web's single hook; the
    // other channel's card simply reads as not-started.
    final stage = _walletChannel == channel ? _walletStage : 'idle';

    if (stage == 'awaiting') {
      return Column(children: [
        Container(
          key: const ValueKey('wallet-awaiting'),
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: palette.textPrimary.withValues(alpha: .05),
            borderRadius: BorderRadius.circular(12),
            border:
                Border.all(color: palette.textPrimary.withValues(alpha: .25)),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                  color: inkFill(context), shape: BoxShape.circle),
              child: const Icon(Icons.smartphone_rounded,
                  size: 19, color: Colors.white),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Check your phone',
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 3),
                    Text(
                        'A payment request for $amountLabel has been sent to '
                        '${displayWalletPhone(phone)}. '
                        '${selcomWallet ? 'Open the Selcom App and approve the request.' : 'Enter your mobile money PIN to approve it.'}',
                        style: TextStyle(
                            fontSize: 12.5,
                            height: 1.35,
                            color: palette.textSecondary)),
                  ]),
            ),
          ]),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: _cancelWalletPayment,
            child: const Text('Cancel and choose another method'),
          ),
        ),
      ]);
    }

    // idle | sending
    final sending = stage == 'sending';
    final showEditor = _walletPhoneEditing || phone.isEmpty;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // The Selcom Wallet row already carries the Selcom mark, so its card
        // does not repeat an icon (web da7fa59).
        if (!selcomWallet) ...[
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
                color: palette.surfaceMuted,
                borderRadius: BorderRadius.circular(10)),
            child: Icon(Icons.account_balance_wallet_outlined,
                size: 19, color: palette.textSecondary),
          ),
          const SizedBox(width: 10),
        ],
        Expanded(
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                    selcomWallet
                        ? 'Pay via Selcom App'
                        : 'Pay with Mobile Money',
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(
                    selcomWallet
                        ? 'Approve the prompt in the Selcom App.'
                        : 'Approve the prompt on your phone with your PIN.',
                    style: TextStyle(
                        fontSize: 12.5, color: palette.textSecondary)),
              ]),
        ),
      ]),
      // The mobile-money networks are the USSD channel's; Selcom Wallet is
      // its own app.
      if (!selcomWallet) ...[
        const SizedBox(height: 12),
        Row(children: [
          for (final provider in kWalletProviders) ...[
            Expanded(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                decoration: BoxDecoration(
                  color: palette.surface,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: palette.border),
                ),
                child: Column(children: [
                  Text(provider.operator,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(provider.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 10, color: palette.textSecondary)),
                ]),
              ),
            ),
            if (provider != kWalletProviders.last) const SizedBox(width: 6),
          ],
        ]),
      ],
      const SizedBox(height: 14),
      Text(
          selcomWallet
              ? 'SELCOM APP PHONE NUMBER'
              : 'MOBILE MONEY PHONE NUMBER',
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: .4,
              color: palette.textSecondary)),
      const SizedBox(height: 6),
      if (showEditor)
        TextFormField(
          key: const ValueKey('wallet-phone'),
          controller: _walletPhone,
          enabled: !sending,
          keyboardType: TextInputType.phone,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: '07XX XXX XXX',
            border: const OutlineInputBorder(),
            errorText: phone.isNotEmpty && !isValidTzMobile(phone)
                ? 'Enter a valid Tanzanian mobile number, e.g. 0712 345 678.'
                : null,
          ),
        )
      else
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: palette.background,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: palette.border),
          ),
          child: Row(children: [
            Expanded(
              child: Text(displayWalletPhone(phone),
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w700)),
            ),
            TextButton.icon(
              onPressed: sending
                  ? null
                  : () => setState(() => _walletPhoneEditing = true),
              icon: const Icon(Icons.edit_outlined, size: 14),
              label: const Text('Change'),
              style: TextButton.styleFrom(
                  // Selcom's black, never red (light ink in dark mode).
                  foregroundColor: AppPalette.of(context).textPrimary,
                  visualDensity: VisualDensity.compact),
            ),
          ]),
        ),
      const SizedBox(height: 6),
      Text(
          selcomWallet
              ? 'This number must be registered with the Selcom App.'
              : 'Use the number registered for mobile money (M-Pesa, Mixx '
                  'by Yas, Airtel Money or HaloPesa).',
          style: TextStyle(fontSize: 11.5, color: palette.textSecondary)),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
            color: palette.background,
            borderRadius: BorderRadius.circular(10)),
        child: Row(children: [
          Expanded(
              child: Text('Amount to pay',
                  style: TextStyle(color: palette.textSecondary))),
          Text(amountLabel,
              style:
                  const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
        ]),
      ),
      if (_walletError != null && _walletChannel == channel) ...[
        const SizedBox(height: 10),
        ErrorBox(message: _walletError!),
      ],
      const SizedBox(height: 12),
      SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          key: ValueKey(selcomWallet ? 'selcom-wallet-send' : 'wallet-send'),
          style: FilledButton.styleFrom(
              backgroundColor: AppColors.brandBlue,
              padding: const EdgeInsets.symmetric(vertical: 15)),
          onPressed: sending || !isValidTzMobile(phone)
              ? null
              : () => _startWalletPayment(channel),
          icon: sending
              ? SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: palette.surface))
              : const Icon(Icons.smartphone_rounded, size: 18),
          label: Text(
              sending
                  ? 'Sending request…'
                  // Web: one label for both channels.
                  : 'Send payment request',
              style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      ),
    ]);
  }

  // ---- Selcom wallet payment ----------------------------------------------
  // Web parity `hooks/use-selcom-wallet-payment.ts`: one lifecycle for both
  // channels — register the Selcom order, send the request, poll its status.

  /// idle → sending → awaiting. Final outcomes leave the card entirely for
  /// the Step 04 result screen.
  String _walletStage = 'idle';

  /// Which channel the current request went out on.
  SelcomPushChannel? _walletChannel;
  final _walletPhone = TextEditingController();
  bool _walletPhoneEditing = false;
  String? _walletError;

  /// Selcom needs a unique order_id per attempt, so a terminal outcome means
  /// the next try registers a new order.
  bool _selcomOrderCreated = false;

  /// A Selcom request went out at some point in this checkout. Unlike
  /// [_selcomOrderCreated] it is never reset, so a payment approved after
  /// the app stopped waiting is still found.
  bool _selcomAttempted = false;
  Timer? _walletPoll;
  DateTime? _walletPollStartedAt;

  /// The poll delays scheduled so far. The bounded wait is the LARGER of this
  /// and the wall clock: on a device the wall clock always wins (it also
  /// counts each status call's latency), so the web's 45s bound is kept
  /// exactly — and under test, where time moves only as timers fire, the
  /// bound is still reached.
  Duration _walletPollScheduled = Duration.zero;

  /// The final wallet outcome shown at Step 04 (web `selcomResult`), and the
  /// number the request went to.
  PaymentResultKind? _selcomResult;
  String? _selcomResultPhone;

  void _stopWalletPoll() {
    _walletPoll?.cancel();
    _walletPoll = null;
  }

  /// Registers the Selcom order (once per attempt) and sends the request on
  /// [channel] — web `start(phone, channel)`.
  Future<void> _startWalletPayment(SelcomPushChannel channel) async {
    final token = _auth.token;
    final proformaId = '${_proforma?['proformaId'] ?? ''}';
    if (token == null || proformaId.isEmpty) {
      setState(() {
        _walletChannel = channel;
        _walletError = 'You need to be logged in.';
      });
      return;
    }
    final phone = _walletPhone.text.trim();
    if (!isValidTzMobile(phone)) {
      setState(() {
        _walletChannel = channel;
        _walletError =
            'Enter a valid Tanzanian mobile number, e.g. 0712 345 678.';
      });
      return;
    }
    _stopWalletPoll();
    setState(() {
      _walletChannel = channel;
      _walletStage = 'sending';
      _walletError = null;
    });
    try {
      if (!_selcomOrderCreated) {
        await _api.createSelcomOrder(token, proformaId);
        _selcomOrderCreated = true;
        _selcomAttempted = true;
      }
      if (channel == SelcomPushChannel.selcomPesa) {
        await _api.pushSelcomPesa(token, proformaId, msisdn: phone);
      } else {
        await _api.pushSelcomWallet(token, proformaId, msisdn: phone);
      }
      if (!mounted) return;
      setState(() => _walletStage = 'awaiting');
      _walletPollStartedAt = DateTime.now();
      _walletPollScheduled = selcomFirstPoll;
      _walletPoll = Timer(selcomFirstPoll, _pollWallet);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _walletStage = 'idle';
        _walletError = '$e'.replaceFirst(RegExp(r'^ApiException:\s*'), '');
      });
    }
  }

  /// One status check. A transient error is not the end of the wait — the
  /// next tick tries again until the bounded timeout.
  Future<void> _pollWallet() async {
    final token = _auth.token;
    final proformaId = '${_proforma?['proformaId'] ?? ''}';
    if (token == null || proformaId.isEmpty) return;
    SelcomOutcome? outcome;
    try {
      final status = await _api.getSelcomPaymentStatus(token, proformaId);
      outcome = outcomeFromState(status['paymentStatus']);
    } catch (_) {
      // Keep waiting.
    }
    if (!mounted) return;
    if (outcome != null) {
      _stopWalletPoll();
      await _settleWalletOutcome(outcome);
      return;
    }
    final startedAt = _walletPollStartedAt;
    final wallClock = startedAt == null
        ? Duration.zero
        : DateTime.now().difference(startedAt);
    final waited =
        wallClock > _walletPollScheduled ? wallClock : _walletPollScheduled;
    if (startedAt != null && waited >= selcomPollTimeout) {
      _stopWalletPoll();
      // A wallet pull can sit at PENDING forever; show the neutral failure
      // rather than guessing (web resultPageForOutcome).
      await _settleWalletOutcome(SelcomOutcome.timeout);
      return;
    }
    _walletPollScheduled += selcomPollInterval;
    _walletPoll = Timer(selcomPollInterval, _pollWallet);
  }

  /// Whether Selcom reports this invoice's latest order as paid. Any error
  /// (no Selcom order, network) means "not known to be paid".
  Future<bool> _selcomPaid(String proformaId) async {
    final token = _auth.token;
    if (token == null || proformaId.isEmpty) return false;
    try {
      final status = await _api.getSelcomPaymentStatus(token, proformaId);
      return outcomeFromState(status['paymentStatus']) == SelcomOutcome.success;
    } catch (_) {
      return false;
    }
  }

  /// One direct check with Selcom; if the money is in, finish on the
  /// success result. Used when the buyer comes back from the Selcom App,
  /// when the invoice turns paid, and before a "Try again".
  Future<bool> _settleIfSelcomPaid() async {
    final proformaId = '${_proforma?['proformaId'] ?? ''}';
    if (_selcomResult == PaymentResultKind.success) return true;
    if (!await _selcomPaid(proformaId) || !mounted) return false;
    _stopWalletPoll();
    await _settleWalletOutcome(SelcomOutcome.success);
    return true;
  }

  /// Coming back to the app — typically from the Selcom App or the USSD
  /// prompt, where the buyer approved the payment. Check at once instead of
  /// waiting for the next tick (a backgrounded app may not have ticked at
  /// all), and re-check a result that gave up before the approval landed.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || !mounted) return;
    if (_walletStage == 'awaiting') {
      _stopWalletPoll();
      _pollWallet();
      return;
    }
    final gaveUp = _step == CheckoutStep.completion &&
        (_selcomResult == PaymentResultKind.failed ||
            _selcomResult == PaymentResultKind.declined);
    final stillPaying = _step == CheckoutStep.payment && _selcomAttempted;
    if (gaveUp || stillPaying) _settleIfSelcomPaid();
  }

  /// Web `handleSelcomOutcome`: every final outcome moves checkout on to
  /// Step 04. A success first re-reads the invoice so the record is the
  /// server's, drops the cart snapshot and refreshes the pending-work strip.
  Future<void> _settleWalletOutcome(SelcomOutcome outcome) async {
    final kind = resultKindFor(outcome);
    if (kind == null) return;
    final phone = _walletPhone.text.trim();
    Map<String, dynamic>? latest = _proforma;

    if (kind == PaymentResultKind.success) {
      final token = _auth.token;
      final proformaId = '${_proforma?['proformaId'] ?? ''}';
      if (token != null && proformaId.isNotEmpty) {
        // Selcom's webhook is what creates the orders, and it can land a
        // moment after the status poll reports COMPLETED; one retry covers
        // the gap so the refreshed invoice carries its order ids.
        for (var attempt = 0; attempt < 2; attempt++) {
          try {
            latest = await _api.getProforma(token, proformaId);
          } catch (_) {
            // The gateway result is authoritative; refreshed order details
            // are optional here.
          }
          if (latest != null && firstProformaOrderId(latest) != null) break;
          if (attempt == 0) {
            await Future<void>.delayed(const Duration(seconds: 2));
            if (!mounted) return;
          }
        }
      }
      KvStore.instance.remove(KvStore.kProformaCartSnapshot);
      requestPendingActionsRefresh();
    } else {
      // Terminal on Selcom's side: the next attempt is a new order.
      _selcomOrderCreated = false;
    }
    if (!mounted) return;
    setState(() {
      if (latest != null) _proforma = latest;
      _placedOrderId =
          latest == null ? null : firstProformaOrderId(latest);
      _selcomResult = kind;
      _selcomResultPhone = phone.isEmpty ? null : phone;
      _walletStage = 'idle';
      _error = null;
    });
    _goTo(CheckoutStep.completion);
  }

  /// Web `handleRetrySelcomPayment`: back to Step 03 with a fresh card, as
  /// the web gets by remounting its payment step.
  Future<void> _retrySelcomPayment() async {
    // The approval can land after the wait gave up: never ask the buyer to
    // pay twice for money Selcom already has.
    if (await _settleIfSelcomPaid() || !mounted) return;
    _stopWalletPoll();
    setState(() {
      _selcomResult = null;
      _selcomResultPhone = null;
      _placedOrderId = null;
      _error = null;
      _walletStage = 'idle';
      _walletError = null;
      _selcomOrderCreated = false;
    });
    _goTo(CheckoutStep.payment);
  }

  /// Web: `${proforma.currency} ${Intl.NumberFormat('en-TZ').format(
  /// Math.round(proforma.grandTotal))}` — e.g. "TZS 46,000".
  String? _resultAmountLabel() {
    final total = _proforma?['grandTotal'];
    if (total is! num) return null;
    final currency = '${_proforma?['currency'] ?? 'TZS'}'.trim();
    final digits = total.round().toString().replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
    return '${currency.isEmpty ? 'TZS' : currency} $digits';
  }

  /// Buyer backed out: stop waiting and release the Selcom order.
  Future<void> _cancelWalletPayment() async {
    _stopWalletPoll();
    final token = _auth.token;
    final proformaId = '${_proforma?['proformaId'] ?? ''}';
    setState(() {
      _walletStage = 'idle';
      _walletError = null;
    });
    if (token == null || proformaId.isEmpty || !_selcomOrderCreated) return;
    try {
      await _api.cancelSelcomOrder(token, proformaId);
    } catch (_) {
      // Best effort — an un-cancelled Selcom order expires on its own.
    } finally {
      _selcomOrderCreated = false;
    }
  }

  Future<void> _pickReceipt() async {
    // The API guardrails web mirrors: at most 5 receipts, 5 MB each. Without
    // these the upload only fails server-side, after the buyer thinks they
    // have attached their proof.
    if (_receipts.length >= _kMaxReceipts) {
      setState(() => _error = 'You can upload up to $_kMaxReceipts receipts.');
      return;
    }
    try {
      // Test seam: ImagePicker has no platform handler under `flutter test`
      // (pick resolves to null). Widget tests inject a fake XFile here.
      final pick = widget.pickReceiptFile;
      final XFile? picked = pick != null
          ? await pick()
          : await ImagePicker().pickImage(
              source: ImageSource.gallery,
              maxWidth: 1600,
              imageQuality: 80,
            );
      if (picked == null) return; // user cancelled — no fake proof
      final bytes = await picked.readAsBytes();
      if (!mounted) return;
      if (bytes.lengthInBytes > _kMaxReceiptBytes) {
        setState(() => _error = '${picked.name} exceeds the 5MB limit.');
        return;
      }
      setState(() {
        _receipts.add((bytes: bytes, name: picked.name));
        _error = null;
        _paymentConfirmed = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Could not pick a receipt file: $e');
    }
  }
}

/// Itemized order summary on the shipping step.
/// A checkout section in the web's card shape: a tinted header strip naming
/// the step with one line of guidance under it, then the body (web
/// `CardHeader` / `CardContent`, `app/checkout/checkout-content.tsx`).
class _CheckoutCard extends StatelessWidget {
  const _CheckoutCard({
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Container(
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: palette.background,
            border: Border(bottom: BorderSide(color: palette.border)),
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(12)),
          ),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 3),
            Text(subtitle,
                style: TextStyle(fontSize: 12, color: palette.textSecondary)),
          ]),
        ),
        Padding(padding: const EdgeInsets.all(14), child: child),
      ]),
    );
  }
}

class _OrderSummary extends StatelessWidget {
  final List<CartItem> lines;
  final CartStore cart;

  /// True when quantities can no longer be changed (step >= 3).
  final bool locked;
  const _OrderSummary({
    required this.lines,
    required this.cart,
    this.locked = false,
    this.stayOnly = false,
  });

  /// Web: "Your stay", and no quantities to review.
  final bool stayOnly;

  @override
  Widget build(BuildContext context) {
    final subtotal = lines.fold(0.0, (s, i) => s + i.subtotal);
    if (lines.isEmpty) return const SizedBox.shrink();
    return Container(
      decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppPalette.of(context).border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AppPalette.of(context).background),
            child: Row(children: [
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(
                        '${stayOnly ? 'Your stay' : 'Your Orders'} (${lines.length})',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w800)),
                    if (!stayOnly) ...[
                    const SizedBox(height: 3),
                    Text(
                        locked
                            ? 'Quantities are fixed once the invoice is issued.'
                            : 'Review quantities before delivery.',
                        style: TextStyle(
                            fontSize: 12,
                            color: AppPalette.of(context).textSecondary)),
                    ],
                  ])),
              if (locked)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                      color: AppPalette.of(context).infoFill,
                      borderRadius: BorderRadius.circular(999)),
                  child: Text('Locked',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppPalette.of(context).infoText)),
                ),
            ])),
        for (final i in lines)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                border: Border(top: BorderSide(color: AppPalette.of(context).surfaceMuted))),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(9),
                child: SizedBox(
                  width: 56,
                  height: 56,
                  child: i.imageUrl == null
                      ? Container(
                          color: AppPalette.of(context).surfaceMuted,
                          child: Icon(Icons.image_outlined,
                              color: AppPalette.of(context).textSecondary))
                      : AppImage(AppConfig.resolveAssetUrl(i.imageUrl!),
                          fit: BoxFit.cover),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                  child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(i.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 13.5, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(Product.formatPrice(i.subtotal),
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w800)),
                  if (i.rentalBooking != null) ...[
                    const SizedBox(height: 7),
                    _RentalBookingTile(booking: i.rentalBooking!),
                    if (!locked)
                      Align(
                        alignment: Alignment.centerRight,
                        child: IconButton(
                          tooltip: 'Remove ${i.title}',
                          onPressed: () => cart.remove(i.lineId),
                          visualDensity: VisualDensity.compact,
                          icon: Icon(Icons.delete_outline,
                              size: 18,
                              color: AppPalette.of(context).textSecondary),
                        ),
                      ),
                  ] else if (!locked) ...[
                    const SizedBox(height: 7),
                    Row(children: [
                      _QuantityButton(
                        icon: Icons.remove,
                        enabled: i.quantity > 1,
                        onPressed: () =>
                            cart.updateQuantityCapped(i.lineId, i.quantity - 1),
                      ),
                      SizedBox(
                        width: 30,
                        child: Text('${i.quantity}',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                fontSize: 12, fontWeight: FontWeight.w700)),
                      ),
                      _QuantityButton(
                        icon: Icons.add,
                        enabled: i.quantity < i.effectiveMax,
                        onPressed: () =>
                            cart.updateQuantityCapped(i.lineId, i.quantity + 1),
                      ),
                      const Spacer(),
                      IconButton(
                        tooltip: 'Remove ${i.title}',
                        onPressed: () => cart.remove(i.lineId),
                        visualDensity: VisualDensity.compact,
                        icon: Icon(Icons.delete_outline,
                            size: 18,
                            color: AppPalette.of(context).textSecondary),
                      ),
                    ]),
                  ] else
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('Quantity: ${i.quantity}',
                          style: TextStyle(
                              fontSize: 12, color: AppPalette.of(context).textSecondary)),
                    ),
                ],
              )),
            ]),
          ),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AppPalette.of(context).background),
          child: Column(children: [
            Row(children: [
              Expanded(
                  child: Text('Subtotal',
                      style: TextStyle(color: AppPalette.of(context).textSecondary))),
              Text(Product.formatPrice(subtotal),
                  style: const TextStyle(fontWeight: FontWeight.w800)),
            ]),
            if (!locked) ...[
              const SizedBox(height: 6),
              Row(children: [
                Expanded(
                    child: Text('Delivery',
                        style: TextStyle(color: AppPalette.of(context).textSecondary))),
                Text('Calculated at checkout',
                    style: TextStyle(
                        fontSize: 12, color: AppPalette.of(context).textSecondary)),
              ]),
            ],
          ]),
        ),
      ]),
    );
  }
}

class _QuantityButton extends StatelessWidget {
  const _QuantityButton({
    required this.icon,
    required this.enabled,
    required this.onPressed,
  });
  final IconData icon;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 28,
        height: 28,
        child: IconButton.outlined(
          padding: EdgeInsets.zero,
          onPressed: enabled ? onPressed : null,
          icon: Icon(icon, size: 14),
        ),
      );
}

class _CheckoutCardHeader extends StatelessWidget {
  const _CheckoutCardHeader({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppPalette.of(context).background,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppPalette.of(context).border),
        ),
        child: Row(children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppPalette.of(context).surfaceMuted,
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(icon,
                size: 20, color: AppPalette.of(context).accentInk),
          ),
          const SizedBox(width: 11),
          Expanded(
              child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: const TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(subtitle,
                  style: TextStyle(
                      fontSize: 12.5, color: AppPalette.of(context).textSecondary)),
            ],
          )),
        ]),
      );
}

class _CheckoutReadinessCard extends StatelessWidget {
  const _CheckoutReadinessCard({
    required this.loading,
    required this.ready,
    required this.needsAddress,
    required this.hasWindow,
    required this.onFixAddress,
  });

  final bool loading;
  final bool ready;
  final bool needsAddress;
  final bool hasWindow;
  final VoidCallback onFixAddress;

  @override
  Widget build(BuildContext context) {
    final color = loading
        ? AppColors.brandBlue
        : ready
            ? AppPalette.of(context).successText
            : AppPalette.of(context).warningText;
    final background = loading
        ? AppPalette.of(context).infoFill
        : ready
            ? AppPalette.of(context).successFill
            : AppPalette.of(context).warningFill;
    final title = loading
        ? 'Checking delivery requirements…'
        : ready
            ? 'Ready for Review'
            : 'A few details still need attention';

    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: .3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (loading)
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: color),
            )
          else
            Icon(
              ready ? Icons.check_circle_rounded : Icons.info_outline_rounded,
              color: color,
              size: 20,
            ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(title,
                style: TextStyle(
                    color: color, fontSize: 13.5, fontWeight: FontWeight.w800)),
          ),
        ]),
        if (!loading && !ready) ...[
          const SizedBox(height: 8),
          if (needsAddress)
            TextButton.icon(
              onPressed: onFixAddress,
              icon: const Icon(Icons.edit_location_alt_outlined, size: 17),
              label: const Text('Add or fix delivery address'),
            ),
          if (!hasWindow)
            const Padding(
              padding: EdgeInsets.only(top: 3),
              child: Text('• Select at least one available delivery window.',
                  style: TextStyle(fontSize: 12.5)),
            ),
        ],
      ]),
    );
  }
}

/// Inline business-error block (BUYER_FLOW_SPEC §5.4 tokens → friendly copy,
/// never a stack trace). Distinct from [ApiErrorView], which is a full-screen
/// FutureBuilder error surface.
class ErrorBox extends StatelessWidget {
  final String message;
  const ErrorBox({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final text = friendlyErrorMessage(message);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: AppPalette.of(context).dangerFill,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppPalette.of(context).dangerBorder)),
      child: Text(text,
          style: TextStyle(
              color: AppPalette.of(context).dangerText, fontSize: 13)),
    );
  }
}

/// Step header — "Step N of 4" with the four labels (web stepper parity).
class _StepIndicator extends StatelessWidget {
  final int current;
  final bool stayOnly;
  const _StepIndicator({required this.current, this.stayOnly = false});

  List<String> get _labels => [
        stayOnly ? 'Guest details' : 'Shipping',
        'Review',
        'Payment',
        'Completion',
      ];

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      padding: const EdgeInsets.fromLTRB(10, 14, 10, 12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (var i = 0; i < 4; i++) ...[
          Expanded(
              child: Column(children: [
            Row(children: [
              if (i > 0)
                Expanded(
                    child: Container(
                  height: 2,
                  color: i <= current ? AppColors.brandBlue : AppPalette.of(context).border,
                )),
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i <= current ? AppColors.brandBlue : AppPalette.of(context).border,
                ),
                alignment: Alignment.center,
                child: Text('${i + 1}',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: i <= current
                            ? Colors.white
                            : AppPalette.of(context).textSecondary)),
              ),
              if (i < 3)
                Expanded(
                    child: Container(
                  height: 2,
                  color: i < current ? AppColors.brandBlue : AppPalette.of(context).border,
                )),
            ]),
            const SizedBox(height: 7),
            Text(_labels[i],
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: i <= current
                        ? AppPalette.of(context).accentInk
                        : AppPalette.of(context).textSecondary)),
          ])),
        ],
      ]),
    );
  }
}

/// Review-step destination block (web review-step.tsx "Delivery Destination").
class _DestinationBlock extends StatelessWidget {
  final String name;
  final String address;
  final String city;
  final String country;
  final String phone;
  final bool pickup;

  /// A stay: "Guest contact", and no address (web review-step).
  final bool stay;
  final double? latitude;
  final double? longitude;
  const _DestinationBlock({
    required this.name,
    required this.address,
    required this.city,
    required this.country,
    required this.phone,
    required this.pickup,
    this.stay = false,
    required this.latitude,
    required this.longitude,
  });

  @override
  Widget build(BuildContext context) {
    final hasMap = !pickup && latitude != null && longitude != null;
    final showMap = hasMap &&
        !WidgetsBinding.instance.runtimeType.toString().contains('Test');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: AppPalette.of(context).infoFill,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppPalette.of(context).infoBorder)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Web `LocationPinGlyph` — the 📍 emoji on a white square, not a
        // Material outline icon (review-step.tsx:253).
        Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: AppPalette.of(context).surface,
              borderRadius: BorderRadius.circular(9)),
          child: Text(pickup ? '🏪' : '📍',
              style: const TextStyle(fontSize: 16)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
                stay
                    ? 'Guest contact'
                    : pickup
                        ? 'Buyer Contact'
                        : 'Delivery Destination',
                style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            if (address.isNotEmpty && !stay)
              Text(address, style: const TextStyle(fontSize: 13)),
            if (!pickup)
              Text('$city, $country', style: const TextStyle(fontSize: 13)),
            if (phone.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Buyer phone: $phone',
                    style: const TextStyle(fontSize: 12)),
              ),
          ]),
        ),
        if (showMap) ...[
          const SizedBox(width: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 82,
              height: 68,
              child: _DeliveryMapPreview(
                latitude: latitude!,
                longitude: longitude!,
              ),
            ),
          ),
        ],
      ]),
    );
  }
}

class _DeliveryMapPreview extends StatelessWidget {
  const _DeliveryMapPreview({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;

  @override
  Widget build(BuildContext context) {
    // Platform views are unavailable in widget tests. Keep an equal-size map
    // representation there so layout tests still exercise the checkout flow.
    if (WidgetsBinding.instance.runtimeType
        .toString()
        .contains('TestWidgetsFlutterBinding')) {
      return ColoredBox(
        color: AppPalette.of(context).successFill,
        child: Center(
          child: Icon(Icons.location_pin,
              color: AppPalette.of(context).accentInk, size: 30),
        ),
      );
    }
    return IgnorePointer(
      child: GoogleMap(
        initialCameraPosition:
            CameraPosition(target: LatLng(latitude, longitude), zoom: 15),
        markers: {
          Marker(
              markerId: const MarkerId('delivery-destination'),
              position: LatLng(latitude, longitude)),
        },
        liteModeEnabled: true,
        zoomControlsEnabled: false,
        mapToolbarEnabled: false,
        myLocationButtonEnabled: false,
        compassEnabled: false,
      ),
    );
  }
}

/// One seller pickup pin on the review map.
class _RouteOrigin {
  const _RouteOrigin({required this.sellerName, required this.origin});
  final String sellerName;
  final Coordinates origin;
}

/// The checkout "Delivery route" card — web parity
/// `components/checkout/delivery-route-map.tsx`, which mobile was missing
/// entirely: the review step only carried a thumbnail of the destination, so
/// the buyer could not see the journey they are paying a delivery fee for.
///
/// Each seller is an `S` pin in its own colour, the buyer is the black `B`
/// pin, and the driving route between them is drawn when the Directions
/// service can trace one. When it cannot — no key, no road route, an offline
/// phone — the card still frames both pins and says so in its title, exactly
/// as the web's marker-only fallback does.
class _DeliveryRouteCard extends StatefulWidget {
  const _DeliveryRouteCard({
    required this.destination,
    required this.origins,
  });

  final Coordinates destination;
  final List<_RouteOrigin> origins;

  @override
  State<_DeliveryRouteCard> createState() => _DeliveryRouteCardState();
}

class _DeliveryRouteCardState extends State<_DeliveryRouteCard> {
  /// Web `ROUTE_COLORS`, in order.
  static const _routeColors = [
    Color(0xFF1E3A8A),
    Color(0xFF059669),
    Color(0xFF7C3AED),
    Color(0xFFEA580C),
    Color(0xFFBE123C),
    Color(0xFF0891B2),
  ];

  final Map<String, List<Coordinates>> _routes = {};
  GoogleMapController? _controller;

  @override
  void initState() {
    super.initState();
    _loadRoutes();
  }

  @override
  void didUpdateWidget(covariant _DeliveryRouteCard old) {
    super.didUpdateWidget(old);
    final moved = old.destination.latitude != widget.destination.latitude ||
        old.destination.longitude != widget.destination.longitude ||
        old.origins.length != widget.origins.length;
    if (moved) _loadRoutes();
  }

  Future<void> _loadRoutes() async {
    for (final origin in widget.origins) {
      final points =
          await DirectionsService.route(origin.origin, widget.destination);
      if (!mounted || points == null) continue;
      setState(() => _routes[origin.sellerName] = points);
      _fitCamera();
    }
  }

  /// Every pin plus every traced point, so the whole journey is in frame.
  List<Coordinates> get _framed => [
        widget.destination,
        for (final o in widget.origins) o.origin,
        for (final points in _routes.values) ...points,
      ];

  void _fitCamera() {
    final controller = _controller;
    final bounds = boundsOf(_framed);
    if (controller == null || bounds == null) return;
    controller.animateCamera(CameraUpdate.newLatLngBounds(
      LatLngBounds(
        southwest:
            LatLng(bounds.southWest.latitude, bounds.southWest.longitude),
        northeast:
            LatLng(bounds.northEast.latitude, bounds.northEast.longitude),
      ),
      40,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final traced = _routes.isNotEmpty;
    return Container(
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(
            color: palette.background,
            border: Border(bottom: BorderSide(color: palette.border)),
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(12)),
          ),
          child: Row(children: [
            Icon(Icons.place_outlined,
                size: 16, color: AppPalette.of(context).accentInk),
            const SizedBox(width: 8),
            Text(
                traced
                    ? (widget.origins.length > 1
                        ? 'Delivery routes'
                        : 'Delivery route')
                    : 'Delivery locations',
                style:
                    const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
          ]),
        ),
        SizedBox(height: 220, child: _map()),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
          child: Wrap(spacing: 14, runSpacing: 6, children: [
            for (var i = 0; i < widget.origins.length; i++)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                      color: _routeColors[i % _routeColors.length],
                      shape: BoxShape.circle),
                ),
                const SizedBox(width: 6),
                Text(widget.origins[i].sellerName,
                    style: TextStyle(
                        fontSize: 11.5, color: palette.textSecondary)),
              ]),
            Text('S = seller pickup · B = your delivery point',
                style: TextStyle(fontSize: 11.5, color: palette.textMuted)),
          ]),
        ),
      ]),
    );
  }

  Widget _map() {
    // Platform views do not exist in widget tests; the rest of the card is
    // still asserted around this placeholder.
    if (WidgetsBinding.instance.runtimeType
        .toString()
        .contains('TestWidgetsFlutterBinding')) {
      return ColoredBox(
        color: AppPalette.of(context).surfaceMuted,
        child: Center(
          child: Icon(Icons.map_outlined,
              color: AppPalette.of(context).accentInk, size: 30),
        ),
      );
    }
    return GoogleMap(
      initialCameraPosition: CameraPosition(
          target: LatLng(
              widget.destination.latitude, widget.destination.longitude),
          zoom: 12),
      markers: {
        for (var i = 0; i < widget.origins.length; i++)
          Marker(
            markerId: MarkerId('seller-$i'),
            position: LatLng(widget.origins[i].origin.latitude,
                widget.origins[i].origin.longitude),
            infoWindow:
                InfoWindow(title: 'Seller: ${widget.origins[i].sellerName}'),
          ),
        Marker(
          markerId: const MarkerId('buyer'),
          position: LatLng(
              widget.destination.latitude, widget.destination.longitude),
          infoWindow: const InfoWindow(title: 'Buyer: delivery destination'),
        ),
      },
      polylines: {
        for (var i = 0; i < widget.origins.length; i++)
          if (_routes[widget.origins[i].sellerName] != null)
            Polyline(
              polylineId: PolylineId('route-$i'),
              color: _routeColors[i % _routeColors.length],
              width: 5,
              points: [
                for (final p in _routes[widget.origins[i].sellerName]!)
                  LatLng(p.latitude, p.longitude),
              ],
            ),
      },
      onMapCreated: (controller) {
        _controller = controller;
        _fitCamera();
      },
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      myLocationButtonEnabled: false,
      compassEnabled: false,
    );
  }
}

/// The server's real seller-availability windows, laid out the way the
/// desktop lays them out — web `components/checkout/availability-window-picker.tsx`:
/// two day columns, a centred day header, and one card per slot showing the
/// slot name over its hours.
///
/// Mobile used to print these as a flat list of rows ("19 Sep Morning
/// (10:00–12:00) / Seller working hours · EAT"), so the live app and the
/// desktop disagreed on the one screen where the buyer commits to a time.
class _SellerAvailabilityPicker extends StatelessWidget {
  const _SellerAvailabilityPicker({
    required this.windows,
    required this.selected,
    required this.nowUtc,
    required this.onChanged,
  });

  final List<Map<String, dynamic>> windows;
  final Set<String> selected;
  final DateTime nowUtc;
  final void Function(String key, bool selected) onChanged;

  /// Parsed rows in server order, deduplicated on (date, slot) exactly as the
  /// web does before grouping.
  List<({String key, DeliveryWindow window})> get _entries {
    final entries = <({String key, DeliveryWindow window})>[];
    for (final raw in windows) {
      final parsed = parseSellerAvailabilityWindows([raw]);
      if (parsed.isEmpty) continue;
      final window = parsed.first;
      final key = '${raw['key'] ?? ''}';
      if (key.isEmpty) continue;
      final duplicate = entries.any((e) =>
          e.window.dateYmd == window.dateYmd && e.window.slot == window.slot);
      if (!duplicate) entries.add((key: key, window: window));
    }
    return entries;
  }

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<({String key, DeliveryWindow window})>>{};
    for (final entry in _entries) {
      groups.putIfAbsent(entry.window.dateYmd, () => []).add(entry);
    }
    if (groups.isEmpty) return const SizedBox.shrink();

    final days = groups.values.toList();
    final rows = <List<List<({String key, DeliveryWindow window})>>>[];
    for (var i = 0; i < days.length; i += 2) {
      rows.add(days.sublist(i, i + 2 > days.length ? days.length : i + 2));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      for (final row in rows)
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: _dayColumn(context, row.first)),
            const SizedBox(width: 8),
            // The second cell stays reserved on an odd last row so a lone day
            // keeps the column width of the days above it.
            Expanded(
                child: row.length > 1
                    ? _dayColumn(context, row[1])
                    : const SizedBox.shrink()),
          ]),
        ),
      const SizedBox(height: 2),
      Text(
          'Adjusted for seller working hours, closures and production time. '
          'Times shown in East Africa Time.',
          style: TextStyle(
              fontSize: 11.5,
              height: 1.4,
              color: AppPalette.of(context).textSecondary)),
    ]);
  }

  Widget _dayColumn(
      BuildContext context, List<({String key, DeliveryWindow window})> day) {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(availabilityDayLabel(day.first.window, nowUtc),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
      ),
      for (final entry in day) _slotTile(context, entry),
    ]);
  }

  Widget _slotTile(
      BuildContext context, ({String key, DeliveryWindow window}) entry) {
    final palette = AppPalette.of(context);
    final expired = !entry.window.endUtc.isAfter(nowUtc);
    final isSelected = !expired && selected.contains(entry.key);
    return Opacity(
      opacity: expired ? .5 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: isSelected ? palette.infoFill : palette.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: isSelected ? AppColors.brandBlue : palette.border,
              width: isSelected ? 2 : 1),
        ),
        child: InkWell(
          key: ValueKey('availability-${entry.key}'),
          borderRadius: BorderRadius.circular(12),
          onTap: expired ? null : () => onChanged(entry.key, !isSelected),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 10, 8, 10),
            child: Row(children: [
              SizedBox(
                width: 22,
                height: 22,
                child: Checkbox(
                  value: isSelected,
                  onChanged:
                      expired ? null : (v) => onChanged(entry.key, v == true),
                  activeColor: AppColors.brandBlue,
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(4)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(entry.window.slot.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700)),
                      Text(
                          expired
                              ? 'Time passed'
                              : availabilityTimeLabel(entry.window),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 11,
                              height: 1.35,
                              color: palette.textSecondary)),
                    ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// One seller's slice of the review: items + the consolidated delivery fee
/// (or its failure label) — charged once per group, never per item. The fee
/// row mirrors web review-step: label 'Delivery fee' vs 'Booking access' /
/// 'Handoff', value green 'Arrange with seller' for handoff groups, amber
/// 'Arranged after checkout' for cross-region ones.
class _SellerGroupCard extends StatelessWidget {
  final SellerGroup group;

  /// Server-quoted consolidated fee for this group; null when unquoted.
  final double? fee;
  final SellerQuoteFailure? failure;
  final bool loading;

  /// True from step >= 3 — quantities can no longer be edited.
  final bool locked;

  /// Every line in the group is a rental/EXEMPT handoff (no delivery quote —
  /// show the green "Arrange with seller" row).
  final bool arrangeWithSeller;

  /// The group's delivery is cross-region and deferred ("Arranged after
  /// checkout", fee excluded from the amount due).
  final bool crossRegion;
  const _SellerGroupCard({
    required this.group,
    required this.fee,
    required this.failure,
    required this.loading,
    required this.locked,
    required this.arrangeWithSeller,
    required this.crossRegion,
  });

  @override
  Widget build(BuildContext context) {
    final groupIsRental = group.items.every((i) => i.rentalBooking != null);
    // Web review-step: a group of stays checks in with its host.
    final groupIsStay = group.items.isNotEmpty &&
        group.items.every((i) => i.rentalBooking?.isShortStay ?? false);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppPalette.of(context).border)),
      child: Column(children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration:
              BoxDecoration(color: AppPalette.of(context).surface),
          child: Row(children: [
            Expanded(
                child: Row(children: [
              Flexible(
                  child: Text(group.sellerName,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800))),
              if (group.isVerified) ...[
                const SizedBox(width: 5),
                Icon(Icons.verified_rounded,
                    size: 16, color: AppPalette.of(context).accentInk),
              ],
            ])),
            // The seller's pickup place and address are deliberately NOT
            // printed here: before payment the buyer only needs to know who
            // they are buying from and how many lines are in the group.
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(
                  '${group.items.length} item${group.items.length == 1 ? '' : 's'}',
                  style: TextStyle(
                      fontSize: 12, color: AppPalette.of(context).textSecondary)),
            ]),
          ]),
        ),
        for (final item in group.items)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(
                  width: 52,
                  height: 52,
                  child: item.imageUrl == null
                      ? Container(
                          color: AppPalette.of(context).surfaceMuted,
                          child: Icon(Icons.image_outlined,
                              color: AppPalette.of(context).textSecondary))
                      : AppImage(AppConfig.resolveAssetUrl(item.imageUrl!),
                          fit: BoxFit.cover),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w600)),
                      for (final c in item.selectedChoices)
                        Text('· ${c.valueId}',
                            style: TextStyle(
                                fontSize: 11, color: AppPalette.of(context).textSecondary)),
                      // Web orderItemUnitLabel: rental lines are priced per
                      // Unit, everything else shows Quantity.
                      Text(
                          '${item.rentalBooking != null ? 'Unit' : 'Qty'}: '
                          '${item.quantity}',
                          style: TextStyle(
                              fontSize: 12, color: AppPalette.of(context).textSecondary)),
                      if (item.rentalBooking != null) ...[
                        const SizedBox(height: 4),
                        _RentalBookingTile(booking: item.rentalBooking!),
                      ],
                    ]),
              ),
              Text(Product.formatPrice(item.subtotal),
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
          ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(
                child: Text(arrangeWithSeller
                    ? (groupIsStay
                        ? 'Check-in'
                        : groupIsRental
                            ? 'Booking access'
                            : 'Handoff')
                    : 'Delivery fee')),
            if (arrangeWithSeller)
              Text(groupIsStay ? 'Arrange with host' : 'Arrange with seller',
                  style: TextStyle(
                      color: AppPalette.of(context).successText,
                      fontWeight: FontWeight.w700,
                      fontSize: 13))
            else if (loading)
              Text('Calculating…',
                  style: TextStyle(color: AppPalette.of(context).textSecondary))
            else if (crossRegion)
              Text('Arranged after checkout',
                  style: TextStyle(
                      color: Colors.amber.shade800,
                      fontWeight: FontWeight.w600,
                      fontSize: 13))
            else if (fee != null && fee! > 0)
              Text(Product.formatPrice(fee!),
                  style: const TextStyle(fontWeight: FontWeight.w700))
            else if (failure != null)
              Flexible(
                child: Text(failure!.reason.shortLabel,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        color: Colors.amber.shade800,
                        fontWeight: FontWeight.w600)),
              )
            else
              Text('To be confirmed',
                  style:
                      TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 13)),
          ]),
        ),
      ]),
    );
  }
}

class _SellerScheduleNoticeCard extends StatelessWidget {
  const _SellerScheduleNoticeCard({
    required this.notice,
    required this.sellerName,
    required this.nowUtc,
  });

  final Map<String, dynamic> notice;
  final String sellerName;

  /// The step's clock, not `DateTime.now()`: every other time on this screen
  /// is measured against it, and reading the wall clock here made the notice
  /// disagree with the windows listed right under it.
  final DateTime nowUtc;

  @override
  Widget build(BuildContext context) {
    final now = nowUtc;
    final reopensAt = TimeUtils.tryParseBackendTimestamp(notice['reopensAt']);
    final closesAt = TimeUtils.tryParseBackendTimestamp(notice['closesAt']);
    final readyAt = TimeUtils.tryParseBackendTimestamp(notice['readyAt']);
    final openNow =
        notice['openNow'] == true && closesAt != null && closesAt.isAfter(now);
    if (reopensAt == null || (!openNow && !reopensAt.isAfter(now))) {
      return const SizedBox.shrink();
    }

    String stamp(DateTime value) {
      final eat = TimeUtils.toEat(value);
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
      ];
      return '${eat.day} ${months[eat.month - 1]}, '
          '${eat.hour.toString().padLeft(2, '0')}:'
          '${eat.minute.toString().padLeft(2, '0')} EAT';
    }

    // A standalone card now that it sits in the delivery-window section
    // instead of being stacked under the seller's item list.
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).infoFill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.of(context).infoBorder),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
              color: AppPalette.of(context).surface,
              borderRadius: BorderRadius.circular(9),
              border: Border.all(color: AppPalette.of(context).infoBorder)),
          child: Icon(Icons.calendar_month_outlined,
              size: 18, color: AppPalette.of(context).infoText),
        ),
        const SizedBox(width: 10),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
                openNow
                    ? '$sellerName is open now'
                    : '$sellerName is outside working hours',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: AppPalette.of(context).infoText)),
            const SizedBox(height: 2),
            Text(
              openNow
                  ? 'The seller can handle these items during the current working hours.'
                  : 'These items can be handled from ${stamp(reopensAt)}. You can still order now.',
              style: TextStyle(
                  fontSize: 11.5,
                  height: 1.35,
                  color: AppPalette.of(context).infoText),
            ),
            if (readyAt != null && readyAt.isAfter(reopensAt))
              Text('Production first; delivery begins ${stamp(readyAt)}.',
                  style: TextStyle(
                      fontSize: 11.5, color: AppPalette.of(context).infoText)),
          ]),
        ),
      ]),
    );
  }
}

/// Compact rental window summary on a review line ("Rental booking · 2 days",
/// with the pick-up/return stamps) — same visual language as the order
/// screen's rental summary, driven by the typed [RentalBooking] (CARTCH-07).
class _RentalBookingTile extends StatelessWidget {
  final RentalBooking booking;
  const _RentalBookingTile({required this.booking});

  @override
  Widget build(BuildContext context) {
    final start = booking.startDate;
    final end = booking.endDate;
    final base = ratePeriodLabel(
            ratePeriodFromJson(booking.ratePeriod) ?? RentalRatePeriod.day)
        .replaceFirst(
            'per ', ''); // 'hour' | 'night' | 'day' | 'week' | 'month'
    final kind = booking.billableUnits == 1 ? base : '${base}s';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppPalette.of(context).infoFill, // blue-50
        border: Border.all(color: AppPalette.of(context).infoBorder), // blue-100
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(booking.isShortStay ? 'Your stay' : 'Rental booking',
            style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 12,
                color: AppPalette.of(context).infoText)),
        if (start != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
                '${formatRentalDate(start)}'
                '${booking.pickupTime != null ? ' at ${booking.pickupTime}' : ''}'
                ' to ${end != null ? formatRentalDate(end) : '?'}'
                '${booking.returnTime != null ? ' at ${booking.returnTime}' : ''}',
                style: TextStyle(
                    fontSize: 12, color: AppPalette.of(context).infoText)),
          ),
        Text('${booking.billableUnits} $kind',
            style: TextStyle(fontSize: 12, color: AppPalette.of(context).infoText)),
      ]),
    );
  }
}

/// Subtotal / Delivery / Total card (review step totals block).
class _TotalsCard extends StatelessWidget {
  final double subtotal;
  final double delivery;
  final double total;
  final bool loading;
  final bool quoteMissing;
  final bool pickup;

  /// The quote contains deferred cross-region groups whose fee is NOT in the
  /// amount due — show the amber "Arranged after checkout" summary row.
  final bool deferred;
  const _TotalsCard({
    required this.subtotal,
    required this.delivery,
    required this.total,
    required this.loading,
    required this.quoteMissing,
    required this.pickup,
    this.deferred = false,
    this.stayOnly = false,
  });

  /// Web review-step: "Booking total" / "Stay total".
  final bool stayOnly;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppPalette.of(context).border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(stayOnly ? 'Booking total' : 'Order totals',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: Text(stayOnly ? 'Stay total' : 'Subtotal')),
          Text(Product.formatPrice(subtotal),
              style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: 6),
        Row(children: [
          const Expanded(child: Text('Delivery')),
          if (pickup)
            Text('No delivery fee',
                style: TextStyle(
                    color: AppPalette.of(context).successText, fontWeight: FontWeight.w700))
          else if (loading)
            Text('Calculating…',
                style: TextStyle(color: AppPalette.of(context).textSecondary))
          else if (quoteMissing)
            Text('To be confirmed',
                style: TextStyle(color: Colors.amber.shade800))
          else if (deferred && delivery == 0)
            // All cross-region: no fee is included, mirroring the web "-".
            Text('Arranged after checkout',
                style: TextStyle(
                    color: Colors.amber.shade800,
                    fontWeight: FontWeight.w600,
                    fontSize: 13))
          else
            Text(Product.formatPrice(delivery),
                style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
        const Divider(height: 18),
        Row(children: [
          const Expanded(child: Text('Total')),
          Text(Product.formatPrice(total),
              style:
                  const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        ]),
      ]),
    );
  }
}

/// Amber/blue "Cross-region delivery" notice on the review step — the fee is
/// arranged after checkout and excluded from the amount due (web copy).
class _CrossRegionInfoBox extends StatelessWidget {
  const _CrossRegionInfoBox();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).infoFill, // blue-50
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppPalette.of(context).infoBorder), // blue-100
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.info_outline,
            size: 18, color: AppPalette.of(context).infoText),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Cross-region delivery',
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: AppPalette.of(context).infoText)),
                const SizedBox(height: 2),
                Text(
                    'The delivery cost will be discussed and arranged after '
                    'checkout once availability is confirmed.',
                    style: TextStyle(
                        fontSize: 12.5,
                        height: 1.3,
                        color: AppPalette.of(context).infoText)),
                Text('The delivery cost is not included in the amount due.',
                    style: TextStyle(
                        fontSize: 12.5,
                        height: 1.3,
                        color: AppPalette.of(context).infoText)),
              ]),
        ),
      ]),
    );
  }
}

class _CheckoutContactField extends StatelessWidget {
  const _CheckoutContactField({
    required this.controller,
    required this.label,
    required this.icon,
    this.keyboardType,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;

  /// Web parity `checkout-content.tsx:2470`: the field is readOnly and
  /// tapping it explains where the value is edited, with a button that takes
  /// the buyer there. Mobile stamped a padlock on each field instead, which
  /// said "you cannot change this" and stopped there.
  void _explain(BuildContext context) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text('To change your $_thing, update it in your Profile '
            'Settings.'),
        action: SnackBarAction(
          label: 'Go to Settings',
          onPressed: () => context.push('/account/settings?returnTo=/checkout'),
        ),
      ));
  }

  /// What the toast calls this field, in the web's wording.
  String get _thing {
    final lower = label.toLowerCase();
    if (lower.contains('whatsapp')) return 'WhatsApp number';
    if (lower.contains('email')) return 'email';
    return 'name';
  }

  @override
  Widget build(BuildContext context) => TextFormField(
        controller: controller,
        readOnly: true,
        onTap: () => _explain(context),
        keyboardType: keyboardType,
        validator: validator,
        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: TextStyle(color: AppPalette.of(context).textSecondary),
          prefixIcon: Icon(icon, size: 20),
          filled: true,
          fillColor: AppPalette.of(context).background,
          isDense: true,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: AppPalette.of(context).border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide:
                const BorderSide(color: AppColors.brandBlue, width: 1.6),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: Colors.redAccent),
          ),
        ),
      );
}

/// Quote-failure explainer with Retry (+ fix/support affordances).
class _QuoteFailureBox extends StatelessWidget {
  final QuoteFailureExplanation explanation;
  final VoidCallback onRetry;
  const _QuoteFailureBox({required this.explanation, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: AppPalette.of(context).infoFill,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppPalette.of(context).infoBorder)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(explanation.title,
            style: const TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(explanation.description,
            style: const TextStyle(fontSize: 13, height: 1.35)),
        for (final r in explanation.resolutions)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('• $r',
                style: TextStyle(
                    fontSize: 12, color: AppPalette.of(context).textSecondary)),
          ),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          OutlinedButton.icon(
            icon: const Icon(Icons.refresh, size: 16),
            onPressed: onRetry,
            label: const Text('Retry check'),
          ),
          if (explanation.buyerCanFix)
            OutlinedButton.icon(
              icon: const Icon(Icons.edit_location_alt_outlined, size: 16),
              // GoRouter owns these paths and MaterialApp has no routes map,
              // so Navigator.pushNamed threw instead of navigating.
              onPressed: () => _openAddresses(context),
              label: const Text('Fix delivery address'),
            ),
          if (explanation.sellerMustFix)
            OutlinedButton.icon(
              icon: const Icon(Icons.support_agent, size: 16),
              onPressed: () => context.push('/contact'),
              label: const Text('Contact support'),
            ),
        ]),
      ]),
    );
  }
}

/// Selcom receiving details for the chosen method (web PAYMENT_METHOD_DETAILS).
class _PaymentMethodAccordion extends StatefulWidget {
  const _PaymentMethodAccordion({
    super.key,
    required this.selected,
    required this.reference,
    required this.onChanged,
    required this.walletBody,
    required this.manualBody,
    required this.onOpenChanged,
  });
  final String selected;
  final String reference;
  final ValueChanged<String> onChanged;

  /// What follows the receiving details of a manual method (bank transfer):
  /// the proof upload, the confirmation and the submit button.
  final Widget Function(String methodId) manualBody;

  /// Tells the page which row is open (null when all are collapsed).
  final ValueChanged<String?> onOpenChanged;

  /// The expanded body of an automated method (Mobile Wallet, Selcom
  /// Wallet): the push card, rendered in place under its own row exactly as
  /// the web renders `MobileWalletPayment` inside the method's section.
  final Widget Function(String methodId) walletBody;

  @override
  State<_PaymentMethodAccordion> createState() =>
      _PaymentMethodAccordionState();
}

class _PaymentMethodAccordionState extends State<_PaymentMethodAccordion> {
  /// Web: "Step 03 opens with every method collapsed, even when the buyer
  /// returns after previously selecting one. The buyer explicitly chooses
  /// what to open."
  String? _expanded;

  Widget _method(String id, String label, String hint, IconData icon,
      {Widget? leading}) {
    final selected = widget.selected == id;
    final expanded = _expanded == id;
    return Column(children: [
      InkWell(
        // Web `payment-method-${id.toLowerCase()}`.
        key: ValueKey('payment-method-${id.toLowerCase()}'),
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          setState(() {
            if (expanded) {
              _expanded = null;
            } else {
              widget.onChanged(id);
              _expanded = id;
            }
          });
          widget.onOpenChanged(_expanded);
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            color: selected
                ? AppPalette.of(context).textPrimary.withValues(alpha: .05)
                : AppPalette.of(context).surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? AppPalette.of(context).textPrimary
                  : AppPalette.of(context).border,
              width: 2,
            ),
          ),
          child: Row(children: [
            leading ??
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: selected
                        ? inkFill(context)
                        : AppPalette.of(context).surfaceMuted,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Icon(icon,
                      size: 19,
                      color: selected
                          ? Colors.white
                          : AppPalette.of(context).textSecondary),
                ),
            const SizedBox(width: 11),
            Expanded(
                child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w800)),
                Text(hint,
                    style: TextStyle(
                        fontSize: 12, color: AppPalette.of(context).textSecondary)),
              ],
            )),
            Icon(
                expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down),
          ]),
        ),
      ),
      AnimatedSize(
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOutCubic,
        child: expanded
            ? Padding(
                padding: const EdgeInsets.only(top: 8),
                child: isAutomatedPaymentMethod(id)
                    // An automated method's body is the push card itself,
                    // not a set of receiving details to copy.
                    ? widget.walletBody(id)
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _ReceivingDetails(
                              method: id, reference: widget.reference),
                          widget.manualBody(id),
                        ],
                      ),
              )
            : const SizedBox.shrink(),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) => Column(children: [
        _method('BANK_TRANSFER', 'Bank Account', 'Transfer through your bank',
            Icons.account_balance_outlined),
        const SizedBox(height: 10),
        // Web `PAYMENT_METHOD_DETAILS.MOBILE_MONEY`: the manual Lipa Namba
        // till (pay it, screenshot it, wait for an admin) was superseded by
        // the automated wallet push and is disabled there
        // (`LIPA_NAMBA_ENABLED = false`). Its receiving details would only
        // invite a payment nobody is verifying any more.
        _method(kMobileWalletMethod, 'Mobile Money',
            'Pay with M-Pesa, Airtel Money, Mixx by Yas, Halopesa',
            Icons.smartphone_rounded),
        const SizedBox(height: 10),
        // Web `PAYMENT_METHOD_DETAILS.SELCOM_PESA`: an in-app request inside
        // the Selcom Wallet app, carrying the supplied Selcom app mark.
        _method(kSelcomPesaMethod, 'Selcom App',
            'Pay directly in the Selcom App', Icons.smartphone_rounded,
            leading: Container(
              key: const ValueKey('selcom-wallet-mark'),
              width: 38,
              height: 38,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: const Color(0xFF292929),
                borderRadius: BorderRadius.circular(9),
                border: Border.all(color: Colors.black.withValues(alpha: .1)),
              ),
              child: Image.asset('assets/images/payments/selcom-app-icon.jpeg',
                  fit: BoxFit.cover),
            )),
      ]);
}

class _ReceivingDetails extends StatelessWidget {
  final String method;
  final String reference;
  const _ReceivingDetails({required this.method, required this.reference});

  static const _mobileMoney = [
    ('Network', 'Selcom'),
    ('Lipa Namba', '7003 9305'),
    ('Name', 'GloboExpats Limited'),
  ];
  static const _bankTransfer = [
    ('Bank', 'Selcom'),
    ('Account number', '5527108094688'),
    ('Account name', 'GloboExpats Limited'),
  ];

  @override
  Widget build(BuildContext context) {
    final rows = method == 'BANK_TRANSFER' ? _bankTransfer : _mobileMoney;
    return Container(
      decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: AppPalette.of(context).textPrimary, width: 2)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          color: AppPalette.of(context).background,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                border: Border.all(color: AppPalette.of(context).textPrimary),
                borderRadius: BorderRadius.circular(6),
              ),
              // Selcom's black mark, not its red.
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
                  child: Text('selcom',
                      style: TextStyle(
                          color: AppPalette.of(context).textPrimary,
                          fontSize: 10,
                          fontWeight: FontWeight.w900)),
                ),
                ColoredBox(
                  color: inkFill(context),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
                    child: Text('PAYMENT',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w900)),
                  ),
                ),
              ]),
            ),
            const SizedBox(height: 8),
            Text(
                '1. Pay via ${method == 'BANK_TRANSFER' ? 'Bank Account' : 'Lipa Namba'}',
                style:
                    const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('Use only the official GloboExpats account below.',
                style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 12)),
          ]),
        ),
        const SizedBox(height: 6),
        for (final (label, value) in rows)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            child: Row(children: [
              Expanded(
                  child: Text(label,
                      style: TextStyle(color: AppPalette.of(context).textSecondary))),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
            ]),
          ),
        const Divider(height: 1),
        Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Expanded(
                  child: Text('Payment reference',
                      style: TextStyle(color: AppPalette.of(context).textSecondary))),
              Flexible(
                child: Text(reference.isEmpty ? '—' : reference,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontWeight: FontWeight.w900,
                        color: AppPalette.of(context).textPrimary,
                        letterSpacing: .5)),
              ),
            ])),
      ]),
    );
  }
}

/// Ticking proforma countdown — visible ONLY while PENDING_PAYMENT and hidden
/// once payment is submitted (expiry pauses under review, §7).
class _ProformaCountdown extends StatefulWidget {
  final dynamic expiresAt;
  final dynamic status;
  final DateTime nowUtc;
  const _ProformaCountdown(
      {required this.expiresAt, required this.status, required this.nowUtc});

  @override
  State<_ProformaCountdown> createState() => _ProformaCountdownState();
}

class _ProformaCountdownState extends State<_ProformaCountdown> {
  Timer? _timer;
  late DateTime _now = widget.nowUtc;

  @override
  void initState() {
    super.initState();
    _startIfVisible();
  }

  @override
  void didUpdateWidget(covariant _ProformaCountdown oldWidget) {
    super.didUpdateWidget(oldWidget);
    _startIfVisible();
  }

  void _startIfVisible() {
    _timer?.cancel();
    if (!Countdown.visibleForStatus('${widget.status ?? ''}')) return;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now().toUtc());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = Countdown.proformaState(
      proformaStatus: '${widget.status ?? ''}',
      expiresAt: widget.expiresAt,
      nowUtc: _now,
    );
    if (state == null) return const SizedBox.shrink();
    // An expired invoice is not just "no timer" — the reservation is gone and
    // the buyer has to be told, in web's own words.
    final (fg, bg) = switch (state.tone) {
      // Palette tones, not fixed shades: the old orange-50 box glared as a
      // bright cream slab in dark mode.
      CountdownTone.expired => (
          AppPalette.of(context).dangerTextStrong,
          AppPalette.of(context).dangerFill
        ),
      CountdownTone.urgent || CountdownTone.normal => (
          AppPalette.of(context).warningTextStrong,
          AppPalette.of(context).warningFill
        ),
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(state.title,
            style: TextStyle(
                fontWeight: FontWeight.w800, fontSize: 12, color: fg)),
        const SizedBox(height: 2),
        Text(state.label,
            style: TextStyle(fontWeight: FontWeight.w700, color: fg)),
      ]),
    );
  }
}

/// Opens the order a payment just placed, or the order list when the
/// backend has not given its id yet.
void openPlacedOrder(BuildContext context, String? orderId) {
  final ref = orderId ?? '';
  final router = GoRouter.maybeOf(context);
  if (ref.isEmpty) {
    if (router != null) {
      router.push('/orders');
    }
    return;
  }
  if (router != null) {
    router.push('/orders/${Uri.encodeComponent(ref)}');
    return;
  }
  Navigator.of(context).push(MaterialPageRoute(
    // Named so Matomo records the screen (pageless routes are skipped).
    settings: RouteSettings(name: '/orders/${Uri.encodeComponent(ref)}'),
    builder: (_) => OrderDetailScreen(
        orderId: ref, token: AuthStore.instance!.token!, api: ApiClient()),
  ));
}

/// Completion step (step 4): reference, escrow copy, View Order Details →
/// /orders/{id}, Continue Shopping.
class _CompletionStep extends StatelessWidget {
  final String? orderId;
  final Map<String, dynamic>? proforma;
  final bool stayOnly;
  const _CompletionStep(
      {required this.orderId, required this.proforma, this.stayOnly = false});

  @override
  Widget build(BuildContext context) {
    final ref = orderId ?? '';
    final number =
        (proforma?['proformaNumber'] ?? proforma?['proformaId'] ?? '')
            .toString();
    return ListView(padding: const EdgeInsets.all(16), children: [
      Container(
        padding: const EdgeInsets.fromLTRB(18, 24, 18, 20),
        decoration: BoxDecoration(
          color: AppPalette.of(context).successFill,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppPalette.of(context).successBorder),
        ),
        child: Column(children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
                shape: BoxShape.circle, color: AppPalette.of(context).successFill),
            child: const Icon(Icons.check_circle_rounded,
                size: 46, color: Color(0xFF059669)),
          ),
          const SizedBox(height: 16),
          const Text('Payment submitted',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 5),
          Text('Your payment is now under review',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: AppPalette.of(context).successText, fontWeight: FontWeight.w700)),
          const SizedBox(height: 18),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              color: AppPalette.of(context).surface.withValues(alpha: .75),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(children: [
              Text(stayOnly ? 'BOOKING REFERENCE' : 'ORDER REFERENCE',
                  style: TextStyle(
                      fontSize: 10.5,
                      color: AppPalette.of(context).textSecondary,
                      fontWeight: FontWeight.w700,
                      letterSpacing: .8)),
              const SizedBox(height: 4),
              Text(ref.isEmpty ? 'Processing…' : ref,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w900)),
              if (number.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text('Invoice $number',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: AppPalette.of(context).textSecondary, fontSize: 12)),
              ],
            ]),
          ),
          const SizedBox(height: 14),
          Text(
            stayOnly
                ? 'Your stay is confirmed only after payment verification and '
                    'host confirmation. Your booking page will show your stay '
                    'dates and check-in code when available.'
                : 'GloboExpats will verify your payment and notify you within 30 '
                    'minutes. Your money stays protected until the order is delivered.',
            textAlign: TextAlign.center,
            style:
                TextStyle(color: AppPalette.of(context).successText, fontSize: 13, height: 1.45),
          ),
        ]),
      ),
      const SizedBox(height: 16),
      // With no order id there is nothing to deep-link to: `/orders/` and
      // `/orders/<proforma number>` both end up on the buyer's order LIST,
      // which after a purchase reads as a blank My Space. Say where the
      // button goes instead of pretending it opens this order.
      FilledButton.icon(
        style: FilledButton.styleFrom(
            backgroundColor: AppColors.brandBlue,
            minimumSize: const Size.fromHeight(48)),
        onPressed: () => openPlacedOrder(context, ref),
        icon: const Icon(Icons.receipt_long_outlined, size: 18),
        label: Text(ref.isEmpty
            ? 'View my orders'
            : stayOnly
                ? 'View booking details'
                : 'View Order Details'),
      ),
      const SizedBox(height: 8),
      OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        onPressed: () => context.go('/browse'),
        icon: const Icon(Icons.storefront_outlined, size: 18),
        label: const Text('Continue Shopping'),
      ),
    ]);
  }
}

/// Test-only harness: pumps [CheckoutScreen] with a fixed clock so window
/// resolution is deterministic (all six composites open).
class CheckoutFlowHarness extends StatelessWidget {
  final ApiClient? api;
  final CartStore? cart;
  const CheckoutFlowHarness({super.key, this.api, this.cart});

  @override
  Widget build(BuildContext context) => CheckoutScreen(
      api: api, cart: cart, nowUtc: DateTime.utc(2026, 8, 25, 6, 0));
}

/// The Delivery Address card's placeholder while checkout loads: the same
/// rows the form will have (name pair, email, phone, saved-address picker),
/// so the finished form lands without moving anything.
class _CheckoutAddressSkeleton extends StatelessWidget {
  const _CheckoutAddressSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(children: [
          Expanded(child: SkeletonBox(height: 54, radius: 12)),
          SizedBox(width: 8),
          Expanded(child: SkeletonBox(height: 54, radius: 12)),
        ]),
        SizedBox(height: 10),
        SkeletonBox(height: 54, radius: 12),
        SizedBox(height: 10),
        SkeletonBox(height: 54, radius: 12),
        SizedBox(height: 16),
        SkeletonBox(height: 96, radius: 14),
      ],
    );
  }
}
