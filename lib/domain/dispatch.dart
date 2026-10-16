/// AU-038: seller availability gate + dispatch blocker explainers.
///
/// Contracts from BUYER_FLOW_SPEC §10 + the sandbox-proven endpoint map in
/// e2e/API_MAP.md (confirm-availability / decline-availability POST;
/// dispatch blockers arrive via `canDispatch`/`dispatchBlockers`).
library;

import 'delivery_windows.dart';
import 'time_utils.dart';

class DispatchBlockers {
  DispatchBlockers._();

  /// Short buyer/seller-facing explainer per backend blocker code
  /// (`DISPATCH_TOO_EARLY`, `NO_TRANSPORTER_ASSIGNED`, …).
  static const Map<String, String> copy = {
    'NOT_READY_FOR_DISPATCH': 'Order is not ready for dispatch yet',
    'ITEM_AVAILABILITY_UNRESOLVED': 'Item availability is still unresolved',
    'PRODUCTION_NOT_COMPLETE':
        'Mark production complete before assigning a transporter or dispatching this made-to-order item',
    'NO_TRANSPORTER_ASSIGNED': 'No transporter assigned to this order',
    'TRANSPORTER_INACTIVE': 'The assigned transporter is inactive',
    'TRANSPORT_MODE_MISMATCH':
        'Transport mode does not match the delivery setup',
    'DISPATCH_DETAILS_INCOMPLETE': 'Dispatch details are incomplete',
    'DISPATCH_TOO_EARLY':
        'Dispatch opens 1 hour before the delivery window starts',
  };

  /// Known codes get their copy; unknown codes pass through so a new backend
  /// blocker never renders as blank.
  static String? explainer(String? code) {
    if (code == null) return null;
    return copy[code] ?? code;
  }

  /// Full banner lines for a `dispatchBlockers[]` payload; empty list → null.
  static List<String> explainAll(List<dynamic> codes) => [
        for (final c in codes)
          if (c != null) explainer(c.toString()) ?? c.toString(),
      ];
}

class AvailabilityGate {
  AvailabilityGate._();

  /// Whether the seller gate banner should render for this order status.
  static bool shouldShow(String? orderStatus, {bool escrowPending = false}) =>
      !escrowPending && orderStatus == 'AWAITING_SELLER_CONFIRMATION';

  /// Decline requires a reason (backend PATCH decline-availability body).
  static String? validateDeclineReason(String? reason) =>
      (reason == null || reason.trim().isEmpty)
          ? 'Please give the buyer a short reason'
          : null;

  /// Buyer decision values for the AWAITING_BUYER_DECISION shortfall flow.
  static const proceedAvailable = 'PROCEED_AVAILABLE';
  static const cancelOrder = 'CANCEL_ORDER';
}

// ---------------------------------------------------------------------------
// Dispatch timing (Phase 3, port of the web `lib/order-delivery-deadline.ts`)
//
// The backend rejects an early dispatch with DISPATCH_TOO_EARLY, and this app
// only ever learned that AFTER the seller tapped and the request came back 409.
// The web works it out up front and shows when the button unlocks, so the
// seller waits deliberately instead of poking a button that keeps failing.
//
// The backend stays authoritative: these helpers only ever return a positive
// answer when the order's own window data proves it, and never block on
// missing or unparseable data.
// ---------------------------------------------------------------------------

/// Sellers may dispatch from one hour before the window opens (backend rule).
const Duration kDispatchAllowance = Duration(hours: 1);

/// Earliest buyer-selected window, falling back to the legacy single-window
/// fields — the web `getPrimaryDeliveryWindow`, including its snake_case
/// tolerance. `SELLER_HOURS` windows and server `startsAt`/`endsAt` overrides
/// are honored through [readOrderDeliveryWindows].
DeliveryWindow? primaryDeliveryWindow(Map<String, dynamic> order) {
  final windows = readOrderDeliveryWindows(order);
  if (windows.isNotEmpty) return windows.first;
  return legacyDeliveryWindow(order);
}

/// The instant dispatch unlocks, or null when the order carries no usable
/// window (in which case nothing is claimed and the backend decides).
///
/// Web parity `getDispatchOpensAt` (lib/order-delivery-deadline.ts:106-122):
/// the backend's own `dispatchOpensAt` is authoritative whenever present;
/// otherwise the allowance runs from the EARLIEST accepted window (not the
/// first-listed one), falling back to the legacy single-window fields.
DateTime? dispatchOpensAt(Map<String, dynamic> order) {
  final serverInstant =
      TimeUtils.tryParseBackendTimestamp(order['dispatchOpensAt']);
  if (serverInstant != null) return serverInstant;

  final windows = readOrderDeliveryWindows(order);
  if (windows.isNotEmpty) {
    var earliest = windows.first.startUtc;
    for (final w in windows.skip(1)) {
      final start = w.startUtc;
      if (start.isBefore(earliest)) earliest = start;
    }
    return earliest.subtract(kDispatchAllowance);
  }

  return legacyDeliveryWindow(order)?.startUtc.subtract(kDispatchAllowance);
}

/// True only when the window data positively proves it is too soon.
bool isDispatchTooEarlyLocally(Map<String, dynamic> order, {DateTime? now}) {
  final opensAt = dispatchOpensAt(order);
  if (opensAt == null) return false;
  return (now ?? DateTime.now().toUtc()).isBefore(opensAt);
}

/// Lock-state copy for the seller's order card: "Unlocks at 09:00 (45 min)",
/// or "Dispatch is available now" once the moment has passed. Null when the
/// order has no window to reason about.
String? dispatchUnlockLabel(Map<String, dynamic> order, {DateTime? now}) {
  final opensAt = dispatchOpensAt(order);
  if (opensAt == null) return null;

  final at = TimeUtils.toEat(opensAt);
  final clock =
      '${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}';
  final remaining = opensAt.difference(now ?? DateTime.now().toUtc());
  final minutes = (remaining.inMilliseconds / 60000).ceil();
  if (minutes <= 0) return 'Dispatch is available now';
  if (minutes < 60) return 'Unlocks at $clock ($minutes min)';

  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  return 'Unlocks at $clock (${hours}h${rest > 0 ? ' ${rest}m' : ''})';
}

/// Statuses where dispatch is still ahead of the order: the goods are with
/// the seller and a rider has not taken them yet.
///
/// Everything about dispatch — the unlock countdown, the blocker list, the
/// "too early to dispatch" explanation — only makes sense here. The backend
/// keeps returning those fields after the fact, so a COMPLETED order was
/// still being told it was too early to dispatch, months after it arrived.
const Set<String> kPreDispatchStatuses = {
  'PAID',
  'AWAITING_DELIVERY',
  'AWAITING_BUYER_CONFIRMATION',
  'SELLER_PREPARING_ORDER',
  'SCHEDULED',
  'READY_FOR_DISPATCH',
  'AWAITING_DISPATCH',
};

/// Whether dispatch guidance should be shown for an order in [status].
bool dispatchGuidanceApplies(String? status) => kPreDispatchStatuses.contains(
    (status ?? '').trim().toUpperCase().replaceAll(RegExp(r'[\s-]+'), '_'));
