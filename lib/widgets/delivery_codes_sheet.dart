import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../domain/pending_actions.dart';
import '../theme.dart';

/// The code a buyer needs at the door, opened from the "Delivery arriving"
/// reminder under the top bar: the order's delivery code, a copy button and a
/// way into the order. [orderId] limits it to that order; without it every
/// dispatched order is listed. Reads [PendingActionsStore.deliveryCodes], so
/// it stays current while open and a delivered order drops out of it.
Future<void> showDeliveryCodesSheet(BuildContext context, {String? orderId}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _DeliveryCodesSheet(orderId: orderId),
  );
}

class _DeliveryCodesSheet extends StatelessWidget {
  const _DeliveryCodesSheet({this.orderId});
  final String? orderId;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.85),
        child: ListenableBuilder(
          listenable: PendingActionsStore.instance,
          builder: (context, _) {
            final codes = [
              for (final c in PendingActionsStore.instance.deliveryCodes)
                if (orderId == null || c.orderId == orderId) c
            ];
            return ListView(
              key: const ValueKey('delivery-codes-sheet'),
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              children: [
                Row(children: [
                  Icon(Icons.pin_outlined, color: palette.accentInk),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                        codes.length == 1 ? 'Your delivery code' : 'Your delivery codes',
                        style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            color: palette.textPrimary)),
                  ),
                ]),
                const SizedBox(height: 6),
                Text(
                  'Give a code to the driver only once you have the items in '
                  'your hands. It confirms delivery and releases payment to the seller.',
                  style: TextStyle(
                      fontSize: 13, height: 1.4, color: palette.textSecondary),
                ),
                const SizedBox(height: 14),
                if (codes.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Text('No orders are on their way right now.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: palette.textSecondary)),
                  )
                else
                  for (final entry in codes) ...[
                    _CodeCard(entry: entry),
                    const SizedBox(height: 10),
                  ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _CodeCard extends StatelessWidget {
  const _CodeCard({required this.entry});
  final DeliveryCodeEntry entry;

  Future<void> _copy(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    await Clipboard.setData(ClipboardData(text: entry.code));
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(
          content: Text('Delivery code copied'),
          duration: Duration(seconds: 2)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final subtitle = [
      if ((entry.itemsLabel ?? '').isNotEmpty) entry.itemsLabel!,
      if ((entry.sellerName ?? '').isNotEmpty) 'from ${entry.sellerName}',
    ].join(' · ');
    return Container(
      key: ValueKey('delivery-code-${entry.orderId}'),
      padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
      decoration: BoxDecoration(
        color: palette.infoFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: palette.infoBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Order ${entry.orderNumber}',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: palette.accentInk)),
                  if (subtitle.isNotEmpty)
                    Text(subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12, color: palette.textSecondary)),
                ],
              ),
            ),
            TextButton(
              onPressed: () {
                final router = GoRouter.of(context);
                Navigator.of(context).pop();
                router.push(entry.route);
              },
              child: const Text('View order'),
            ),
          ]),
          const SizedBox(height: 4),
          Row(children: [
            Expanded(
              child: SelectableText(entry.code,
                  style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 8,
                      color: palette.accentInk)),
            ),
            IconButton(
              key: ValueKey('delivery-code-copy-${entry.orderId}'),
              tooltip: 'Copy delivery code',
              onPressed: () => _copy(context),
              icon: Icon(Icons.copy_rounded, color: palette.accentInk),
            ),
          ]),
        ],
      ),
    );
  }
}
