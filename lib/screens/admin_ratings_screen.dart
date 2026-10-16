import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/time_utils.dart';
import '../theme.dart';
import '../widgets/error_text.dart';
import '../widgets/skeleton_loader.dart';

/// AU-065 admin ratings tab (web admin-ratings-tab.tsx parity): paged list of
/// all ratings with author/target/stars, delete-with-confirm per row.
class AdminRatingsScreen extends StatefulWidget {
  const AdminRatingsScreen({super.key, this.api});
  final ApiClient? api;
  @override
  State<AdminRatingsScreen> createState() => _AdminRatingsScreenState();
}

class _AdminRatingsScreenState extends State<AdminRatingsScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<List<Map<String, dynamic>>> _future = _load();

  Future<List<Map<String, dynamic>>> _load() async {
    final token = AuthStore.instance?.token;
    if (token == null) return Future.error('Not logged in');
    return _api.adminRatings(token);
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _delete(Map<String, dynamic> r) async {
    final token = AuthStore.instance?.token;
    final id = (r['ratingId'] as num?)?.toInt();
    if (token == null || id == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Delete rating?'),
        content: const Text('The rating will be permanently removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    // Captured before awaits below (use_build_context_synchronously).
    // ignore: use_build_context_synchronously
    final messenger = ScaffoldMessenger.of(context);
    try {
      // ignore: use_build_context_synchronously
      await _api.adminDeleteRating(token, id);
      messenger.showSnackBar(const SnackBar(content: Text('Rating deleted.')));
      _reload();
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      messenger.showSnackBar(SnackBar(content: Text('Could not delete: ${e.message}')));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not delete the rating.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ratings')),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: FutureBuilder<List<Map<String, dynamic>>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const FeedSkeleton();
            }
            if (snap.hasError) {
              return Center(
                  child: Text('Could not load ratings: ${friendlyApiError(snap.error)}',
                      textAlign: TextAlign.center));
            }
            final rows = snap.data ?? const <Map<String, dynamic>>[];
            if (rows.isEmpty) {
              return ListView(children: const [
                SizedBox(height: 120),
                Center(child: Text('No ratings.', style: TextStyle(color: Colors.grey))),
              ]);
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final r = rows[i];
                final stars = ((r['stars'] ?? r['rating']) as num?)?.toDouble() ?? 0;
                final created = TimeUtils.tryParseBackendTimestamp(r['createdAt']);
                return Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                      color: AppPalette.of(context).surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppPalette.of(context).border)),
                  child: Row(children: [
                    const Icon(Icons.star, size: 16, color: Colors.amber),
                    const SizedBox(width: 4),
                    Text(stars.toStringAsFixed(1),
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                              '${r['authorName'] ?? 'Anonymous'} → ${r['targetUserName'] ?? '?'}'
                              '${(r['ratingType'] ?? '').toString().isNotEmpty ? ' · ${r['ratingType']}' : ''}',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          if (((r['reviewText'] ?? '') as String?).toString().trim().isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Text(r['reviewText'],
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: 12, color: AppPalette.of(context).textSecondary)),
                            ),
                          if (created != null)
                            Text(TimeUtils.eatFormatDayMonth(TimeUtils.toEat(created)),
                                style: TextStyle(
                                    fontSize: 11, color: AppPalette.of(context).textSecondary)),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Delete',
                      icon: const Icon(Icons.delete_outline,
                          size: 18, color: Color(0xFFDC2626)),
                      onPressed: () => _delete(r),
                    ),
                  ]),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
