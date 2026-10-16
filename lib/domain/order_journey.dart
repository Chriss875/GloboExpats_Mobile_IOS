/// The order progress rail — web `buyerJourneySteps` / `sellerJourneySteps`
/// (`app/expat/dashboard/page.tsx` for the list card,
/// `app/orders/[id]/page.tsx` for the "Order tracking" section).
///
/// One definition serves both surfaces on purpose. Mobile used to show the
/// four-step journey on the order card and a six-step lifecycle timeline
/// under "Order tracking" inside the order, so the same order appeared to be
/// on two different journeys depending on where you looked at it. The desktop
/// puts THIS rail under "Order tracking"; the six-step timeline is a separate
/// block further down the page.
library;

enum OrderJourneyStage { payment, confirm, preparing, handover, arrived }

class OrderJourneyStep {
  final OrderJourneyStage stage;
  final String label;

  /// One line of explanation under the label. The desktop shows it inside the
  /// order and omits it on the card.
  final String? detail;
  const OrderJourneyStep(this.stage, this.label, [this.detail]);
}

class OrderJourney {
  final List<OrderJourneyStep> steps;
  final int index;
  final bool cancelled;
  const OrderJourney(
      {required this.steps, required this.index, required this.cancelled});

  OrderJourneyStep get current => steps[index.clamp(0, steps.length - 1)];
}

const _cancelled = {'CANCELLED', 'FAILED', 'EXPIRED'};
const _finished = {'COMPLETED', 'DELIVERED', 'PICKED_UP'};

/// Statuses where the goods are still with the seller: a transporter may be
/// assigned or scheduled, but nothing has left yet (web's shared comment on
/// both milestone helpers).
const _withSeller = {
  'AWAITING_DELIVERY',
  'AWAITING_PICKUP',
  'SELLER_PREPARING_ORDER',
  'AWAITING_BUYER_CONFIRMATION',
  'SCHEDULED',
  'READY_FOR_DISPATCH',
  'AWAITING_DISPATCH',
};

/// How far along the journey [status] is, counted in BUYER steps
/// (0 = seller confirms … 3 = delivered). The seller's card rail adds
/// "Payment secured" in front, so its index is this plus one.
int _buyerStageIndex(String status) {
  if (_finished.contains(status)) return 3;
  if (status == 'IN_TRANSIT') return 2;
  if (_withSeller.contains(status)) return 1;
  return 0;
}

int _sellerCardIndex(String status) {
  if (_finished.contains(status)) return 4;
  if (status == 'IN_TRANSIT') return 3;
  if (_withSeller.contains(status) || status == 'PAID') return 2;
  if (const {'PENDING', 'AWAITING_PAYMENT'}.contains(status)) return 0;
  return 1;
}

/// Builds the rail for one order.
///
/// [detailed] is the inside-the-order variant: the desktop adds a line of
/// explanation under each step there, names the pickup stages "Ready for
/// collection" / "Collected", and drops the seller's "Payment secured" step
/// (by the time a sale has its own page, it is paid).
OrderJourney buildOrderJourney({
  required String status,
  required bool selling,
  required bool pickup,
  bool detailed = false,
  String? transporterName,
  bool productionAwaitingCompletion = false,
  String? deliveryWindowLabel,
}) {
  final s = status.trim().toUpperCase();
  final cancelled = _cancelled.contains(s);
  final withPaymentStep = selling && !detailed;
  // The seller's rail is its own sequence — a paid order is already
  // "Preparing order" to the seller while the buyer is still waiting on the
  // confirmation. Dropping the payment step on the order page shifts the
  // index by exactly one; it never changes which real stage is current.
  final index = selling
      ? (withPaymentStep ? _sellerCardIndex(s) : _sellerCardIndex(s) - 1)
          .clamp(0, 4)
      : _buyerStageIndex(s);

  String? detail(OrderJourneyStage stage) {
    if (!detailed) return null;
    switch (stage) {
      case OrderJourneyStage.payment:
        return null;
      case OrderJourneyStage.confirm:
        if (selling) {
          return index > 0
              ? 'You confirmed the item is available'
              : 'Confirm the item before preparing it';
        }
        return index > 0
            ? 'Seller confirmed your item is available'
            : 'Waiting for the seller to confirm the item';
      case OrderJourneyStage.preparing:
        if (selling) {
          return productionAwaitingCompletion
              ? 'Finish making or preparing the item'
              : 'Prepare the complete order for handover';
        }
        return productionAwaitingCompletion
            ? 'The seller is making your item'
            : 'The seller is preparing your order';
      case OrderJourneyStage.handover:
        if (pickup) {
          return selling
              ? 'Keep the order ready for the buyer'
              : 'Your item is packed and waiting for you';
        }
        if (selling) {
          return transporterName != null && transporterName.trim().isNotEmpty
              ? '${transporterName.trim()} is taking it to the buyer'
              : 'The transporter is taking it to the buyer';
        }
        return transporterName != null && transporterName.trim().isNotEmpty
            ? '${transporterName.trim()} is bringing your order'
            : 'Your order is travelling to you';
      case OrderJourneyStage.arrived:
        if (pickup) {
          return selling
              ? 'The buyer collected the order'
              : 'You have picked up your order';
        }
        if (selling) return 'The buyer received the order';
        final window = deliveryWindowLabel?.trim();
        return (window != null && window.isNotEmpty)
            ? window
            : 'Your order has arrived';
    }
  }

  // The card keeps "Out for delivery" / "Delivered" for a pickup order and
  // only swaps the icon (web `getBuyerOrderTransport`); the detail page uses
  // the pickup wording.
  final handoverLabel =
      detailed && pickup ? 'Ready for collection' : 'Out for delivery';
  final arrivedLabel = detailed && pickup ? 'Collected' : 'Delivered';

  return OrderJourney(
    cancelled: cancelled,
    index: index,
    steps: [
      if (withPaymentStep)
        OrderJourneyStep(OrderJourneyStage.payment, 'Payment secured'),
      OrderJourneyStep(OrderJourneyStage.confirm, 'Seller confirms',
          detail(OrderJourneyStage.confirm)),
      OrderJourneyStep(OrderJourneyStage.preparing, 'Preparing order',
          detail(OrderJourneyStage.preparing)),
      OrderJourneyStep(OrderJourneyStage.handover, handoverLabel,
          detail(OrderJourneyStage.handover)),
      OrderJourneyStep(OrderJourneyStage.arrived, arrivedLabel,
          detail(OrderJourneyStage.arrived)),
    ],
  );
}
