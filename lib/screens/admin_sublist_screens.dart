import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:intl/intl.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../theme.dart';
import '../widgets/error_text.dart';
import '../widgets/skeleton_loader.dart';

/// Format a price the way the reference shows it: `TSh 46,000`.
String tsh(num? amount) {
  if (amount == null) return '—';
  return 'TSh ${NumberFormat('#,##0').format(amount.toDouble())}';
}

/// Generic admin list screen (Users, Products/Listings) backed by an
/// authenticated GET. Covers /admin/users and /admin/listings.
class AdminListScreen extends StatefulWidget {
  final String title;
  final Future<List<Map<String, dynamic>>> Function(String token) loader;
  final Map<String, dynamic> Function(Map<String, dynamic>) fields;
  const AdminListScreen({super.key, required this.title, required this.loader, required this.fields});
  @override
  State<AdminListScreen> createState() => _AdminListScreenState();
}

class _AdminListScreenState extends State<AdminListScreen> {
  late final AuthStore _auth = AuthStore.instance!;
  late final Future<List<Map<String, dynamic>>> _future =
      _auth.token != null ? widget.loader(_auth.token!) : Future.error('Not logged in');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) return const FeedSkeleton();
          if (snap.hasError) return Center(child: Text('Could not load: ${friendlyApiError(snap.error)}', textAlign: TextAlign.center));
          final rows = snap.data ?? const [];
          if (rows.isEmpty) return const Center(child: Text('No rows.', style: TextStyle(color: Colors.grey)));
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: rows.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, i) {
              final fields = widget.fields(rows[i]);
              return Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppPalette.of(context).surface, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppPalette.of(context).border)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final e in fields.entries)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 1),
                        child: Text('${e.key}: ${e.value}', style: const TextStyle(fontSize: 13)),
                      ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}

/// Pre-built Admin Users screen.
class AdminUsersScreen extends StatelessWidget {
  const AdminUsersScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return AdminListScreen(
      title: 'Admin users',
      loader: (t) => ApiClient().adminUsers(t),
      fields: (u) => {
        'Name': u['name'] ?? u['fullName'] ?? u['firstName'] ?? '',
        'Email': u['email'] ?? u['loggingEmail'] ?? u['emailAddress'] ?? '',
        'Roles': (u['roles'] ?? []).toString(),
        'Status': (u['status'] ?? u['enabled'] ?? '').toString(),
      },
    );
  }
}

/// Pre-built Admin Listings (products) screen.
class AdminListingsScreen extends StatelessWidget {
  const AdminListingsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return AdminListScreen(
      title: 'Admin listings',
      loader: (t) => ApiClient().adminProducts(t),
      fields: (p) => {
        'Title': p['productName'] ?? p['title'] ?? '',
        'Price': tsh(p['askingPrice'] as num? ?? p['productAskingPrice'] as num?),
        'Status': p['productStatus'] ?? p['status'] ?? '',
        'Seller': p['sellerName'] ?? '',
      },
    );
  }
}

/// Format an ISO timestamp to a readable local date/time string.
String _fmtDt(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  try {
    final d = DateTime.parse(iso).toLocal();
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  } catch (_) {
    return iso;
  }
}
/// Pre-built Admin Messages (notifications) screen — /admin/messages.
/// AU-065: admin contact-message inbox. The old screen read
/// /admin/notifications — the WRONG data source (matrix BROKEN-data-source).
/// Real source is GET /contact/all with read/delete actions; unread rows get
/// a badge, expanding a row marks it read like the web inbox.
class AdminMessagesScreen extends StatefulWidget {
  const AdminMessagesScreen({super.key, this.api});
  final ApiClient? api;
  @override
  State<AdminMessagesScreen> createState() => _AdminMessagesScreenState();
}

class _AdminMessagesScreenState extends State<AdminMessagesScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<List<Map<String, dynamic>>> _future;
  final Set<int> _readLocally = {};
  int _unread = 0;

  /// Web parity: the admin nav polls unread counts every 30 s.
  @override
  void initState() {
    super.initState();
    final token = AuthStore.instance?.token;
    _future = token == null
        ? Future.error('Not logged in')
        : _api.fetchContactMessages(token);
    _pollUnread();
  }

  Future<void> _pollUnread() async {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    try {
      final n = await _api.fetchContactUnreadCount(token);
      if (mounted) setState(() => _unread = n);
    } catch (_) {}
  }

  void _reload() {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    setState(() => _future = _api.fetchContactMessages(token));
  }

  Future<void> _markRead(Map<String, dynamic> m) async {
    final token = AuthStore.instance?.token;
    final id = (m['id'] as num?)?.toInt();
    if (token == null || id == null) return;
    setState(() => _readLocally.add(id));
    try {
      await _api.markContactRead(token, id);
    } catch (_) {
      // best-effort: the local badge already reflects the read state
    }
  }

  Future<void> _delete(Map<String, dynamic> m) async {
    final token = AuthStore.instance?.token;
    final id = (m['id'] as num?)?.toInt();
    if (token == null || id == null) return;
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.deleteContactMessage(token, id);
      messenger.showSnackBar(const SnackBar(content: Text('Message deleted.')));
      _reload();
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      messenger.showSnackBar(SnackBar(content: Text('Could not delete: ${e.message}')));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not delete the message.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_unread > 0 ? 'Admin messages ($_unread unread)' : 'Admin messages')),
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
                  child: Text('Could not load messages: ${friendlyApiError(snap.error)}',
                      textAlign: TextAlign.center));
            }
            final rows = snap.data ?? const <Map<String, dynamic>>[];
            if (rows.isEmpty) {
              return ListView(children: const [
                SizedBox(height: 120),
                Center(child: Text('No contact messages.', style: TextStyle(color: Colors.grey))),
              ]);
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final m = rows[i];
                final id = (m['id'] as num?)?.toInt() ?? 0;
                final unread = m['isRead'] != true && !_readLocally.contains(id);
                final name = (m['name'] ?? '').toString();
                final subject = (m['subject'] ?? '').toString();
                final email = (m['email'] ?? '').toString();
                final wa = (m['whatsAppPhoneNumber'] ?? '').toString();
                final reason = (m['reason'] ?? '').toString();
                return Card(
                  child: ExpansionTile(
                    tilePadding: const EdgeInsets.symmetric(horizontal: 12),
                    childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    leading: unread
                        ? Icon(Icons.mark_email_unread_outlined, color: AppPalette.of(context).accentInk)
                        : Icon(Icons.mark_email_read_outlined, color: AppPalette.of(context).textSecondary),
                    title: Row(children: [
                      Expanded(child: Text(subject.isNotEmpty ? subject : '(no subject)',
                          style: TextStyle(fontWeight: unread ? FontWeight.w800 : FontWeight.w500))),
                      if (unread)
                        Container(width: 8, height: 8,
                            decoration: const BoxDecoration(color: AppColors.brandBlue, shape: BoxShape.circle)),
                    ]),
                    subtitle: Text('$name · $reason',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                    onExpansionChanged: (open) {
                      if (open && unread) _markRead(m);
                    },
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(m['message']?.toString() ?? '', style: const TextStyle(height: 1.4)),
                            const SizedBox(height: 8),
                            Text('From: $name <$email>',
                                style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
                            if (_fmtDt(m['createdAt']?.toString()).isNotEmpty)
                              Text(_fmtDt(m['createdAt']?.toString()),
                                  style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
                            const SizedBox(height: 8),
                            Row(children: [
                              if (wa.isNotEmpty)
                                TextButton.icon(
                                  onPressed: () async {
                                    final cleaned = wa.replaceAll(RegExp(r'[^0-9]'), '');
                                    final uri = Uri.parse('https://wa.me/$cleaned');
                                    try {
                                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                                    } catch (_) {}
                                  },
                                  icon: const Icon(Icons.chat_bubble_outline, size: 15),
                                  label: const Text('WhatsApp', style: TextStyle(fontSize: 12)),
                                ),
                              const Spacer(),
                              IconButton(
                                tooltip: 'Delete',
                                icon: const Icon(Icons.delete_outline, size: 18, color: Color(0xFFDC2626)),
                                onPressed: () => _delete(m),
                              ),
                            ]),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

/// Pre-built Admin Verification queue screen — /admin/verification.
class AdminVerificationScreen extends StatelessWidget {
  const AdminVerificationScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return AdminListScreen(
      title: 'Admin verification',
      loader: (t) => ApiClient().adminSellerVerifications(t),
      fields: (r) => {
        'User': [r['firstName'], r['lastName'], r['userName']].where((e) => e != null && (e as String).isNotEmpty).join(' ').toString(),
        'Email': (r['email'] ?? r['emailAddress'] ?? '').toString(),
        'Status': (r['status'] ?? '').toString(),
      },
    );
  }
}
