import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/account_setup.dart';
import '../domain/international_phone.dart';
import '../domain/time_utils.dart';
import '../domain/notification_feed.dart';
import '../theme.dart';
import '../widgets/error_text.dart';
import '../config.dart';
import '../widgets/account_setup.dart' show whatsAppNumberError;
import '../widgets/account_ui.dart';
import '../widgets/app_image.dart';
import '../widgets/phone_number_field.dart';
import '../widgets/skeleton_loader.dart';
import 'addresses_screen.dart';
import 'payout_details_screen.dart';
import 'working_hours_screen.dart';
import 'package:go_router/go_router.dart';

/// Account & misc screens (Notifications, Settings, Help/About) — first-draft
/// versions covering the web /notifications, /account/settings, /help, /about,
/// /faq, /contact, /privacy, /terms routes.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, this.api});
  final ApiClient? api;
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  static const int _pageSize = 20;
  // Paged feed (A-13): rows accumulate across fetchNotifications pages rather
  // than a one-shot 20-row fetch. Tabs/filter/search narrow whatever has been
  // loaded and a "Load more" footer fetches the next page.
  List<Map<String, dynamic>> _rows = [];
  int _page = 0;
  bool _hasMore = true;
  bool _initialLoading = true;
  bool _loadingMore = false;
  String? _loadError;
  bool _busy = false;
  NotificationTab _tab = NotificationTab.all;
  NotificationActionFilter _filter = NotificationActionFilter.all;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _loadFirst();
  }

  Future<void> _loadFirst() async {
    final token = AuthStore.instance?.token;
    if (token == null) {
      // First build reads these field values directly, so no setState needed.
      _rows = const [];
      _page = 0;
      _hasMore = false;
      _initialLoading = false;
      _loadError = null;
      return;
    }
    try {
      final rows =
          await _api.fetchNotifications(token, page: 0, size: _pageSize);
      if (!mounted) return;
      setState(() {
        _rows = List.of(rows);
        _page = 0;
        // A full page means the server may still hold older rows — keep the
        // footer until a short (or empty) page confirms the feed has ended.
        _hasMore = rows.length >= _pageSize;
        _initialLoading = false;
        _loadError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _initialLoading = false;
        _loadError = friendlyApiError(e);
      });
    }
  }

  Future<void> _retry() async {
    setState(() {
      _initialLoading = true;
      _loadError = null;
    });
    await _loadFirst();
  }

  /// Pull-to-refresh and post-action reload: back to page 0, clear busy.
  Future<void> _reload() async {
    if (mounted) setState(() => _busy = false);
    await _loadFirst();
  }

  Future<void> _loadMore() async {
    final token = AuthStore.instance?.token;
    if (token == null || _loadingMore || !_hasMore || _busy) return;
    setState(() => _loadingMore = true);
    try {
      final more =
          await _api.fetchNotifications(token, page: _page + 1, size: _pageSize);
      if (!mounted) return;
      setState(() {
        _page += 1;
        _rows = [..._rows, ...more];
        _hasMore = more.length >= _pageSize;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not load more notifications. Try again.')));
    }
  }

  /// Removes already-deleted rows from the loaded feed so the UI updates
  /// immediately (the server has already committed the delete).
  void _dropLocalIds(Set<int> ids) {
    if (ids.isEmpty) return;
    setState(() {
      _rows.removeWhere((raw) {
        final id = raw['notificationId'] ?? raw['id'];
        final parsed = id is num ? id.toInt() : int.tryParse('$id');
        return parsed != null && ids.contains(parsed);
      });
    });
  }

  // A-12: per-row delete wired to DELETE /notifications/{id}.
  Future<void> _deleteOne(UserNotificationRow n) async {
    final token = AuthStore.instance?.token;
    if (token == null || _busy) return;
    setState(() => _busy = true);
    try {
      await _api.deleteNotification(token, n.id);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Could not delete notification: ${e.message}')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Could not delete notification. Try again.')));
      }
    }
    if (!context.mounted) return;
    _dropLocalIds({n.id});
    setState(() => _busy = false);
  }

  // A-12: bulk delete of the currently SHOWN (filtered) rows — DELETE
  // /notifications/bulk {ids}.
  Future<void> _deleteShown() async {
    final token = AuthStore.instance?.token;
    if (token == null || _busy) return;
    final shown = _visible(_rows);
    if (shown.isEmpty) return;
    final ids = {for (final r in shown) r.id};
    setState(() => _busy = true);
    try {
      await _api.deleteNotificationsBulk(token, ids.toList());
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Could not delete notifications: ${e.message}')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Could not delete notifications. Try again.')));
      }
    }
    if (!mounted) return;
    _dropLocalIds(ids);
    setState(() => _busy = false);
  }

  void _go(String path) {
    try {
      GoRouter.of(context).go(path);
    } catch (_) {
      // Not hosted under the app router (tests/embeds): nothing to navigate.
    }
  }

  Future<void> _markAll() async {
    final token = AuthStore.instance?.token;
    if (token == null || _busy) return;
    setState(() => _busy = true);
    try {
      await _api.markAllNotificationsRead(token);
    } on ApiException catch (e) {
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Could not mark all read: ${e.message}')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not mark all read. Try again.')));
      }
    }
    if (mounted) await _reload();
  }

  Future<void> _deleteAll() async {
    final token = AuthStore.instance?.token;
    if (token == null || _busy) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Delete all notifications?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Delete all')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await _api.deleteAllNotifications(token);
    } on ApiException catch (e) {
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Could not delete: ${e.message}')));
      }
    }
    if (mounted) await _reload();
  }

  /// [target] is the DERIVED destination (web `getUserNotificationActionUrl`),
  /// not the raw `actionUrl` — an informational or cancelled row deliberately
  /// resolves to null and simply marks itself read.
  Future<void> _open(UserNotificationRow n, String? target) async {
    final token = AuthStore.instance?.token;
    if (token != null && !n.isRead) {
      // Mark read BEFORE navigating like the web (awaited so the read state
      // is durable when the user lands back); failures never block nav.
      try {
        await _api.markNotificationRead(token, n.id);
      } catch (_) {}
    }
    final url = target;
    if (url != null && url.isNotEmpty && mounted) {
      try {
        GoRouter.of(context).go(url);
      } catch (_) {
        // hosted outside the router (tests, embeds): fall back to reload
        await _reload();
      }
    } else if (mounted) {
      await _reload();
    }
  }

  /// Applies web's three-stage narrowing in the same order: role tab, then
  /// action-type filter, then free-text search — with informational payment
  /// rows dropping out of the active feed once they have been read.
  List<UserNotificationRow> _visible(List<Map<String, dynamic>> raw) {
    final query = _search.trim().toLowerCase();
    return raw
        .map(UserNotificationRow.fromJson)
        .whereType<UserNotificationRow>()
        .where(shouldShowNotificationInActiveFeed)
        .where((n) => notificationMatchesTab(n, _tab))
        .where((n) => notificationMatchesActionFilter(n, _filter))
        .where((n) =>
            query.isEmpty ||
            n.title.toLowerCase().contains(query) ||
            n.message.toLowerCase().contains(query))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications'), actions: [
        IconButton(
          tooltip: 'Mark all read',
          onPressed: _busy ? null : _markAll,
          icon: const Icon(Icons.done_all_outlined),
        ),
        IconButton(
          tooltip: 'Delete all',
          onPressed: _busy ? null : _deleteAll,
          icon: const Icon(Icons.delete_sweep_outlined),
        ),
      ]),
      body: _body(),
    );
  }

  Widget _body() {
    if (_initialLoading) {
      return const FeedSkeleton();
    }
    if (_loadError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Could not load notifications: $_loadError',
                textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _retry, child: const Text('Retry')),
          ]),
        ),
      );
    }
    final rows = _visible(_rows);
    return Column(children: [
      Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 0),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text('Complete the required actions to move your orders forward.',
              style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
        ),
      ),
      _tabBar(),
      _filterBar(),
      if (rows.isNotEmpty) _bulkBar(rows.length),
      Expanded(
        child: rows.isEmpty && !_hasMore
            ? RefreshIndicator(onRefresh: _reload, child: _emptyList())
            : RefreshIndicator(
                onRefresh: _reload,
                child: ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(12),
                  itemCount: rows.length + (_hasMore ? 1 : 0),
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, i) =>
                      i >= rows.length ? _loadMoreTile() : _row(rows[i]),
                ),
              ),
      ),
    ]);
  }

  /// Web-parity empty state (A-14): the old one-line grey "No notifications
  /// yet." becomes the same "You're all caught up!" card as the web plus CTAs.
  Widget _emptyList() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 110),
        const Icon(Icons.check_circle_outline,
            size: 64, color: Color(0xFF10B981)),
        const SizedBox(height: 14),
        Text("You're all caught up!",
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 20, fontWeight: FontWeight.w800, color: AppPalette.of(context).textPrimary)),
        const SizedBox(height: 6),
        Text(
          'You have no pending actions. Grab a cup of coffee and relax, or browse for new items.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: AppPalette.of(context).textSecondary),
        ),
        const SizedBox(height: 22),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          OutlinedButton(
            key: const ValueKey('notif-empty-dashboard'),
            onPressed: () => _go('/expat/dashboard'),
            child: const Text('Go to Dashboard'),
          ),
          const SizedBox(width: 10),
          FilledButton(
            key: const ValueKey('notif-empty-browse'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.brandBlue),
            onPressed: () => _go('/browse'),
            child: const Text('Browse Products'),
          ),
        ]),
      ],
    );
  }

  /// A-13: the paged feed's footer — visible whenever a fetch returned a full
  /// page, so older rows can be loaded without losing current position.
  Widget _loadMoreTile() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Center(
        child: OutlinedButton.icon(
          key: const ValueKey('notif-load-more'),
          onPressed: _loadingMore ? null : _loadMore,
          icon: _loadingMore
              ? const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.expand_more, size: 18),
          label: Text(_loadingMore ? 'Loading more…' : 'Load more notifications'),
        ),
      ),
    );
  }

  /// A-12: the bulk action strip sits under the filter bar and reports exactly
  /// how many rows the DELETE would remove after the active filters.
  Widget _bulkBar(int shownCount) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 2, 12, 0),
      child: Align(
        alignment: Alignment.centerRight,
        child: TextButton.icon(
          key: const ValueKey('notif-delete-shown'),
          onPressed: _busy ? null : _deleteShown,
          icon: const Icon(Icons.delete_sweep_outlined, size: 16),
          label: Text('Delete shown ($shownCount)',
              style: const TextStyle(fontSize: 12.5)),
        ),
      ),
    );
  }

  Widget _tabBar() => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: SizedBox(
          height: 34,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final t in NotificationTab.values)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    key: ValueKey('notif-tab-${t.name}'),
                    label: Text(_tabLabel(t), style: const TextStyle(fontSize: 12)),
                    selected: _tab == t,
                    onSelected: (_) => setState(() => _tab = t),
                  ),
                ),
            ],
          ),
        ),
      );

  Widget _filterBar() => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        child: Row(children: [
          Expanded(
            child: SizedBox(
              height: 38,
              child: TextField(
                key: const ValueKey('notif-search'),
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: 'Search notifications',
                  prefixIcon: Icon(Icons.search, size: 18),
                  border: OutlineInputBorder(),
                ),
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
          ),
          const SizedBox(width: 8),
          DropdownButton<NotificationActionFilter>(
            key: const ValueKey('notif-filter'),
            value: _filter,
            underline: const SizedBox.shrink(),
            items: [
              for (final f in NotificationActionFilter.values)
                DropdownMenuItem(
                    value: f,
                    child: Text(_filterLabel(f), style: const TextStyle(fontSize: 12))),
            ],
            onChanged: (f) => setState(() => _filter = f ?? NotificationActionFilter.all),
          ),
        ]),
      );

  static String _tabLabel(NotificationTab t) => switch (t) {
        NotificationTab.all => 'All',
        NotificationTab.buying => 'Buying',
        NotificationTab.selling => 'Selling',
        NotificationTab.requests => 'Requests',
      };

  static String _filterLabel(NotificationActionFilter f) => switch (f) {
        NotificationActionFilter.all => 'All types',
        NotificationActionFilter.payment => 'Payment',
        NotificationActionFilter.fulfillment => 'Fulfillment',
        NotificationActionFilter.receipt => 'Receipt',
        NotificationActionFilter.rating => 'Rating',
      };

  Widget _row(UserNotificationRow n) {
    final kind = notificationVisualKind(n);
    // A row with nowhere useful to go must not look tappable.
    final target = notificationActionUrl(n);
    final accent = switch (kind) {
      NotificationVisualKind.rating => const Color(0xFFF59E0B),
      NotificationVisualKind.logistics => const Color(0xFFDC2626),
      NotificationVisualKind.normal => AppColors.brandBlue,
    };
    // Trailing status: unread dot, chevron (when it navigates) or spacer.
    final Widget status = n.isRead
        ? (target == null
            ? const SizedBox(width: 18, height: 18)
            : Icon(Icons.chevron_right,
                size: 18, color: AppPalette.of(context).textSecondary))
        : Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
          );
    return Card(
      color: n.isRead
          ? AppPalette.of(context).surface
          : accent.withValues(alpha: 0.04),
      child: ListTile(
        onTap: () => _open(n, target),
        leading: Icon(_iconFor(n.notificationType),
            color: n.isRead ? AppPalette.of(context).textSecondary : accent),
        title: Text(n.title,
            style: TextStyle(
                fontWeight: n.isRead ? FontWeight.w600 : FontWeight.w800, fontSize: 14)),
        subtitle: Text(
          '${n.message}\n${_stampOf(n.createdAt)}',
          style: const TextStyle(fontSize: 12, height: 1.4),
        ),
        isThreeLine: true,
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(
            key: ValueKey('notif-delete-${n.id}'),
            tooltip: 'Delete notification',
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(
                minWidth: 34, minHeight: 34, maxWidth: 34, maxHeight: 34),
            onPressed: _busy ? null : () => _deleteOne(n),
            icon: Icon(Icons.delete_outline,
                size: 18, color: AppPalette.of(context).textSecondary),
          ),
          const SizedBox(width: 2),
          status,
        ]),
      ),
    );
  }

  String _stampOf(DateTime? t) {
    if (t == null) return 'Date unavailable';
    final e = TimeUtils.toEat(t);
    return '${TimeUtils.eatFormatDayMonth(e)} '
        '${e.hour.toString().padLeft(2, '0')}:${e.minute.toString().padLeft(2, '0')}';
  }


  IconData _iconFor(String? type) {
    switch (type) {
      case 'ORDER_STATUS':
      case 'ORDER_PLACED':
        return Icons.local_shipping_outlined;
      case 'PAYMENT':
      case 'PAYMENT_CONFIRMED':
        return Icons.payments_outlined;
      case 'NEW_REQUEST':
      case 'REQUEST_NUDGE':
        return Icons.forum_outlined;
      case 'DELIVERY':
        return Icons.local_shipping_outlined;
      default:
        return Icons.notifications_outlined;
    }
  }
}

/// AU-059 profile editor (covers the web `/account/settings`): fields are
/// prefilled from `/userManagement/user-details` and saved via multipart
/// POST `/userManagement/editProfile` (`profileInformationDTO` JSON part).
/// The old screen was local-state toggles + a currency dropdown that was
/// never persisted or sent anywhere (matrix MISSING).
///
/// Security (change password) used to be a tab on this same screen; it is now
/// its own destination reached from the Account tab, below Verification, so
/// this screen really is only profile information. Web parity
/// (`ProfileSectionShortcuts`): a top pill-button switcher — Profile, Payout
/// details (sellers only) and Addresses — shows exactly one section at a
/// time, mirroring the web page's own three shortcut buttons rather than the
/// web's anchor-scroll behaviour, which has no mobile equivalent. Payout and
/// Addresses were previously separate pages (Addresses) or not linked from
/// anywhere at all (Payout, a fully built screen with no entry point) - both
/// are now the same widgets, just embedded instead of navigated to. My
/// payments and Payment methods are NOT part of this page on the web either
/// (My payments lives under MySpace's Buying tab; Payment methods has no
/// confirmed web entry point) - flagged separately rather than guessed here.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, this.api});
  final ApiClient? api;
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

enum _ProfileTab { profile, payout, hours, addresses }

class _SettingsScreenState extends State<SettingsScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();

  final _form = GlobalKey<FormState>();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _about = TextEditingController();
  final _organization = TextEditingController();
  final _position = TextEditingController();
  String _email = '';
  String? _avatarUrl;
  Uint8List? _avatarBytes;
  String? _avatarName;
  bool _isSeller = false;

  /// WhatsApp lives in a [PhoneNumberField] (country box + digits), which
  /// reports the canonical `+…` value; the original is what was loaded.
  String _whatsappOriginal = '';
  String _whatsappValue = '';
  String? _whatsappError;

  /// Bumped by Discard so the phone field rebuilds from the snapshot.
  int _formGeneration = 0;

  bool _loading = true;
  bool _saving = false;
  bool _deletingPhoto = false;
  String? _error;
  String? _success;

  // Web parity `app/account/settings/page.tsx`: there is no permanent Save
  // button. Editing any field flips `hasChanges` true, which is what makes
  // the "unsaved changes" banner and the Save/Discard bar exist at all -
  // before that, the page is just the profile to look at.
  bool _hasChanges = false;
  Map<String, dynamic>? _loadedProfile;

  @override
  void initState() {
    super.initState();
    _prefill();
  }

  void _onFieldChanged() {
    if (!_hasChanges || _success != null) {
      setState(() {
        _hasChanges = true;
        _success = null;
      });
    }
  }

  @override
  void dispose() {
    for (final c in [_firstName, _lastName, _about, _organization, _position]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _prefill() async {
    final token = AuthStore.instance?.token;
    if (token == null) {
      setState(() => _loading = false);
      return;
    }
    try {
      final me = await _api.getUserDetails(token);
      if (!mounted) return;
      final roles = me['roles'];
      setState(() {
        _loadedProfile = me;
        _applyProfileData(me);
        // Web parity `isSeller()`: the Payout section is only meaningful for
        // a seller, so it stays hidden rather than showing an empty card to
        // everyone.
        _isSeller =
            roles is List && roles.any((r) => r is Map && r['roleName'] == 'SELLER');
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Populates every field from a `user-details` map — shared by the initial
  /// prefill and by Discard, which just re-applies the same snapshot fetched
  /// at load time rather than refetching.
  void _applyProfileData(Map<String, dynamic> me) {
    _firstName.text = (me['firstName'] ?? '').toString();
    _lastName.text = (me['lastName'] ?? '').toString();
    _whatsappOriginal = (me['whatsAppPhoneNumber'] ?? '').toString().trim();
    _whatsappValue = _whatsappOriginal;
    _whatsappError = null;
    _about.text = (me['aboutMe'] ?? '').toString();
    _organization.text = (me['organization'] ?? '').toString();
    _position.text = (me['position'] ?? '').toString();
    _email = (me['email'] ?? AuthStore.instance?.email ?? '').toString();
    final image = (me['profileImageUrl'] ?? '').toString();
    _avatarUrl = image.isEmpty ? null : image;
    _avatarBytes = null;
    _avatarName = null;
  }

  /// Web parity `discardChanges`: revert every field to the last-loaded
  /// snapshot and drop back to the no-Save-button state.
  void _discardChanges() {
    final snapshot = _loadedProfile;
    setState(() {
      if (snapshot != null) _applyProfileData(snapshot);
      _formGeneration++;
      _hasChanges = false;
      _error = null;
      _success = null;
    });
  }

  /// Bytes, not a path: `MultipartFile.fromPath` has no filesystem on web,
  /// which is where the harness verifies this screen.
  Future<void> _pickAvatar() async {
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 800,
        imageQuality: 85,
      );
      if (picked == null) return; // cancelled
      final bytes = await picked.readAsBytes();
      if (!mounted) return;
      setState(() {
        _avatarBytes = bytes;
        _avatarName = picked.name;
        _hasChanges = true;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not open that image. Try another one.');
      }
    }
  }

  /// Web parity: the Profile Picture section offers Delete alongside Change.
  Future<void> _deletePhoto() async {
    final token = AuthStore.instance?.token;
    if (token == null || (_avatarUrl == null && _avatarBytes == null)) return;
    setState(() => _deletingPhoto = true);
    try {
      await _api.deleteProfileImage(token);
      if (!mounted) return;
      setState(() {
        _avatarUrl = null;
        _avatarBytes = null;
        _avatarName = null;
        _deletingPhoto = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _deletingPhoto = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _deletingPhoto = false;
        _error = 'Could not remove your photo. Please try again.';
      });
    }
  }

  /// The number to send, or null when it is unchanged. Sets
  /// [_whatsappError] and returns false when it cannot be saved.
  bool _checkWhatsApp() {
    final wa = _whatsappValue.trim();
    String? error;
    if (wa == _whatsappOriginal) {
      // Untouched, even if an old record lacks its country code.
    } else if (wa.isEmpty) {
      error = 'Your WhatsApp number is needed to buy and sell.';
    } else {
      error = whatsAppNumberError(wa);
    }
    setState(() => _whatsappError = error);
    return error == null;
  }

  String? get _whatsappToSend {
    final wa = _whatsappValue.trim();
    if (wa.isEmpty || wa == _whatsappOriginal) return null;
    final next = normalizeInternationalPhone(wa);
    // Re-sending the stored number re-runs the backend's duplicate check for
    // nothing (web ProfileCompletionModal note); only a change is sent.
    return next == normalizeInternationalPhone(_whatsappOriginal) ? null : next;
  }

  Future<void> _save() async {
    final fieldsOk = _form.currentState!.validate();
    if (!_checkWhatsApp() || !fieldsOk) return;
    final token = AuthStore.instance?.token;
    if (token == null) {
      setState(() => _error = 'Please log in to edit your profile.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
      _success = null;
    });
    final whatsapp = _whatsappToSend;
    final profile = {
      'firstName': _firstName.text.trim(),
      'lastName': _lastName.text.trim(),
      if (whatsapp != null) 'whatsAppPhoneNumber': whatsapp,
      'aboutMe': _about.text.trim(),
      'organization': _organization.text.trim(),
      'position': _position.text.trim(),
    };
    try {
      await _api.editProfile(
        token,
        profile,
        profileImageBytes: _avatarBytes,
        profileImageName: _avatarName,
      );
      if (!mounted) return;
      if (whatsapp != null) AccountSetup.instance.markWhatsApp(whatsapp);
      setState(() {
        // Discard now returns to what was just saved, not the first load.
        _loadedProfile = {
          ...?_loadedProfile,
          ...profile,
          'whatsAppPhoneNumber': whatsapp ?? _whatsappOriginal,
        };
        if (whatsapp != null) _whatsappOriginal = whatsapp;
        _saving = false;
        _success = 'Profile updated.';
        // Web parity: a successful save is what makes the Save/Discard bar
        // disappear again - there's nothing left unsaved. (Avatar bytes stay
        // as-is: this endpoint's response doesn't hand back a fresh URL, and
        // the local preview is already showing the just-uploaded image.)
        _hasChanges = false;
      });
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Could not save your profile. Please try again.';
      });
    }
  }

  _ProfileTab _tab = _ProfileTab.profile;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AccountSetup.instance,
      builder: (context, _) => _buildScreen(context),
    );
  }

  Widget _buildScreen(BuildContext context) {
    final setup = AccountSetup.instance.status;
    // Web parity `ProfileSectionShortcuts`: Payout (and Working hours) are
    // only ever tabs for a seller — they simply are not choices for anyone
    // else. A red dot marks a tab that still needs something.
    final tabs = [
      PillTab(_ProfileTab.profile, 'Profile',
          icon: _isSeller ? null : Icons.person_outline_rounded,
          attention: setup != null && !setup.isDone(SetupStep.whatsapp)),
      if (_isSeller)
        PillTab(_ProfileTab.payout, 'Payout',
            attention:
                setup != null && setup.showPayout && !setup.payoutConfigured),
      if (_isSeller)
        PillTab(_ProfileTab.hours, 'Hours',
            attention:
                setup != null && setup.showHours && !setup.hoursConfigured),
      PillTab(_ProfileTab.addresses, 'Addresses',
          icon: _isSeller ? null : Icons.place_outlined,
          attention: setup != null && !setup.isDone(SetupStep.location)),
    ];
    // A seller's Payout tab can disappear mid-session — never strand the
    // view on a tab that no longer exists.
    final selected =
        tabs.any((t) => t.value == _tab) ? _tab : _ProfileTab.profile;
    final onProfile = !_loading && selected == _ProfileTab.profile;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile Information')),
      bottomNavigationBar: onProfile ? _saveBar() : null,
      body: _loading
          ? const FeedSkeleton(itemCount: 4)
          : AccountFormTheme(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: PillTabs<_ProfileTab>(
                      key: const ValueKey('profile-tabs'),
                      tabs: tabs,
                      selected: selected,
                      onChanged: (t) => setState(() => _tab = t),
                    ),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                      children: switch (selected) {
                        _ProfileTab.profile => _profileSection(),
                        _ProfileTab.payout => const [
                            PayoutDetailsSection(embedded: true)
                          ],
                        _ProfileTab.hours => [WorkingHoursSection(api: _api)],
                        _ProfileTab.addresses => const [
                            AddressBookSection(embedded: true)
                          ],
                      },
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  /// Always there on the Profile tab, so there is never a question of how to
  /// save: it says whether anything is unsaved, and Save only lights up once
  /// something changed.
  Widget _saveBar() {
    final palette = AppPalette.of(context);
    final (IconData icon, Color tone, String status) = _error != null
        ? (Icons.error_outline_rounded, palette.dangerText, _error!)
        : _hasChanges
            ? (
                Icons.edit_note_rounded,
                palette.warningText,
                'You have unsaved changes in your profile'
              )
            : _success != null
                ? (Icons.check_circle_rounded, palette.successText, _success!)
                : (
                    Icons.info_outline_rounded,
                    palette.textSecondary,
                    'Edit any field, then tap Save changes.'
                  );
    return Material(
      color: palette.surface,
      elevation: 10,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              Icon(icon, size: 17, color: tone),
              const SizedBox(width: 6),
              Expanded(
                child: Text(status,
                    key: const ValueKey('profile-save-status'),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: tone,
                        fontWeight: FontWeight.w600,
                        fontSize: 12.5)),
              ),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              if (_hasChanges) ...[
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : _discardChanges,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    child: const Text('Discard'),
                  ),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                flex: 2,
                child: FilledButton.icon(
                  key: const ValueKey('profile-save'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandBlue,
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: _saving || !_hasChanges ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.check_rounded, size: 18),
                  label: const Text('Save Changes',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  /// Web parity `app/account/settings/page.tsx`: Picture → Name/Email/Phone →
  /// About Me → Organization Details, grouped into cards. This is just the
  /// Profile tab; Payout, Hours and Addresses are their own tabs, and account
  /// deletion lives under Security, away from everyday editing.
  List<Widget> _profileSection() {
    final palette = AppPalette.of(context);
    final name = '${_firstName.text.trim()} ${_lastName.text.trim()}'.trim();
    final hasPhoto = _avatarUrl != null || _avatarBytes != null;
    return [
      Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _identityCard(name, hasPhoto),
            const SizedBox(height: 16),
            Row(children: [
              Icon(Icons.edit_outlined, size: 16, color: palette.accentInk),
              const SizedBox(width: 6),
              Expanded(
                child: Text('Edit your details below, then tap Save changes.',
                    style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: palette.textSecondary)),
              ),
            ]),
            const SizedBox(height: 12),
            AccountSection(
              title: 'Personal details',
              icon: Icons.badge_outlined,
              child: Column(children: [
                TextFormField(
                  controller: _firstName,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                      labelText: 'First Name',
                      prefixIcon: Icon(Icons.person_outline_rounded)),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                  onChanged: (_) => _onFieldChanged(),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _lastName,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                      labelText: 'Last Name',
                      prefixIcon: Icon(Icons.person_outline_rounded)),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                  onChanged: (_) => _onFieldChanged(),
                ),
              ]),
            ),
            const SizedBox(height: 14),
            AccountSection(
              title: 'Contact',
              icon: Icons.contact_phone_outlined,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Read-only, like the web: the address is the login
                  // identity and changing it is a separate, verified flow.
                  TextFormField(
                    key: const Key('settings-email'),
                    initialValue: _email,
                    enabled: false,
                    decoration: InputDecoration(
                      labelText: 'Email Address',
                      prefixIcon: const Icon(Icons.mail_outline_rounded),
                      suffixIcon: Padding(
                        padding: const EdgeInsets.only(right: 10),
                        child: Align(
                          widthFactor: 1,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: palette.successFill,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text('Verified',
                                style: TextStyle(
                                    color: palette.successText,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700)),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (_whatsappOriginal.isEmpty) ...[
                    Row(children: [
                      Icon(Icons.error_outline_rounded,
                          size: 16, color: palette.warningText),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                            'Add your WhatsApp number so buyers and our team can reach you.',
                            style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                color: palette.warningText)),
                      ),
                    ]),
                    const SizedBox(height: 10),
                  ],
                  PhoneNumberField(
                    key: ValueKey('settings-whatsapp-$_formGeneration'),
                    initialValue: _whatsappOriginal,
                    label: 'WhatsApp Number',
                    helperText: 'Buyers use this to contact you',
                    errorText: _whatsappError,
                    onChanged: (v) {
                      _whatsappValue = v;
                      if (_whatsappError != null) {
                        setState(() => _whatsappError = null);
                      }
                      _onFieldChanged();
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            AccountSection(
              title: 'About you',
              icon: Icons.notes_rounded,
              subtitle: 'Shown on your shop',
              child: TextFormField(
                controller: _about,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'About Me / Bio (Optional)',
                  hintText: 'A line or two buyers see on your shop',
                  alignLabelWithHint: true,
                ),
                onChanged: (_) => _onFieldChanged(),
              ),
            ),
            const SizedBox(height: 14),
            // Web parity: a bordered "Organization Details" block.
            AccountSection(
              title: 'Organization Details',
              icon: Icons.business_outlined,
              child: Column(children: [
                TextFormField(
                  controller: _organization,
                  decoration: const InputDecoration(
                      labelText: 'Organization',
                      hintText: 'e.g., United Nations',
                      prefixIcon: Icon(Icons.apartment_rounded)),
                  onChanged: (_) => _onFieldChanged(),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _position,
                  decoration: const InputDecoration(
                      labelText: 'Position (Optional)',
                      hintText: 'e.g., Program Officer',
                      prefixIcon: Icon(Icons.work_outline_rounded)),
                  onChanged: (_) => _onFieldChanged(),
                ),
              ]),
            ),
          ],
        ),
      ),
    ];
  }

  /// The brand header: photo (tap to change), name, sign-in email.
  Widget _identityCard(String name, bool hasPhoto) {
    final url = _avatarUrl;
    Widget photo;
    if (_avatarBytes != null) {
      photo = Image.memory(_avatarBytes!, fit: BoxFit.cover);
    } else if (url != null) {
      // Through the app's image loader: the stored value is a backend path
      // that has to be resolved against the API host — a bare NetworkImage
      // of it never loaded.
      photo = AppImage(AppConfig.resolveAssetUrl(url),
          fit: BoxFit.cover, width: 84, height: 84);
    } else {
      photo = _avatarFallback(name);
    }
    return Container(
      key: const ValueKey('profile-identity'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.brandBlue, AppColors.heroBlue700],
        ),
      ),
      child: Row(children: [
        GestureDetector(
          onTap: _pickAvatar,
          child: Stack(clipBehavior: Clip.none, children: [
            Container(
              width: 84,
              height: 84,
              padding: const EdgeInsets.all(3),
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: BrandStage.glassLine,
              ),
              child: ClipOval(child: SizedBox.expand(child: photo)),
            ),
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: BrandStage.ink,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.brandBlue, width: 2),
                ),
                child: const Icon(Icons.photo_camera_rounded,
                    size: 15, color: BrandStage.emblemInk),
              ),
            ),
          ]),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(name.isEmpty ? 'Your profile' : name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                      color: BrandStage.ink)),
              if (_email.isNotEmpty)
                Text(_email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 12.5, color: BrandStage.inkSoft)),
              const SizedBox(height: 8),
              Wrap(spacing: 6, runSpacing: 6, children: [
                _HeaderChip(
                  icon: Icons.photo_camera_outlined,
                  label: hasPhoto ? 'Change' : 'Add photo',
                  onTap: _pickAvatar,
                ),
                if (hasPhoto)
                  _HeaderChip(
                    icon: Icons.close_rounded,
                    label: 'Remove',
                    busy: _deletingPhoto,
                    onTap: _deletingPhoto ? null : _deletePhoto,
                  ),
              ]),
            ],
          ),
        ),
      ]),
    );
  }

  Widget _avatarFallback(String name) {
    final initials = name
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .take(2)
        .map((p) => p[0].toUpperCase())
        .join();
    return Container(
      color: BrandStage.glass,
      alignment: Alignment.center,
      child: initials.isEmpty
          ? const Icon(Icons.person_rounded, size: 38, color: BrandStage.ink)
          : Text(initials,
              style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: BrandStage.ink)),
    );
  }
}

/// A glassy action chip on the brand header.
class _HeaderChip extends StatelessWidget {
  const _HeaderChip(
      {required this.icon, required this.label, this.onTap, this.busy = false});
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BrandStage.glass,
      shape: const StadiumBorder(side: BorderSide(color: BrandStage.glassLine)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            busy
                ? const SizedBox(
                    width: 13,
                    height: 13,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: BrandStage.ink))
                : Icon(icon, size: 14, color: BrandStage.ink),
            const SizedBox(width: 5),
            Text(label,
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: BrandStage.ink)),
          ]),
        ),
      ),
    );
  }
}

/// Account deletion, kept deliberately out of quick reach: Account →
/// Security → "Delete account" at the very bottom opens this page. Google
/// Play still requires an in-app path; it just no longer sits under every
/// profile edit.
class DeleteAccountScreen extends StatelessWidget {
  const DeleteAccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Delete account')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [_DeleteAccountSection()],
      ),
    );
  }
}

/// Change password (covers the web's Security tab on `/account/settings`).
/// Used to be a segmented-control half of Profile Information; now its own
/// destination, reached from the Account tab below Verification, so Profile
/// Information really is only profile information.
class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key, this.api});
  final ApiClient? api;
  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  final _form = GlobalKey<FormState>();
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmPassword = TextEditingController();

  bool _changing = false;
  String? _error;
  String? _success;

  @override
  void dispose() {
    _currentPassword.dispose();
    _newPassword.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    if (!_form.currentState!.validate()) return;
    final token = AuthStore.instance?.token;
    if (token == null) {
      setState(() => _error = 'Please log in to change your password.');
      return;
    }
    setState(() {
      _changing = true;
      _error = null;
      _success = null;
    });
    try {
      await _api.changePassword(
        token,
        currentPassword: _currentPassword.text,
        newPassword: _newPassword.text,
      );
      if (!mounted) return;
      setState(() {
        _changing = false;
        _success = 'Password changed.';
        _currentPassword.clear();
        _newPassword.clear();
        _confirmPassword.clear();
      });
    } on ApiException catch (e) {
      // The backend's own message (e.g. a wrong current password) is shown
      // verbatim - never a generic success.
      if (!mounted) return;
      setState(() {
        _changing = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _changing = false;
        _error = 'Could not change your password. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Security')),
      body: AccountFormTheme(
        child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Change password',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(
                  'You will stay signed in on this device.',
                  style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 13),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _currentPassword,
                  obscureText: true,
                  decoration: const InputDecoration(
                      labelText: 'Current password', border: OutlineInputBorder()),
                  validator: (v) =>
                      (v == null || v.isEmpty) ? 'Enter your current password' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _newPassword,
                  obscureText: true,
                  decoration: const InputDecoration(
                      labelText: 'New password', border: OutlineInputBorder()),
                  validator: (v) =>
                      (v == null || v.length < 8) ? 'Use at least 8 characters' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _confirmPassword,
                  obscureText: true,
                  decoration: const InputDecoration(
                      labelText: 'Confirm new password', border: OutlineInputBorder()),
                  validator: (v) =>
                      v != _newPassword.text ? 'Passwords do not match' : null,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  ErrorText(error: _error),
                ],
                if (_success != null) ...[
                  const SizedBox(height: 12),
                  Text(_success!,
                      style: const TextStyle(
                          color: AppColors.accentGreen, fontWeight: FontWeight.w600)),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandBlue,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: _changing ? null : _changePassword,
                  child: _changing
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Change password'),
                ),
              ],
            ),
          ),
          // Out of quick reach on purpose: a plain link at the very bottom,
          // opening its own page with the full warning.
          const SizedBox(height: 48),
          Divider(color: AppPalette.of(context).border),
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              key: const ValueKey('security-delete-account'),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  settings: const RouteSettings(name: '/account/security/delete-account'),
                  builder: (_) => const DeleteAccountScreen())),
              style: TextButton.styleFrom(
                  foregroundColor: AppPalette.of(context).textSecondary),
              child: const Text('Delete account'),
            ),
          ),
        ],
      ),
      ),
    );
  }
}

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key, this.title = 'Help'});
  final String title;
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('GloboExpats — Tanzania\'s expat marketplace',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          SizedBox(height: 12),
          Text(
            'Buy and sell quality items in Dar es Salaam, Arusha and across East Africa. '
            'Connect with verified sellers and join the expat community.\n\n'
            'Need help? Visit the FAQ on the web app, or contact support at '
            'info@globoexpats.com or WhatsApp +255 693 749 306.\n\n'
            'Terms, privacy and platform policies are available on the website.',
            style: TextStyle(color: AppPalette.of(context).textSecondary, height: 1.5),
          ),
        ],
      ),
    );
  }
}

/// Payment methods (covers `/account/payment-methods`). First draft lists the
/// supported methods; in the sandbox the actual gateway settlement is not
/// stored per-account, so this is informational (never fakes a card).
class PaymentMethodsScreen extends StatelessWidget {
  const PaymentMethodsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment methods')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const ListTile(
            leading: Icon(Icons.payments_outlined, color: Color(0xFF16A34A)),
            title: Text('Mobile money'),
            subtitle: Text('Payment on delivery of the order'),
          ),
          ListTile(
            leading: Icon(Icons.credit_card, color: AppPalette.of(context).accentInk),
            title: Text('Card (CARD)'),
            subtitle: Text('Settled through the gateway on checkout'),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Payments are processed through the platform gateway. A payment is only '
              'recorded as successful when the backend confirms it — the app never fakes it.',
              style: TextStyle(
                  color: AppPalette.of(context).textSecondary,
                  fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

/// Account deletion — required by Google Play's User Data policy for any app
/// that lets users create an account.
///
/// The backend has no deletion endpoint yet (only address and profile-image
/// deletion exist), so this raises a deletion REQUEST through the support
/// channel the app already publishes rather than pretending to delete
/// anything. That is the honest interim: Play accepts a request-based flow as
/// long as it genuinely results in deletion, and the copy below tells the user
/// exactly what will happen and when. Swap `_requestDeletion` for a real
/// `DELETE /api/v1/userManagement/account` call the moment one exists.
class _DeleteAccountSection extends StatefulWidget {
  const _DeleteAccountSection();

  /// Public page carrying the same request path, which Play requires to be
  /// reachable WITHOUT installing the app.
  static const webDeletionUrl = 'https://www.globoexpats.com/account/delete';

  @override
  State<_DeleteAccountSection> createState() => _DeleteAccountSectionState();
}

class _DeleteAccountSectionState extends State<_DeleteAccountSection> {
  bool _deleting = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppPalette.of(context).dangerFill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.of(context).dangerBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Row(children: [
          Icon(Icons.warning_amber_rounded, size: 18, color: Color(0xFFDC2626)),
          SizedBox(width: 8),
          Text('Delete account',
              style: TextStyle(
                  fontWeight: FontWeight.w800, fontSize: 14, color: Color(0xFFDC2626))),
        ]),
        const SizedBox(height: 6),
        Text(
            'Deleting your account removes your profile, listings, saved addresses '
            'and order history. Orders that are still in progress must be completed '
            'or cancelled first. This cannot be undone.',
            style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary, height: 1.35)),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            key: const ValueKey('delete-account'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFFDC2626),
              side: const BorderSide(color: Color(0xFFDC2626)),
            ),
            icon: const Icon(Icons.delete_forever_outlined, size: 18),
            label: Text(_deleting ? 'Deleting account...' : 'Delete account'),
            onPressed: _deleting ? null : () => _confirm(context),
          ),
        ),
        const SizedBox(height: 6),
        Text('If you cannot sign in, use ${_DeleteAccountSection.webDeletionUrl}',
            style: TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary)),
      ]),
    );
  }

  Future<void> _confirm(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text(
            'This will delete or anonymize your profile, saved addresses, saved '
            'items, active cart, payout details, verification document links and '
            'active public content. Some transaction records may be retained where '
            'required for legal, payment, fraud or support reasons.\n\n'
            'This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Keep my account')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Delete my account'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!context.mounted) return;

    final store = AuthStore.instance;
    if (store == null) {
      messenger.showSnackBar(
          const SnackBar(content: Text('Please log in again to delete your account.')));
      return;
    }
    setState(() => _deleting = true);
    final okDeleted = await store.deleteAccount();
    if (!context.mounted) return;
    setState(() => _deleting = false);
    if (okDeleted) {
      messenger.showSnackBar(
          const SnackBar(content: Text('Your account has been deleted.')));
      router.go('/');
    } else {
      messenger.showSnackBar(SnackBar(
        content: Text(store.error ??
            'Could not delete your account. Try again or use ${_DeleteAccountSection.webDeletionUrl}.'),
      ));
    }
  }
}
