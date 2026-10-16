import 'package:intl/intl.dart';

import '../domain/time_utils.dart';
import '../domain/production_time.dart';
import '../domain/delivery_windows.dart';
import '../domain/commission_calculator.dart';
import '../domain/rentals.dart' show isShortStayBookingJson, parseRentalDate;

/// AU-034: client-side status groups, mirroring the reference's order list.
enum OrderGroup { ongoing, overdue, completed, cancelled }

extension OrderGroupLabel on OrderGroup {
  /// Reference tab labels (dashboard order-status tablist).
  String get label => switch (this) {
        OrderGroup.ongoing => 'Ongoing',
        OrderGroup.overdue => 'Overdue',
        OrderGroup.completed => 'Completed',
        OrderGroup.cancelled => 'Cancelled',
      };
}

/// One line item of an order detail (`items[]` of GET /api/v1/orders/{id}).
/// Carries qty, price, image and the selected choice labels so the order
/// detail screen can render exactly what was bought (AU-035: the detail used
/// to show zero line items).
class OrderItem {
  final int? orderItemId;
  final int productId;
  final String productName;
  final double quantity;
  final double price;

  /// Seller-view unit price (`finalTotalSellingPrice`) — web parity
  /// `getOrderItemUnitPrice` prefers it over `price`.
  final double? unitPrice;

  /// Extra unit-price spellings feeding [effectiveUnitPrice]'s web fallback
  /// chain (`unitPrice` > `finalTotalSellingPrice` > `price` > `productPrice`
  /// > `askingPrice`, finite ≥ 0 else 0 — lib/order-detail-view.ts:25-34).
  final num? finalTotalSellingPrice;
  final num? productPrice;
  final num? askingPrice;

  /// Stored line-subtotal on the item (`subtotal`/`lineTotal`/`total`), used
  /// verbatim by the order financial summary before falling back to
  /// unit price × quantity (web `getItemsSubtotal`).
  final double? storedLineSubtotal;

  /// Per-unit seller payout persisted on the order item (`sellerPayout`).
  /// FINANC-08: the seller money-transparency summary prefers this stored value
  /// and only reverse-computes commission when it is absent.
  final num? sellerPayout;

  /// Per-unit stored seller-facing commission (`sellerFacingCommissionAmount`),
  /// the authoritative GloboExpats cut when present.
  final num? sellerFacingCommissionAmount;

  /// How many calendar days the seller needs to make/prepare this item
  /// (`productionTimeDays`) — drives the availability-gate production-deadline
  /// copy (seller-availability-gate.tsx longestProductionTime).
  final num? productionTimeDays;

  final String? image;

  /// Category slugs driving the rental kind detection (vehicle vs property).
  final String? productCategory;
  final String? productCategorySlug;
  final String? productSubcategorySlug;
  final List<OrderSelectedChoice> selectedChoices;
  final Map<String, dynamic>? rentalBooking;

  const OrderItem({
    this.orderItemId,
    required this.productId,
    required this.productName,
    this.quantity = 1,
    this.price = 0,
    this.unitPrice,
    this.finalTotalSellingPrice,
    this.productPrice,
    this.askingPrice,
    this.storedLineSubtotal,
    this.image,
    this.productCategory,
    this.productCategorySlug,
    this.productSubcategorySlug,
    this.selectedChoices = const [],
    this.rentalBooking,
    this.sellerPayout,
    this.sellerFacingCommissionAmount,
    this.productionTimeDays,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) => OrderItem(
        orderItemId: (json['orderItemId'] as num?)?.toInt(),
        productId: (json['productId'] as num?)?.toInt() ?? 0,
        productName: (json['productName'] ?? json['title'] ?? '').toString(),
        quantity: (json['quantity'] as num?)?.toDouble() ?? 1,
        price: (json['price'] as num?)?.toDouble() ?? 0,
        unitPrice: (json['unitPrice'] as num?)?.toDouble(),
        finalTotalSellingPrice: json['finalTotalSellingPrice'] as num?,
        productPrice: json['productPrice'] as num?,
        askingPrice: json['askingPrice'] as num?,
        storedLineSubtotal: _finiteAmount(json['subtotal'] ??
            json['lineTotal'] ??
            json['total']),
        image: (json['image'] ?? json['productImage'])?.toString(),
        productCategory: (json['productCategory'] ??
                json['category'] ??
                json['categoryName'])
            ?.toString(),
        productCategorySlug: json['productCategorySlug']?.toString(),
        productSubcategorySlug: json['productSubcategorySlug']?.toString(),
        sellerPayout: _finiteAmount(json['sellerPayout']),
        sellerFacingCommissionAmount:
            _finiteAmount(json['sellerFacingCommissionAmount']),
        productionTimeDays: _finiteAmount(json['productionTimeDays']),
        selectedChoices: ((json['selectedChoices'] as List?) ?? const [])
            .whereType<Map>()
            .map((e) => OrderSelectedChoice.fromJson(e.cast<String, dynamic>()))
            .toList(),
        rentalBooking: json['rentalBooking'] is Map
            ? (json['rentalBooking'] as Map).cast<String, dynamic>()
            : null,
      );

  /// Web parity `getOrderItemUnitPrice` (lib/order-detail-view.ts:25-34):
  /// `unitPrice` > `finalTotalSellingPrice` > `price` > `productPrice` >
  /// `askingPrice`, first finite amount ≥ 0, else 0.
  double get effectiveUnitPrice {
    for (final raw in <num?>[
      unitPrice,
      finalTotalSellingPrice,
      price,
      productPrice,
      askingPrice,
    ]) {
      final d = _finiteAmount(raw);
      if (d != null) return d;
    }
    return 0;
  }

  /// "Single" / "2 x TSh 626,000" style summary used by the detail list tile.
  String get quantityLabel =>
      '${quantity % 1 == 0 ? quantity.toInt() : quantity} × ${Order.formatAmount(effectiveUnitPrice)}';

  List<String> get choiceLabels =>
      selectedChoices.map((c) => c.label).toList(growable: false);

  bool get hasRental => rentalBooking != null;
}

/// Rental presentation derived from the order's items (web parity
/// `getRentalOrderPresentation`): kind drives the timeline step wording.
enum RentalKind { vehicle, property }

class RentalPresentation {
  final RentalKind kind;
  final Map<String, dynamic> booking;

  const RentalPresentation(this.kind, this.booking);

  /// Vehicle subcategories / category names flip the wording (web parity
  /// VEHICLE_RENTAL_SUBCATEGORIES).
  static RentalPresentation? fromItems(List<OrderItem> items) {
    for (final item in items) {
      final b = item.rentalBooking;
      if (b == null) continue;
      final cat =
          '${item.productCategory ?? ''} ${item.productCategorySlug ?? ''}'
              .toLowerCase();
      const vehicleSubcats = {
        'cars-for-rent', 'suvs-4x4-for-rent', 'vans-minibuses-for-rent',
      };
      final kind = vehicleSubcats.contains(item.productSubcategorySlug) ||
              cat.contains('vehicle')
          ? RentalKind.vehicle
          : RentalKind.property;
      return RentalPresentation(kind, b);
    }
    return null;
  }

  bool get isVehicle => kind == RentalKind.vehicle;

  /// A property short stay (web `isShortStay`): guest/host wording, "Your
  /// stay", a check-in code and booking progress instead of delivery.
  bool get isShortStay => !isVehicle && isShortStayBookingJson(booking);

  /// "Rental pickup" vs "Arrival / check-in" ("Check-in" for a short stay).
  String get startStepLabel => isShortStay
      ? 'Check-in'
      : isVehicle
          ? 'Rental pickup'
          : 'Arrival / check-in';

  String get startLabel => isVehicle ? 'Pickup' : 'Check-in';
  String get endLabel => isVehicle ? 'Return' : 'Checkout';

  /// "Booking" for a short stay, otherwise "Order".
  String get orderNoun => isShortStay ? 'Booking' : 'Order';

  /// "Vehicle rental" / "Stay booking" / "Property rental" (web card label).
  String get kindLabel => isVehicle
      ? 'Vehicle rental'
      : isShortStay
          ? 'Stay booking'
          : 'Property rental';

  /// Check-in / pickup moment and checkout / return deadline, in the
  /// operating zone (web `rentalMoment`: booking date + clock time in EAT).
  DateTime? get startAt =>
      _rentalMoment(booking['startDate'], booking['pickupTime']?.toString());
  DateTime? get deadline =>
      _rentalMoment(booking['endDate'], booking['returnTime']?.toString());

  /// The one-line stage chip on order cards (web `getRentalStageLabel`).
  String stageLabel(String? status, {DateTime? now}) {
    final s = (status ?? '').trim().toUpperCase().replaceAll(RegExp(r'[\s-]+'), '_');
    final t = now ?? DateTime.now();
    final started = startAt != null && !t.isBefore(startAt!);
    final beforeEnd = deadline == null || t.isBefore(deadline!);
    if (isShortStay) {
      if (s == 'CANCELLED') return 'Booking cancelled';
      if (s == 'FAILED') return 'Booking failed';
      if (s == 'AWAITING_PAYMENT') return 'Awaiting payment';
      if (s == 'PENDING') return 'Payment under review';
      if (const ['PAID', 'PAYMENT_HELD_IN_ESCROW', 'AWAITING_SELLER_CONFIRMATION']
          .contains(s)) {
        return 'Awaiting host confirmation';
      }
      if (s == 'COMPLETED' || s == 'CONFIRMED') return 'Stay completed';
      if (s == 'PICKED_UP') return beforeEnd ? 'Stay in progress' : 'Completing stay';
      if (s == 'AWAITING_PICKUP' || s == 'SCHEDULED') {
        return started ? 'Awaiting check-in confirmation' : 'Check-in scheduled';
      }
      return 'Booking processing';
    }
    if (s == 'COMPLETED' || s == 'CONFIRMED') return 'Rental completed';
    if (s == 'AWAITING_SELLER_CONFIRMATION') return 'Awaiting rental confirmation';
    if (s == 'AWAITING_PICKUP' || s == 'SCHEDULED') {
      if (started) {
        return isVehicle
            ? 'Awaiting pickup confirmation'
            : 'Awaiting arrival confirmation';
      }
      return isVehicle ? 'Pickup scheduled' : 'Arrival scheduled';
    }
    if (s == 'PICKED_UP') return beforeEnd ? 'Rental in progress' : 'Completing rental';
    return isVehicle ? 'Pickup scheduled' : 'Arrival scheduled';
  }

  static DateTime? _rentalMoment(dynamic date, String? time) {
    final d = parseRentalDate(date);
    if (d == null) return null;
    var hour = 0, minute = 0;
    final m = RegExp(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', caseSensitive: false)
        .firstMatch((time ?? '').trim());
    if (m != null) {
      hour = int.parse(m.group(1)!) % 12 +
          (m.group(3)!.toUpperCase() == 'PM' ? 12 : 0);
      minute = int.parse(m.group(2)!);
    }
    return DateTime.utc(d.year, d.month, d.day, hour, minute)
        .subtract(TimeUtils.eatOffset);
  }
}

class OrderSelectedChoice {
  final num? definitionId;
  final String attributeName;
  final String valueId;
  final String valueLabel;

  const OrderSelectedChoice({
    this.definitionId,
    this.attributeName = '',
    this.valueId = '',
    this.valueLabel = '',
  });

  factory OrderSelectedChoice.fromJson(Map<String, dynamic> json) =>
      OrderSelectedChoice(
        definitionId: json['definitionId'] as num?,
        attributeName: (json['attributeName'] ?? '').toString(),
        valueId: (json['valueId'] ?? '').toString(),
        valueLabel: (json['valueLabel'] ?? '').toString(),
      );

  /// "Pack Size: Single"
  String get label => attributeName.isEmpty
      ? valueLabel
      : '$attributeName: $valueLabel';
}

/// Finite, non-negative money value or null (web `finiteAmount`). Empty and
/// unparseable values resolve to null so a missing field never reads as 0 in
/// the middle of a fallback chain.
double? _finiteAmount(dynamic value) {
  final n = value is num ? value : num.tryParse(value?.toString() ?? '');
  if (n == null || !n.isFinite || n < 0) return null;
  return n.toDouble();
}

/// First present, parseable money value among [keys] (web `firstPresent`).
double? _firstFinite(Map<String, dynamic> json, List<String> keys) {
  for (final key in keys) {
    if (json[key] == null) continue;
    final v = _finiteAmount(json[key]);
    if (v != null) return v;
  }
  return null;
}

String? _text(dynamic v) {
  final t = v?.toString().trim() ?? '';
  return t.isEmpty || t == 'null' ? null : t;
}

/// Web `getRentalOrderLocation` (lib/order-card-location.ts): the seller's
/// pickup place as one label, with a pin link when it has coordinates.
({String label, String mapUrl})? _rentalLocation(Map<String, dynamic> json) {
  dynamic pick(String camel, String snake) => json[camel] ?? json[snake];
  final parts = <String>[];
  for (final v in [
    pick('sellerPickupPlaceName', 'seller_pickup_place_name'),
    pick('sellerPickupAddress', 'seller_pickup_address'),
    pick('sellerPickupNeighbourhood', 'seller_pickup_neighbourhood'),
    pick('sellerPickupCity', 'seller_pickup_city'),
    pick('sellerPickupCountry', 'seller_pickup_country'),
  ]) {
    final t = _text(v);
    if (t != null && !parts.any((p) => p.toLowerCase() == t.toLowerCase())) {
      parts.add(t);
    }
  }
  if (parts.isEmpty) return null;
  final lat =
      num.tryParse('${pick('sellerPickupLatitude', 'seller_pickup_latitude')}');
  final lng = num.tryParse(
      '${pick('sellerPickupLongitude', 'seller_pickup_longitude')}');
  final pinned = lat != null &&
      lng != null &&
      lat.abs() <= 90 &&
      lng.abs() <= 180 &&
      !(lat == 0 && lng == 0);
  final query = pinned ? '$lat,$lng' : Uri.encodeComponent(parts.join(', '));
  return (
    label: parts.join(' · '),
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=$query',
  );
}

/// An order as returned by `/api/v1/orders` and `/api/v1/orders/{id}`.
class Order {
  final String orderId;
  final String orderNumber;
  final String? status; // e.g. PENDING_PAYMENT / PAID / etc (string enum)
  final String? paymentStatus;
  final bool escrowPending;
  final double subtotal;
  final double deliveryFee;

  /// ORDERS-18: whether the payload actually persisted a delivery fee. Web
  /// `hasDeliveryFee` (lib/order-detail-view.ts:68) is true only when a finite
  /// fee was stored; a cross-region order whose fee is settled after checkout
  /// carries none and must render 'Arranged after checkout', never a bare 0.
  final bool hasDeliveryFee;
  final double totalAmount;
  final String currency;
  final String? createdAt;
  final String? paymentDeadline;
  final String? orderType; // buying | selling
  final String? listType; // buying | selling list-row spelling (web orderType||listType)
  final String? orderDate; // creation-stamp alias (web createdAt || orderDate)
  final String? sellerId; // seller user id — classifier user-id fallback
  final String? buyerId; // buyer user id — classifier user-id fallback
  final String? sellerName;
  final String? buyerName;
  final String? deliveryAddress;
  final String? deliveryCity;
  final String? deliveryMethod;
  final bool? buyerRated;
  final bool? sellerRated;

  /// SELLER_DELIVERY | BUYER_PICKUP — selects the timeline step sequence.
  final String? fulfillmentType;

  /// Buyer-visible 6-digit handover code (exposed ONLY while IN_TRANSIT).
  final String? deliveryCode;

  /// Rental handover code, visible to the booker while AWAITING_PICKUP.
  final String? rentalHandoffCode;

  /// Failed verifications of [rentalHandoffCode]; after three the guest may
  /// generate a replacement (web `rentalHandoffCodeAttempts`).
  final int rentalHandoffCodeAttempts;

  /// Counterparty phones. On a paid rental the guest sees the host's and
  /// the host the guest's (web dashboard RentalCounterparty).
  final String? buyerPhone;
  final String? sellerPhone;

  /// Where the rental is: the seller's pickup address and pin (web
  /// `getRentalOrderLocation`). Null when the order carries none.
  final ({String label, String mapUrl})? rentalLocation;

  /// Made-to-order preparation tracking (web ProductionTimeCard). Null on an
  /// ordinary item, which is never gated on production.
  final ProductionSource production;
  final String? refundStatus;

  /// FINANC-04 (D-4/D-5): embedded payment context on the detail payload —
  /// the proforma behind the order and the receipts the buyer has uploaded.
  /// The web `embeddedPayment` fallback reads the same aliases
  /// (`proformaId ?? proforma_id`, `paymentReceipts ?? payment_receipts ??
  /// receipts`). Null/empty on list rows and legacy orders without a proforma.
  final String? proformaId;
  final String? paymentMethodType;
  final List<Map<String, dynamic>> paymentReceipts;

  /// HELD | RELEASED | null (AU-036 escrow badge states).
  final String? payoutStatus;

  /// Present when refundStatus == REFUNDED (AU-036: amount shown in banner).
  final num? refundAmount;

  /// AU-038 dispatch gate: `canDispatch` true ⇒ the Dispatch button shows;
  /// otherwise `dispatchBlockedReason` / `dispatchBlockers[]` say why.
  final bool? canDispatch;
  final String? dispatchBlockedReason;
  final List<String> dispatchBlockers;

  /// The order's own delivery-window fields, kept verbatim so
  /// `dispatchOpensAt` / `dispatchUnlockLabel` can tell the seller when
  /// dispatch unlocks. Held as the raw subset rather than parsed here: the
  /// rules (which spellings count, what a malformed window means) live in
  /// domain/dispatch.dart, next to the web contract they mirror.
  final Map<String, dynamic> deliveryWindowFields;

  /// Line items — present on the detail payload (`items[]`), absent on list rows.
  final List<OrderItem> items;

  /// Delivery deadline driving the overdue grouping (AU-034).
  final String? fulfillmentDeadline;
  final bool? overdue;

  /// Server-confirmed deadline candidates — the web `getOrderDeliveryDeadline`
  /// explicit chain (`fulfillmentDeadline` > `deliveryDeadline` >
  /// `deliveryDueAt` > `promisedDeliveryAt`). Each may be absent; they feed
  /// [OrderLifecycle.deliveryDeadlineUtc], not a UI field.
  final String? deliveryDeadline;
  final String? deliveryDueAt;
  final String? promisedDeliveryAt;

  /// AU-039: backend capability flag — true only for the BUYER of a
  /// delivery order while IN_TRANSIT; gates the buyer's "I received the
  /// items" self-confirm button (reference allowBuyerConfirmation).
  final bool? buyerCanConfirmDelivery;

  /// Logistics-v2 embedded `trip` on the detail payload — the proposed
  /// delivery time that is waiting on the buyer, and the transporter who will
  /// deliver. All null on list rows and legacy orders without a trip.
  final String? proposedDeliveryTime;
  final String? deliveryTimeStatus; // PROPOSED | BUYER_CONFIRMED | …
  final String? transporterName;
  final String? transporterPhone;

  const Order({

    required this.orderId,
    this.orderNumber = '',
    this.status,
    this.paymentStatus,
    this.escrowPending = false,
    this.subtotal = 0,
    this.deliveryFee = 0,
    this.hasDeliveryFee = false,
    this.totalAmount = 0,
    this.currency = 'TZS',
    this.createdAt,
    this.paymentDeadline,
    this.orderType,
    this.listType,
    this.orderDate,
    this.sellerId,
    this.buyerId,
    this.sellerName,
    this.buyerName,
    this.deliveryAddress,
    this.deliveryCity,
    this.deliveryMethod,
    this.buyerRated,
    this.sellerRated,
    this.fulfillmentType,
    this.deliveryCode,
    this.rentalHandoffCode,
    this.rentalHandoffCodeAttempts = 0,
    this.buyerPhone,
    this.sellerPhone,
    this.rentalLocation,
    this.production = const ProductionSource(),
    this.refundStatus,
    this.payoutStatus,
    this.refundAmount,
    this.proformaId,
    this.paymentMethodType,
    this.paymentReceipts = const [],
    this.canDispatch,
    this.dispatchBlockedReason,
    this.dispatchBlockers = const [],
    this.deliveryWindowFields = const {},
    this.items = const [],
    this.fulfillmentDeadline,
    this.overdue,
    this.deliveryDeadline,
    this.deliveryDueAt,
    this.promisedDeliveryAt,
    this.buyerCanConfirmDelivery,
    this.proposedDeliveryTime,
    this.deliveryTimeStatus,
    this.transporterName,
    this.transporterPhone,
  });

  factory Order.fromJson(Map<String, dynamic> json) {
    // Logistics-v2: the order detail carries the trip (delivery-time proposal
    // + transporter) that drives the buyer delivery-time confirmation banner.
    final tripRaw = json['trip'];
    final trip = tripRaw is Map ? tripRaw.cast<String, dynamic>() : null;
    final transporterRaw = trip?['transporter'];
    final transporter =
        transporterRaw is Map ? transporterRaw.cast<String, dynamic>() : null;

    // Line items parsed first so the financial summary can derive a subtotal
    // from them when the payload omits one.
    final items = ((json['items'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => OrderItem.fromJson(e.cast<String, dynamic>()))
        .toList();

    // Web getOrderFinancialSummary (lib/order-detail-view.ts:44-70): each of
    // the three money rows falls back through its aliases, then to amounts
    // derived from the line items or from the other persisted rows.
    final persistedSubtotal =
        _firstFinite(json, const ['subtotal', 'itemsSubtotal', 'itemsTotal']);
    final persistedDeliveryFee = _firstFinite(
        json,
        const [
          'deliveryFee',
          'delivery_fee',
          'consolidatedDeliveryFee',
          'deliveryTotal',
        ]);
    final persistedTotal =
        _firstFinite(json, const ['totalAmount', 'grandTotal', 'orderTotal', 'total']);
    var calculatedItemsSubtotal = 0.0;
    for (final item in items) {
      final line = item.storedLineSubtotal ??
          item.effectiveUnitPrice * (item.quantity < 1 ? 1 : item.quantity);
      calculatedItemsSubtotal += line;
    }
    final deliveryFee = persistedDeliveryFee ?? 0;
    final subtotal = persistedSubtotal ??
        (calculatedItemsSubtotal > 0
            ? calculatedItemsSubtotal
            : ((persistedTotal ?? 0) - deliveryFee)
                .clamp(0, double.infinity)
                .toDouble());
    final totalAmount = persistedTotal ?? subtotal + deliveryFee;

    return Order(
        production: productionSourceFromJson(json),
        orderId: (json['orderId'] ?? '').toString(),
        orderNumber: (json['orderNumber'] ?? '').toString(),
        status: json['status']?.toString(),
        paymentStatus: json['paymentStatus']?.toString(),
        escrowPending: json['escrowPending'] as bool? ?? false,
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        hasDeliveryFee: persistedDeliveryFee != null,
        totalAmount: totalAmount,
        currency: json['currency'] as String? ?? 'TZS',
        createdAt: json['createdAt']?.toString(),
        paymentDeadline: json['paymentDeadline']?.toString(),
        orderType: json['orderType']?.toString(),
        listType: json['listType']?.toString(),
        orderDate: json['orderDate']?.toString(),
        sellerId: json['sellerId']?.toString(),
        buyerId: json['buyerId']?.toString(),
        sellerName: json['sellerName'] as String?,
        buyerName: json['buyerName'] as String?,
        deliveryAddress: json['deliveryAddress'] as String?,
        deliveryCity: json['deliveryCity'] as String?,
        deliveryMethod: json['deliveryMethod'] as String?,
        buyerRated: json['buyerRated'] as bool?,
        sellerRated: json['sellerRated'] as bool?,
        fulfillmentType: json['fulfillmentType']?.toString(),
        deliveryCode: (json['deliveryCode'] as String?)?.trim().isEmpty ?? true
            ? null
            : (json['deliveryCode'] as String).trim(),
        rentalHandoffCode: json['rentalHandoffCode']?.toString(),
        rentalHandoffCodeAttempts:
            (json['rentalHandoffCodeAttempts'] as num?)?.toInt() ?? 0,
        buyerPhone: _text(json['buyerPhone'] ?? json['buyerPhoneNumber']),
        sellerPhone: _text(json['sellerPhone'] ?? json['sellerPhoneNumber']),
        rentalLocation: _rentalLocation(json),
        refundStatus: json['refundStatus']?.toString(),
        payoutStatus: json['payoutStatus']?.toString(),
        refundAmount: json['refundAmount'] as num?,
        proformaId: (json['proformaId'] ?? json['proforma_id'])?.toString(),
        paymentMethodType: (json['paymentMethodType'] ??
                json['paymentMethod'] ??
                json['payment_method'])
            ?.toString(),
        paymentReceipts: [
          for (final r
              in (json['paymentReceipts'] ??
                      json['payment_receipts'] ??
                      json['receipts'])
                  is List
                  ? (json['paymentReceipts'] ??
                      json['payment_receipts'] ??
                      json['receipts']) as List
                  : const <Object>[])
            if (r is Map) r.cast<String, dynamic>(),
        ],
        canDispatch: json['canDispatch'] as bool?,
        dispatchBlockedReason: json['dispatchBlockedReason']?.toString(),
        dispatchBlockers: ((json['dispatchBlockers'] as List?) ?? const [])
            .map((b) => b is Map ? ((b['reason'] ?? b['code']) ?? '').toString() : b.toString())
            .where((s) => s.isNotEmpty)
            .toList(),
        deliveryWindowFields: {
          for (final key in const [
            'dispatchOpensAt',
            'preferredDeliveryWindows',
            'preferred_delivery_windows',
            'preferredDeliveryDate',
            'preferred_delivery_date',
            'preferredDeliverySlot',
            'preferred_delivery_slot',
          ])
            if (json[key] != null) key: json[key],
        },
        items: items,
        fulfillmentDeadline: json['fulfillmentDeadline']?.toString(),
        overdue: json['overdue'] as bool?,
        deliveryDeadline: json['deliveryDeadline']?.toString(),
        deliveryDueAt: json['deliveryDueAt']?.toString(),
        promisedDeliveryAt: json['promisedDeliveryAt']?.toString(),
        buyerCanConfirmDelivery: json['buyerCanConfirmDelivery'] as bool?,
        proposedDeliveryTime: trip?['proposedDeliveryTime']?.toString(),
        deliveryTimeStatus: trip?['deliveryTimeStatus']?.toString(),
        transporterName: transporter?['fullName']?.toString(),
        transporterPhone: (transporter?['phoneNumber'] ??
                transporter?['whatsAppPhoneNumber'])
            ?.toString(),
      );
  }

  static String formatAmount(double a, [String c = 'TZS']) {
    final s = NumberFormat('#,##0').format(a);
    return c == 'TZS' ? 'TSh $s' : '$s $c';
  }
}

extension OrderLifecycle on Order {
  /// Parsed `createdAt` in EAT wall clock, or null when absent/unparseable.
  DateTime? get createdAtEat {
    final t = TimeUtils.tryParseBackendTimestamp(createdAt);
    return t == null ? null : TimeUtils.toEat(t);
  }

  /// Reference list-row stamp: `23 Aug, 14:05` (EAT).
  String? get createdAtLabel {
    final t = TimeUtils.tryParseBackendTimestamp(createdAt);
    return t == null ? null : _EatStamp.format(t);
  }

  /// AU-035: legacy `CONFIRMED` normalizes to `COMPLETED` everywhere the
  /// status is displayed (web parity `normalizeOrderStatus`, which also
  /// upper-cases and maps spaces/dashes to underscores).
  String get normalizedStatus => normalizeOrderStatus(status);

  bool get isTerminal {
    // Web parity COMPLETED_ORDER_STATUSES + CANCELLED_ORDER_STATUSES
    // (dashboard getOrderStatusGroup): delivered/picked-up orders are done.
    const terminal = {
      'COMPLETED', 'DELIVERED', 'PICKED_UP',
      'CANCELLED', 'FAILED', 'EXPIRED',
    };
    final s = normalizedStatus;
    return terminal.contains(s);
  }

  /// Effective delivery deadline for the overdue grouping, or null when the
  /// payload carries nothing time-derived. Web parity `getOrderDeliveryDeadline`
  /// (lib/order-delivery-deadline.ts:239-268): the first server-confirmed/
  /// proposed deadline wins, then the trip's proposed delivery time, then the
  /// latest end across the buyer's accepted windows (server `endsAt` overrides
  /// honored), then the legacy single-window end — SELLER_HOURS excluded.
  DateTime? get deliveryDeadlineUtc {
    for (final raw in <String?>[
      fulfillmentDeadline,
      deliveryDeadline,
      deliveryDueAt,
      promisedDeliveryAt,
    ]) {
      final t = TimeUtils.tryParseBackendTimestamp(raw);
      if (t != null) return t;
    }
    final trip = TimeUtils.tryParseBackendTimestamp(proposedDeliveryTime);
    if (trip != null) return trip;

    final windows = readOrderDeliveryWindows(deliveryWindowFields);
    if (windows.isNotEmpty) return latestWindowEndUtc(windows);

    final legacy = legacyDeliveryWindow(deliveryWindowFields);
    if (legacy != null && !legacy.slot.isSellerHours) return legacy.endUtc;
    return null;
  }

  /// Buyer-selected delivery window(s) as a human label — web parity with
  /// `getOrderDeliveryWindowLabels` (`"Tomorrow Afternoon (12:00–16:00)"`,
  /// joined with ` · ` when several). Null when the payload carries no
  /// parseable window.
  String? get deliveryWindowLabel {
    if (deliveryWindowFields.isEmpty) return null;
    final now = DateTime.now().toUtc();
    final today = TimeUtils.todayYmdEAT(now);
    final tomorrow = TimeUtils.tomorrowYmdEAT(now);
    final windows = readOrderDeliveryWindows(deliveryWindowFields);
    final labels = <String>[
      for (final w in windows) w.summaryLabel(today, tomorrow),
    ];
    if (labels.isNotEmpty) return labels.join(' · ');
    final legacy = legacyDeliveryWindow(deliveryWindowFields);
    if (legacy != null && !legacy.slot.isSellerHours) {
      return legacy.summaryLabel(today, tomorrow);
    }
    return null;
  }

  /// AU-034 group: overdue = [deliveryDeadlineUtc] past while not terminal.
  /// Rental orders complete only at COMPLETED/CONFIRMED (web
  /// isRentalOrderComplete) — DELIVERED/PICKED_UP mid-rental stay ongoing.
  OrderGroup get group {
    final s = normalizedStatus;
    if (rental != null) {
      if (s == 'COMPLETED' || s == 'CONFIRMED') return OrderGroup.completed;
      if (s == 'CANCELLED' || s == 'FAILED' || s == 'EXPIRED') {
        return OrderGroup.cancelled;
      }
    } else if (isTerminal) {
      if (s == 'CANCELLED' || s == 'FAILED' || s == 'EXPIRED') {
        return OrderGroup.cancelled;
      }
      return OrderGroup.completed;
    }
    final dl = deliveryDeadlineUtc;
    if (dl != null && DateTime.now().toUtc().isAfter(dl)) {
      return OrderGroup.overdue;
    }
    return OrderGroup.ongoing;
  }

  /// Buying vs selling split: backend `orderType`, falling back to an id
  /// match heuristic is impossible client-side, so default to buying.
  bool get isSelling => orderType == 'selling';

  /// Rental presentation when any item carries a booking (null otherwise).
  RentalPresentation? get rental => RentalPresentation.fromItems(items);
}

/// Web parity `normalizeOrderStatus`: upper-case, spaces/dashes → underscores,
/// legacy CONFIRMED → COMPLETED, unknown → UNKNOWN.
String normalizeOrderStatus(dynamic status) {
  final s = status?.toString();
  if (s == null || s.isEmpty) return 'UNKNOWN';
  final up = s.toUpperCase().trim().replaceAll(RegExp(r'[\s-]+'), '_');
  return up == 'CONFIRMED' ? 'COMPLETED' : up;
}

/// Buyer/seller/admin wording for one authoritative status (web parity
/// `getOrderStatusLabel`). Falls back to the humanised raw status so a new
/// backend status never renders blank.
String orderStatusLabel(dynamic status, {String perspective = 'buyer'}) {
  final n = normalizeOrderStatus(status);
  final map = const <String, Map<String, String>>{
    'PENDING': {
      'buyer': 'Payment submitted - being verified',
      'seller': 'Awaiting payment verification',
      'admin': 'Pending',
    },
    'AWAITING_PAYMENT': {
      'buyer': 'Awaiting payment verification',
      'seller': 'Awaiting payment verification',
      'admin': 'Awaiting payment',
    },
    'AWAITING_SELLER_CONFIRMATION': {
      'buyer': 'Payment confirmed - awaiting seller',
      'seller': 'New order - confirm item is available',
      'admin': 'Awaiting seller confirmation',
    },
    'PAID': {
      'buyer': 'Payment confirmed - order placed',
      'seller': 'New order - payment confirmed',
      'admin': 'Paid',
    },
    'AWAITING_DELIVERY': {
      'buyer': 'Seller confirmed - preparing your delivery',
      'seller': 'Confirmed - assign a driver',
      'admin': 'Awaiting dispatch',
    },
    'READY_FOR_DISPATCH': {
      'buyer': 'Driver assigned - dispatch in progress',
      'seller': 'Driver assigned - dispatch once they have the items',
      'admin': 'Ready for dispatch',
    },
    'AWAITING_BUYER_CONFIRMATION': {
      'buyer': 'Confirm the new delivery time',
      'seller': 'Waiting for buyer to confirm the new time',
      'admin': 'Awaiting buyer time confirmation',
    },
    'IN_TRANSIT': {
      'buyer': 'Out for delivery',
      'seller': 'Dispatched - in transit',
      'admin': 'In transit',
    },
    'DELIVERED': {
      'buyer': 'Delivered - confirm received',
      'seller': 'Delivered',
      'admin': 'Delivered',
    },
    'AWAITING_PICKUP': {
      'buyer': 'Ready for pickup',
      'seller': 'Awaiting buyer pickup',
      'admin': 'Awaiting pickup',
    },
    'PICKED_UP': {
      'buyer': 'Picked up',
      'seller': 'Picked up',
      'admin': 'Picked up',
    },
    'COMPLETED': {
      'buyer': 'Completed',
      'seller': 'Completed',
      'admin': 'Completed',
    },
    'CANCELLED': {
      'buyer': 'Cancelled',
      'seller': 'Cancelled',
      'admin': 'Cancelled',
    },
  };
  return map[n]?[perspective] ?? n.replaceAll('_', ' ');
}

/// Formats a UTC instant as the reference's EAT list stamp.
/// Formats a UTC instant as the reference's EAT list stamp.
class _EatStamp {
  static String format(DateTime utc) {
    final e = TimeUtils.toEat(utc);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    String two(int n) => n.toString().padLeft(2, '0');
    return '${e.day} ${months[e.month - 1]}, ${two(e.hour)}:${two(e.minute)}';
  }
}

/// FINANC-08 seller money-transparency totals: how the buyer's payment splits
/// between the seller's proceeds and GloboExpats' commission.
class SellerPricingTotals {
  final double sellerReceives;
  final double globoExpatsCut;
  const SellerPricingTotals({this.sellerReceives = 0, this.globoExpatsCut = 0});

  bool get isZero => sellerReceives <= 0 && globoExpatsCut <= 0;
}

/// Exact port of web orders/[id] `sellerPricing` reduce (FINANC-08): per item,
/// the stored per-unit `sellerPayout` is preferred; when absent, a
/// reverse-commission fallback is recomputed from the item's final selling
/// price (`finalTotalSellingPrice` > `price`) with the LIVE platform rates
/// (`currentCommissionRates` — cached platform-settings or the documented
/// defaults). GloboExpats' cut is the stored per-unit
/// `sellerFacingCommissionAmount` when present, else `final price − payout`.
/// Totals are per-unit amounts × quantity.
SellerPricingTotals computeSellerPricingTotals(List<OrderItem> items) {
  var sellerReceives = 0.0;
  var globoExpatsCut = 0.0;
  for (final item in items) {
    final qty = item.quantity < 1 ? 1 : item.quantity;
    final finalSellingPrice =
        (item.finalTotalSellingPrice?.toDouble() ?? item.price);
    final storedPayout = item.sellerPayout?.toDouble() ?? 0;
    final hasStoredPayout = storedPayout > 0;
    final sellerPayout = hasStoredPayout
        ? storedPayout
        : CommissionCalculator(rates: currentCommissionRates).payoutForPrice(
            finalSellingPrice,
            categoryCommissionRateFor(item.productCategory ?? 'Others'));
    final storedCut = item.sellerFacingCommissionAmount?.toDouble();
    final globo = (storedCut != null && storedCut >= 0)
        ? storedCut
        : (finalSellingPrice - sellerPayout).clamp(0, double.infinity);
    sellerReceives += sellerPayout * qty;
    globoExpatsCut += globo * qty;
  }
  return SellerPricingTotals(
      sellerReceives: sellerReceives, globoExpatsCut: globoExpatsCut);
}
