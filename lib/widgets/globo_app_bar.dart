import 'dart:async';

import '../domain/pending_actions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'tour_anchor.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../cart/cart_store.dart';
import '../config.dart';
import '../theme.dart';
import 'currency_toggle.dart';
import '../screens/account_misc_screens.dart' show SecurityScreen;
import 'brand_logo.dart';

/// The app's one top bar, mirroring the web reference's mobile header
/// (`components/header.tsx` at `md:hidden`): brand-blue chrome carrying the
/// wordmark, the country indicator, then search, cart and notifications.
///
/// It lives on the shell rather than on each screen: before this, 43 screens
/// each built their own `AppBar(title: Text(...))`, so the cart count and the
/// unread-notification count were only ever visible on Home.
///
/// Deliberately no periodic poll. The web badge polls every 30s; here the
/// count is fetched on mount and re-fetched through [refreshSignal] when the
/// shell changes tab, which keeps widget tests free of pending timers while
/// still updating whenever the user moves around the app.
class GloboAppBar extends StatefulWidget implements PreferredSizeWidget {
  const GloboAppBar({
    super.key,
    this.api,
    this.refreshSignal,
    this.showSearch = true,
    this.extendedSearch = false,
  });

  final ApiClient? api;

  /// Bumped by the shell on tab change to re-read the unread count.
  final ValueListenable<int>? refreshSignal;

  /// Browse and search screens own the query field, so the icon is redundant.
  final bool showSearch;

  /// Home only: grows the bar with a second row carrying the full search
  /// field in place of the icon, mirroring the web reference's persistent
  /// header search (`components/header.tsx`) instead of home owning its own
  /// scrolling search bar.
  final bool extendedSearch;

  /// The field (36) + the 1px pulse ring on each side + 6px of breathing
  /// room under it. Was 54, which made the header read as two full bars.
  static const double _searchRowHeight = 44;

  @override
  Size get preferredSize =>
      Size.fromHeight(56 + (extendedSearch ? _searchRowHeight : 0));

  @override
  State<GloboAppBar> createState() => _GloboAppBarState();
}

class _GloboAppBarState extends State<GloboAppBar>
    with SingleTickerProviderStateMixin {
  late final ApiClient _api = widget.api ?? ApiClient();
  int _unread = 0;
  String? _profileImageUrl;
  String? _profileName;
  late final TextEditingController _search = TextEditingController();
  // Created on first use, never from dispose(): a `late final` initializer
  // here meant tearing down an app bar that never showed the search row
  // allocated a fresh controller mid-dispose, whose createTicker() then did an
  // ancestor lookup on an already-deactivated element and threw.
  AnimationController? _searchPulseController;
  AnimationController get _searchPulse =>
      _searchPulseController ??= AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1600),
      );
  Timer? _searchPulseTimer;

  @override
  void initState() {
    super.initState();
    widget.refreshSignal?.addListener(_loadUnread);
    _loadUnread();
    _resolveProfile();
    if (widget.extendedSearch) _startSearchPrompt();
  }

  void _startSearchPrompt() {
    _searchPulse.repeat();
    _searchPulseTimer?.cancel();
    _searchPulseTimer = Timer(const Duration(seconds: 6), () {
      if (mounted) _searchPulse.stop();
    });
  }

  @override
  void dispose() {
    widget.refreshSignal?.removeListener(_loadUnread);
    _search.dispose();
    _searchPulseTimer?.cancel();
    _searchPulseController?.dispose();
    super.dispose();
  }

  Future<void> _loadUnread() async {
    final token = AuthStore.instance?.token;
    if (token == null) {
      if (mounted && _unread != 0) setState(() => _unread = 0);
      return;
    }
    try {
      final count = await _api.fetchUnreadNotificationCount(token);
      if (mounted) setState(() => _unread = count);
    } catch (_) {
      // A failed count never blocks the chrome - the bell just shows no badge.
    }
  }

  /// The avatar's image and initials. This used to resolve the user's ROLE
  /// as well, purely to decide whether an Admin row appeared in the dropdown;
  /// admin is web-only now, so the role is not read at all.
  Future<void> _resolveProfile() async {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    try {
      final me = await _api.getUserDetails(token);
      if (!mounted) return;
      final image = (me['profileImageUrl'] ?? me['avatar'])?.toString().trim();
      final firstName = (me['firstName'] ?? '').toString().trim();
      final lastName = (me['lastName'] ?? '').toString().trim();
      setState(() {
        _profileImageUrl = image?.isNotEmpty == true ? image : null;
        _profileName = '$firstName $lastName'.trim();
      });
    } catch (_) {}
  }

  /// Web parity `search-bar.tsx`: submitting goes to the marketplace with
  /// the term applied (`/browse?q=`), so the results land in the same
  /// filterable grid as every other way in. An empty box just opens it.
  void _submitSearch() {
    final query = _search.text.trim();
    if (query.isEmpty) {
      context.push('/browse');
      return;
    }
    context
        .push(Uri(path: '/browse', queryParameters: {'q': query}).toString());
  }

  @override
  Widget build(BuildContext context) {
    return AppBar(
      backgroundColor: AppPalette.of(context).chrome,
      foregroundColor: Colors.white,
      elevation: 0,
      titleSpacing: 12,
      automaticallyImplyLeading: false,
      title: InkWell(
        onTap: () => context.go('/'),
        child: const Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: GloboExpatsWordmark(fontSize: 18, globoColor: Colors.white),
        ),
      ),
      actions: [
        // Web parity: the header carries the currency switcher, not a static
        // country flag (components/currency-toggle.tsx).
        const TourAnchor(id: 'currency', child: CurrencyToggle()),
        if (widget.showSearch)
          IconButton(
            icon: const Icon(Icons.search),
            tooltip: 'Search',
            onPressed: () => context.push('/search'),
          ),
        ListenableBuilder(
          listenable: CartStore.instance,
          builder: (context, _) => TourAnchor(
            id: 'cart',
            child: _BadgedIcon(
            iconWidget: const LucideCartIcon(size: 20),
            tooltip: 'Cart',
            count: CartStore.instance.count,
            onPressed: () => context.push('/cart'),
          )),
        ),
        if (AuthStore.instance?.isAuthenticated == true) ...[
          ListenableBuilder(
            listenable: PendingActionsStore.instance,
            builder: (context, _) => TourAnchor(
              id: 'notifications',
              child: _BadgedIcon(
              icon: Icons.notifications_none,
              tooltip: 'Notifications',
              count: _unread + PendingActionsStore.instance.total,
              onPressed: () => context.push('/notifications'),
            )),
          ),
          _accountMenu(context),
        ],
        const SizedBox(width: 8),
      ],
      bottom: widget.extendedSearch
          ? PreferredSize(
              preferredSize:
                  const Size.fromHeight(GloboAppBar._searchRowHeight),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
                child: AnimatedBuilder(
                  animation: _searchPulse,
                  builder: (context, child) {
                    final t = _searchPulse.value;
                    final glow = 0.35 + (0.35 * (1 - (2 * t - 1).abs()));
                    return Container(
                      padding: const EdgeInsets.all(1),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(19),
                        gradient: SweepGradient(
                          transform: GradientRotation(t * 6.28318),
                          colors: const [
                            Color(0xFF60A5FA),
                            Color(0xFFFFFFFF),
                            Color(0xFF22C55E),
                            Color(0xFFFFFFFF),
                            Color(0xFF60A5FA),
                          ],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.white.withValues(alpha: glow),
                            blurRadius: 6,
                          ),
                        ],
                      ),
                      child: child,
                    );
                  },
                  child: TourAnchor(
                    id: 'home-search',
                    child: SearchBar(
                    controller: _search,
                    hintText: 'What are you looking for?',
                    leading: const Icon(Icons.search_rounded, size: 18),
                    trailing: [
                      // Clear, once there is something to clear (the query
                      // stays in the field after a search).
                      ValueListenableBuilder<TextEditingValue>(
                        valueListenable: _search,
                        builder: (context, value, _) => value.text.isEmpty
                            ? const SizedBox.shrink()
                            : IconButton(
                                key: const ValueKey('home-search-clear'),
                                tooltip: 'Clear search',
                                onPressed: _search.clear,
                                iconSize: 18,
                                visualDensity: VisualDensity.compact,
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints.tightFor(
                                    width: 30, height: 30),
                                icon: const Icon(Icons.close_rounded),
                              ),
                      ),
                      // Unconstrained, this button's 48px minimum tap target
                      // set the row's height on its own and `minHeight` below
                      // had no effect at all.
                      IconButton(
                        tooltip: 'Search',
                        onPressed: _submitSearch,
                        iconSize: 18,
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints.tightFor(
                            width: 30, height: 30),
                        icon: const Icon(Icons.arrow_forward_rounded),
                      ),
                    ],
                    onSubmitted: (_) => _submitSearch(),
                    elevation: const WidgetStatePropertyAll(0),
                    constraints: const BoxConstraints(minHeight: 36),
                    textStyle: const WidgetStatePropertyAll(
                        TextStyle(fontSize: 13.5)),
                    hintStyle: const WidgetStatePropertyAll(
                        TextStyle(fontSize: 13.5)),
                    padding: const WidgetStatePropertyAll(
                        EdgeInsets.symmetric(horizontal: 10)),
                    backgroundColor: WidgetStatePropertyAll(
                        AppPalette.of(context).chromeField),
                    side: WidgetStatePropertyAll(
                      BorderSide(color: AppPalette.of(context).border),
                    ),
                    shape: WidgetStatePropertyAll(
                      RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                    ),
                  )),
                ),
              ),
            )
          : null,
    );
  }

  /// Avatar-triggered dropdown, web parity `header.tsx`'s mobile account menu
  /// narrowed to this app's already-trimmed set (see `AccountScreen`'s doc):
  /// Profile Information, Verification, Security, Admin (only for an actual
  /// admin), Help & about, then Log out.
  Widget _accountMenu(BuildContext context) {
    final email = AuthStore.instance?.email ?? '';
    final identity = (_profileName?.isNotEmpty == true ? _profileName! : email);
    final initial = identity.isNotEmpty ? identity[0].toUpperCase() : 'U';
    final image = _profileImageUrl == null
        ? null
        : NetworkImage(AppConfig.resolveAssetUrl(_profileImageUrl!));
    return PopupMenuButton<String>(
      tooltip: 'Account',
      offset: const Offset(0, 44),
      itemBuilder: (context) => [
        const PopupMenuItem(
            value: 'settings', child: Text('Profile Information')),
        const PopupMenuItem(value: 'verification', child: Text('Verification')),
        const PopupMenuItem(value: 'security', child: Text('Security')),
        const PopupMenuItem(value: 'help', child: Text('Help & about')),
        const PopupMenuDivider(),
        const PopupMenuItem(
          value: 'logout',
          child: Text('Log out', style: TextStyle(color: Color(0xFFDC2626))),
        ),
      ],
      onSelected: (value) {
        switch (value) {
          case 'settings':
            context.push('/account/settings');
            break;
          case 'verification':
            context.push('/account/verification');
            break;
          case 'security':
            Navigator.of(context).push(
                MaterialPageRoute(
                    settings: const RouteSettings(name: '/account/security'),
                    builder: (_) => const SecurityScreen()));
            break;
          case 'help':
            context.push('/help');
            break;
          case 'logout':
            AuthStore.instance?.logout();
            break;
        }
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: CircleAvatar(
          radius: 15,
          backgroundColor: Colors.white24,
          foregroundImage: image,
          child: Text(
            initial,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

/// An action icon with the web header's red count bubble.
class _BadgedIcon extends StatelessWidget {
  const _BadgedIcon({
    this.icon,
    this.iconWidget,
    required this.tooltip,
    required this.count,
    required this.onPressed,
  }) : assert(icon != null || iconWidget != null);

  final IconData? icon;

  /// Supplied instead of [icon] when the glyph is drawn rather than a font
  /// codepoint (the cart uses lucide's path for web parity).
  final Widget? iconWidget;
  final String tooltip;
  final int count;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          icon: iconWidget ?? Icon(icon),
          tooltip: tooltip,
          onPressed: onPressed,
        ),
        // Web parity (header.tsx): a 20px red-500 disc overhanging the button's
        // top-right corner, "9+" past nine, gone entirely at zero.
        if (count > 0)
          Positioned(
            right: 2,
            top: 2,
            child: Container(
              width: 20,
              height: 20,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: Color(0xFFEF4444),
                shape: BoxShape.circle,
              ),
              child: Text(
                count > 9 ? '9+' : '$count',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  height: 1.1,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
