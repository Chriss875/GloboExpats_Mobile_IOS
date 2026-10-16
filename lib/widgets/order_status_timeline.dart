import 'package:flutter/material.dart';

import '../domain/production_time.dart';
import '../models/order.dart';
import '../theme.dart';
import 'delivery_journey.dart';

/// Visual progress tracker for an order's lifecycle — shown identically to the
/// buyer and the seller on the order detail so both sides see where the order
/// stands, not just a status badge.
///
/// Port of `components/orders/order-status-timeline.tsx` (AU-035): delivery vs
/// pickup vs rental step sequences, role wording, DELIVERED reads done while
/// COMPLETED is still pending, and CONFIRMED normalizes to COMPLETED.
class OrderStatusTimeline extends StatelessWidget {
  final String status;

  /// 'SELLER_DELIVERY' | 'BUYER_PICKUP' — decides which step sequence shows.
  final String? fulfillmentType;

  /// Whose wording to use for the role-specific steps.
  final String perspective;

  /// Rental presentation when any order item carries a booking.
  final RentalPresentation? rental;

  /// Made-to-order preparation (web `ProductionTimingSource`). When set with
  /// `productionTimeDays > 0`, a "Production · N day(s)" step is spliced
  /// between the seller-confirm step and the arrange/ready step — and while
  /// production is still outstanding that step is the one shown in progress
  /// (ORDERS-13 / web order-status-timeline.tsx).
  final ProductionSource? production;

  const OrderStatusTimeline({
    super.key,
    required this.status,
    this.fulfillmentType,
    this.perspective = 'buyer',
    this.rental,
    this.production,
  });

  static const _placedStatuses = [
    'PENDING', 'AWAITING_PAYMENT', 'PAID', 'PAYMENT_HELD_IN_ESCROW',
  ];

  List<_StepDef> get _steps {
    final base = _baseSteps();
    final days = production?.productionTimeDays;
    // Made-to-order (web order-status-timeline.tsx): splice a production step
    // after "placed" and "seller confirms", before arranging delivery. The step
    // never matches a status — the current marker is set explicitly while the
    // order is awaiting production. Rentals and ordinary items are untouched.
    if (rental != null || days == null || days <= 0) return base;
    return <_StepDef>[
      ...base.sublist(0, 2),
      _StepDef(
        key: 'production',
        label: 'Production · $days ${days == 1 ? 'day' : 'days'}',
        statuses: const [],
      ),
      ...base.sublist(2),
    ];
  }

  List<_StepDef> _baseSteps() {
    if (rental != null) return _rentalSteps();
    final delivery = (fulfillmentType ?? '').toUpperCase() == 'SELLER_DELIVERY';
    if (delivery) return _deliverySteps();
    return _pickupSteps();
  }

  // Logistics v2 delivery lifecycle: placed & paid → seller confirms → assign
  // rider & dispatch → in transit → delivered → completed. The first step
  // merges "placed" and "paid": in the escrow flow the order only comes into
  // existence *after* payment is verified. Step 1 reads "Payment secured" to
  // the seller and "Order placed" to the buyer.
  List<_StepDef> _deliverySteps() => [
        _StepDef(
          key: 'placed',
          label: perspective == 'seller' ? 'Payment secured' : 'Order placed',
          statuses: _placedStatuses,
        ),
        _StepDef(
          key: 'confirm',
          label: perspective == 'seller'
              ? 'Confirm item availability'
              : 'Waiting for seller to confirm availability',
          statuses: const ['AWAITING_SELLER_CONFIRMATION'],
        ),
        _StepDef(
          key: 'assigned',
          label:
              perspective == 'seller' ? 'Assign rider' : 'Arranging delivery',
          statuses: const [
            'AWAITING_DELIVERY', 'SELLER_PREPARING_ORDER', 'AWAITING_BUYER_CONFIRMATION',
          ],
        ),
        // A driver holds the items once the order is ready to dispatch, even
        // before the seller taps "Dispatch items" — the assign task is done.
        _StepDef(
          key: 'transit',
          label: 'In transit',
          statuses: const ['READY_FOR_DISPATCH', 'AWAITING_DISPATCH', 'IN_TRANSIT'],
        ),
        // Physical handover is confirmed but rating — which completes the
        // order — is still outstanding, so this stays distinct from Completed.
        _StepDef(key: 'delivered', label: 'Delivered', statuses: const ['DELIVERED']),
        _StepDef(key: 'done', label: 'Completed', statuses: const ['COMPLETED']),
      ];

  List<_StepDef> _pickupSteps() => [
        _StepDef(
          key: 'placed',
          label: perspective == 'seller' ? 'Payment secured' : 'Order placed',
          statuses: _placedStatuses,
        ),
        _StepDef(
          key: 'confirm',
          label: perspective == 'seller'
              ? 'Confirm item availability'
              : 'Waiting for seller to confirm availability',
          statuses: const ['AWAITING_SELLER_CONFIRMATION'],
        ),
        _StepDef(
          key: 'ready',
          label: 'Ready for pickup',
          statuses: const ['AWAITING_DELIVERY', 'AWAITING_PICKUP'],
        ),
        _StepDef(key: 'pickedup', label: 'Picked up', statuses: const ['PICKED_UP']),
        _StepDef(key: 'completed', label: 'Completed', statuses: const ['COMPLETED']),
      ];

  List<_StepDef> _rentalSteps() => [
        _StepDef(
          key: 'placed',
          label: perspective == 'seller' ? 'Payment secured' : 'Booking placed',
          statuses: _placedStatuses,
        ),
        _StepDef(
          key: 'confirm',
          label: rental!.isShortStay
              ? (perspective == 'seller' ? 'Confirm booking' : 'Host confirmation')
              : perspective == 'seller'
                  ? 'Confirm rental'
                  : 'Seller confirmation',
          statuses: const ['AWAITING_SELLER_CONFIRMATION'],
        ),
        _StepDef(
          key: 'start',
          label: rental!.startStepLabel,
          statuses: const ['AWAITING_PICKUP', 'SCHEDULED'],
        ),
        _StepDef(
            key: 'rental',
            label: rental!.isShortStay ? 'Stay in progress' : 'Rental period',
            statuses: const ['PICKED_UP']),
        _StepDef(key: 'completed', label: 'Completed', statuses: const ['COMPLETED']),
      ];

  @override
  Widget build(BuildContext context) {
    final normalized = normalizeOrderStatus(status);
    final failed = normalized == 'CANCELLED' || normalized == 'FAILED';
    final steps = _steps;
    var matched = steps.indexWhere((s) => s.statuses.contains(normalized));

    // Rental sequences reuse statuses differently, so map them explicitly
    // (web parity `rentalIndex`) before falling back to the matched index.
    if (rental != null) {
      matched = switch (normalized) {
        'COMPLETED' => steps.length - 1,
        'AWAITING_SELLER_CONFIRMATION' => 1,
        'PICKED_UP' => 3,
        _ => matched >= 0 ? matched : 0,
      };
      if (_placedStatuses.contains(normalized)) matched = 0;
    }

    final deliveredIdx = steps.indexWhere((s) => s.key == 'delivered');
    final normalCurrent = failed
        ? 0
        : normalized == 'COMPLETED'
            ? steps.length - 1
            : (normalized == 'DELIVERED' && deliveredIdx != -1)
                // Delivered reads as done; the still-outstanding Completed
                // step becomes current until the buyer's rating finishes it.
                ? (deliveredIdx + 1).clamp(0, steps.length - 1)
                : (matched < 0 ? 0 : matched);
    // While a made-to-order item is still being produced (no production
    // completion yet), the production step — not the arrange/ready step — is
    // the one in progress (web `awaitingProduction`).
    final productionIdx = steps.indexWhere((s) => s.key == 'production');
    final awaitingProduction = productionIdx != -1 &&
        production?.completedAt == null &&
        const [
          'AWAITING_DELIVERY',
          'AWAITING_PICKUP',
          'SELLER_PREPARING_ORDER',
          'AWAITING_BUYER_CONFIRMATION',
        ].contains(normalized);
    final current = awaitingProduction ? productionIdx : normalCurrent;

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (failed)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(normalized == 'CANCELLED' ? 'Order cancelled' : 'Order failed',
                  style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: AppPalette.of(context).dangerText)),
            ),
          DeliveryJourney(
            steps: [
              for (final s in steps)
                DeliveryJourneyStep(label: s.label, icon: _iconFor(s.key)),
            ],
            currentIndex: failed
                ? 0
                : (normalized == 'COMPLETED' ? steps.length - 1 : current),
            cancelled: failed,
            semanticLabel: 'Order status progress',
          ),
        ],
      ),
    );
  }

  /// A step's icon by its semantic key - purely decorative, mirroring the web
  /// reference's per-step Lucide icons (`CreditCard`, `CheckCircle2`,
  /// `Package`, a transport glyph, `House`).
  static IconData _iconFor(String key) => switch (key) {
        'placed' => Icons.receipt_long_outlined,
        'confirm' => Icons.check_circle_outline,
        'production' => Icons.build_circle_outlined,
        'assigned' || 'ready' => Icons.inventory_2_outlined,
        'transit' => Icons.local_shipping_outlined,
        'delivered' => Icons.home_outlined,
        'pickedup' => Icons.shopping_bag_outlined,
        'start' => Icons.event_available_outlined,
        'rental' => Icons.calendar_month_outlined,
        'done' || 'completed' => Icons.task_alt,
        _ => Icons.circle_outlined,
      };
}

class _StepDef {
  final String key;
  final String label;
  final List<String> statuses;
  const _StepDef({required this.key, required this.label, required this.statuses});
}
