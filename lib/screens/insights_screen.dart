import 'package:flutter/material.dart';

import '../config.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../theme.dart';
import '../widgets/simple_bar_chart.dart';
import '../widgets/skeleton_loader.dart';

/// Insights hub covering the web `/insights/*` and `/statistics` analytics
/// pages. Renders the same trend data the web app shows when an admin session
/// can reach it; analytics failures are swallowed and shown as empty (per the
/// app rule), never blocking the app.
class InsightsScreen extends StatefulWidget {
  const InsightsScreen({super.key, this.auth, this.api});
  final AuthStore? auth;
  final ApiClient? api;
  @override
  State<InsightsScreen> createState() => _InsightsScreenState();
}

class _InsightsScreenState extends State<InsightsScreen> {
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<Map<String, List<Map<String, dynamic>>>> _future = _load();

  /// AU-063 web parity: interval/range selects on trend cards refetch from
  /// the backend (`interval` @RequestParam — sandbox-proven bucketing).
  String _interval = 'day';
  static const _intervals = {'day': 'Daily', 'week': 'Weekly', 'month': 'Monthly', 'year': 'Yearly'};

  // AU-063: Matomo web-analytics section (dev instance — the reference
  // /statistics console's own data source). Blank cards on failure are the
  // documented analytics exception; a missing token hides the whole block.
  final bool _showMatomo = true;
  Future<Map<String, dynamic>>? _matomoFuture;
  static const _matomoTabs = {'Visits': 'visits', 'Pages': 'pages', 'Countries': 'countries', 'Devices': 'devices', 'Search': 'search'};
  String _matomoTab = 'visits';

  Future<Map<String, dynamic>> _loadMatomo() async {
    final out = <String, dynamic>{};
    final period = _interval == 'year' ? 'month' : _interval;
    final visits = await _api.matomoQuery('VisitsSummary.get',
        period: period, date: _interval == 'year' ? 'last12' : 'last30');
    final pages = await _api.matomoQuery('Actions.getPageUrls',
        period: period, date: _interval == 'year' ? 'last12' : 'last30',
        extra: {'filter_limit': '10'});
    final countries = await _api.matomoQuery('UserCountry.getCountry',
        period: period, date: _interval == 'year' ? 'last12' : 'last30',
        extra: {'filter_limit': '10'});
    final devices = await _api.matomoQuery('DevicesDetection.getType',
        period: period, date: _interval == 'year' ? 'last12' : 'last30');
    final search = await _api.matomoQuery('Actions.getSiteSearchKeywords',
        period: period, date: _interval == 'year' ? 'last12' : 'last30',
        extra: {'filter_limit': '10'});
    out['visits'] = visits ?? const {};
    out['pages'] = pages ?? const [];
    out['countries'] = countries ?? const [];
    out['devices'] = devices ?? const {};
    out['search'] = search ?? const [];
    return out;
  }

  void _openMatomo() {
    setState(() => _matomoFuture = _loadMatomo());
  }

  Future<Map<String, List<Map<String, dynamic>>>> _load() async {
    final token = _auth.token;
    if (token == null) return const {};
    try {
      final results = await Future.wait<dynamic>([
        _api.adminTrend(token, 'orders', interval: _interval).catchError((_) => const <Map<String, dynamic>>[]),
        _api.adminTrend(token, 'proformas', interval: _interval).catchError((_) => const <Map<String, dynamic>>[]),
        _api.adminStats(token).catchError((_) => const <String, dynamic>{}),
      ]);
      return {
        'orders': (results[0] as List).cast<Map<String, dynamic>>(),
        'proformas': (results[1] as List).cast<Map<String, dynamic>>(),
        'stats': (results[2] as Map).cast<String, dynamic>().entries
            .map((e) => {'key': e.key, 'value': (e.value is num ? e.value : 0)})
            .toList(),
      };
    } catch (_) {
      return const {};
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Insights')),
      body: FutureBuilder<Map<String, List<Map<String, dynamic>>>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const FeedSkeleton();
          }
          final d = snap.data ?? const {};
          final orders = d['orders'] ?? const [];
          final proformas = d['proformas'] ?? const [];
          return RefreshIndicator(
            onRefresh: () async { setState(() => _future = _load()); await _future; },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // AU-063 interval select row.
                SizedBox(
                  height: 40,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (final e in _intervals.entries)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(e.value),
                            selected: _interval == e.key,
                            onSelected: (_) => setState(() {
                              _interval = e.key;
                              _future = _load();
                            }),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                _card('Sales', _seriesEntries(orders, 'placed')),
                const SizedBox(height: 16),
                _card('Completed orders', _seriesEntries(orders, 'completed')),
                const SizedBox(height: 16),
                _card('Proforma volume', _seriesEntries(proformas, 'placed')),
                const SizedBox(height: 16),
                _card('Verified proformas', _seriesEntries(proformas, 'verified')),
                const SizedBox(height: 16),
                _card('Key platform stats', _statEntries(d['stats'] ?? const [])),
                const SizedBox(height: 24),
                // AU-063: Matomo web-analytics console (reference /statistics).
                if (AppConfig.matomoToken.isNotEmpty && _showMatomo) ...[
                  Row(children: [
                    const Expanded(
                        child: Text('Web analytics (Matomo)',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800))),
                    TextButton.icon(
                      key: const ValueKey('open-matomo'),
                      onPressed: _matomoFuture == null ? _openMatomo : null,
                      icon: const Icon(Icons.query_stats),
                      label: const Text('Load'),
                    ),
                  ]),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 40,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        for (final e in _matomoTabs.entries)
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(e.key),
                              selected: _matomoTab == e.value,
                              onSelected: (_) => setState(() => _matomoTab = e.value),
                            ),
                          ),
                      ],
                    ),
                  ),
                  FutureBuilder<Map<String, dynamic>>(
                    future: _matomoFuture,
                    builder: (context, msnap) {
                      if (msnap.connectionState != ConnectionState.done) {
                        return const Padding(
                          padding: EdgeInsets.all(20),
                          child: ListRowsSkeleton(itemCount: 2),
                        );
                      }
                      final m = msnap.data ?? const {};
                      return _matomoCard(m);
                    },
                  ),
                  const SizedBox(height: 24),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  /// AU-063: renders one Matomo tab. Every block renders blank on empty data
  /// (the documented analytics exception) — never placeholder copy.
  Widget _matomoCard(Map<String, dynamic> m) {
    Widget blank = const Padding(
      padding: EdgeInsets.all(12),
      child: Text('', style: TextStyle(fontSize: 12)),
    );
    switch (_matomoTab) {
      case 'visits':
        final v = (m['visits'] as Map?)?.cast<String, dynamic>() ?? const {};
        if (v.isEmpty) return blank;
        final rows = [
          ('Visits', v['nb_visits']),
          ('Unique visitors', v['nb_uniq_visitors']),
          ('Actions', v['nb_actions']),
          ('Bounce rate', v['bounce_rate']),
          ('Avg. time on site (s)', v['avg_time_on_site']),
        ];
        return _kvCard([for (final r in rows) MapEntry(r.$1, '${r.$2 ?? 0}')]);
      case 'pages':
        return _rowsCard((m['pages'] as List?) ?? const [], (r) {
          final label = r is Map ? (r['label'] ?? '').toString() : r.toString();
          final visits = r is Map ? (r['nb_visits'] ?? r['nb_hits'] ?? 0) : 0;
          return MapEntry(label, '$visits');
        });
      case 'countries':
        return _rowsCard((m['countries'] as List?) ?? const [], (r) {
          final label = r is Map ? (r['label'] ?? '').toString() : r.toString();
          final visits = r is Map ? (r['nb_visits'] ?? 0) : 0;
          return MapEntry(label, '$visits');
        });
      case 'devices':
        final d = (m['devices'] as Map?)?.cast<String, dynamic>() ?? const {};
        if (d.isEmpty) return blank;
        return _kvCard([for (final e in d.entries) MapEntry(e.key, '${e.value}')]);
      case 'search':
        return _rowsCard((m['search'] as List?) ?? const [], (r) {
          final label = r is Map ? (r['label'] ?? '').toString() : r.toString();
          final hits = r is Map ? (r['nb_hits'] ?? 0) : 0;
          return MapEntry(label, '$hits');
        });
    }
    return blank;
  }

  Widget _kvCard(List<MapEntry<String, String>> rows) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: AppPalette.of(context).surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppPalette.of(context).border)),
        child: Column(children: [
          for (final r in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(children: [
                Expanded(child: Text(r.key, style: const TextStyle(fontSize: 13))),
                Text(r.value,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              ]),
            ),
        ]),
      );

  Widget _rowsCard(List<dynamic> rows, MapEntry<String, String> Function(dynamic) map) {
    if (rows.isEmpty) {
      return const Padding(
          padding: EdgeInsets.all(12), child: Text('', style: TextStyle(fontSize: 12)));
    }
    return _kvCard(rows.take(10).map(map).toList());
  }

  Widget _card(String title, List<MapEntry<String, double>> entries) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppPalette.of(context).surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppPalette.of(context).border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          SimpleBarChart(entries),
        ],
      ),
    );
  }

  List<MapEntry<String, double>> _seriesEntries(List<Map<String, dynamic>> series, String key) {
    final out = <MapEntry<String, double>>[];
    final recent = series.length > 14 ? series.sublist(series.length - 14) : series;
    for (final s in recent) {
      final date = (s['date'] ?? '').toString().split('-');
      final label = date.length >= 2 ? '${date[1]}/${date[2]}' : (s['date'] ?? '');
      out.add(MapEntry(label, (s[key] as num?)?.toDouble() ?? 0));
    }
    return out;
  }

  List<MapEntry<String, double>> _statEntries(List<Map<String, dynamic>> stats) {
    final out = <MapEntry<String, double>>[];
    for (final e in stats) {
      final v = e['value'];
      if (v is num && v > 0) {
        out.add(MapEntry((e['key'] ?? '').toString(), v.toDouble()));
      }
    }
    return out;
  }
}
