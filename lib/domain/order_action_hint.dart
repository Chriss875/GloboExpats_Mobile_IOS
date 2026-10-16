/// What the buyer or seller should do next about an order — port of the web
/// `getOrderActionHint` in `lib/order-status.ts`.
///
/// The status label says where the order *is*; this says what the person
/// looking at it is meant to *do*. Mobile showed only the label, so an order
/// sitting on the other party gave no clue whether it was waiting on you.
library;

import 'dispatch_errors.dart';

/// Colour/intent of a hint. `action` means the CTA is the next step,
/// `warning` means something is wrong, `info` means simply wait.
enum HintTone { info, action, warning, success }

class OrderActionHint {
  /// One sentence in the reader's own terms.
  final String label;

  /// Button copy, or null when there is nothing to press.
  final String? cta;

  /// Whether the CTA should actually do something now.
  final bool actionable;

  /// A CTA that is shown but greyed: the dispatch button while the delivery
  /// window is still closed, where hiding it would read as "something is
  /// broken" rather than "not yet".
  final bool disabled;

  final HintTone tone;

  const OrderActionHint({
    required this.label,
    this.cta,
    this.actionable = false,
    this.disabled = false,
    this.tone = HintTone.info,
  });
}

/// [canDispatch] is the backend flag: only an explicit `false` withholds the
/// dispatch CTA, so a backend that omits it cannot silently strip the button.
OrderActionHint? getOrderActionHint(
  String? status,
  String role, {
  String? fulfillmentType,
  bool? canDispatch,
  String? dispatchBlockedReason,
}) {
  // Same rule as `normalizeOrderStatus` in models/order.dart, which callers
  // normally apply already (`order.normalizedStatus`). Repeated rather than
  // imported because models depends on domain, not the other way round.
  final raw = (status ?? '').trim();
  final s = raw.isEmpty
      ? 'UNKNOWN'
      : () {
          final up = raw.toUpperCase().replaceAll(RegExp(r'[\s-]+'), '_');
          return up == 'CONFIRMED' ? 'COMPLETED' : up;
        }();
  final isPickup = (fulfillmentType ?? '').toUpperCase() == 'BUYER_PICKUP';

  if (role == 'seller') {
    switch (s) {
      // v2 escrow: GloboExpats verifies payment, never the seller — returning
      // a hint here also suppresses the legacy "Mark Paid" button.
      case 'PENDING':
      case 'AWAITING_PAYMENT':
        return const OrderActionHint(
          label: "GloboExpats is verifying the buyer's payment - no action needed yet.",
        );
      case 'AWAITING_SELLER_CONFIRMATION':
        return const OrderActionHint(
          label: 'Confirm you still have this item so it can be delivered.',
          cta: 'Confirm availability',
          actionable: true,
          tone: HintTone.action,
        );
      // Web keeps all four "seller owes a rider" statuses on ONE branch with
      // ONE CTA. Mobile used to split READY_FOR_DISPATCH/AWAITING_DISPATCH
      // into a second "Dispatch items" case and call PAID "Assign driver", so
      // an order's progress and its button spoke two different vocabularies —
      // neither of them the web's.
      case 'PAID':
      case 'AWAITING_DELIVERY':
      case 'READY_FOR_DISPATCH':
      case 'AWAITING_DISPATCH':
        // Timing is a temporary lock, so keep the action visible but greyed.
        // Other blockers withhold it until the seller resolves them.
        if (canDispatch == false && !isPickup) {
          final timingLocked = isDispatchTimingReason(dispatchBlockedReason);
          return OrderActionHint(
            label: getDispatchBlockedMessage(dispatchBlockedReason) ??
                'Complete delivery setup before assigning a rider.',
            cta: timingLocked ? 'Assign rider' : null,
            disabled: true,
            tone: timingLocked ? HintTone.info : HintTone.warning,
          );
        }
        return isPickup
            ? const OrderActionHint(label: 'Waiting for the buyer to pick up.')
            : const OrderActionHint(
                label: 'Assign a rider to start delivery.',
                cta: 'Assign rider',
                actionable: true,
                tone: HintTone.action,
              );
      case 'AWAITING_BUYER_CONFIRMATION':
        return const OrderActionHint(
          label: 'Waiting for the buyer to confirm the delivery time.',
        );
      case 'IN_TRANSIT':
        return const OrderActionHint(
          label: "Out for delivery - enter the buyer's code once handed over.",
          cta: 'Confirm delivery',
          actionable: true,
          tone: HintTone.action,
        );
      case 'DELIVERED':
        return const OrderActionHint(
          label: 'Delivered. Waiting for the buyer to rate and complete the order.',
          tone: HintTone.success,
        );
      default:
        return null;
    }
  }

  // Buyer perspective
  switch (s) {
    case 'PENDING':
    case 'AWAITING_PAYMENT':
      return const OrderActionHint(
        label: 'Payment submitted - GloboExpats is verifying it and will notify you.',
      );
    case 'AWAITING_SELLER_CONFIRMATION':
      return const OrderActionHint(
        label: 'Payment confirmed. Waiting for the seller to confirm your item.',
      );
    case 'PAID':
    case 'AWAITING_DELIVERY':
    case 'READY_FOR_DISPATCH':
    case 'AWAITING_DISPATCH':
      return OrderActionHint(
        label: isPickup
            ? 'Your item is being prepared for pickup.'
            : 'The seller is preparing your delivery.',
      );
    case 'AWAITING_BUYER_CONFIRMATION':
      return const OrderActionHint(
        label: 'The seller proposed a delivery time - confirm it works for you.',
        cta: 'Confirm delivery time',
        actionable: true,
        tone: HintTone.action,
      );
    case 'IN_TRANSIT':
      return const OrderActionHint(
        label: 'Out for delivery. Share your code with the driver when your items arrive.',
        cta: 'View delivery code',
        actionable: true,
        tone: HintTone.action,
      );
    case 'AWAITING_PICKUP':
      return const OrderActionHint(
        label: 'Ready for pickup at the agreed location.',
      );
    case 'DELIVERED':
      // Reaching DELIVERED means the buyer already confirmed physical receipt
      // (delivery code, or "I received the items"), so what is left is rating
      // the seller — the same action that completes the order.
      return const OrderActionHint(
        label: 'Delivered! Rate the seller to complete your order.',
        cta: 'Rate Seller',
        actionable: true,
        tone: HintTone.action,
      );
    case 'PICKED_UP':
      return const OrderActionHint(
        label: 'Received your items? Confirm to complete the order.',
        cta: 'Confirm received',
        actionable: true,
        tone: HintTone.action,
      );
    default:
      return null;
  }
}
