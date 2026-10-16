/// AU-038: dispatch preconditions — exact port of the web reference
/// `lib/dispatch-errors.ts`. The same backend evaluator powers
/// `dispatchBlockedReason` on the order (why the button is withheld) and the
/// 409 body when a dispatch attempt is rejected. Match on the CODE, never the
/// HTTP status — every rejection is a 409.
library;

const String _kNotReady = 'NOT_READY_FOR_DISPATCH';
const String _kAvailability = 'ITEM_AVAILABILITY_UNRESOLVED';
const String _kProduction = 'PRODUCTION_NOT_COMPLETE';
const String _kNoTransporter = 'NO_TRANSPORTER_ASSIGNED';
const String _kTransporterInactive = 'TRANSPORTER_INACTIVE';
const String _kModeMismatch = 'TRANSPORT_MODE_MISMATCH';
const String _kDetailsIncomplete = 'DISPATCH_DETAILS_INCOMPLETE';
const String _kTooEarly = 'DISPATCH_TOO_EARLY';

const Map<String, String> kDispatchErrorMessages = {
  _kNotReady: 'This order is not ready to dispatch yet.',
  _kAvailability:
      "An item on this order is short and still waiting on the buyer's decision. Dispatch becomes available once availability is resolved.",
  _kProduction:
      'Mark production complete before assigning a transporter or dispatching this made-to-order item.',
  _kNoTransporter:
      'No transporter is assigned to this order. Assign a transporter before dispatching.',
  _kTransporterInactive:
      'The assigned transporter is inactive. Assign an active transporter before dispatching.',
  _kModeMismatch:
      'The assigned vehicle cannot carry these items. Reassign a transporter with a compatible vehicle.',
  // Destination pin / delivery fee only — a missing transport mode is
  // TRANSPORT_MODE_MISMATCH, not this code.
  _kDetailsIncomplete:
      'This order is missing delivery destination details - the destination map pin or the delivery fee. These need to be fixed on the order before it can be dispatched.',
  _kTooEarly:
      "It is too early to dispatch this order. You can dispatch from one hour before the buyer's delivery window starts - no changes needed, just wait.",
};

bool _isKnownReason(String? value) =>
    value != null && kDispatchErrorMessages.containsKey(value);

/// Message for a rejected dispatch attempt (409 body `code`). Falls back to
/// the raw message when the code is unknown.
String getDispatchFailureMessage(String? errorCode, String fallbackMessage) =>
    _isKnownReason(errorCode)
        ? kDispatchErrorMessages[errorCode]!
        : fallbackMessage;

/// Message for the backend's `dispatchBlockedReason`, or null when the reason
/// is unknown/absent (nothing shown rather than a raw enum).
String? getDispatchBlockedMessage(String? reason) =>
    _isKnownReason(reason) ? kDispatchErrorMessages[reason] : null;

/// True when the seller only needs to WAIT, not fix anything.
bool isDispatchTimingReason(String? reason) => reason == _kTooEarly;

/// Messages for every entry of the backend's `dispatchBlockers[]` array — all
/// current blockers at once, so the seller can clear them in one pass instead
/// of discovering the next one after each retry. Unknown codes are skipped.
List<String> getDispatchBlockerMessages(List<dynamic>? blockers) {
  if (blockers == null) return const [];
  return [
    for (final b in blockers)
      if (_isKnownReason(b is Map ? (b['reason'] ?? b['code'])?.toString() : b?.toString()))
        kDispatchErrorMessages[(b is Map
                ? (b['reason'] ?? b['code'])
                : b)!
            .toString()]!,
  ];
}
