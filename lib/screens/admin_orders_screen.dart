import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../models/order.dart';
import '../theme.dart';
import 'orders_screen.dart' show OrderDetailScreen;
import '../widgets/error_text.dart';
import '../widgets/skeleton_loader.dart';

/// Admin orders list from GET /api/v1/admin/orders (ADMIN role).
class AdminOrdersScreen extends StatefulWidget {
  const AdminOrdersScreen({super.key, this.auth, this.api});
  final AuthStore? auth;
  final ApiClient? api;
  @override
  State<AdminOrdersScreen> createState() => _AdminOrdersScreenState();
}

class _AdminOrdersScreenState extends State<AdminOrdersScreen> {
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  late final ApiClient _api = widget.api ?? ApiClient();

  /// AU-065: per-group filter chips mirror the web console's follow-up
  /// cards; the backend does the filtering (`group` query param).
  String _group = 'all';
  static const _groups = {'all': 'All', 'ongoing': 'Ongoing', 'overdue': 'Overdue', 'cancelled': 'Cancelled', 'completed': 'Completed'};
  late Future<List<Order>> _future = _load();

  Future<List<Order>> _load() {
    final token = _auth.token;
    if (token == null) return Future.error('Not logged in');
    return _api.adminOrders(token, group: _group);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin orders')),
      body: FutureBuilder<List<Order>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) return const FeedSkeleton();
          if (snap.hasError) return Center(child: Text('Could not load admin orders: ${friendlyApiError(snap.error)}', textAlign: TextAlign.center));
          final orders = snap.data ?? const [];
          // AU-065: follow-up group chips (web console parity) — the backend
          // filters server-side via `group`.
          return Column(
            children: [
              SizedBox(
                height: 44,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  children: [
                    for (final e in _groups.entries)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(e.value),
                          selected: _group == e.key,
                          onSelected: (_) => setState(() {
                            _group = e.key;
                            _future = _load();
                          }),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: orders.isEmpty
                    ? ListView(children: const [
                        SizedBox(height: 80),
                        Center(child: Text('No orders in this group.', style: TextStyle(color: Colors.grey))),
                      ])
                    : ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: orders.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, i) => _orderCard(context, orders[i]),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  /// AU-043: explicit admin escrow action. The backend guards are sandbox-
  /// proven (API_MAP #4): release-payment on REFUNDED → ORDER_REFUNDED;
  /// release on undelivered → ORDER_NOT_DELIVERED; double refund →
  /// NO_REFUND_DUE. Errors surface verbatim — never faked as success.
  Future<void> _escrowAction(BuildContext context, Order o, String action) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.adminOrderAction(_auth.token!, o.orderId, action);
      messenger.showSnackBar(SnackBar(content: Text('${action == 'release-payment' ? 'Payout released' : 'Refund issued'} for ${o.orderNumber}.')));
      setState(() => _future = _load());
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      messenger.showSnackBar(SnackBar(content: Text('$action failed: ${e.message}')));
    }
  }

  /// Inline escrow actions per row state (AU-065 orders-tab escrow inline).
  Widget _orderCard(BuildContext context, Order o) {
    final canRelease = o.payoutStatus == 'HELD' &&
        ['DELIVERED', 'COMPLETED', 'CONFIRMED'].contains(o.normalizedStatus);
    final canRefund = o.refundStatus == 'REFUND_PENDING';
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        settings: RouteSettings(name: '/admin/orders/${Uri.encodeComponent(o.orderId)}'),
        builder: (_) => OrderDetailScreen(orderId: o.orderId, token: _auth.token!, api: _api, order: o, admin: true),
      )),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppPalette.of(context).surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppPalette.of(context).border)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(o.orderNumber.isEmpty ? 'Order' : o.orderNumber,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
                if (o.payoutStatus == 'HELD') _miniBadge('Escrow held', Colors.amber.shade900, Colors.amber.shade100),
                if (o.payoutStatus == 'RELEASED') _miniBadge('Released', Colors.green.shade900, Colors.green.shade100),
                if (o.refundStatus == 'REFUNDED') _miniBadge('Refunded', Colors.deepOrange.shade900, Colors.deepOrange.shade100),
                if (o.refundStatus == 'REFUND_PENDING') _miniBadge('Refund due', Colors.red.shade900, Colors.red.shade100),
                const SizedBox(width: 6),
                Icon(Icons.chevron_right, color: AppPalette.of(context).textSecondary),
              ],
            ),
            const SizedBox(height: 4),
            Text('${o.status ?? ''} · ${Order.formatAmount(o.totalAmount, o.currency)}',
                style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 13)),
            // AU-043: escrow inline actions — only when the backend's own
            // preconditions are met by the row state.
            if (canRelease || canRefund) ...[
              const SizedBox(height: 8),
              Row(children: [
                if (canRelease)
                  Expanded(
                    child: FilledButton.tonal(
                      // Tonal is the one light-filled variant, so it opts out
                      // of the theme's white label.
                      style: FilledButton.styleFrom(
                          foregroundColor:
                              Theme.of(context).colorScheme.onSecondaryContainer),
                      onPressed: () => _escrowAction(context, o, 'release-payment'),
                      child: const Text('Release payout'),
                    ),
                  ),
                if (canRelease && canRefund) const SizedBox(width: 8),
                if (canRefund)
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: AppPalette.of(context).textPrimary),
                      onPressed: () => _escrowAction(context, o, 'refund'),
                      child: const Text('Issue refund'),
                    ),
                  ),
              ]),
            ],
          ],
        ),
      ),
    );
  }

  Widget _miniBadge(String label, Color fg, Color bg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: fg)),
      );
}

