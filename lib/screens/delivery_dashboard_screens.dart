import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_tour.dart';
import '../widgets/tour_anchor.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/pending_actions.dart';
import '../models/order.dart';
import '../theme.dart';
import '../domain/driver_app.dart';
import '../widgets/driver_app_widgets.dart';
import '../widgets/error_text.dart';
import '../widgets/seller_verification_gate.dart' show isVerifiedAccountDetails;
import '../widgets/skeleton_loader.dart';
import 'orders_screen.dart';
import 'my_payments_screen.dart';
import 'seller_listings_screen.dart';
import 'seller_wallet_panel.dart';
import 'requests_screen.dart';
import 'saved_items_screen.dart';

/// Delivery tracking for an order (covers `/transporter`). Reads the
/// order's transporter/status; shows "not yet available" honestly when the
/// order has no transporter yet (e.g. 404 before an order is fulfilled).
class DeliveryTrackingScreen extends StatefulWidget {
  final String orderId;
  final String? orderNumber;

  /// Test/preview injection; production resolves via AuthStore.instance.
  final AuthStore? auth;
  final ApiClient? api;
  const DeliveryTrackingScreen(
      {super.key,
      required this.orderId,
      this.orderNumber,
      this.auth,
      this.api});
  @override
  State<DeliveryTrackingScreen> createState() => _DeliveryTrackingScreenState();
}

class _DeliveryTrackingScreenState extends State<DeliveryTrackingScreen> {
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  late final ApiClient _api = widget.api ?? ApiClient();

  /// AU-039 r2: the seller-style verify card mounts ONLY for a viewer who can
  /// actually verify (seller/admin — reference /orders/[id] mounts it under
  /// `orderType === 'selling'`). A buyer hitting verify-delivery gets 403
  /// FORBIDDEN ("You cannot manage transport for this order"), so mounting it
  /// for buyers produced three counted-as-lockout failures. The buyer instead
  /// gets their own code + "I received the items" self-confirm.
  bool _isSellerView = false;
  bool _roleResolved = false;
  Map<String, dynamic>? _order;

  late final Future<Map<String, dynamic>> _future = _auth.token != null
      ? _api.fetchOrderTransporter(_auth.token!, widget.orderId)
      : Future.error('Not logged in');

  @override
  void initState() {
    super.initState();
    _resolveRole();
  }

  Future<void> _resolveRole() async {
    final token = _auth.token;
    if (token == null) return;
    try {
      final me = await _api.getUserDetails(token);
      final roles = me['roles'];
      final isAdmin = roles is List &&
          roles.any((r) => r is Map && r['roleName'] == 'ADMIN');
      // The order payload says which side of the order this viewer is on:
      // `orderType: selling` means the viewer is the seller (reference
      // /orders/[id] gate). Buyers see `buying`.
      final order = await _api.fetchOrderDetail(token, widget.orderId);
      if (!mounted) return;
      setState(() {
        _isSellerView = isAdmin || order.isSelling;
        _order = {
          'deliveryCode': order.deliveryCode,
          'buyerCanConfirmDelivery': order.buyerCanConfirmDelivery,
          'normalizedStatus': order.normalizedStatus,
        };
        _roleResolved = true;
      });
    } catch (_) {
      // Role unknown → keep the card hidden rather than showing an input that
      // would 403 (the buyer's own screen still shows below).
      if (mounted) setState(() => _roleResolved = true);
    }
  }

  /// AU-039: handover-code verification state (attempts + lockout).
  int _attemptsRemaining = 3;
  bool _locked = false;
  String? _verifyMsg;

  void _paint(String msg) {
    // Web parity DeliveryCodeCard toasts every outcome. The in-card Text alone
    // was swallowed by the built bundle (verifier r6 C-D2b), so paint BOTH:
    // SnackBar (always visible, semantics-announced) and the inline Text.
    _verifyMsg = msg;
    ScaffoldMessenger.maybeOf(context)
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  /// Transporter/seller enters the buyer's 6-digit code at handover.
  /// Wrong code → HTTP 400 INVALID_DELIVERY_CODE with attemptsRemaining; after
  /// 3 attempts the backend answers 429 LOCKED. Only a genuine INVALID body
  /// consumes a local attempt — a 403/network failure must never count toward
  /// lockout (verifier r6 C-D2a).
  Future<void> _verifyCode(String code) async {
    setState(() => _verifyMsg = null);
    try {
      await _api.orderAction(_auth.token!, widget.orderId, 'verify-delivery',
          body: {'code': code});
      if (!mounted) return;
      setState(() => _verifyMsg =
          'Delivery confirmed — the order is now marked as delivered.');
      _paint(_verifyMsg!);
    } on ApiException catch (e) {
      if (!mounted) return;
      final m = e.message;
      final invalid = m.contains('INVALID_DELIVERY_CODE');
      final lockedOut =
          m.contains('Too many incorrect attempts') || m.contains('LOCKED');
      if (invalid) {
        // The backend body carries attemptsRemaining (sandbox-proven:
        // {"success":false,"message":"INVALID_DELIVERY_CODE","attemptsRemaining":2}).
        final serverRem =
            RegExp(r'attemptsRemaining[":\s]+(\d+)').firstMatch(m)?.group(1) ??
                RegExp(r'(\d+)\s*attempt').firstMatch(m)?.group(1);
        final n = serverRem != null
            ? int.parse(serverRem)
            : (_attemptsRemaining - 1).clamp(0, 3);
        setState(() {
          _attemptsRemaining = n;
          _locked = n <= 0;
          _verifyMsg = _locked
              ? 'Three attempts have been used. Ask the buyer to generate a new code.'
              : '${m.replaceAll(RegExp(r'attemptsRemaining[":\s]+\d+'), '').trim()} '
                  '$n of 3 OTP attempts remaining';
        });
        _paint(_verifyMsg!);
      } else if (lockedOut) {
        setState(() {
          _locked = true;
          _attemptsRemaining = 0;
          _paint(m);
        });
      } else {
        // 403 FORBIDDEN / conflict / network — surface it, consume nothing.
        setState(() => _verifyMsg = 'Could not confirm delivery: $m');
        _paint(_verifyMsg!);
      }
    }
  }

  /// Buyer lost the code — issue a fresh one (resets the lockout).
  Future<void> _regenerate() async {
    try {
      await _api.orderAction(
          _auth.token!, widget.orderId, 'regenerate-delivery-code');
      if (!mounted) return;
      setState(() {
        _attemptsRemaining = 3;
        _locked = false;
        _paint('New code generated. Share the new code with your driver.');
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _paint('Could not regenerate the code: ${e.message}'));
    }
  }

  /// AU-039 parity: buyer confirms delivery without an OTP
  /// (POST /orders/{id}/confirm-delivery), same DELIVERED transition as a
  /// correct code.
  Future<void> _buyerConfirmDelivery() async {
    try {
      await _api.orderAction(_auth.token!, widget.orderId, 'confirm-delivery');
      if (!mounted) return;
      setState(() => _verifyMsg =
          'Delivery confirmed — the order is now marked as delivered.');
      _paint(_verifyMsg!);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _paint('Could not confirm delivery: ${e.message}'));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Delivery tracking')),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const FeedSkeleton();
          }
          if (snap.hasError) {
            return const Center(
              child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                      'Delivery tracking is not available for this order yet.\nIt appears once the order is fulfilled and a transporter is assigned.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey))),
            );
          }
          final t = snap.data!;
          final inTransit = (t['status'] ?? '')
                  .toString()
                  .toUpperCase()
                  .contains('IN_TRANSIT') ||
              _order?['normalizedStatus'] == 'IN_TRANSIT';
          final buyerCode = _order?['deliveryCode'] as String?;
          final buyerCanConfirm = _order?['buyerCanConfirmDelivery'] == true;
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              if (widget.orderNumber != null)
                Text(widget.orderNumber!,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              _row(
                  'Transporter',
                  ((t['transporter']?['fullName']) ??
                          t['transporterName'] ??
                          t['name'] ??
                          '—')
                      .toString()),
              _row(
                  'Phone',
                  ((t['transporter']?['phoneNumber']) ??
                          t['phone'] ??
                          t['phoneNumber'] ??
                          '—')
                      .toString()),
              _row(
                  'Status',
                  (t['status'] ?? 'IN_TRANSIT')
                      .toString()
                      .replaceAll('_', ' ')),
              _row(
                  'Est. delivery',
                  (t['estimatedDelivery'] ?? t['proposedDeliveryTime'] ?? '—')
                      .toString()),
              // What the rider has reported so far; nothing while there is none.
              if (_auth.token != null)
                DriverProgressCard(
                    api: _api, token: _auth.token!, orderId: widget.orderId),
              const Divider(height: 30),
              // Seller/admin only: enter the code the buyer reads out.
              if (_roleResolved && _isSellerView)
                _CodeVerifyCard(
                  locked: _locked,
                  attemptsRemaining: _attemptsRemaining,
                  message: _verifyMsg,
                  onVerify: _verifyCode,
                  onRegenerate: _regenerate,
                ),
              // Buyer: read the code out at handover + self-confirm when the
              // backend allows it (reference DeliveryCodeCard perspective
              // 'buyer' with allowBuyerConfirmation).
              if (_roleResolved && !_isSellerView && inTransit) ...[
                if (buyerCode != null)
                  _BuyerCodeCard(
                    code: buyerCode,
                    canConfirm: buyerCanConfirm,
                    message: _verifyMsg,
                    onRegenerate: _regenerate,
                    onConfirm: _buyerConfirmDelivery,
                  )
                else ...[
                  Text(
                      'Your delivery code will appear here once the order is out for delivery.',
                      style: TextStyle(color: AppPalette.of(context).textSecondary)),
                  if (_verifyMsg != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(_verifyMsg!,
                          style:
                              TextStyle(color: AppPalette.of(context).textSecondary)),
                    ),
                ],
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(children: [
          Expanded(
              flex: 2,
              child: Text(label,
                  style: TextStyle(color: AppPalette.of(context).textSecondary))),
          Expanded(
              flex: 3,
              child: Text(value,
                  style: const TextStyle(fontWeight: FontWeight.w600))),
        ]),
      );
}

/// AU-039 parity: the buyer's own code card (reference DeliveryCodeCard
/// perspective 'buyer'): the big mono code to read out at handover, the
/// reference Clipboard copy button, a Generate-a-new-code escape hatch, and —
/// when the backend says buyerCanConfirmDelivery — the "I received the items"
/// self-confirm. The card is one semantics container so title / instructions /
/// code / feedback all reach screen readers (r9 FAIL: they painted but were
/// absent from flt-semantics).
class _BuyerCodeCard extends StatelessWidget {
  final String code;
  final bool canConfirm;
  final String? message;
  final VoidCallback onRegenerate;
  final VoidCallback onConfirm;
  const _BuyerCodeCard({
    required this.code,
    required this.canConfirm,
    required this.message,
    required this.onRegenerate,
    required this.onConfirm,
  });

  Future<void> _copyCode(BuildContext context) async {
    // Announce FIRST, then write: the reference paints an sr-only aria-live
    // line ("Delivery code copied") the moment the icon is tapped.
    ScaffoldMessenger.maybeOf(context)
      ?..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Delivery code copied')));
    await Clipboard.setData(ClipboardData(text: code));
  }

  @override
  Widget build(BuildContext context) {
    final msg = message;
    return Semantics(
      container: true,
      liveRegion: msg != null,
      label: 'Your delivery code. '
          'Give this code to the driver only when you have your items.'
          '${msg == null ? '' : ' $msg'}',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppPalette.of(context).successFill,
          border: Border.all(color: AppPalette.of(context).successBorder),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your delivery code',
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: AppPalette.of(context).successText)),

            const SizedBox(height: 4),
            Text(
                'Give this code to the driver only when you have your items.',
                style: TextStyle(fontSize: 12, color: AppPalette.of(context).successText)),
            const SizedBox(height: 10),
            Row(children: [
              // AU-039 verifier: the code Text painted on canvas but was absent
              // from the flt-semantics tree — expose it explicitly.
              Semantics(
                label: 'Delivery code $code',
                child: Text(code,
                    key: const ValueKey('buyer-delivery-code'),
                    style: const TextStyle(
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 8)),
              ),
              // Reference parity: Clipboard icon beside the code.
              IconButton(
                key: const ValueKey('copy-delivery-code-btn'),
                tooltip: 'Copy delivery code',
                icon: const Icon(Icons.copy_outlined, size: 20),
                onPressed: () {
                  _copyCode(context);
                },
              ),
            ]),
            // Reference sr-only aria-live line: announces the copy result.
            Semantics(
              liveRegion: true,
              child: const Text('',
                  key: ValueKey('delivery-code-live'),
                  style: TextStyle(fontSize: 1, color: Colors.transparent)),
            ),
            if (msg != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Semantics(
                  label: msg,
                  child: Text(msg,
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, children: [
              OutlinedButton.icon(
                key: const ValueKey('buyer-regenerate-btn'),
                onPressed: onRegenerate,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Generate a new code'),
              ),
              if (canConfirm)
                FilledButton.icon(
                  key: const ValueKey('buyer-confirm-delivery-btn'),
                  onPressed: onConfirm,
                  icon: const Icon(Icons.task_alt, size: 18),
                  label: const Text('I received the items'),
                ),
            ]),
          ],
        ),
      ),
    );
  }
}

/// MySpace: the owner's hub, and where selling starts.
///
/// Phase 2 turned this from a stats block plus a menu of links into the web's
/// five-tab dashboard (`/expat/dashboard`): Overview, Selling, Buying, Saved,
/// Requests. The tabs render the screens that already existed rather than
/// reimplementing them - each takes an `embedded` flag so its own AppBar makes
/// way for the shared GloboAppBar and this tab bar.
class ExpatDashboardScreen extends StatefulWidget {
  const ExpatDashboardScreen(
      {super.key,
      this.api,
      this.paymentsHttpClient,
      this.initialTab = 'overview',
      this.initialSub,
      this.initialListingFilter,
      this.initialPaymentStatus});
  final ApiClient? api;
  final String initialTab;
  final String? initialSub;

  /// My Listings' status filter, e.g. `attention` from the strip.
  final String? initialListingFilter;
  final PaymentGroup? initialPaymentStatus;

  /// Test seam threaded down to the Buying tab's Payments sub-view
  /// ([MyPaymentsScreen] talks to the backend via its own `PaymentsApi`, not
  /// the shared [ApiClient] — see that file's doc comment).
  final http.Client? paymentsHttpClient;

  @override
  State<ExpatDashboardScreen> createState() => _ExpatDashboardScreenState();
}

class _ExpatDashboardScreenState extends State<ExpatDashboardScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(
        length: 5, vsync: this, initialIndex: _indexFor(widget.initialTab));
    // First visit while signed in: show what each section is for.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) AppTour.maybeStartMySpace(context);
    });
  }

  static int _indexFor(String tab) {
    const names = ['overview', 'selling', 'buying', 'saved', 'requests'];
    final index = names.indexOf(tab.toLowerCase());
    return index < 0 ? 0 : index;
  }

  /// My Space stays mounted as a shell tab, so a link into it while it is
  /// already open (the strip's "Fix" button) arrives here, not in initState.
  @override
  void didUpdateWidget(covariant ExpatDashboardScreen old) {
    super.didUpdateWidget(old);
    if (old.initialTab != widget.initialTab) {
      _tabs.animateTo(_indexFor(widget.initialTab));
    }
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final api = widget.api ?? ApiClient();
    return Scaffold(
      // No app bar: MySpace is a shell tab, so the shared GloboAppBar and the
      // bottom nav come from AppShell.
      backgroundColor: AppPalette.of(context).background,
      // Web parity: My Space pins nothing. The greeting scrolls away with the
      // content while the tab strip stays reachable, so a long listing grid
      // gets the whole screen instead of half of it.
      body: NestedScrollView(
        headerSliverBuilder: (context, _) => [
          SliverToBoxAdapter(child: _MySpaceWelcome(api: widget.api)),
        ],
        body: Column(
          children: [
            Material(
              color: AppPalette.of(context).background,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
                // All five tabs share the width — nothing scrolls off — with
                // a blue pill that stretches from tab to tab and follows the
                // finger during a swipe.
                child: TourAnchor(
                  id: 'myspace-tabs',
                  child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: AppPalette.of(context).surfaceMuted,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppPalette.of(context).border),
                  ),
                  child: ListenableBuilder(
                    listenable: PendingActionsStore.instance,
                    builder: (context, _) => TabBar(
                      controller: _tabs,
                      isScrollable: false,
                      tabAlignment: TabAlignment.fill,
                      dividerColor: Colors.transparent,
                      indicatorSize: TabBarIndicatorSize.tab,
                      indicatorAnimation: TabIndicatorAnimation.elastic,
                      splashFactory: NoSplash.splashFactory,
                      overlayColor:
                          const WidgetStatePropertyAll(Colors.transparent),
                      labelPadding: const EdgeInsets.symmetric(horizontal: 2),
                      indicator: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [AppColors.brandBlue, Color(0xFF2563EB)],
                        ),
                      ),
                      labelColor: Colors.white,
                      unselectedLabelColor: AppPalette.of(context).textSecondary,
                      labelStyle: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 11,
                          fontWeight: FontWeight.w800),
                      unselectedLabelStyle: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 11,
                          fontWeight: FontWeight.w600),
                      onTap: (_) => HapticFeedback.selectionClick(),
                      tabs: [
                        for (final (i, tab) in [
                          (Icons.space_dashboard_rounded, 'Overview', 0),
                          (
                            Icons.storefront_rounded,
                            'Selling',
                            PendingActionsStore.instance.sellingPending
                          ),
                          (
                            Icons.shopping_bag_rounded,
                            'Buying',
                            PendingActionsStore.instance.buyingPending
                          ),
                          (Icons.favorite_rounded, 'Saved', 0),
                          (Icons.forum_rounded, 'Requests', 0),
                        ].indexed)
                          Tab(
                            height: 48,
                            child: TourAnchor(
                              id: 'myspace-tab-${tab.$2.toLowerCase()}',
                              child: _DashboardTabLabel(
                                icon: tab.$1,
                                label: tab.$2,
                                count: tab.$3,
                                index: i,
                                animation: _tabs.animation!,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                )),
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: TabBarView(
                controller: _tabs,
                children: [
                  _OverviewTab(
                    api: widget.api,
                    onSeeListings: () => _tabs.animateTo(1),
                    onSeeOrders: () => _tabs.animateTo(2),
                  ),
                  // LISTIN-17: the web selling workspace ("My Listings") is
                  // itself a Listings | Orders | Payments sub-tab bar (web
                  // DashboardSectionTabs under a verified seller). Transporters
                  // is a further sub-tab owned by the transport phase.
                  _SellingTab(
                      // A new link (sub-tab or filter) starts it afresh.
                      key: ValueKey(
                          '${widget.initialSub}|${widget.initialListingFilter}'),
                      api: api,
                      initialSub: widget.initialSub,
                      initialListingFilter: widget.initialListingFilter),
                  _BuyingTab(
                      api: api,
                      initialSub: widget.initialSub,
                      initialPaymentStatus: widget.initialPaymentStatus,
                      paymentsHttpClient: widget.paymentsHttpClient),
                  SavedItemsScreen(api: widget.api, embedded: true),
                  // Web parity: the dashboard Requests tab embeds the OWNER "My
                  // requests" board (app/expat/dashboard?tab=requests), not the
                  // public feed — RequestsScreen defaults to the public board
                  // for the standalone /requests route.
                  const RequestsScreen(initialBoard: RequestsInitialBoard.mine),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardTabLabel extends StatelessWidget {
  const _DashboardTabLabel({
    required this.icon,
    required this.label,
    required this.count,
    required this.index,
    required this.animation,
  });
  final IconData icon;
  final String label;
  final int count;
  final int index;

  /// The tab controller's live position, so the icon swells as the pill
  /// arrives under it — mid-swipe too, not only on release.
  final Animation<double> animation;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          final near = (1 - (animation.value - index).abs()).clamp(0.0, 1.0);
          // Icon over label, so five fit across a phone.
          return Column(mainAxisSize: MainAxisSize.min, children: [
            Stack(clipBehavior: Clip.none, children: [
              Transform.scale(
                scale: .92 + .12 * near,
                child: Icon(icon, size: 17),
              ),
              if (count > 0)
                Positioned(
                  right: -10,
                  top: -6,
                  child: Badge(
                    smallSize: 14,
                    largeSize: 14,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    textStyle: const TextStyle(
                        fontSize: 9, fontWeight: FontWeight.w800),
                    backgroundColor: Color.lerp(
                        const Color(0xFFDC2626), AppColors.brandAmber, near),
                    textColor:
                        near > .5 ? const Color(0xFF0B1437) : Colors.white,
                    label: Text(count > 99 ? '99+' : '$count'),
                  ),
                ),
            ]),
            const SizedBox(height: 3),
            Text(label, maxLines: 1, overflow: TextOverflow.fade, softWrap: false),
          ]);
        },
      );
}

/// One entry in a [DashboardSectionTabs] control.
typedef DashboardSectionTab<T> = ({
  T value,
  String label,
  IconData icon,
  int badge,
});

/// Web parity `components/dashboard/dashboard-section-tabs.tsx`: the workspace
/// switcher under the Selling / Buying headings.
///
/// It is a two-column grid whose 1px gaps are the container's own background
/// showing through, so the buttons read as a single segmented block divided by
/// hairlines rather than as separate chips.
class DashboardSectionTabs<T> extends StatelessWidget {
  const DashboardSectionTabs({
    super.key,
    required this.tabs,
    required this.value,
    required this.onChanged,
  });

  final List<DashboardSectionTab<T>> tabs;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    // The 1px gaps between the buttons are this container showing through, so
    // it has to be the themed border rather than a slate-200 literal.
    final line = AppPalette.of(context).border;
    final rows = (tabs.length / 2).ceil();
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          color: line,
          border: Border.all(color: line),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var r = 0; r < rows; r++) ...[
              if (r > 0) const SizedBox(height: 1),
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var c = 0; c < 2; c++) ...[
                      if (c > 0) const SizedBox(width: 1),
                      Expanded(
                        child: r * 2 + c < tabs.length
                            ? _button(context, tabs[r * 2 + c])
                            : ColoredBox(color: AppPalette.of(context).surface),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _button(BuildContext context, DashboardSectionTab<T> tab) {
    final selected = tab.value == value;
    final palette = AppPalette.of(context);
    return Material(
      color: selected ? AppColors.brandBlue : palette.surface,
      child: InkWell(
        onTap: () => onChanged(tab.value),
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(tab.icon,
                  size: 16,
                  color: selected ? Colors.white : palette.textSecondary),
              const SizedBox(width: 8),
              Flexible(
                child: Text(tab.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: selected ? Colors.white : palette.textSecondary,
                    )),
              ),
              if (tab.badge > 0) ...[
                const SizedBox(width: 6),
                Container(
                  constraints: const BoxConstraints(minWidth: 20),
                  height: 20,
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  decoration: BoxDecoration(
                    color: selected
                        ? const Color(0xFFFBBF24)
                        : const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                        color: selected
                            ? Colors.white.withValues(alpha: .5)
                            : const Color(0xFFFCD34D)),
                  ),
                  child: Text(tab.badge > 99 ? '99+' : '${tab.badge}',
                      style: TextStyle(
                        fontSize: 10,
                        height: 1,
                        fontWeight: FontWeight.w600,
                        // The badge fill is a fixed amber in BOTH modes,
                        // so its ink stays dark in both.
                        color: selected
                            ? const Color(0xFF020617)
                            : const Color(0xFF78350F),
                      )),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Web parity: the "Selling" / "Buying" heading above each workspace switcher.
class _DashboardSectionHeading extends StatelessWidget {
  const _DashboardSectionHeading(this.title, this.subtitle, {this.trailing});
  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final heading = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(title,
            style: TextStyle(
                fontSize: 20,
                height: 1.25,
                fontWeight: FontWeight.w600,
                color: AppPalette.of(context).textPrimary)),
        if (subtitle != null)
          Text(subtitle!,
              style: TextStyle(fontSize: 14, color: AppPalette.of(context).textSecondary)),
      ],
    );
    if (trailing == null) return heading;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [Expanded(child: heading), trailing!],
    );
  }
}

/// Web parity `app/expat/dashboard/page.tsx` header: avatar, "Welcome back,
/// {first name}!" and the green Verified pill, above the tab strip.
class _MySpaceWelcome extends StatefulWidget {
  const _MySpaceWelcome({this.api});
  final ApiClient? api;

  @override
  State<_MySpaceWelcome> createState() => _MySpaceWelcomeState();
}

class _MySpaceWelcomeState extends State<_MySpaceWelcome> {
  String _first = '';
  String _initials = '';
  bool _verified = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = AuthStore.instance?.token;
    if (token == null || token.isEmpty) return;
    try {
      final me = await (widget.api ?? ApiClient()).getUserDetails(token);
      if (!mounted) return;
      final first = (me['firstName'] ?? '').toString().trim();
      final last = (me['lastName'] ?? '').toString().trim();
      setState(() {
        _first = first;
        _initials = [
          if (first.isNotEmpty) first[0],
          if (last.isNotEmpty) last[0],
        ].join().toUpperCase();
        _verified = isVerifiedAccountDetails(me);
      });
    } catch (_) {
      // The greeting is decoration: a failed lookup just leaves the fallback.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 16, 12, 16),
      child: Row(children: [
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
              color: Color(0xFF1E3A8A), shape: BoxShape.circle),
          child: Text(_initials.isEmpty ? 'GE' : _initials,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w600)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Welcome back, ${_first.isEmpty ? 'there' : _first}!',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 20,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                      color: AppPalette.of(context).textPrimary)),
              if (_verified) ...[
                const SizedBox(height: 4),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                  decoration: BoxDecoration(
                      color: const Color(0xFF10B981),
                      borderRadius: BorderRadius.circular(999)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.verified_rounded, size: 12, color: Colors.white),
                    SizedBox(width: 4),
                    Text('Verified',
                        style: TextStyle(
                            fontSize: 12,
                            height: 1.35,
                            fontWeight: FontWeight.w600,
                            color: AppPalette.of(context).background)),
                  ]),
                ),
              ],
            ],
          ),
        ),
      ]),
    );
  }
}

/// The stats and the Sell call to action - what the whole screen used to be.
class _OverviewTab extends StatefulWidget {
  const _OverviewTab(
      {this.api, required this.onSeeListings, required this.onSeeOrders});
  final ApiClient? api;
  final VoidCallback onSeeListings;
  final VoidCallback onSeeOrders;

  @override
  State<_OverviewTab> createState() => _OverviewTabState();
}

class _OverviewTabState extends State<_OverviewTab> {
  late final ApiClient _api = widget.api ?? ApiClient();

  /// Started ONCE. This used to be called straight from `build`, so every
  /// rebuild — a pending-work badge ticking over, a tab animation, a theme
  /// change — threw away the in-flight request, started another pair, and
  /// put the skeleton back on screen. On a weak connection that is the whole
  /// of "My Space is slow".
  /// Deliberately NOT kept alive across tab switches: coming back should show
  /// current numbers. Within the read cache's window that costs nothing, and
  /// after it the figures are worth re-reading.
  late final Future<List<dynamic>> _future = _stats();

  Future<List<dynamic>> _stats() async {
    final token = AuthStore.instance?.token;
    if (token == null) return <dynamic>[<Map<String, dynamic>>[], <Order>[]];
    // Independent reads, so they go out together rather than one after the
    // other — half the wait on a slow link.
    final results = await Future.wait([
      _api.getUserDetails(token),
      _api.fetchOrders(token),
    ]);
    final me = results[0] as Map<String, dynamic>;
    final orders = results[1] as List<Order>;
    final products =
        me['products'] is List ? me['products'] as List : const <dynamic>[];
    return [products, orders.where((o) => o.orderType == 'selling').toList()];
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text('My Space',
            style: TextStyle(
                fontSize: 28, height: 1.05, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text('Your listings, orders and requests in one place.',
            style: TextStyle(color: AppPalette.of(context).textSecondary)),
        const SizedBox(height: 16),
        // Selling is not a bottom tab any more, so MySpace carries it as the
        // primary action (web parity: the Sell CTA on /expat/dashboard).
        const SizedBox(height: 18),
        // AU-054 overview stats: activeListings · totalViews · sellingOrders ·
        // orderRevenue (web dashboard cards).
        FutureBuilder<List<dynamic>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const _OverviewSkeleton();
            }
            if (snap.hasError) {
              return ErrorText(
                  error: snap.error, context: 'Could not load your stats.');
            }
            final products = (snap.data?[0] as List?) ?? const <dynamic>[];
            final selling =
                (snap.data?[1] as List<Order?>?) ?? const <Order?>[];
            // LISTIN-19 / FINANC-03 parity: "active" counts the web's
            // active+booked status keys, and revenue sums every SELLING order
            // whose status reached DELIVERED/COMPLETED/PICKED_UP/PAID
            // (dashboard page.tsx lines 1207-1230). The old "not archived"
            // active count and the PAID-only revenue were both wrong.
            final active = products.where((p) {
              final key = _listingStatusKey((p as Map).cast<String, dynamic>());
              return key == 'active' || key == 'booked';
            }).length;
            final views = products.fold<int>(
                0,
                (sum, p) =>
                    sum + (((p as Map)['clickCount'] as num?)?.toInt() ?? 0));
            final revenue = selling.fold<double>(0, (sum, o) {
              final oo = o!;
              const paid = {
                'DELIVERED',
                'COMPLETED',
                'PICKED_UP',
                'PAID',
              };
              return sum +
                  (paid.contains(oo.normalizedStatus) ? oo.totalAmount : 0);
            });
            final ranked = [...products]..sort((a, b) =>
                (((b as Map)['clickCount'] as num?) ?? 0)
                    .compareTo(((a as Map)['clickCount'] as num?) ?? 0));
            return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  LayoutBuilder(builder: (context, constraints) {
                    final metricHeight =
                        ((constraints.maxWidth - 10) / 2) / 1.65;
                    return Column(children: [
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 1.65,
                        children: [
                          _MetricCard(
                              value: '${products.length}',
                              label: 'Total listings',
                              detail: 'All listings',
                              icon: Icons.inventory_2_outlined,
                              color: const Color(0xFF2563EB)),
                          _MetricCard(
                              value: '$active',
                              label: 'Active listings',
                              detail: 'Ready for buyers',
                              icon: Icons.bolt_outlined,
                              color: const Color(0xFF059669)),
                          _MetricCard(
                              value: '$views',
                              label: 'Total views',
                              detail: products.isEmpty
                                  ? 'No listings yet'
                                  : '${(views / products.length).toStringAsFixed(1)} average',
                              icon: Icons.visibility_outlined,
                              color: const Color(0xFF059669)),
                          _MetricCard(
                              value: '${selling.length}',
                              label: 'Selling orders',
                              detail: 'All activity',
                              icon: Icons.shopping_bag_outlined,
                              color: const Color(0xFFEA580C)),
                        ],
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        height: metricHeight,
                        child: _MetricCard(
                            value: 'TSh ${revenue.toStringAsFixed(0)}',
                            label: 'Revenue',
                            detail: 'Completed orders',
                            icon: Icons.trending_up,
                            color: const Color(0xFF7C3AED)),
                      ),
                    ]);
                  }),
                  const SizedBox(height: 22),
                  const _SectionHeading(
                      title: 'Performance',
                      subtitle: 'Your most-viewed listings'),
                  const SizedBox(height: 10),
                  _PerformancePanel(
                      products: ranked.take(5).toList(), totalViews: views),
                ]);
          },
        ),
        // "Quick actions" removed: every destination it offered is already
        // one tap away on the bottom bar (Sell) or the Selling sub-tabs
        // (Listings, Orders), so the row was a third route to the same places.
        const SizedBox(height: 28),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard(
      {required this.value,
      required this.label,
      required this.detail,
      required this.icon,
      required this.color});
  final String value, label, detail;
  final IconData icon;

  /// The icon's own colour. Its tile is a wash of the same hue rather than a
  /// separate literal, so the tile follows the theme for free instead of
  /// staying a light `orange-50` patch on a dark card.
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
        label: '$label, $value, $detail',
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              color: AppPalette.of(context).surface,
              borderRadius: BorderRadius.circular(18),
              border:
                  Border.all(color: AppPalette.of(context).border.withValues(alpha: .75))),
          child: Row(children: [
            Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                    color: color.withValues(alpha: .14),
                    borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: color, size: 20)),
            const SizedBox(width: 10),
            Expanded(
                child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w800,
                          height: 1)),
                  const SizedBox(height: 5),
                  Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 11.5, fontWeight: FontWeight.w600)),
                  Text(detail,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 10.5, color: AppPalette.of(context).textSecondary)),
                ])),
          ]),
        ),
      );
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, required this.subtitle});
  final String title, subtitle;
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 2),
        Text(subtitle,
            style: TextStyle(
                fontSize: 12.5, color: AppPalette.of(context).textSecondary)),
      ]);
}

class _PerformancePanel extends StatelessWidget {
  const _PerformancePanel({required this.products, required this.totalViews});
  final List<dynamic> products;
  final int totalViews;
  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
        decoration: BoxDecoration(
            color: AppPalette.of(context).surface, borderRadius: BorderRadius.circular(18)),
        child: Column(children: [
          Icon(Icons.query_stats, size: 32, color: AppPalette.of(context).textSecondary),
          SizedBox(height: 8),
          Text('Performance appears after your first listing receives views.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppPalette.of(context).textSecondary))
        ]),
      );
    }
    final maxViews = products.fold<int>(1, (m, p) {
      final v = (((p as Map)['clickCount'] as num?) ?? 0).toInt();
      return v > m ? v : m;
    });
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: AppPalette.of(context).surface, borderRadius: BorderRadius.circular(18)),
      child: Column(children: [
        for (var i = 0; i < products.length; i++) ...[
          Builder(builder: (_) {
            final p = (products[i] as Map).cast<String, dynamic>();
            final name =
                (p['productName'] ?? p['name'] ?? 'Listing').toString();
            final views = ((p['clickCount'] as num?) ?? 0).toInt();
            return Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(children: [
                  SizedBox(
                      width: 26,
                      child: Text('#${i + 1}',
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppPalette.of(context).textSecondary))),
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Row(children: [
                          Expanded(
                              child: Text(name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600))),
                          Text('$views',
                              style: const TextStyle(
                                  fontSize: 12, fontWeight: FontWeight.w700))
                        ]),
                        const SizedBox(height: 6),
                        ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                                value: views / maxViews,
                                minHeight: 6,
                                backgroundColor: AppPalette.of(context).surfaceMuted,
                                color: AppColors.brandBlue)),
                      ])),
                ]));
          }),
        ],
        const SizedBox(height: 6),
        Align(
            alignment: Alignment.centerLeft,
            child: Text('$totalViews total views',
                style: TextStyle(
                    fontSize: 11.5, color: AppPalette.of(context).textSecondary))),
      ]),
    );
  }
}


class _OverviewSkeleton extends StatelessWidget {
  const _OverviewSkeleton();
  @override
  Widget build(BuildContext context) => GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.65,
        children: List.generate(
            4,
            (_) => Container(
                decoration: BoxDecoration(
                    color: AppPalette.of(context).surfaceMuted,
                    borderRadius: BorderRadius.circular(18)))),
      );
}

/// Derived listing status key for the Overview stats — exact port of the
/// reference `getListingStatusKey` (also mirrored privately in
/// SellerListingsScreen). Two-field model: approval (`productStatus`) takes
/// precedence over availability (`availabilityStatus`); legacy single-field
/// ARCHIVED honored on both. The dashboard needs its own copy because the
/// listing screen's helper is private to that widget.
String _listingStatusKey(Map<String, dynamic> p) {
  final approval =
      ((p['productStatus'] as String?) ?? (p['status'] as String?) ?? '')
          .toUpperCase();
  final avail = ((p['availabilityStatus'] as String?) ?? '').toUpperCase();
  final available = (p['productQuantity'] as num?)?.toInt() ?? 0;
  final sold = (p['soldQuantity'] as num?)?.toInt() ?? 0;
  final rental = p['rentalConfiguration'] != null;

  if (approval == 'REJECTED' || approval == 'UNAPPROVED') return 'unapproved';
  if (approval == 'PENDING') return 'pending';
  if (approval == 'ARCHIVED') return 'archived';
  if (avail == 'ARCHIVED') return 'archived';
  if (rental) return (p['rentalBookedToday'] == true) ? 'booked' : 'active';
  if (approval == 'SOLD') return 'sold';
  if (approval == 'OUT_OF_STOCK') return 'out_of_stock';
  if (avail == 'OUT_OF_STOCK') return 'out_of_stock';
  if (avail == 'AVAILABLE') return available > 0 ? 'active' : 'out_of_stock';
  if (available > 0) return 'active';
  if (sold > 0) return 'sold';
  return 'out_of_stock';
}

/// Web parity `app/expat/dashboard/page.tsx`: the Selling workspace ("My
/// Listings" tab) carries its own Listings | Orders | Payments sub-tab bar
/// (LISTIN-17). Transporters is owned by the transport phase and is not shown
/// here yet.
// Web parity: the seller's Payments tab was merged into the Virtual wallet
// (web 5ed5275), so an old `sub=payments` link lands on the wallet.
enum _SellingSub { listings, orders, transporters, wallet }

class _SellingTab extends StatefulWidget {
  const _SellingTab(
      {super.key,
      required this.api,
      this.initialSub,
      this.initialListingFilter});
  final ApiClient api;
  final String? initialSub;
  final String? initialListingFilter;

  @override
  State<_SellingTab> createState() => _SellingTabState();
}

class _SellingTabState extends State<_SellingTab> {
  late _SellingSub _sub = widget.initialSub == 'payments'
      ? _SellingSub.wallet
      : _SellingSub.values.firstWhere((v) => v.name == widget.initialSub,
          orElse: () => _SellingSub.listings);

  @override
  Widget build(BuildContext context) {
    // The heading and workspace tabs are handed to the listings screen as
    // header widgets so they sit inside its scroll view: web parity, where
    // nothing on My Space is pinned.
    final header = [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _DashboardSectionHeading(
              'Selling',
              null,
              trailing: FilledButton.icon(
                onPressed: () => context.push('/sell'),
                icon: const Icon(Icons.add_rounded, size: 16),
                label: const Text('New'),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF1E3A8A),
                  foregroundColor: Colors.white,
                  minimumSize: const Size(0, 40),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  textStyle: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w500),
                ),
              ),
            ),
            const SizedBox(height: 12),
            ListenableBuilder(
              listenable: PendingActionsStore.instance,
              builder: (context, _) => DashboardSectionTabs<_SellingSub>(
                value: _sub,
                onChanged: (v) => setState(() => _sub = v),
                tabs: [
                  (
                    value: _SellingSub.listings,
                    label: 'Listings',
                    icon: Icons.inventory_2_outlined,
                    badge: 0,
                  ),
                  (
                    value: _SellingSub.orders,
                    label: 'Orders',
                    icon: Icons.shopping_bag_outlined,
                    badge: PendingActionsStore.instance.sellingPending,
                  ),
                  (
                    value: _SellingSub.transporters,
                    label: 'Transporters',
                    icon: Icons.local_shipping_outlined,
                    badge: 0,
                  ),
                  (
                    value: _SellingSub.wallet,
                    label: 'Virtual wallet',
                    icon: Icons.account_balance_wallet_outlined,
                    badge: 0,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ];

    // Every workspace hosts the header inside its own scroll view, so the
    // heading and sub-tabs scroll away with the content on all four.
    return switch (_sub) {
      _SellingSub.listings =>
        SellerListingsScreen(
            api: widget.api,
            embedded: true,
            header: header,
            initialFilter: widget.initialListingFilter),
      _SellingSub.orders => OrdersScreen(
          api: widget.api,
          initialTab: 'selling',
          embedded: true,
          header: header),
      _SellingSub.transporters =>
        _TransportersPanel(api: widget.api, header: header),
      _SellingSub.wallet =>
        SellerWalletPanel(api: widget.api, header: header),
    };
  }
}

class _TransportersPanel extends StatefulWidget {
  const _TransportersPanel({required this.api, this.header = const <Widget>[]});
  final ApiClient api;

  /// Scrolled with the list, not pinned above it — web parity: nothing on My
  /// Space is sticky.
  final List<Widget> header;
  @override
  State<_TransportersPanel> createState() => _TransportersPanelState();
}

class _TransportersPanelState extends State<_TransportersPanel> {
  late Future<List<Map<String, dynamic>>> _future = _load();
  Future<List<Map<String, dynamic>>> _load() {
    final token = AuthStore.instance?.token;
    return token == null
        ? Future.value([])
        : widget.api.fetchTransporterRegistry(token);
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  @override
  Widget build(BuildContext context) =>
      FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return _scrollBody(const [
              Padding(
                  padding: EdgeInsets.only(top: 64),
                  child: Center(child: CircularProgressIndicator())),
            ]);
          }
          if (snap.hasError) {
            return _scrollBody([
              Padding(
                padding: const EdgeInsets.only(top: 64),
                child: Center(
                    child: Text(
                        'Could not load transporters: ${friendlyApiError(snap.error)}',
                        textAlign: TextAlign.center)),
              ),
            ]);
          }
          final rows = snap.data ?? const [];
          return _scrollBody(
            [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Transporters',
                        style: TextStyle(
                            fontSize: 22, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text('People available for your order deliveries.',
                        style: TextStyle(color: AppPalette.of(context).textSecondary)),
                    const SizedBox(height: 16),
                    if (rows.isEmpty)
                      Padding(
                          padding: EdgeInsets.only(top: 64),
                          child: Center(
                              child: Column(children: [
                            Icon(Icons.local_shipping_outlined,
                                size: 40, color: AppPalette.of(context).textSecondary),
                            SizedBox(height: 10),
                            Text('No transporters available yet')
                          ])))
                    else
                      for (final row in rows)
                        Card(
                          margin: const EdgeInsets.only(bottom: 10),
                          child: Column(children: [
                            ListTile(
                              leading: const CircleAvatar(
                                  child: Icon(Icons.local_shipping_outlined)),
                              title: Text(
                                  (row['fullName'] ?? 'Transporter').toString(),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text([row['vehicleType'], row['plateNumber']]
                                      .where((v) =>
                                          v != null && v.toString().isNotEmpty)
                                      .join(' • ')),
                                  if (riderAppStatus(row) != null)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: RiderAppBadge(transporter: row),
                                    ),
                                ],
                              ),
                              trailing: row['available'] == false
                                  ? const Text('Busy')
                                  : const Text('Available',
                                      style: TextStyle(
                                          color: AppColors.accentGreen,
                                          fontWeight: FontWeight.w700)),
                            ),
                            if (canInviteRider(row) &&
                                AuthStore.instance?.token != null)
                              Align(
                                alignment: Alignment.centerRight,
                                child: Padding(
                                  padding:
                                      const EdgeInsets.only(right: 8, bottom: 4),
                                  child: RiderAppActions(
                                    api: widget.api,
                                    token: AuthStore.instance!.token!,
                                    transporter: row,
                                    onChanged: _refresh,
                                  ),
                                ),
                              ),
                          ]),
                        ),
                  ],
                ),
              ),
            ],
          );
        },
      );

  /// Every state of this panel is one scroll view whose first children are the
  /// host's [_TransportersPanel.header], so the MySpace heading and workspace
  /// tabs scroll away with the list instead of being pinned above it.
  Widget _scrollBody(List<Widget> children) => RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [...widget.header, ...children],
        ),
      );
}

/// Web parity `app/expat/dashboard/page.tsx`: the Buying tab carries its own
/// `myOrdersSub` toggle between Orders and Payments — "My payments" lives
/// here, not on Profile Information or as a stray Account-tab row (both were
/// tried and were wrong; see account_misc_screens.dart's doc comments).
enum _BuyingSub { orders, payments }

class _BuyingTab extends StatefulWidget {
  const _BuyingTab(
      {required this.api,
      this.initialSub,
      this.initialPaymentStatus,
      this.paymentsHttpClient});
  final ApiClient api;
  final String? initialSub;
  final PaymentGroup? initialPaymentStatus;
  final http.Client? paymentsHttpClient;

  @override
  State<_BuyingTab> createState() => _BuyingTabState();
}

class _BuyingTabState extends State<_BuyingTab> {
  late _BuyingSub _sub = _BuyingSub.values.firstWhere(
      (v) => v.name == widget.initialSub,
      orElse: () => _BuyingSub.orders);

  @override
  Widget build(BuildContext context) {
    // Handed to whichever panel is showing so it scrolls with the content —
    // web parity: nothing on My Space is pinned.
    final header = [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _DashboardSectionHeading(
                'Buying', 'Track your purchases and payments'),
            const SizedBox(height: 12),
            ListenableBuilder(
              listenable: PendingActionsStore.instance,
              builder: (context, _) => DashboardSectionTabs<_BuyingSub>(
                value: _sub,
                onChanged: (v) => setState(() => _sub = v),
                tabs: [
                  (
                    value: _BuyingSub.orders,
                    label: 'Orders',
                    icon: Icons.shopping_bag_outlined,
                    badge: PendingActionsStore.instance.buyingOrdersPending,
                  ),
                  (
                    value: _BuyingSub.payments,
                    label: 'Payments',
                    icon: Icons.credit_card_outlined,
                    badge: PendingActionsStore.instance.buyingPaymentsPending,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ];

    return switch (_sub) {
      _BuyingSub.orders => OrdersScreen(
          api: widget.api,
          initialTab: 'buying',
          embedded: true,
          header: header),
      _BuyingSub.payments => MyPaymentsScreen(
          api: widget.api,
          paymentsHttpClient: widget.paymentsHttpClient,
          embedded: true,
          header: header,
          initialGroup: widget.initialPaymentStatus ?? PaymentGroup.pending,
        ),
    };
  }
}

/// AU-039: transporter-side handover code entry. Mirrors the reference
/// DeliveryCodeCard verify panel ("Confirm delivery" card): title, instruction
/// copy, code field, Verify action, attempts-remaining copy, lockout after 3
/// wrong tries, and a Regenerate escape hatch. The whole card is one semantics
/// container so the static copy reaches screen readers too (r9: it painted but
/// was absent from flt-semantics).
class _CodeVerifyCard extends StatefulWidget {
  final bool locked;
  final int attemptsRemaining;
  final String? message;
  final ValueChanged<String> onVerify;
  final VoidCallback onRegenerate;
  const _CodeVerifyCard({
    required this.locked,
    required this.attemptsRemaining,
    required this.message,
    required this.onVerify,
    required this.onRegenerate,
  });

  @override
  State<_CodeVerifyCard> createState() => _CodeVerifyCardState();
}

class _CodeVerifyCardState extends State<_CodeVerifyCard> {
  final _ctrl = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final msg = widget.message;
    return Semantics(
      container: true,
      label: 'Confirm delivery. '
          'Ask the buyer for their delivery code at handover and enter it here to mark this order delivered.',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppPalette.of(context).infoFill,
          border: Border.all(color: const Color(0xFF93C5FD)),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Delivery handover',
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: AppPalette.of(context).accentInk)),
            const SizedBox(height: 4),
            Text(
              'Enter the 6-digit code the buyer shows you to confirm delivery.',
              style: TextStyle(fontSize: 12, color: AppPalette.of(context).accentInk),
            ),
            const SizedBox(height: 10),
            TextField(
              key: const ValueKey('delivery-code-input'),
              controller: _ctrl,
              enabled: !widget.locked,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: InputDecoration(
                labelText: 'Delivery code',
                counterText: '',
                border: const OutlineInputBorder(),
                errorText:
                    widget.locked ? 'Locked — regenerate the code' : null,
              ),
            ),
            const SizedBox(height: 8),
            Row(children: [
              FilledButton.icon(
                key: const ValueKey('verify-delivery-btn'),
                onPressed: widget.locked
                    ? null
                    : () {
                        final code = _ctrl.text.trim();
                        if (code.isNotEmpty) widget.onVerify(code);
                      },
                icon: const Icon(Icons.verified_outlined),
                label: const Text('Verify delivery'),
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: widget.onRegenerate,
                icon: const Icon(Icons.refresh),
                label: const Text('Generate new code'),
              ),
            ]),
            if (widget.attemptsRemaining < 3 && !widget.locked)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                // AU-039 verifier: expose the server-driven attempts line to
                // the a11y tree (it painted but was absent from flt-semantics).
                child: Semantics(
                  label: 'attemptsRemaining: ${widget.attemptsRemaining}',
                  child: Text('attemptsRemaining: ${widget.attemptsRemaining}',
                      style: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ),
            if (msg != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Semantics(
                  label: msg,
                  child: Text(msg,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: msg.startsWith('Delivery confirmed') ||
                                  msg.contains('New code')
                              ? AppPalette.of(context).successText
                              : AppPalette.of(context).dangerText)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
