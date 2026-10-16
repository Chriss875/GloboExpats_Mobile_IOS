import 'package:flutter/material.dart';

import '../domain/production_time.dart';
import '../domain/time_utils.dart';
import '../theme.dart';

/// Made-to-order preparation status on an order — web parity
/// `components/orders/production-time-card.tsx`.
///
/// Renders nothing at all for an ordinary item: only a listing the seller
/// promised a preparation period for has anything to track here.
class ProductionTimeCard extends StatelessWidget {
  final ProductionSource source;

  /// The buyer's chosen earliest delivery date, when the order carries one.
  final DateTime? earliestDeliveryDate;

  /// Only the seller of a still-in-production order may confirm it is done.
  final bool canComplete;
  final Future<void> Function()? onComplete;
  final DateTime? now;

  const ProductionTimeCard({
    super.key,
    required this.source,
    this.earliestDeliveryDate,
    this.canComplete = false,
    this.onComplete,
    this.now,
  });

  @override
  Widget build(BuildContext context) {
    final timing = getProductionTiming(source, now: now);
    if (timing.state == ProductionState.notApplicable) {
      return const SizedBox.shrink();
    }

    final (title, accent, background) = switch (timing.state) {
      ProductionState.complete => (
          'Production complete',
          AppPalette.of(context).successText,
          AppPalette.of(context).successFill
        ),
      ProductionState.overdue => (
          'Production overdue',
          const Color(0xFFDC2626),
          AppPalette.of(context).dangerFill
        ),
      _ => ('Production in progress', AppColors.brandBlue, AppPalette.of(context).infoFill),
    };

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(
            timing.state == ProductionState.complete
                ? Icons.check_circle_outline
                : Icons.schedule,
            size: 18,
            color: accent,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(title,
                style: TextStyle(
                    fontWeight: FontWeight.w800, fontSize: 13.5, color: accent)),
          ),
          if (timing.state == ProductionState.complete)
            Text('Marked ready by the seller',
                style: TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary))
          else
            Text(formatProductionRemaining(timing.remaining),
                style: TextStyle(
                    fontSize: 11.5, fontWeight: FontWeight.w700, color: accent)),
        ]),
        if (source.expectedCompletionAt != null &&
            timing.state != ProductionState.complete) ...[
          const SizedBox(height: 8),
          _row('Expected production completion', _fmt(source.expectedCompletionAt!)),
        ],
        if (earliestDeliveryDate != null) ...[
          const SizedBox(height: 4),
          _row('Earliest delivery date', _fmt(earliestDeliveryDate!)),
        ],
        if (canComplete && timing.state != ProductionState.complete) ...[
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              key: const ValueKey('mark-production-complete'),
              style: FilledButton.styleFrom(backgroundColor: accent),
              onPressed: () => _confirm(context),
              icon: const Icon(Icons.done_all, size: 17),
              label: const Text('Mark production complete'),
            ),
          ),
        ],
      ]),
    );
  }

  Widget _row(String label, String value) => Row(children: [
        Text(label, style: const TextStyle(fontSize: 11.5, color: AppColors.textSecondary)),
        const Spacer(),
        Text(value,
            style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
      ]);

  String _fmt(DateTime t) {
    final e = TimeUtils.toEat(t);
    return TimeUtils.eatFormatDayMonth(e);
  }

  Future<void> _confirm(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Mark production complete?'),
        content: const Text(
            'Confirm only when the item is fully made or prepared. This will unlock '
            "transporter assignment, while the buyer's selected delivery window stays "
            'unchanged.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(d, false),
              child: const Text('Keep in production')),
          FilledButton(
              onPressed: () => Navigator.pop(d, true),
              child: const Text('Yes, production is complete')),
        ],
      ),
    );
    if (ok == true) await onComplete?.call();
  }
}
