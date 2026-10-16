import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/pending_actions.dart';
import '../models/order.dart' as models;
import '../theme.dart';
import '../theme_controller.dart';
import '../widgets/account_setup.dart';
import '../widgets/delivery_codes_sheet.dart';
import '../widgets/globo_app_bar.dart';
import '../widgets/motion.dart';
import '../widgets/tour_anchor.dart';
import '../widgets/seller_verification_gate.dart' show isVerifiedAccountDetails;
import '../widgets/shop_profile_card.dart';
import 'account_misc_screens.dart' show SecurityScreen, HelpScreen;
import 'home_screen.dart';
import 'delivery_dashboard_screens.dart';
import 'requests_screen.dart';
import 'app_tour.dart';
import 'welcome_guide_screen.dart';

/// Root scaffold: one persistent top bar ([GloboAppBar]) and one persistent
/// bottom navigation, with the five tab screens rendered between them.
///
/// Mobile-web navigation adapted for the app: Home · Community · Sell ·
/// MySpace · Profile. Community replaces the web's Marketplace destination,
/// while Sell keeps the elevated centre treatment.
///
/// Every tab is a `ShellRoute` child (see `app_router.dart`), so the bars stay
/// put while navigating. They used to disappear: only `/` was a shell child,
/// so the first tap on Marketplace pushed a full-screen route with no bottom
/// nav and no way back.
class AppShell extends StatefulWidget {
  final AuthStore store;
  final Widget? child;
  final int initialTab;
  final ApiClient? api;
  final bool hideChrome;

  /// The current route, handed down from [AppShellWithRouter]. The pending
  /// action banner needs it to suppress a step whose destination is already
  /// on screen (web `isPendingActionDestination`). Null when the shell is
  /// pumped bare, where nothing is suppressed.
  final Uri? location;

  const AppShell({
    super.key,
    required this.store,
    this.child,
    this.initialTab = 0,
    this.api,
    this.hideChrome = false,
    this.location,
  });

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  late int _index = widget.initialTab.clamp(0, _navItems.length - 1);

  /// Bumped on every tab change so the top bar re-reads the unread count
  /// without a background timer.
  final ValueNotifier<int> _chromeRefresh = ValueNotifier<int>(0);

  static const _navItems = [
    (icon: Icons.home_outlined, label: 'Home', route: '/'),
    // Web parity (header/navigation.tsx): Community is lucide `Users`, and
    // Sell is `CircleDollarSign` / `DollarSign` — not a megaphone and a
    // price tag, which is what these two used to be.
    (icon: Icons.people_outline, label: 'Community', route: '/requests'),
    (icon: Icons.attach_money_rounded, label: 'Sell', route: '/sell'),
    (
      icon: Icons.inventory_2_outlined,
      label: 'MySpace',
      route: '/expat/dashboard'
    ),
    (icon: Icons.person_outline, label: 'Account', route: '/account'),
  ];

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_offerAccountSetup);
    _offerAccountSetup();
  }

  /// A signed-in account still missing its WhatsApp number or location is
  /// offered the setup checklist once, after the screen has painted — the
  /// mobile stand-in for the web's blocking setup popups. Never over the
  /// sell flow (it asks for exactly what it needs in place) or the tour.
  String? _setupOfferedFor;

  /// A fresh login that landed on the sell flow: offered once the seller
  /// leaves it rather than never.
  String? _setupDeferredFor;

  void _offerAccountSetup() {
    if (widget.hideChrome || !AccountSetupNudge.enabled) return;
    final token = widget.store.token;
    if (token == null || token.isEmpty) {
      // Signed out: the next login is a new one, whatever token it carries.
      _setupOfferedFor = null;
      _setupDeferredFor = null;
      return;
    }
    if (token == _setupOfferedFor) return;
    _setupOfferedFor = token;
    final freshSignIn = widget.store.consumeFreshSignIn();
    Future<void>.delayed(const Duration(milliseconds: 1200), () {
      if (!mounted || AppTour.running) return;
      if (widget.store.token != token) return;
      final path = widget.location?.path ?? '';
      if (path.startsWith('/sell')) {
        if (freshSignIn) _setupDeferredFor = token;
        return;
      }
      unawaited(AccountSetupNudge.maybeShow(context, widget.store.api, token,
          widget.store.email ?? token,
          freshSignIn: freshSignIn));
    });
  }

  /// The deferred offer, once the seller has moved off the sell flow.
  void _offerDeferredSetup() {
    final token = _setupDeferredFor;
    if (token == null || widget.hideChrome) return;
    if ((widget.location?.path ?? '').startsWith('/sell')) return;
    _setupDeferredFor = null;
    if (widget.store.token != token) return;
    Future<void>.delayed(const Duration(milliseconds: 800), () {
      if (!mounted || AppTour.running || widget.store.token != token) return;
      unawaited(AccountSetupNudge.maybeShow(context, widget.store.api, token,
          widget.store.email ?? token,
          freshSignIn: true));
    });
  }

  @override
  void didUpdateWidget(covariant AppShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.store != widget.store) {
      oldWidget.store.removeListener(_offerAccountSetup);
      widget.store.addListener(_offerAccountSetup);
    }
    // The router rebuilds the shell with a new tab on every location change.
    if (oldWidget.initialTab != widget.initialTab) {
      _index = widget.initialTab.clamp(0, _navItems.length - 1);
      _chromeRefresh.value++;
    }
    if (oldWidget.location?.path != widget.location?.path) {
      _offerDeferredSetup();
    }
  }

  @override
  void dispose() {
    widget.store.removeListener(_offerAccountSetup);
    _chromeRefresh.dispose();
    super.dispose();
  }

  void _onTap(int i) {
    setState(() => _index = i);
    _chromeRefresh.value++;
    // Guarded: the shell is also pumped bare in widget tests, where there is
    // no router to navigate with.
    final signedIn = widget.store.isAuthenticated;
    final route = i == 4 && !signedIn
        ? '/login'
        : i == 2 && !signedIn
            ? '/login?returnUrl=%2Fsell'
            : _navItems[i].route;
    GoRouter.maybeOf(context)?.go(route);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.hideChrome
          ? null
          : GloboAppBar(
              api: widget.api,
              refreshSignal: _chromeRefresh,
              // Browse owns its own query field, exactly as the web header hides
              // search on /browse.
              // Home's search now lives in the bar itself (extendedSearch) and
              // Browse owns its own search controls, so neither needs the icon.
              showSearch: _index != 0 && _index != 1,
              // The full search field belongs to the HOME route only. Product
              // detail routes map back to tab 0 for bottom-nav highlighting,
              // but the web detail header stays compact there.
              extendedSearch: widget.location?.path == '/',
            ),
      body: Column(children: [
        if (!widget.hideChrome && widget.store.isAuthenticated)
          _PendingActionBanner(
              api: widget.api ?? ApiClient(),
              store: widget.store,
              refreshSignal: _chromeRefresh,
              location: widget.location),
        Expanded(
            child: widget.child ??
                IndexedStack(
                  index: _index,
                  children: [
                    HomeScreen(api: widget.api),
                    const RequestsScreen(),
                    const SizedBox.shrink(),
                    const ExpatDashboardScreen(),
                    AccountScreen(store: widget.store),
                  ],
                )),
      ]),
      bottomNavigationBar: widget.hideChrome
          ? null
          : AnimatedBuilder(
              animation: widget.store,
              builder: (context, _) => ListenableBuilder(
                listenable: PendingActionsStore.instance,
                builder: (context, _) => _WebStyleBottomNav(
                  currentIndex: _index,
                  signedIn: widget.store.isAuthenticated,
                  pendingCount: PendingActionsStore.instance.total,
                  onTap: _onTap,
                ),
              ),
            ),
    );
  }
}

class _WebStyleBottomNav extends StatelessWidget {
  const _WebStyleBottomNav({
    required this.currentIndex,
    required this.signedIn,
    required this.pendingCount,
    required this.onTap,
  });
  final int currentIndex;
  final bool signedIn;
  final int pendingCount;
  final ValueChanged<int> onTap;

  /// The same five icons as always — each with its filled twin, which the
  /// active tab switches to (outlined at rest, solid when chosen).
  static const _items = [
    (Icons.home_outlined, Icons.home_rounded, 'Home'),
    (Icons.people_outline, Icons.people_rounded, 'Community'),
    (Icons.attach_money_rounded, Icons.attach_money_rounded, 'Sell'),
    (Icons.inventory_2_outlined, Icons.inventory_2_rounded, 'MySpace'),
    // Web parity (mobile-bottom-nav.tsx): the last destination is "Account".
    (Icons.person_outline, Icons.person_rounded, 'Account'),
  ];

  void _tap(int i) {
    HapticFeedback.selectionClick();
    onTap(i);
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Material(
      color: palette.surface,
      elevation: 12,
      shadowColor: Colors.black26,
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 76,
          child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < _items.length; i++)
                    Expanded(
                      child: TourAnchor(
                        id: const [
                          'nav-home',
                          'nav-community',
                          'nav-sell',
                          'nav-myspace',
                          'nav-account'
                        ][i],
                        child: i == 2
                          ? _SellNavButton(onTap: () => _tap(2))
                          : _NavItem(
                              key: ValueKey('bottom-nav-$i'),
                              icon: _items[i].$1,
                              activeIcon: _items[i].$2,
                              label:
                                  i == 4 && !signedIn ? 'Login' : _items[i].$3,
                              active: currentIndex == i,
                              badge: i == 3 ? pendingCount : 0,
                              onTap: () => _tap(i),
                            ),
                      ),
                    ),
                ],
              ),
        ),
      ),
    );
  }
}

/// One destination. No background, no ripple: the outline swaps to the
/// filled icon with a small spring, and icon and label change colour.
class _NavItem extends StatelessWidget {
  const _NavItem({
    super.key,
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.active,
    required this.badge,
    required this.onTap,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool active;
  final int badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final activeColor = Theme.of(context).colorScheme.primary;
    return Semantics(
      selected: active,
      button: true,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 7),
          child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
            SizedBox(
              height: 32,
              child: Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.center,
                  children: [
                    TweenAnimationBuilder<double>(
                      // Re-keyed on every change, so arriving springs.
                      key: ValueKey(active),
                      tween: Tween(begin: active ? .7 : 1.0, end: 1.0),
                      duration: const Duration(milliseconds: 650),
                      curve: active ? Curves.elasticOut : Curves.easeOut,
                      builder: (context, scale, child) =>
                          Transform.scale(scale: scale, child: child),
                      child: Icon(
                        active ? activeIcon : icon,
                        size: 24,
                        color: active ? activeColor : palette.textSecondary,
                      ),
                    ),
                    if (badge > 0)
                      Positioned(
                        right: 6,
                        top: -4,
                        child: Badge(label: Text(badge > 9 ? '9+' : '$badge')),
                      ),
                  ]),
            ),
            const SizedBox(height: 4),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 300),
              curve: kEmphasizedIn,
              // Built on the theme's style: a bare TextStyle here would
              // drop the app font (Inter) for the platform default.
              style: DefaultTextStyle.of(context).style.merge(TextStyle(
                    fontSize: 10.5,
                    color: active ? activeColor : palette.textSecondary,
                    fontWeight: active ? FontWeight.w800 : FontWeight.w500,
                  )),
              child: Text(label, maxLines: 1),
            ),
          ]),
        ),
      ),
    );
  }
}

/// The raised Sell button: the brand green, punched out of the bar by a
/// ring in the bar's own colour, dipping under the thumb.
class _SellNavButton extends StatefulWidget {
  const _SellNavButton({required this.onTap});
  final VoidCallback onTap;

  @override
  State<_SellNavButton> createState() => _SellNavButtonState();
}

class _SellNavButtonState extends State<_SellNavButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Transform.translate(
      offset: const Offset(0, -13),
      child: Semantics(
        button: true,
        label: 'Sell',
        excludeSemantics: true,
        child: GestureDetector(
          key: const ValueKey('bottom-nav-2'),
          behavior: HitTestBehavior.opaque,
          onTapDown: (_) => setState(() => _down = true),
          onTapCancel: () => setState(() => _down = false),
          onTapUp: (_) => setState(() => _down = false),
          onTap: widget.onTap,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            AnimatedScale(
              scale: _down ? .9 : 1,
              duration: const Duration(milliseconds: 160),
              curve: Curves.easeOut,
              child: Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF22C55E), Color(0xFF16A34A)],
                  ),
                  border: Border.all(color: palette.surface, width: 4),
                  boxShadow: const [
                    BoxShadow(
                        color: Color(0x33000000),
                        blurRadius: 12,
                        offset: Offset(0, 4)),
                  ],
                ),
                child: const Icon(Icons.attach_money_rounded,
                    color: BrandStage.ink, size: 27),
              ),
            ),
            const SizedBox(height: 2),
            Text('Sell',
                style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: palette.textPrimary)),
          ]),
        ),
      ),
    );
  }
}

/// The global "act now" strip pinned under the top bar.
///
/// Web parity (`components/pending-actions-banner.tsx`): it shows the single
/// most urgent outstanding step, notes how many others are queued behind it as
/// "+N more tasks", and — importantly — hides itself while the user is already
/// standing on the screen that step points at.
///
/// There is no dismiss and no "mark done". The strip is a pure projection of
/// [PendingActionsStore]: when the real action succeeds the backend state
/// advances, the classifier stops returning that step, and the strip drops it
/// (and every badge downstream) on the next refresh. A manual dismiss would
/// only hide the symptom — the work would still be outstanding.
class _PendingActionBanner extends StatefulWidget {
  const _PendingActionBanner({
    required this.api,
    required this.store,
    required this.refreshSignal,
    this.location,
  });

  final ApiClient api;
  final AuthStore store;
  final ValueListenable<int> refreshSignal;

  /// The current route, or null when the shell is pumped outside a router
  /// (widget tests) — in which case nothing is suppressed.
  final Uri? location;

  @override
  State<_PendingActionBanner> createState() => _PendingActionBannerState();
}

class _PendingActionBannerState extends State<_PendingActionBanner> {
  Timer? _poll;
  DateTime? _lastLoadedAt;

  /// A tab change does not change the work outstanding; anything that does
  /// calls [requestPendingActionsRefresh] and bypasses this. Without it,
  /// moving between tabs re-read the whole order and payment list each time.
  static const _minRefreshGap = Duration(seconds: 20);

  @override
  void initState() {
    super.initState();
    widget.refreshSignal.addListener(_loadIfStale);
    pendingActionsRefreshSignal.addListener(_loadNow);
    // Deferred past the first frame: the strip is chrome, and its two list
    // reads were racing the opened screen's own requests for the connection.
    // A post-frame callback rather than a delay — the screen's own futures go
    // out from its initState, so this simply queues behind them instead of
    // guessing at a number that would also never fire under pumpAndSettle.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _loadNow();
    });
    _poll = Timer.periodic(const Duration(seconds: 60), (_) => _loadNow());
  }

  @override
  void dispose() {
    widget.refreshSignal.removeListener(_loadIfStale);
    pendingActionsRefreshSignal.removeListener(_loadNow);
    _poll?.cancel();
    super.dispose();
  }

  void _loadNow() {
    _lastLoadedAt = DateTime.now();
    unawaited(_load());
  }

  void _loadIfStale() {
    final last = _lastLoadedAt;
    if (last != null && DateTime.now().difference(last) < _minRefreshGap) {
      return;
    }
    _loadNow();
  }

  /// Re-reads the state the strip is derived from. Called on tab change, on
  /// every workflow mutation ([requestPendingActionsRefresh]), and on a slow
  /// poll so a change made elsewhere still lands.
  Future<void> _load() async {
    final token = widget.store.token;
    if (token == null || token.isEmpty) {
      PendingActionsStore.instance.clear();
      return;
    }
    String? currentUserId;
    var listings = const <Map<String, dynamic>>[];
    try {
      final profile = await widget.api.getUserDetails(token);
      final raw = profile['userId'] ?? profile['id'];
      currentUserId = raw == null ? null : '$raw';
      // The seller's own listings ride on the profile, as My Listings reads
      // them — a hidden one gets its own reminder in the strip.
      final products = profile['products'];
      if (products is List) {
        listings = products.whereType<Map<String, dynamic>>().toList();
      }
    } catch (_) {}

    // Each endpoint is caught on its own, exactly as the web does
    // (`apiClient.getOrders().catch(() => null)`). A shared try/catch around
    // both would let a payments outage blank the order reminders too — hiding
    // a rejected payment behind an unrelated 500 is the nag-forever failure in
    // reverse: the work would be real, and invisible.
    final results = await Future.wait([
      // This strip exists to be current — it runs at launch and then only
      // when something signals that work changed — so it reads past the
      // shared cache and refreshes it for every other screen at the same
      // time. Leaving it cacheable would let a finished step keep nagging.
      widget.api
          .fetchOrders(token, forceRefresh: true)
          .catchError((_) => const <models.Order>[]),
      widget.api
          .fetchMyPaymentsRaw(token)
          .catchError((_) => const <Map<String, dynamic>>[]),
    ]);
    PendingActionsStore.instance.replace(
      orders: results[0] as List<models.Order>,
      payments: results[1] as List<Map<String, dynamic>>,
      currentUserId: currentUserId,
      listings: listings,
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: PendingActionsStore.instance,
      builder: (context, _) {
        final location = widget.location;
        final rows = PendingActionsStore.instance
            .visibleFor(location?.path, location?.queryParameters ?? const {});
        // The strip's data arrives a beat after the screen paints, so it
        // always lands on content the user has already started reading.
        // Growing into place over 180ms makes that a movement they can
        // follow rather than a jolt that loses their place.
        if (rows.isEmpty) {
          return const AnimatedSize(
            duration: Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: SizedBox(width: double.infinity),
          );
        }

        final row = rows.first;
        final extra = rows.length - 1;
        final overdueBy = row.overdueByAt(DateTime.now());
        // An overdue step reads as urgent whatever its kind: the clock has
        // already run out on it.
        final urgent = row.urgent || overdueBy != null;
        final palette = AppPalette.of(context);
        final accent = urgent ? palette.warningText : palette.infoText;

        return AnimatedSize(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: Material(
            key: const ValueKey('pending-action-banner'),
            color: urgent ? palette.warningFill : palette.infoFill,
            shape: Border(
                bottom: BorderSide(color: accent.withValues(alpha: .18))),
            child: InkWell(
              onTap: () => context.push(row.route),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Icon(_pendingActionIcon(row),
                          color: accent, size: 18),
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(row.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 12.5,
                                  height: 1.25,
                                  fontWeight: FontWeight.w600,
                                  color: palette.textPrimary)),
                          if (overdueBy != null || extra > 0) ...[
                            const SizedBox(height: 3),
                            Wrap(spacing: 6, runSpacing: 2, children: [
                              if (overdueBy != null)
                                _BannerTag(
                                    label:
                                        'Overdue ${formatPendingActionAge(overdueBy)}',
                                    color: palette.dangerText,
                                    fill: palette.dangerFill),
                              if (extra > 0)
                                Text(
                                    '+$extra more ${extra == 1 ? 'task' : 'tasks'}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                        fontSize: 10,
                                        height: 1.4,
                                        fontWeight: FontWeight.w600,
                                        color: accent)),
                            ]),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 6),
                    _BannerCta(
                        label: row.bannerCta,
                        onPressed: () {
                          // A dispatched order's reminder opens its
                          // delivery code in place, not the order page.
                          if (row.isDeliveryCode &&
                              PendingActionsStore.instance
                                      .deliveryCodeFor(row.orderId) !=
                                  null) {
                            showDeliveryCodesSheet(context,
                                orderId: row.orderId);
                          } else {
                            context.push(row.route);
                          }
                        }),
                    // Snoozing only quiets the strip. The work remains in
                    // the bell, tab counts, and order card.
                    PopupMenuButton<String>(
                      tooltip: 'Reminder options',
                      onSelected: (value) {
                        if (value == 'snooze') {
                          PendingActionsStore.instance.snooze(row.id);
                        } else {
                          context.push(value);
                        }
                      },
                      itemBuilder: (_) => [
                        for (final entry in rows.skip(1))
                          PopupMenuItem(
                            value: entry.route,
                            child: Text(entry.title),
                          ),
                        const PopupMenuItem(
                          value: 'snooze',
                          child: Text('Remind me later'),
                        ),
                      ],
                      child: SizedBox(
                        width: 32,
                        height: 40,
                        child: Icon(Icons.more_horiz_rounded,
                            color: accent, size: 20),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Web parity `KIND_ICON` (pending-actions-banner.tsx): the strip names the
/// kind of work with its glyph, rather than putting the same warning triangle
/// on a payment, a dispatch and a delivery alike.
IconData _pendingActionIcon(PendingActionEntry entry) {
  switch (entry.section) {
    case PendingActionSection.buyingPayments:
      return entry.urgent
          ? Icons.error_outline_rounded
          : Icons.receipt_long_outlined;
    case PendingActionSection.sellingOrders:
      return Icons.local_shipping_outlined;
    case PendingActionSection.buyingOrders:
      return Icons.inventory_2_outlined;
  }
}

/// The "Overdue 3d" marker.
class _BannerTag extends StatelessWidget {
  const _BannerTag(
      {required this.label, required this.color, required this.fill});
  final String label;
  final Color color;
  final Color fill;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(
            color: fill, borderRadius: BorderRadius.circular(999)),
        child: Text(label,
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: color,
                height: 1.4)),
      );
}

/// Compact action aligned with the reminder instead of adding a second row.
class _BannerCta extends StatelessWidget {
  const _BannerCta({required this.label, required this.onPressed});
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brandBlue,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 32),
          padding: const EdgeInsets.symmetric(horizontal: 9),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          textStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(label),
          const SizedBox(width: 3),
          const Icon(Icons.arrow_forward_rounded, size: 12),
        ]),
      );
}

/// ShellRoute wrapper: renders the routed child between the shared bars and
/// keeps the selected tab in step with the URL.
class AppShellWithRouter extends StatelessWidget {
  final Widget child;
  const AppShellWithRouter({super.key, required this.child});

  static int tabForLocation(String location) {
    if (location.startsWith('/requests') || location.startsWith('/request/')) {
      return 1;
    }
    if (location.startsWith('/sell')) {
      return 2;
    }
    if (location.startsWith('/expat') || location.startsWith('/orders')) {
      return 3;
    }
    if (location.startsWith('/account')) return 4;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final store = AuthStore.instance ?? AuthStore();
    final location = GoRouterState.of(context).uri;
    final path = location.path;
    return AppShell(
      store: store,
      initialTab: tabForLocation(path),
      hideChrome: false,
      location: location,
      child: child,
    );
  }
}

/// The Account tab.
///
/// Web parity: the web's own mobile header menu narrows this down to
/// "Account Settings" (Profile + Security tabs) and "Verification" for an
/// ordinary user, because everything else it also lists (My Space, Buying,
/// Selling, Notifications, Requests) already has a dedicated home in this
/// app's bottom bar and top bar. This tab used to carry eleven rows (orders,
/// payments, saved items, addresses, settings, notifications, help, payment
/// methods, verification, admin, insights) plus logout — most of that has no
/// web-menu equivalent because the web simply doesn't surface it here either.
/// My orders/Saved items live in MySpace, Notifications has its own bell in
/// the top bar.
///
/// Security is its own row here, below Verification, rather than the tab it
/// used to be on Profile Information — that screen is now only profile
/// information, switching between Profile / Payout / Addresses with a top
/// pill-button bar (web parity: `ProfileSectionShortcuts`), one section
/// visible at a time. Help & about and Log out live here on the Account tab,
/// since neither has a web-menu home inside Profile Information either. My
/// payments (a MySpace Buying sub-tab on web) and Payment methods (no
/// confirmed web entry point) are NOT on this tab or on Profile Information —
/// flagged separately rather than guessed a third time.
///
/// Admin is deliberately absent: platform management is a web-only surface,
/// so the app offers no entry point to it at all (the screens remain in the
/// tree for the deep-linked `/admin` routes). Insights is out for a different
/// reason with no fix as clean: nothing in
/// the web menu says who it's for, so rather than guess a gate for it the way
/// Admin's was missing one, it is dropped from this tab entirely; the screen
/// itself is untouched; it can come back once its intended audience is clear.
class AccountScreen extends StatefulWidget {
  final AuthStore store;
  const AccountScreen({super.key, required this.store});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  bool _verified = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  /// One lookup feeds the Verification row's state.
  Future<void> _loadProfile() async {
    final token = widget.store.token;
    if (token == null) return;
    try {
      final me = await widget.store.api.getUserDetails(token);
      if (!mounted) return;
      setState(() => _verified = isVerifiedAccountDetails(me));
    } catch (_) {
      // The header just falls back to the signed-in email.
    }
  }

  Future<void> _pickTheme() async {
    final controller = ThemeController.instance;
    final chosen = await showModalBottomSheet<ThemeMode>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        final palette = AppPalette.of(sheetContext);
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
                child: Text('Appearance',
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: palette.textPrimary)),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Text('Choose how GloboExpats looks on this device.',
                    style:
                        TextStyle(fontSize: 13, color: palette.textSecondary)),
              ),
              for (final mode in ThemeMode.values)
                RadioListTile<ThemeMode>(
                  value: mode,
                  groupValue: controller.mode,
                  onChanged: (v) => Navigator.pop(sheetContext, v),
                  secondary: Icon(ThemeController.iconFor(mode),
                      color: palette.textSecondary),
                  title: Text(ThemeController.labelFor(mode),
                      style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: palette.textPrimary)),
                  subtitle: mode == ThemeMode.system
                      ? Text('Match your phone’s setting',
                          style: TextStyle(color: palette.textSecondary))
                      : null,
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
    if (chosen != null) await controller.setMode(chosen);
  }

  Future<void> _confirmLogout() async {
    final palette = AppPalette.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Log out?'),
        content: Text(
            'You will need to sign in again to buy, sell or track orders.',
            style: TextStyle(color: palette.textSecondary)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Stay signed in')),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626),
                foregroundColor: Colors.white),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await widget.store.logout();
    if (!mounted) return;
    // Web parity `providers/auth-provider.tsx:754` — logout sends the user
    // to the homepage. Mobile left them standing on whatever authenticated
    // screen they logged out from, which then re-rendered its own sign-in
    // gate inside a tab that should never show one.
    if (context.mounted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final palette = AppPalette.of(context);
    return ListenableBuilder(
      listenable: ThemeController.instance,
      builder: (context, _) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // The public storefront leads the tab; personal details live in
          // Profile information below, so there is no second profile card.
          if (store.token != null) ...[
            // Hidden once every setup step is done.
            AccountSetupCard(api: store.api, token: store.token!),
            ShopProfileCard(
                api: store.api, token: store.token!, cacheKey: store.email),
            const SizedBox(height: 20),
          ],
          _AccountGroup(
            heading: 'Account',
            rows: [
              _AccountRow(
                icon: Icons.person_outline,
                tint: AppColors.brandBlue,
                title: 'Profile information',
                subtitle: 'Name, payout details and addresses',
                onTap: () => context.push('/account/settings'),
              ),
              _AccountRow(
                icon: Icons.verified_user_outlined,
                tint: const Color(0xFF10B981),
                title: 'Verification',
                subtitle:
                    _verified ? 'Your account is verified' : 'Not yet verified',
                trailingBadge: _verified ? null : 'Action needed',
                onTap: () => context.push('/account/verification'),
              ),
              _AccountRow(
                icon: Icons.lock_outline,
                tint: const Color(0xFF8B5CF6),
                title: 'Security',
                subtitle: 'Password and sign-in',
                onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                        settings: const RouteSettings(name: '/account/security'),
                        builder: (_) => const SecurityScreen())),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _AccountGroup(
            heading: 'Preferences',
            rows: [
              _AccountRow(
                icon: ThemeController.iconFor(ThemeController.instance.mode),
                tint: const Color(0xFF0EA5E9),
                title: 'Appearance',
                subtitle: 'Light, dark or match your phone',
                trailingLabel:
                    ThemeController.labelFor(ThemeController.instance.mode),
                onTap: _pickTheme,
              ),
            ],
          ),
          const SizedBox(height: 16),
          _AccountGroup(
            heading: 'Support',
            rows: [
              _AccountRow(
                icon: Icons.auto_stories_outlined,
                tint: const Color(0xFF8B5CF6),
                title: 'App guide',
                subtitle: 'Welcome slides, then a tour of the app',
                onTap: () async {
                  final nav = Navigator.of(context, rootNavigator: true);
                  final completed = await nav.push(WelcomeGuideScreen.route());
                  if (completed == true) AppTour.start(nav);
                },
              ),
              _AccountRow(
                icon: Icons.help_outline,
                tint: const Color(0xFFF59E0B),
                title: 'Help & about',
                subtitle: 'Guides, contact and app info',
                onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                        settings: const RouteSettings(name: '/help'),
                        builder: (_) => const HelpScreen())),
              ),
            ],
          ),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: _confirmLogout,
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFFDC2626),
              side: const BorderSide(color: Color(0xFFFCA5A5)),
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
            icon: const Icon(Icons.logout_rounded, size: 18),
            label: const Text('Log out'),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text('GloboExpats',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: palette.textSecondary)),
          ),
        ],
      ),
    );
  }
}

/// A titled card of rows, hairline-separated — the grouped-settings pattern.
class _AccountGroup extends StatelessWidget {
  const _AccountGroup({required this.heading, required this.rows});

  final String heading;
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          child: Text(heading.toUpperCase(),
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: palette.textSecondary)),
        ),
        Material(
          color: palette.surface,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: palette.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = 0; i < rows.length; i++) ...[
                  if (i > 0)
                    Divider(
                        height: 1,
                        thickness: 1,
                        indent: 60,
                        color: palette.border),
                  rows[i],
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _AccountRow extends StatelessWidget {
  const _AccountRow({
    required this.icon,
    required this.tint,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.trailingLabel,
    this.trailingBadge,
  });

  final IconData icon;
  final Color tint;
  final String title;
  final String? subtitle;

  /// The row's current value, shown before the chevron (e.g. "System").
  final String? trailingLabel;

  /// An attention pill instead of a value (e.g. "Action needed").
  final String? trailingBadge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 19, color: tint),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: palette.textPrimary)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12.5, color: palette.textSecondary)),
                  ],
                ],
              ),
            ),
            if (trailingBadge != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999)),
                child: Text(trailingBadge!,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppPalette.of(context).warningText)),
              )
            else if (trailingLabel != null)
              Text(trailingLabel!,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: palette.textSecondary)),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right_rounded,
                size: 20, color: palette.textSecondary),
          ],
        ),
      ),
    );
  }
}
