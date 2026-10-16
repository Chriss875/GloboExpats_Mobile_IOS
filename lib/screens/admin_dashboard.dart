import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../models/order.dart';
import '../theme.dart';
import '../widgets/simple_bar_chart.dart';
import 'admin_orders_screen.dart';
import '../screens/admin_ratings_screen.dart' show AdminRatingsScreen;
import 'admin_payments_review_screen.dart';
import 'admin_sublist_screens.dart';
import '../widgets/error_text.dart';
import '../widgets/skeleton_loader.dart';

/// Admin overview (mirrors the web `admin-overview`): KPI stat cards, order +
/// proforma trend charts, and the "Top Buyers by Clicks" analytics card.
/// Requires an ADMIN account; on failure (e.g. non-admin 403) it degrades
/// gracefully.
class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key, this.auth, this.api});
  final AuthStore? auth;
  final ApiClient? api;
  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<_AdminData> _future = _load();

  Future<_AdminData> _load() async {
    final token = _auth.token;
    if (token == null) throw ApiException('Not logged in');
    final results = await Future.wait<dynamic>([
      _api.adminStats(token),
      _api.adminTrend(token, 'orders'),
      _api.adminTrend(token, 'proformas'),
      _api.adminTopBuyers(token),
      // AU-064: analytics-service families; every call is failure-optional.
      _api.adminAnalyticsSummary(token),
      _api.adminRevenueOverTime(token),
      _api.adminVerificationBreakdown(token),
      _api.adminTopClickedProducts(token),
      _api.adminTopClickedSellers(token),
      _api.adminTopClickedCategories(token),
      _api.adminCumulativeSignups(token),
    ]);
    return _AdminData(
      stats: results[0] as Map<String, dynamic>,
      orderTrend: (results[1] as List).cast<Map<String, dynamic>>(),
      proformaTrend: (results[2] as List).cast<Map<String, dynamic>>(),
      topBuyers: (results[3] as List).cast<Map<String, dynamic>>(),
      summary: results[4] as Map<String, dynamic>?,
      revenue: (results[5] as List).cast<Map<String, dynamic>>(),
      verification: (results[6] as List).cast<Map<String, dynamic>>(),
      topProducts: (results[7] as List).cast<Map<String, dynamic>>(),
      topSellers: (results[8] as List).cast<Map<String, dynamic>>(),
      topCategories: (results[9] as List).cast<Map<String, dynamic>>(),
      cumulative: (results[10] as List).cast<Map<String, dynamic>>(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin'), actions: [
        PopupMenuButton<String>(
          onSelected: (d) {
            final map = const {'orders': AdminOrdersScreen(), 'users': AdminUsersScreen(), 'listings': AdminListingsScreen(), 'messages': AdminMessagesScreen(), 'verify': AdminVerificationScreen(), 'payment review': AdminPaymentsReviewScreen(), 'ratings': AdminRatingsScreen()};
            Navigator.of(context).push(MaterialPageRoute(
                settings: RouteSettings(name: '/admin/${d.replaceAll(' ', '-')}'),
                builder: (_) => map[d]!));
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'orders', child: Text('Orders')),
            PopupMenuItem(value: 'users', child: Text('Users')),
            PopupMenuItem(value: 'listings', child: Text('Listings')),
            PopupMenuItem(value: 'messages', child: Text('Messages')),
            PopupMenuItem(value: 'verify', child: Text('Verification')),
            PopupMenuItem(value: 'payment review', child: Text('Payment review')),
            PopupMenuItem(value: 'ratings', child: Text('Ratings')),
          ],
          icon: const Icon(Icons.menu),
        ),
      ]),
      body: FutureBuilder<_AdminData>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const FeedSkeleton();
          }
          if (snap.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(friendlyApiError(snap.error, fallback: 'Admin data unavailable (need an admin account).'),
                    textAlign: TextAlign.center, style: const TextStyle(color: Colors.grey)),
              ),
            );
          }
          final d = snap.data!;
          final s = d.stats;
          return RefreshIndicator(
            onRefresh: () async { setState(() => _future = _load()); await _future; },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Wrap(
                  spacing: 10, runSpacing: 10,
                  children: [
                    _statCard(context, 'Users', s['totalUsers']?.toString() ?? '0',
                        drill: AdminUsersScreen()),
                    _statCard(context, 'Orders', s['totalOrders']?.toString() ?? '0',
                        drill: AdminOrdersScreen()),
                    _statCard(context, 'Products', s['totalProducts']?.toString() ?? '0',
                        drill: AdminListingsScreen()),
                    _statCard(context, 'Ratings', s['totalRatings']?.toString() ?? '0',
                        drill: AdminRatingsScreen()),
                    _statCard(context, 'Revenue', Order.formatAmount((s['totalRevenue'] as num?)?.toDouble() ?? 0),
                        drill: AdminPaymentsReviewScreen()),
                  ],
                ),
                const SizedBox(height: 20),
                _chartCard('Sales trend', _trendEntries(d.orderTrend, 'placed')),
                const SizedBox(height: 16),
                _chartCard('Proforma trend', _trendEntries(d.proformaTrend, 'placed')),
                const SizedBox(height: 16),
                _chartCard('Top Buyers by Clicks', _buyerEntries(d.topBuyers)),
                // AU-064: analytics-service suite (reference admin-overview.tsx).
                // Cards render BLANK when their data is empty — documented
                // exception to the hide-empty-blocks rule.
                if (d.summary != null) ...[
                  const SizedBox(height: 16),
                  _summaryCard(d.summary!),
                ],
                if (d.revenue.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _chartCard('Revenue over time (monthly)',
                      _revenueEntries(d.revenue)),
                ],
                if (d.verification.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _chartCard('Users by verification status',
                      _countEntries(d.verification, 'status', 'count')),
                ],
                if (d.topProducts.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _chartCard('Top clicked products',
                      _nameCountEntries(d.topProducts, 'productName', 'clickCount')),
                ],
                if (d.topSellers.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _chartCard('Top clicked sellers',
                      _nameCountEntries(d.topSellers, 'sellerName', 'clickCount')),
                ],
                if (d.topCategories.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _chartCard('Top clicked categories',
                      _nameCountEntries(d.topCategories, 'categoryName', 'clickCount')),
                ],
                if (d.cumulative.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _chartCard('Cumulative signups vs verified',
                      d.cumulative
                          .map((m) => MapEntry(
                                ((m['date'] ?? m['day'] ?? '')).toString(),
                                ((m['total'] ?? m['cumulative'] ?? m['signups'] ?? 0) as num?)?.toDouble() ?? 0,
                              ))
                          .toList()),
                ],
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }

  /// AU-065 web parity: the five KPI cards are clickable and drill into their
  /// console sections (admin-overview.tsx card -> sub-tab navigation).
  Widget _statCard(BuildContext ctx, String label, String value, {Widget? drill}) {
    final card = Container(
      width: (MediaQuery.of(ctx).size.width - 16 * 2 - 10 * 2) / 3,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppPalette.of(context).surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppPalette.of(context).border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppPalette.of(context).accentInk)),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
        ],
      ),
    );
    if (drill == null) return card;
    return InkWell(onTap: () => Navigator.of(ctx).push(MaterialPageRoute(
        settings: RouteSettings(name: '/admin/${label.toLowerCase().replaceAll(' ', '-')}'),
        builder: (_) => drill)), child: card);
  }

  Widget _chartCard(String title, List<MapEntry<String, double>> entries) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppPalette.of(context).surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppPalette.of(context).border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          SimpleBarChart(entries.length > 12 ? entries.sublist(entries.length - 12) : entries),
        ],
      ),
    );
  }

  List<MapEntry<String, double>> _trendEntries(List<Map<String, dynamic>> series, String key) {
    final out = <MapEntry<String, double>>[];
    for (final s in series) {
      final date = (s['date'] ?? '').toString().split('-');
      final label = date.length >= 2 ? '${date[1]}/${date[2]}' : (s['date'] ?? '');
      final val = (s[key] as num?)?.toDouble() ?? 0;
      out.add(MapEntry(label, val));
    }
    return out;
  }

  List<MapEntry<String, double>> _buyerEntries(List<Map<String, dynamic>> buyers) {
    final out = <MapEntry<String, double>>[];
    for (final b in buyers) {
      final name = (b['buyerName'] ?? b['name'] ?? b['userName'] ?? 'User').toString();
      final clicks = ((b['clickCount'] ?? b['clicks'] ?? b['views']) as num?)?.toDouble() ?? 0;
      out.add(MapEntry(name, clicks));
    }
    return out;
  }

  /// AU-064 headline counts card from /analytics/overview/summary.
  Widget _summaryCard(Map<String, dynamic> s) {
    String v(String k) => (s[k] as num?)?.toInt().toString() ?? '0';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppPalette.of(context).surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppPalette.of(context).border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Platform summary', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        Wrap(spacing: 18, runSpacing: 8, children: [
          _summaryCell('Total users', v('total_users')),
          _summaryCell('Sellers', v('total_sellers')),
          _summaryCell('Buyers', v('total_buyers')),
          _summaryCell('Products', v('total_products')),
          _summaryCell('Orders', v('total_orders')),
          _summaryCell('Product clicks', v('total_product_clicks')),
          _summaryCell('Saved items', v('total_saved_products')),
        ]),
      ]),
    );
  }

  Widget _summaryCell(String label, String value) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppPalette.of(context).accentInk)),
      Text(label, style: TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary)),
    ]);
  }

  List<MapEntry<String, double>> _revenueEntries(List<Map<String, dynamic>> series) {
    final out = <MapEntry<String, double>>[];
    for (final s in series) {
      final label = (s['date'] ?? s['period'] ?? '').toString();
      final val = ((s['revenue'] ?? s['totalRevenue'] ?? s['total']) as num?)?.toDouble() ?? 0;
      out.add(MapEntry(label, val));
    }
    return out;
  }

  List<MapEntry<String, double>> _countEntries(List<Map<String, dynamic>> rows,
      String labelKey, String countKey) {
    return rows
        .map((r) => MapEntry((r[labelKey] ?? '?').toString(),
            ((r[countKey] ?? r['value'] ?? 0) as num?)?.toDouble() ?? 0))
        .toList();
  }

  List<MapEntry<String, double>> _nameCountEntries(List<Map<String, dynamic>> rows,
      String nameKey, String countKey) {
    final out = <MapEntry<String, double>>[];
    for (final r in rows) {
      final name = (r[nameKey] ?? r['name'] ?? r['title'] ?? '?').toString();
      final val = ((r[countKey] ?? r['clicks'] ?? r['views'] ?? 0) as num?)?.toDouble() ?? 0;
      out.add(MapEntry(name, val));
    }
    return out;
  }
}

class _AdminData {
  final Map<String, dynamic> stats;
  final List<Map<String, dynamic>> orderTrend;
  final List<Map<String, dynamic>> proformaTrend;
  final List<Map<String, dynamic>> topBuyers;
  // AU-064: analytics-service card data (all nullable/empty — blank when the
  // service has no data, per the analytics-failures-optional convention).
  final Map<String, dynamic>? summary;
  final List<Map<String, dynamic>> revenue;
  final List<Map<String, dynamic>> verification;
  final List<Map<String, dynamic>> topProducts;
  final List<Map<String, dynamic>> topSellers;
  final List<Map<String, dynamic>> topCategories;
  final List<Map<String, dynamic>> cumulative;
  const _AdminData({
    required this.stats,
    required this.orderTrend,
    required this.proformaTrend,
    required this.topBuyers,
    this.summary,
    this.revenue = const [],
    this.verification = const [],
    this.topProducts = const [],
    this.topSellers = const [],
    this.topCategories = const [],
    this.cumulative = const [],
  });
}
