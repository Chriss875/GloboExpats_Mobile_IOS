import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../models/order.dart';
import '../storage/kv_store.dart';
import 'dispatch_errors.dart';
import 'time_utils.dart';

/// AU-058: derived order-action feed — exact port of the web reference
/// `lib/order-notification-actions.ts` classifier. Pure functions so the
/// notifications feed and any banner agree on what is pending.

enum OrderActionType {
  paymentRequired,
  confirmAvailability,
  confirmDeliveryTime,
  confirmReceipt,
  viewDeliveryCode,
  viewRentalHandoffCode,
  markDelivered,
  markPickedUp,
  markPaid,
  assignTransporter,
  dispatchOrder,
  verifyDelivery,
  verifyRentalHandoff,
  rateBuyer,
  rateSeller,
}

class OrderActionDescriptor {
  final bool selling; // BUYING | SELLING perspective
  final OrderActionType actionType;
  final String title;
  final String description;
  final String actionLabel;
  const OrderActionDescriptor({
    required this.selling,
    required this.actionType,
    required this.title,
    required this.description,
    required this.actionLabel,
  });
}

bool _completed(String s) =>
    const {'COMPLETED', 'DELIVERED', 'PICKED_UP'}.contains(s);

/// Web parity `resolveOrderNotificationType`
/// (lib/order-notification-actions.ts:56-72): an explicit orderType/listType
/// wins; else the current viewer's id is matched against the order's
/// sellerId/buyerId; else the order is treated as buying.
bool _isSelling(Order o, String? currentUserId) {
  final explicit =
      (o.orderType?.trim().toLowerCase().isNotEmpty ?? false)
          ? o.orderType!.trim().toLowerCase()
          : (o.listType?.trim().toLowerCase() ?? '');
  if (explicit == 'selling') return true;
  if (explicit == 'buying') return false;
  final userId = currentUserId?.trim() ?? '';
  if (userId.isNotEmpty) {
    final seller = o.sellerId?.trim() ?? '';
    final buyer = o.buyerId?.trim() ?? '';
    if (seller.isNotEmpty && seller == userId) return true;
    if (buyer.isNotEmpty && buyer == userId) return false;
  }
  return false; // default buying, matching the reference
}

/// The single most relevant next action for an order from the given viewer's
/// perspective, or null when nothing needs doing (ratings excluded from the
/// buyer flow until terminal, per the reference decision tree).
OrderActionDescriptor? getOrderNotificationAction(Order o, {String? currentUserId}) {
  final selling = _isSelling(o, currentUserId);
  final status = o.normalizedStatus;
  final rental = o.rental;

  if (!selling) {
    if (status == 'AWAITING_PAYMENT' && !o.escrowPending) {
      return OrderActionDescriptor(
          selling: selling,
          actionType: OrderActionType.paymentRequired,
          title: 'Payment required: ${o.orderNumber}',
          description: 'Complete payment to keep your order moving.',
          actionLabel: 'Pay now');
    }
    if (status == 'AWAITING_BUYER_CONFIRMATION') {
      return OrderActionDescriptor(
          selling: selling,
          actionType: OrderActionType.confirmDeliveryTime,
          title: 'Confirm delivery time: ${o.orderNumber}',
          description: 'Review and confirm the delivery time proposed for your order.',
          actionLabel: 'Confirm time');
    }
    if (status == 'AWAITING_PICKUP' && rental != null) {
      return OrderActionDescriptor(
          selling: selling,
          actionType: OrderActionType.viewRentalHandoffCode,
          title: 'Rental handoff ready: ${o.orderNumber}',
          description:
              'Open the order and show the ${rental.isVehicle ? 'pickup' : 'check-in'} code at handoff.',
          actionLabel: 'View handoff code');
    }
    if (status == 'IN_TRANSIT') {
      return OrderActionDescriptor(
          selling: selling,
          actionType: OrderActionType.viewDeliveryCode,
          title: 'Delivery arriving: ${o.orderNumber}',
          description:
              'Open the order and share the delivery code only after your items arrive.',
          actionLabel: 'View delivery code');
    }
    if (status == 'PICKED_UP' || status == 'DELIVERED') {
      if (status == 'PICKED_UP' && rental != null) return null;
      return OrderActionDescriptor(
          selling: selling,
          actionType: OrderActionType.confirmReceipt,
          title: 'Confirm received: ${o.orderNumber}',
          description: 'Confirm that you received your items, then rate the seller.',
          actionLabel: 'Confirm received');
    }
    if (_completed(status) && o.buyerRated == false) {
      return OrderActionDescriptor(
          selling: selling,
          actionType: OrderActionType.rateSeller,
          title: 'Rate seller: ${o.orderNumber}',
          description: 'Share your experience with the seller.',
          actionLabel: 'Rate seller');
    }
    return null;
  }

  // SELLING perspective.
  if (status == 'AWAITING_SELLER_CONFIRMATION') {
    return OrderActionDescriptor(
        selling: selling,
        actionType: OrderActionType.confirmAvailability,
        title: 'New order - confirm availability: ${o.orderNumber}',
        description: 'Payment is secured. Confirm that the item is still available for delivery.',
        actionLabel: 'Confirm availability');
  }
  if (status == 'AWAITING_PAYMENT' || status == 'PENDING') {
    return OrderActionDescriptor(
        selling: selling,
        actionType: OrderActionType.markPaid,
        title: 'New order - mark paid: ${o.orderNumber}',
        description: 'A buyer placed an order. Confirm payment when it is received.',
        actionLabel: 'Mark paid');
  }
  if (status == 'PAID' || status == 'AWAITING_DELIVERY') {
    final sellerDelivery = o.fulfillmentType == 'SELLER_DELIVERY';
    return OrderActionDescriptor(
        selling: selling,
        actionType: sellerDelivery
            ? OrderActionType.assignTransporter
            : OrderActionType.markPickedUp,
        title: 'Payment confirmed - fulfill ${o.orderNumber}',
        description: sellerDelivery
            ? 'Payment is confirmed. Arrange transport and prepare the items for delivery.'
            : 'Payment is confirmed. Arrange pickup with the buyer.',
        actionLabel: sellerDelivery ? 'Arrange delivery' : 'Confirm pickup');
  }
  if (status == 'READY_FOR_DISPATCH' || status == 'AWAITING_DISPATCH') {
    if (o.canDispatch == false &&
        isDispatchTimingReason(o.dispatchBlockedReason)) {
      return null; // too early — don't nag the seller
    }
    if (o.canDispatch == false) {
      return OrderActionDescriptor(
          selling: selling,
          actionType: OrderActionType.assignTransporter,
          title: 'Delivery setup needs attention: ${o.orderNumber}',
          description:
              'Review the order and complete the missing delivery details before dispatch.',
          actionLabel: 'Review delivery');
    }
    return OrderActionDescriptor(
        selling: selling,
        actionType: OrderActionType.dispatchOrder,
        title: 'Ready to dispatch: ${o.orderNumber}',
        description: 'Dispatch the order after the transporter has received all items.',
        actionLabel: 'Dispatch items');
  }
  if (status == 'AWAITING_PICKUP') {
    if (rental != null) {
      return OrderActionDescriptor(
          selling: selling,
          actionType: OrderActionType.verifyRentalHandoff,
          title: 'Verify rental handoff: ${o.orderNumber}',
          description:
              "Enter the buyer's ${rental.isVehicle ? 'pickup' : 'check-in'} code after the handoff.",
          actionLabel: 'Verify handoff');
    }
    return OrderActionDescriptor(
        selling: selling,
        actionType: OrderActionType.markPickedUp,
        title: 'Waiting for pickup: ${o.orderNumber}',
        description: 'Mark the order as picked up after the handoff is complete.',
        actionLabel: 'Confirm pickup');
  }
  if (status == 'IN_TRANSIT') {
    return OrderActionDescriptor(
        selling: selling,
        actionType: OrderActionType.verifyDelivery,
        title: 'Confirm delivery: ${o.orderNumber}',
        description: "Enter the buyer's delivery code after the items have been handed over.",
        actionLabel: 'Confirm delivery');
  }
  if (_completed(status) && o.sellerRated == false) {
    return OrderActionDescriptor(
        selling: selling,
        actionType: OrderActionType.rateBuyer,
        title: 'Rate buyer: ${o.orderNumber}',
        description: 'Share your experience with the buyer.',
        actionLabel: 'Rate buyer');
  }
  return null;
}

// NOTE: the badge count lives on `PendingActionsStore` (see `total`,
// `sellingPending`, …) rather than in a standalone helper here. There used to
// be a second `pendingOrderActionCount` with its own rules — it counted
// ratings as work and dropped orders older than 30 days — which meant the bell
// and the strip could disagree about the same order. One definition, one place.



enum PendingActionSection { buyingOrders, buyingPayments, sellingOrders }

final ValueNotifier<int> pendingActionsRefreshSignal = ValueNotifier<int>(0);

void requestPendingActionsRefresh() {
  pendingActionsRefreshSignal.value++;
}

class PendingActionEntry {
  const PendingActionEntry({
    required this.id,
    required this.title,
    required this.description,
    required this.actionLabel,
    required this.route,
    required this.section,
    required this.urgent,
    required this.priority,
    required this.timestamp,
    this.orderId,
    this.deadline,
    String? bannerCta,
  }) : _bannerCta = bannerCta;

  final String id;
  final String title;
  final String description;

  /// A dispatched order's "Delivery arriving" reminder, whose strip button
  /// shows the delivery code.
  bool get isDeliveryCode =>
      id.endsWith(':${OrderActionType.viewDeliveryCode.name}');
  /// The full label, used where there is room for it — an order card's own
  /// button. The strip uses [bannerCta].
  final String actionLabel;

  final String? _bannerCta;

  /// The short, per-kind label the one-line strip shows.
  String get bannerCta => _bannerCta ?? actionLabel;

  final String route;
  final PendingActionSection section;
  final bool urgent;

  /// Lower sorts first — web parity `KIND_PRIORITY`
  /// (web lib/pending-action-alerts.ts:62). Ranking by kind rather than by
  /// age is deliberate: a rejected payment is the buyer's own money and
  /// outranks a fulfilment step no matter which is newer, and two orders of
  /// the same kind must not swap places between refreshes.
  final int priority;

  final DateTime timestamp;

  /// Set when this entry is an order step, so the order card carrying it can
  /// show its own badge. Null for payment entries.
  final String? orderId;

  /// When this step was supposed to be done by — the order's delivery
  /// deadline. Null for steps that have no clock (an unfinished payment sits
  /// on its own proforma expiry, which the checkout countdown already owns).
  final DateTime? deadline;

  /// True once [deadline] has passed. The step is still outstanding and still
  /// counted; what changes is how loudly the strip says it.
  bool isOverdueAt(DateTime now) =>
      deadline != null && now.toUtc().isAfter(deadline!);

  /// How far past [deadline] this step is, or null while it is still on time.
  Duration? overdueByAt(DateTime now) =>
      isOverdueAt(now) ? now.toUtc().difference(deadline!) : null;
}

/// Web parity `KIND_CTA` (pending-actions-banner.tsx): the strip's button
/// says what KIND of work this is, in two words, and is deliberately shorter
/// than the per-action label the order cards use. "Arrange delivery" and
/// "Assign rider" are the right words on a card that has room for them; on a
/// one-line strip they crowd out the title that says which order it is.
String pendingActionBannerCta(OrderActionType type) {
  switch (type) {
    case OrderActionType.paymentRequired:
      return 'Continue payment';
    case OrderActionType.confirmDeliveryTime:
      return 'Confirm time';
    case OrderActionType.confirmReceipt:
      return 'Confirm received';
    // The strip opens the code itself: it is what the buyer needs at the door.
    case OrderActionType.viewDeliveryCode:
      return 'Show code';
    case OrderActionType.viewRentalHandoffCode:
      return 'Track delivery';
    case OrderActionType.rateBuyer:
    case OrderActionType.rateSeller:
      return 'Rate';
    // Everything a seller has to fulfil shares one word, exactly as the web
    // groups them all under `seller_fulfillment`.
    case OrderActionType.confirmAvailability:
    case OrderActionType.markPaid:
    case OrderActionType.markDelivered:
    case OrderActionType.markPickedUp:
    case OrderActionType.assignTransporter:
    case OrderActionType.dispatchOrder:
    case OrderActionType.verifyDelivery:
    case OrderActionType.verifyRentalHandoff:
      return 'Open order';
  }
}

/// "3d", "5h", "20m" — the compact age the strip prints next to an overdue
/// step. Deliberately terse: it shares one line with the title and the CTA.
String formatPendingActionAge(Duration d) {
  if (d.inDays >= 1) return '${d.inDays}d';
  if (d.inHours >= 1) return '${d.inHours}h';
  if (d.inMinutes >= 1) return '${d.inMinutes}m';
  return 'now';
}

/// Web parity `KIND_PRIORITY` (web lib/pending-action-alerts.ts:62-70).
/// Ratings are absent because they are never an alert — nothing is blocked
/// while they stay outstanding.
int pendingActionPriority(OrderActionType type) {
  switch (type) {
    // buyer_payment_rejected: money, and a clock, both the user's own.
    case OrderActionType.confirmAvailability:
    case OrderActionType.markPaid:
    case OrderActionType.markDelivered:
    case OrderActionType.markPickedUp:
    case OrderActionType.assignTransporter:
    case OrderActionType.dispatchOrder:
    case OrderActionType.verifyDelivery:
    case OrderActionType.verifyRentalHandoff:
      return 1; // seller_fulfillment
    case OrderActionType.confirmReceipt:
      return 2; // buyer_confirm_receipt
    case OrderActionType.confirmDeliveryTime:
      return 4; // buyer_confirm_delivery_time
    case OrderActionType.viewDeliveryCode:
    case OrderActionType.viewRentalHandoffCode:
      return 5; // buyer_confirm_delivery
    case OrderActionType.paymentRequired:
      return 6; // buyer_payment_unfinished: the order is still parked safely
    case OrderActionType.rateBuyer:
    case OrderActionType.rateSeller:
      return 99; // never raised as an alert
  }
}

/// Web parity `isPendingActionDestination`
/// (web lib/pending-action-destination.ts).
///
/// True when [href] points at the page the user is already on. The banner uses
/// this to hide an alert whose destination is the current screen: it has
/// already delivered its CTA — the user is standing on the thing it is asking
/// for — and repeating it there is the nag that never clears.
///
/// Query parameters are matched one-way, exactly like the reference: every
/// parameter on the destination must match the current URL, but unrelated
/// parameters on the current URL are ignored (`tab=buying&sub=orders` still
/// matches a destination of `tab=buying`).
bool isPendingActionDestination(
  String href,
  String pathname,
  Map<String, String> query,
) {
  final destination = Uri.tryParse(href);
  if (destination == null) return false;

  String trimTrailingSlash(String path) =>
      path.length > 1 && path.endsWith('/')
          ? path.substring(0, path.length - 1)
          : path;

  final destinationPath = trimTrailingSlash(destination.path);
  final currentPath = trimTrailingSlash(pathname);
  if (destinationPath != currentPath) return false;

  // A newly created invoice is displayed at /checkout without the resume
  // query, so a bare /checkout counts as being on the destination.
  if (currentPath == '/checkout' && !query.containsKey('proforma')) return true;

  for (final entry in destination.queryParameters.entries) {
    if (query[entry.key] != entry.value) return false;
  }
  return true;
}

/// A listing whose delivery setup is unfinished, so buyers cannot see it
/// (web `needsLogisticsConfirmation`). The explicit `deliverySetupReady`
/// flag wins when the backend sends one; otherwise the two source fields
/// have to say the seller really pinned a pickup point and picked a vehicle.
/// Archived and rejected listings are not the seller's delivery problem.
bool listingNeedsDeliveryFix(Map<String, dynamic> p) {
  final status = '${p['productStatus'] ?? p['status'] ?? ''}'.toUpperCase();
  final availability = '${p['availabilityStatus'] ?? ''}'.toUpperCase();
  if (status == 'ARCHIVED' ||
      availability == 'ARCHIVED' ||
      status == 'REJECTED' ||
      status == 'UNAPPROVED') {
    return false;
  }
  final issues = p['deliverySetupIssues'];
  final issueCount = issues is List ? issues.length : 0;
  final ready = p['deliverySetupReady'];
  if (ready == false || issueCount > 0) return true;
  if (ready == true) return false;
  final coordSource = p['coordinatesSource'] as String?;
  final modeSource = p['transportModeSource'] as String?;
  if (coordSource == null && modeSource == null) return false;
  return coordSource != 'PINNED' || modeSource != 'SELLER_SELECTED';
}

/// One authoritative pending-work state shared by the shell and MySpace.
/// Entries are derived from live workflow state; they cannot be dismissed or
/// manually completed. When an order/payment transition succeeds, refresh()
/// replaces the snapshot and the resolved entry naturally disappears.
/// A dispatched order's delivery code, as the buyer hands it to the driver.
class DeliveryCodeEntry {
  const DeliveryCodeEntry({
    required this.orderId,
    required this.orderNumber,
    required this.code,
    this.itemsLabel,
    this.sellerName,
  });

  final String orderId;
  final String orderNumber;
  final String code;

  /// "Beef T-Bone" or "Beef T-Bone + 2 more".
  final String? itemsLabel;
  final String? sellerName;

  String get route => '/orders/${Uri.encodeComponent(orderId)}';

  /// The buyer's IN_TRANSIT orders that carry a code. The backend only sends
  /// `deliveryCode` to the buyer, and only while the order is on its way.
  static List<DeliveryCodeEntry> fromOrders(Iterable<Order> orders) => [
        for (final o in orders)
          if (!o.isSelling &&
              o.normalizedStatus == 'IN_TRANSIT' &&
              (o.deliveryCode ?? '').isNotEmpty)
            DeliveryCodeEntry(
              orderId: o.orderId,
              orderNumber: o.orderNumber,
              code: o.deliveryCode!,
              itemsLabel: o.items.isEmpty
                  ? null
                  : o.items.length == 1
                      ? o.items.first.productName
                      : '${o.items.first.productName} + ${o.items.length - 1} more',
              sellerName: o.sellerName,
            ),
      ];

  String get _key => '$orderId:$code';
}

class PendingActionsStore extends ChangeNotifier {
  PendingActionsStore._();
  static final instance = PendingActionsStore._();

  /// Codes for every order currently on its way to this buyer — the strip
  /// under the top bar shows them from its "Delivery arriving" reminder.
  List<DeliveryCodeEntry> _deliveryCodes = const [];
  List<DeliveryCodeEntry> get deliveryCodes => _deliveryCodes;

  DeliveryCodeEntry? deliveryCodeFor(String? orderId) {
    for (final c in _deliveryCodes) {
      if (c.orderId == orderId) return c;
    }
    return null;
  }

  List<PendingActionEntry> _entries = const [];
  List<PendingActionEntry> get entries => _entries;
  PendingActionEntry? get latest => _entries.isEmpty ? null : _entries.first;

  int countFor(PendingActionSection section) =>
      _entries.where((entry) => entry.section == section).length;
  int get sellingPending => countFor(PendingActionSection.sellingOrders);
  int get buyingOrdersPending => countFor(PendingActionSection.buyingOrders);
  int get buyingPaymentsPending => countFor(PendingActionSection.buyingPayments);
  int get buyingPending => buyingOrdersPending + buyingPaymentsPending;
  int get total => sellingPending + buyingPending;

  /// The outstanding step for one order, or null when nothing is waiting on
  /// the viewer for it. Drives the badge on that order's own card — the
  /// deepest level of the same cascade the tabs and the bell read from.
  PendingActionEntry? forOrder(String orderId) {
    for (final entry in _entries) {
      if (entry.orderId == orderId) return entry;
    }
    return null;
  }

  /// How many steps one order is still waiting on the viewer for. Zero once
  /// the order has advanced past its last outstanding step.
  int countForOrder(String orderId) =>
      _entries.where((entry) => entry.orderId == orderId).length;

  /// Web parity (`pending-actions-banner.tsx` `visibleAlerts`): the entries
  /// worth interrupting the user with *right now* — every outstanding action
  /// except the ones whose destination is the screen they are already on, and
  /// the ones the user has put down for a while.
  ///
  /// The counts behind the badges deliberately do NOT use this: the badge
  /// answers "how much work is outstanding", the banner answers "what should
  /// I do next from here". Snoozing therefore quiets the interruption without
  /// ever hiding the work.
  /// [pathname] is null when the shell is pumped outside a router, in which
  /// case nothing is suppressed for being the current destination — but the
  /// snooze still applies, because putting a step down is about the step, not
  /// about where the user happens to be standing.
  List<PendingActionEntry> visibleFor(
    String? pathname,
    Map<String, String> query,
  ) {
    final now = DateTime.now();
    return _entries
        .where((entry) =>
            !_isSnoozed(entry.id, now) &&
            (pathname == null ||
                !isPendingActionDestination(entry.route, pathname, query)))
        .toList();
  }

  /// How long a put-down step stays quiet. Long enough that it stops being
  /// noise on this session's every screen, short enough that real work cannot
  /// be snoozed out of sight for a day.
  static const snoozeDuration = Duration(hours: 8);

  static const _snoozeKey = 'pending_action_snoozes';
  Map<String, DateTime>? _snoozes;

  Map<String, DateTime> get _snoozeMap {
    if (_snoozes != null) return _snoozes!;
    final raw = KvStore.instance.getString(_snoozeKey);
    final out = <String, DateTime>{};
    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map) {
          decoded.forEach((key, value) {
            final at = DateTime.tryParse('$value');
            if (at != null) out['$key'] = at;
          });
        }
      } catch (_) {
        // A corrupt blob just means nothing is snoozed.
      }
    }
    return _snoozes = out;
  }

  bool _isSnoozed(String id, DateTime now) {
    final until = _snoozeMap[id];
    return until != null && now.isBefore(until);
  }

  /// Puts one step's banner down until [snoozeDuration] from now. The entry
  /// stays in [entries] and in every count.
  void snooze(String id, {DateTime? now}) {
    final at = now ?? DateTime.now();
    final map = Map<String, DateTime>.from(_snoozeMap)
      ..[id] = at.add(snoozeDuration)
      // Expired rows would otherwise accumulate forever.
      ..removeWhere((_, until) => until.isBefore(at));
    _snoozes = map;
    KvStore.instance.setString(
        _snoozeKey,
        jsonEncode(
            map.map((key, value) => MapEntry(key, value.toIso8601String()))));
    notifyListeners();
  }

  @visibleForTesting
  void clearSnoozes() {
    _snoozes = <String, DateTime>{};
    KvStore.instance.setString(_snoozeKey, '');
  }

  /// My Listings with the "Needs attention" filter on — where a seller
  /// fixes the listings buyers cannot see.
  static const listingsAttentionRoute =
      '/expat/dashboard?tab=selling&sub=listings&listingFilter=attention';

  void replace({
    required List<Order> orders,
    required List<Map<String, dynamic>> payments,
    String? currentUserId,
    List<Map<String, dynamic>> listings = const [],
  }) {
    final codes = DeliveryCodeEntry.fromOrders(orders);
    final codesChanged = !listEquals(_deliveryCodes.map((c) => c._key).toList(),
        codes.map((c) => c._key).toList());
    _deliveryCodes = List.unmodifiable(codes);
    final next = <PendingActionEntry>[];
    for (final order in orders) {
      final action = getOrderNotificationAction(order, currentUserId: currentUserId);
      if (action == null ||
          action.actionType == OrderActionType.rateBuyer ||
          action.actionType == OrderActionType.rateSeller) {
        continue;
      }
      final stamp = TimeUtils.tryParseBackendTimestamp(order.createdAt ?? order.orderDate) ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
      next.add(PendingActionEntry(
        id: 'order:${order.orderId}:${action.actionType.name}',
        title: action.title,
        description: action.description,
        actionLabel: action.actionLabel,
        route: '/orders/${Uri.encodeComponent(order.orderId)}',
        section: action.selling
            ? PendingActionSection.sellingOrders
            : PendingActionSection.buyingOrders,
        urgent: action.actionType != OrderActionType.viewDeliveryCode &&
            action.actionType != OrderActionType.viewRentalHandoffCode,
        priority: pendingActionPriority(action.actionType),
        timestamp: stamp,
        orderId: order.orderId,
        deadline: order.deliveryDeadlineUtc,
        bannerCta: pendingActionBannerCta(action.actionType),
      ));
    }

    for (final payment in payments) {
      final state = _paymentActionState(payment);
      if (state == null) continue;
      final proformaId = (payment['proformaId'] ?? '').toString();
      final number = (payment['proformaNumber'] ?? 'Your invoice').toString();
      final stamp = TimeUtils.tryParseBackendTimestamp(
              payment['submittedAt'] ?? payment['createdAt']) ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
      final rejected = state == PaymentActionState.updateRequired;
      next.add(PendingActionEntry(
        id: 'payment:$proformaId:$state',
        title: rejected ? 'Payment update required' : 'You have an unfinished payment',
        description: rejected
            ? '$number was rejected. Reopen it and update your proof within 48 hours.'
            : '$number is still active. Continue where you left off.',
        actionLabel: rejected ? 'Update payment' : 'Continue payment',
        route: rejected
            ? '/expat/dashboard?tab=buying&sub=payments&paymentStatus=rejected'
            : '/checkout?proforma=${Uri.encodeQueryComponent(proformaId)}',
        section: PendingActionSection.buyingPayments,
        urgent: rejected,
        // buyer_payment_rejected sorts above everything; an unfinished
        // payment below every order step, exactly as the web ranks them.
        priority: rejected ? 0 : 6,
        timestamp: stamp,
      ));
    }

    // Listings hidden from buyers because their pickup pin or vehicle is
    // missing. The backend hides them from everyone but the seller, so
    // without this a seller only found out by opening My Listings.
    final hidden = listings.where(listingNeedsDeliveryFix).length;
    if (hidden > 0) {
      next.add(PendingActionEntry(
        id: 'listings:delivery-setup',
        title: hidden == 1
            ? '1 listing is hidden from buyers'
            : '$hidden listings are hidden from buyers',
        description: 'Add the pickup pin and delivery vehicle so buyers can '
            'see and order ${hidden == 1 ? 'it' : 'them'}.',
        actionLabel: 'Fix listings',
        bannerCta: 'Fix',
        route: listingsAttentionRoute,
        section: PendingActionSection.sellingOrders,
        urgent: true,
        priority: 3,
        timestamp: DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      ));
    }

    final now = DateTime.now().toUtc();
    next.sort((a, b) {
      if (a.priority != b.priority) return a.priority - b.priority;
      // Within a kind, the one that has already slipped goes first: the strip
      // shows a single entry, so it should be the one that slipped rather
      // than whichever happens to be newest.
      final overdue = a.isOverdueAt(now) == b.isOverdueAt(now)
          ? 0
          : (a.isOverdueAt(now) ? -1 : 1);
      if (overdue != 0) return overdue;
      return b.timestamp.compareTo(a.timestamp);
    });
    if (listEquals(_entries.map((e) => e.id).toList(), next.map((e) => e.id).toList())) {
      _entries = next;
      if (codesChanged) notifyListeners();
      return;
    }
    _entries = List.unmodifiable(next);
    notifyListeners();
  }

  void clear() {
    if (_entries.isEmpty && _deliveryCodes.isEmpty) return;
    _entries = const [];
    _deliveryCodes = const [];
    notifyListeners();
  }
}

/// Web parity `getBuyerPaymentRecoveryState`
/// (web lib/buyer-payment-recovery.ts). Returns the two states that raise an
/// alert, or null when the payment raises none.
///
/// The branch order is the load-bearing part, exactly as on the web: a
/// replacement SUBMITTED receipt outranks an older REJECTED one, because the
/// backend keeps the rejected row as audit history — checking REJECTED first
/// would keep a corrected payment stuck in "Action needed" forever.
///
/// [updateRequired] = the 48-hour rejection window; [unfinished] = the
/// proforma is still live. Everything else (verified, under review, expired,
/// cancelled) is either done or in someone else's hands, so it stays quiet.
enum PaymentActionState { updateRequired, unfinished }

PaymentActionState? _paymentActionState(Map<String, dynamic> payment) {
  String norm(Object? value) => (value ?? '').toString().trim().toUpperCase();
  final status = norm(payment['status']);
  final receipts = payment['receipts'];
  final receiptStatuses = (receipts is List ? receipts : const [])
      .whereType<Map>()
      .map((row) => norm(row['status']))
      .toList();

  if (status == 'CONFIRMED' || status == 'VERIFIED') return null;
  if (status == 'EXPIRED' || status == 'CANCELLED') return null;
  if (receiptStatuses.contains('SUBMITTED')) return null; // under review
  if (status == 'REJECTED' || receiptStatuses.contains('REJECTED')) {
    return PaymentActionState.updateRequired;
  }
  if (const {
    'PAYMENT_SUBMITTED',
    'SUBMITTED',
    'PENDING_VERIFICATION',
    'UNDER_REVIEW',
  }.contains(status)) {
    return null; // under review
  }
  // Web's fallback: a live proforma with no other verdict is simply unpaid.
  return PaymentActionState.unfinished;
}
