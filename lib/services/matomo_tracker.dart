import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import '../config.dart';
import '../storage/kv_store.dart';

/// Lightweight Matomo tracker for the mobile app — a thin client of the
/// Matomo HTTP Tracking API (matomo.php), the officially supported route for
/// Flutter per the Matomo team. Mirrors the web app's tracking model
/// (components/matomo-tag-manager.tsx): page/screen views, ecommerce product
/// views / cart updates / orders, events (Product View/AddToCart, Ecommerce
/// Purchase, Share, Error), site search, and a user id bound to the
/// signed-in account.
///
/// Design constraints:
/// - Never throws into UI paths: every send is fire-and-forget with a timeout.
/// - Hits are queued and flushed on a short timer (and on demand) so bursts of
///   events cost a handful of requests, and so a transient network failure
///   only delays a hit instead of dropping it (queue persisted to KvStore).
/// - The visitor id is a random 16-hex-char id persisted locally (Matomo's
///   `_id`), stable across sessions — NOT the user id.
/// - App screens are tracked with a synthetic URL so app traffic is separable
///   inside the Matomo site by hostname segment. The host is flavour-aware:
///   dev builds report under https://app-dev.globoexpats.com, prod builds
///   under https://app.globoexpats.com — two distinct "domains" so the dev
///   and live apps can never be confused, even though each reports to its own
///   Matomo instance anyway.
class MatomoTracking {
  MatomoTracking._();
  static final MatomoTracking instance = MatomoTracking._();

  static const _queueKey = 'matomo_hit_queue_v1';
  static const _visitorKey = 'matomo_visitor_id_v1';
  static const String _appUrlBase =
      AppConfig.isDevBuild ? 'https://app-dev.globoexpats.com' : 'https://app.globoexpats.com';

  /// Disabled explicitly with --dart-define=MATOMO_TRACKING=false
  /// (local sims / tests). Enabled by default.
  static bool get _enabled =>
      const bool.fromEnvironment('MATOMO_TRACKING', defaultValue: true);

  String? _endpoint; // https://host/matomo.php
  String? _siteId;
  String? _visitorId;
  String? _userId;
  final List<Map<String, String>> _queue = <Map<String, String>>[];
  Timer? _flushTimer;
  bool _sending = false;
  /// Replaceable in tests (MockClient); production uses the default client.
  @visibleForTesting
  http.Client client = http.Client();

  /// Hits recorded before [init] finished. Replayed once init completes
  /// instead of being silently dropped.
  final List<Map<String, String>> _pending = <Map<String, String>>[];
  bool _initDone = false;
  AppLifecycleListener? _lifecycle;

  /// The screen the user is on: events are attributed to it and reuse its
  /// page-view id, so Matomo groups them under that page view.
  String _currentUrl = '$_appUrlBase/';
  String? _currentPvId;

  /// Last router location tracked, so a router notification that does not
  /// change the location never double-counts.
  String? _lastLocation;

  /// Called once from main() after KvStore is loaded and the persisted
  /// session restored, so the first hit already carries the user id.
  /// Safe to call twice.
  Future<void> init() async {
    if (!_enabled) {
      debugPrint('[Matomo] tracking disabled by MATOMO_TRACKING=false');
      return;
    }
    if (_initDone) return;
    try {
      _siteId = AppConfig.matomoSiteId;
      final raw = AppConfig.matomoUrl.trim();
      if (raw.isEmpty) return;
      final uri = Uri.parse(raw);
      // AppConfig.matomoUrl points at the reporting API (…/index.php). The
      // tracking endpoint lives beside it: same host, /matomo.php.
      _endpoint = Uri(
        scheme: uri.scheme.isEmpty ? 'https' : uri.scheme,
        host: uri.host,
        port: uri.hasPort ? uri.port : null,
        path: '/matomo.php',
      ).toString();

      var vid = KvStore.instance.getString(_visitorKey);
      if (vid == null || vid.length != 16 || !RegExp(r'^[0-9a-f]+$').hasMatch(vid)) {
        final rnd = Random.secure();
        vid = List.generate(16, (_) => rnd.nextInt(16).toRadixString(16)).join();
        await KvStore.instance.setString(_visitorKey, vid);
      }
      _visitorId = vid;

      final saved = KvStore.instance.getString(_queueKey);
      if (saved != null && saved.isNotEmpty) {
        for (final line in saved.split('\n')) {
          if (line.isEmpty) continue;
          try {
            final map = <String, String>{};
            for (final pair in line.split('&')) {
              final i = pair.indexOf('=');
              if (i <= 0) continue;
              final k = Uri.decodeComponent(pair.substring(0, i));
              final v = Uri.decodeComponent(pair.substring(i + 1));
              map[k] = v;
            }
            _queue.add(map);
          } catch (_) {/* skip malformed line */}
        }
      }
      _initDone = true;
      // Send what is queued as soon as the app is backgrounded — the 5s
      // timer may never fire once the OS suspends or kills the process.
      _lifecycle ??= AppLifecycleListener(
        onPause: () => unawaited(flush()),
        onHide: () => unawaited(flush()),
      );
      for (final hit in _pending) {
        _enqueueReady(hit);
      }
      _pending.clear();
      _scheduleFlush();
      debugPrint('[Matomo] initialized: site=$_siteId visitor=$_visitorId '
          'user=${_userId == null ? '-' : 'set'} queued=${_queue.length}');
    } catch (e) {
      debugPrint('[Matomo] init failed (tracking off): $e');
    }
  }

  /// Bind hits to the signed-in account (web parity: setMatomoUserId, called
  /// with the account email). Every hit enqueued afterwards carries `uid`;
  /// null on logout (web: resetUserId).
  void setUserId(String? userId) {
    if (!_enabled) return;
    final next = (userId == null || userId.trim().isEmpty) ? null : userId.trim();
    if (next == _userId) return;
    _userId = next;
    debugPrint('[Matomo] user id ${_userId == null ? 'reset' : 'set'}');
  }

  /// Follows every go_router location change — `go`, `push`, `pop`,
  /// redirects and the initial route — including routes inside the
  /// ShellRoute's nested navigator, which a root NavigatorObserver never
  /// sees. Web parity: the tag manager tracks a page view per pathname +
  /// search change.
  void attachRouter(GoRouter router) {
    // buildRouter runs inside a build(): a rebuilt app must not leave the old
    // router's listener behind (double page views).
    final prev = _router;
    if (prev != null && _routerListener != null) {
      prev.routerDelegate.removeListener(_routerListener!);
    }
    _router = router;
    void onChange() {
      try {
        final uri = locationOf(router.routerDelegate.currentConfiguration);
        if (uri == null) return;
        final loc = uri.toString();
        if (loc == _lastLocation) return;
        _lastLocation = loc;
        trackScreen(loc);
      } catch (e) {
        debugPrint('[Matomo] route tracking skipped: $e');
      }
    }

    _routerListener = onChange;
    router.routerDelegate.addListener(onChange);
    onChange(); // in case the initial route already resolved
  }

  GoRouter? _router;
  VoidCallback? _routerListener;

  /// Hits not yet delivered (queued + waiting for init), oldest first.
  @visibleForTesting
  List<Map<String, String>> get debugHits => [..._queue, ..._pending];

  /// Clears queued hits and screen state between tests.
  @visibleForTesting
  void debugReset() {
    _queue.clear();
    _pending.clear();
    _flushTimer?.cancel();
    _flushTimer = null;
    _lastLocation = null;
    _currentUrl = '$_appUrlBase/';
    _currentPvId = null;
    _userId = null;
  }

  /// The location the user actually sees. `push` keeps the base list's `uri`
  /// and appends an [ImperativeRouteMatch], so the top-most imperative match
  /// (possibly nested inside a shell) wins over [RouteMatchList.uri].
  @visibleForTesting
  static Uri? locationOf(RouteMatchList config) {
    if (config.isEmpty) return null;
    Uri? pushed;
    void walk(List<RouteMatchBase> matches) {
      for (final m in matches) {
        if (m is ImperativeRouteMatch) pushed = m.matches.uri;
        if (m is ShellRouteMatch) walk(m.matches);
      }
    }

    walk(config.matches);
    return pushed ?? config.uri;
  }

  /// Screen/app-page view (web parity: trackPageView per route). Becomes the
  /// current screen for subsequent events.
  void trackScreen(String path, {String? title}) {
    final p = path.startsWith('/') ? path : '/$path';
    _currentUrl = '$_appUrlBase$p';
    _currentPvId = _newPvId();
    _enqueue({
      'url': _currentUrl,
      'action_name': title ?? titleFor(p),
      'pv_id': _currentPvId!,
    });
  }

  /// Restores the current-screen attribution after a pageless route is
  /// popped, without counting a new page view.
  void resumeScreen(String? path) {
    final p = (path != null && path.isNotEmpty) ? path : _lastLocation;
    if (p == null) return;
    _currentUrl = '$_appUrlBase${p.startsWith('/') ? p : '/$p'}';
  }

  /// Custom event (web parity: trackEvent(category, action, name, value)).
  /// Attributed to the current screen and its page view.
  void trackEvent(String category, String action, {String? name, num? value}) {
    _enqueue({
      'e_c': category,
      'e_a': action,
      if (name != null && name.isNotEmpty) 'e_n': name,
      if (value != null && value.isFinite) 'e_v': value.toString(),
      'url': _currentUrl,
      if (_currentPvId != null) 'pv_id': _currentPvId!,
    });
  }

  /// Site-search tracking (Matomo's Site Search reports). `search` carries
  /// the keyword itself — it was sent as the literal "1" before, so every
  /// app search reported as the keyword "1".
  void trackSearch(String keyword, {String? category, int? resultCount}) {
    final q = keyword.trim();
    if (q.isEmpty) return;
    _enqueue({
      'url': '$_appUrlBase/search?q=${Uri.encodeComponent(q)}',
      'action_name': 'Search',
      'search': q,
      if (category != null && category.isNotEmpty) 'search_cat': category,
      if (resultCount != null) 'search_count': resultCount.toString(),
      'pv_id': _newPvId(),
    });
  }

  /// Ecommerce product view (web parity: setEcommerceView + trackPageView,
  /// then a Product/View event).
  void trackProductView({
    required Object productId,
    String? productName,
    String? categoryName,
    num? price,
  }) {
    final label =
        (productName == null || productName.isEmpty) ? '$productId' : productName;
    _currentPvId = _newPvId();
    _enqueue({
      'url': _currentUrl,
      'action_name': label,
      'pv_id': _currentPvId!,
      '_pks': '$productId',
      '_pkn': productName ?? '',
      '_pkc': categoryName ?? '',
      '_pkp': '${price ?? 0}',
    });
    trackEvent('Product', 'View', name: label, value: price ?? 0);
  }

  /// Ecommerce cart update with the full cart contents (Matomo replaces the
  /// tracked cart with each update), plus the Product/AddToCart event for
  /// the item that was added (web parity: trackAddToCart).
  void trackCartUpdate({
    required List<MatomoEcommerceItem> items,
    required num cartTotal,
    MatomoEcommerceItem? added,
  }) {
    _enqueue({
      'idgoal': '0',
      'revenue': cartTotal.toString(),
      'ec_items': jsonEncode([for (final i in items) i.toJson()]),
      'url': _currentUrl,
      if (_currentPvId != null) 'pv_id': _currentPvId!,
    });
    if (added != null) {
      trackEvent('Product', 'AddToCart',
          name: added.name.isEmpty ? added.sku : added.name, value: added.price);
    }
  }

  /// Ecommerce order (web parity: trackEcommerceOrder + Ecommerce/Purchase
  /// event). Matomo ignores a repeated [orderId].
  void trackOrder({
    required String orderId,
    required num grandTotal,
    num? subTotal,
    num? tax,
    num? shipping,
    num? discount,
  }) {
    _enqueue({
      'idgoal': '0',
      'ec_id': orderId,
      'revenue': grandTotal.toString(),
      if (subTotal != null) 'ec_st': subTotal.toString(),
      if (tax != null) 'ec_tx': tax.toString(),
      if (shipping != null) 'ec_sh': shipping.toString(),
      if (discount != null) 'ec_dt': discount.toString(),
      'url': _currentUrl,
      if (_currentPvId != null) 'pv_id': _currentPvId!,
    });
    trackEvent('Ecommerce', 'Purchase', name: orderId, value: grandTotal);
  }

  /// Share Kit send (web parity: trackShare(channel, design, target)).
  void trackShare(String channel, String design, String target) =>
      trackEvent('Share', channel, name: '$target ($design)');

  /// Uncaught error (web parity: trackError → Error event).
  void trackError(Object error, {String source = 'flutter'}) {
    var msg = error.toString();
    if (msg.length > 300) msg = msg.substring(0, 300);
    trackEvent('Error', 'App Error', name: '[$source] $msg', value: 0);
  }

  String _newPvId() {
    final rnd = Random.secure();
    return List.generate(6, (_) => rnd.nextInt(16).toRadixString(16)).join();
  }

  /// `/product/42?x=1` → `product / 42`: readable Page Titles rows.
  @visibleForTesting
  static String titleFor(String path) {
    final clean = path.split('?').first;
    if (clean == '/' || clean.isEmpty) return 'Home';
    return clean.split('/').where((s) => s.isNotEmpty).join(' / ');
  }

  void _enqueue(Map<String, String> params) {
    if (!_enabled) return;
    // `h/m/s` are the visitor's LOCAL time (Matomo's local-time report);
    // `cdt` pins the hit's real timestamp because queued hits replay later.
    final now = DateTime.now();
    final hit = <String, String>{
      'idsite': _siteId ?? AppConfig.matomoSiteId,
      'rec': '1',
      'apiv': '1',
      'send_image': '0',
      if (_userId != null) 'uid': _userId!,
      // At app start the screen is not measured yet ("0x0") — leave it out.
      if (_screenRes != '0x0') 'res': _screenRes,
      'lang': _locale,
      'ua': _userAgent,
      'h': now.hour.toString(),
      'm': now.minute.toString(),
      's': now.second.toString(),
      'cdt': (now.millisecondsSinceEpoch ~/ 1000).toString(),
      ...params,
    };
    if (!_initDone) {
      if (_pending.length < 50) _pending.add(hit);
      return;
    }
    _enqueueReady(hit);
  }

  void _enqueueReady(Map<String, String> hit) {
    if (_endpoint == null || _visitorId == null) return;
    hit['_id'] = _visitorId!;
    _queue.add(hit);
    if (_queue.length > 200) _queue.removeRange(0, _queue.length - 200);
    _persistQueue();
    _scheduleFlush();
  }

  String get _screenRes {
    try {
      final view = WidgetsBinding.instance.platformDispatcher.views.first;
      final dpr = view.devicePixelRatio;
      final w = (view.physicalSize.width / dpr).round();
      final h = (view.physicalSize.height / dpr).round();
      return '${w}x$h';
    } catch (_) {
      return '';
    }
  }

  String get _locale {
    try {
      return WidgetsBinding.instance.platformDispatcher.locale.toLanguageTag();
    } catch (_) {
      return '';
    }
  }

  /// The HTTP client's default UA ("Dart/3.x (dart:io)") tells Matomo
  /// nothing, so every app visit landed as unknown OS / device type. Send a
  /// UA Matomo's device detector maps to the right OS and a smartphone.
  static final String _userAgent = () {
    const app = 'GloboExpatsApp/${AppConfig.isDevBuild ? 'dev' : 'live'}';
    if (kIsWeb) return 'Mozilla/5.0 $app';
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'Mozilla/5.0 (Linux; Android; Mobile) $app';
      case TargetPlatform.iOS:
        return 'Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X) Mobile $app';
      default:
        return 'Mozilla/5.0 $app';
    }
  }();

  void _scheduleFlush() {
    _flushTimer ??= Timer(const Duration(seconds: 5), () {
      _flushTimer = null;
      unawaited(flush());
    });
  }

  /// Sends queued hits. Network failures and 5xx keep hits queued for the
  /// next attempt. A 4xx is Matomo rejecting that hit for good (e.g. a `cdt`
  /// older than 24h without a token), so it is dropped — before, one such
  /// hit sat at the head of the queue and blocked every later hit forever.
  Future<void> flush() async {
    if (!_enabled || _sending || _endpoint == null || _queue.isEmpty) return;
    _sending = true;
    try {
      while (_queue.isNotEmpty) {
        final hit = _queue.first;
        try {
          final resp = await client
              .post(Uri.parse(_endpoint!),
                  body: hit, headers: {'Content-Type': 'application/x-www-form-urlencoded'})
              .timeout(const Duration(seconds: 8));
          final code = resp.statusCode;
          if (code >= 200 && code < 300) {
            _queue.remove(hit);
          } else if (code >= 400 && code < 500 && code != 408 && code != 429) {
            debugPrint('[Matomo] hit rejected ($code), dropped: ${hit['url']}');
            _queue.remove(hit);
          } else {
            _scheduleRetry(); // transient server issue — retry later
            break;
          }
          _persistQueue();
        } catch (_) {
          _scheduleRetry(); // offline — retry later
          break;
        }
      }
    } finally {
      _sending = false;
    }
  }

  /// A failed flush must never leave queued hits stranded: re-arm the timer
  /// (with a longer interval) until the network or server recovers.
  void _scheduleRetry() {
    _flushTimer ??= Timer(const Duration(seconds: 20), () {
      _flushTimer = null;
      unawaited(flush());
    });
  }

  Future<void> _persistQueue() async {
    try {
      final lines = _queue
          .map((m) => m.entries
              .map((e) => '${Uri.encodeComponent(e.key)}=${Uri.encodeComponent(e.value)}')
              .join('&'))
          .join('\n');
      await KvStore.instance.setString(_queueKey, lines);
    } catch (_) {/* persistence is best-effort */}
  }
}

/// One line of a Matomo ecommerce cart/order: `[sku, name, category, price, qty]`.
class MatomoEcommerceItem {
  const MatomoEcommerceItem({
    required this.sku,
    required this.name,
    this.category,
    required this.price,
    this.quantity = 1,
  });

  final String sku;
  final String name;
  final String? category;
  final num price;
  final int quantity;

  List<Object> toJson() => [sku, name, category ?? '', price, quantity];
}

/// Navigator observer for *pageless* routes — `Navigator.push(MaterialPageRoute(
/// settings: RouteSettings(name: '/…')))` screens that go_router never hears
/// about. Router-owned pages are skipped ([MatomoTracking.attachRouter]
/// already counts them), so nothing is double-counted. Attach one instance
/// per navigator: the root navigator AND the ShellRoute's navigator.
class MatomoRouteObserver extends NavigatorObserver {
  static String? _nameOf(Route<dynamic>? route) {
    if (route is! PageRoute) return null;
    if (route.settings is Page) return null; // go_router page
    final name = route.settings.name;
    return (name == null || name.isEmpty) ? null : name;
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    final name = _nameOf(route);
    if (name != null) MatomoTracking.instance.trackScreen(name);
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    final name = _nameOf(newRoute);
    if (name != null) MatomoTracking.instance.trackScreen(name);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (_nameOf(route) == null) return;
    MatomoTracking.instance.resumeScreen(_nameOf(previousRoute));
  }
}
