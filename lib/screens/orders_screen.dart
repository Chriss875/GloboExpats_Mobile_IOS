import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/buyer_payment_recovery.dart';
import '../domain/countdown.dart';
import '../domain/dispatch.dart';
import '../domain/driver_app.dart';
import '../domain/order_action_hint.dart';
import '../domain/order_journey.dart';
import '../domain/dispatch_errors.dart';
import '../domain/pending_actions.dart';
import '../domain/production_time.dart';
import '../models/order.dart';
import '../domain/escrow.dart';
import '../domain/time_utils.dart';
import '../theme.dart';
import 'delivery_dashboard_screens.dart';
import 'my_payments_screen.dart'
    show MyPaymentsScreen, PaymentsApi, PaymentGroup;
import '../config.dart';
import '../widgets/app_image.dart';
import '../widgets/assign_transporter_modal.dart';
import '../widgets/delivery_journey.dart';
import '../widgets/error_text.dart';
import '../widgets/order_status_timeline.dart';
import '../widgets/production_time_card.dart';
import '../widgets/rental_order_widgets.dart';
import '../widgets/skeleton_loader.dart';
import '../widgets/navigation_boundary.dart';

/// Orders list — GET /api/v1/orders (requires login).
class OrdersScreen extends StatefulWidget {
  const OrdersScreen(
      {super.key,
      this.auth,
      this.api,
      this.initialTab,
      this.embedded = false,
      this.header = const <Widget>[]});

  /// Rendered inside a MySpace tab, where the shared GloboAppBar and the
  /// tab bar are already on screen.
  final bool embedded;

  /// Widgets the host wants scrolled with the list rather than pinned above
  /// it — MySpace hands its section heading and workspace tabs down here so
  /// nothing on the dashboard is sticky (web parity).
  final List<Widget> header;
  final AuthStore? auth;
  final ApiClient? api;

  /// 'buying' (default) or 'selling' — AU-054/055: the seller dashboard opens
  /// this screen scoped to the selling side of the split list.
  final String? initialTab;
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<List<Order>> _future;
  late String _tab = (widget.initialTab == 'selling') ? 'selling' : 'buying';

  /// ORDS-25 web parity: the dashboard slices filtered orders 10 per page
  /// (itemsPerOrderPage = 10) over the full fetched list, keeping the old list
  /// rendered while a refresh refetches (stale-while-revalidate). Mobile shows
  /// the first page and grows it by a page on 'Load more orders'; pull-to-refresh
  /// swaps in a fresh fetch and starts again at page one.
  static const int _pageSize = 10;
  int _visibleCount = _pageSize;

  /// ACCOUN-08 / FINANC-06 (D-6): payout-setup prompt. Fired at most once per
  /// OrdersScreen lifetime (the web shows it app-wide until configured); the
  /// backend's prompt-status answer decides — never a local guess.
  bool _payoutPromptAttempted = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Order>> _load() => _auth.token != null
      ? _api.fetchOrders(_auth.token!)
      : Future.error('Not logged in');

  Future<void> _refresh() async {
    final next = _load();
    setState(() {
      _future = next;
      _visibleCount = _pageSize;
    });
    try {
      await next;
    } catch (_) {
      // The FutureBuilder error branch below renders the load-error state —
      // never a fake empty/success list.
    }
  }

  void _showMore() => setState(() => _visibleCount += _pageSize);

  /// ACCOUN-08 / FINANC-06 (D-6): ask GET payout-details/prompt-status once the
  /// SELLING list has data; when the backend says this seller has listings but
  /// no payout method and should be prompted, show the web's non-dismissible
  /// 'Set up your payout method' dialog. Best-effort — never blocks the list.
  Future<void> _maybePromptPayoutSetup(List<Order> orders) async {
    if (_payoutPromptAttempted || _tab != 'selling') return;
    final token = _auth.token;
    if (token == null || token.isEmpty) return;
    if (!orders.any((o) => o.isSelling)) return;
    _payoutPromptAttempted = true;
    try {
      final s = await _api.getSellerPayoutPromptStatus(token);
      if (!mounted) return;
      if (s['hasListings'] == true &&
          s['configured'] != true &&
          s['shouldPrompt'] == true) {
        await _showPayoutSetupPrompt();
      }
    } catch (_) {
      // Prompt is best-effort; a network failure must never gate the orders.
    }
  }

  Future<void> _showPayoutSetupPrompt() async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          title: const Text('Set up your payout method'),
          content: const Text(
              'Your seller payments will be sent here after the payment '
              'process is completed.'),
          actions: [
            FilledButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                GoRouter.of(ctx).push('/account/payout-details');
              },
              child: const Text('Set up now'),
            ),
          ],
        ),
      ),
    );
  }

  /// Resets pagination whenever the buying/selling split or group filter
  /// changes so the new scope starts from its first page.
  void _changeFilter(VoidCallback change) {
    setState(() {
      change();
      _visibleCount = _pageSize;
    });
  }

  /// Web parity (dashboard buyer/seller history): three groups, not five
  /// chips. Ongoing and overdue are one bucket, there is no "all", and the
  /// list opens on the active group.
  _OrderHistoryFilter _historyFilter = _OrderHistoryFilter.ongoing;

  /// Web 2026-10: All / Bookings / Products, offered only when this side
  /// has short-stay bookings. Bookings are orders, not a separate list.
  _OrderKind _kind = _OrderKind.all;

  List<Order> _scoped(List<Order> all) =>
      all.where((o) => (_tab == 'selling') == o.isSelling).toList();

  static bool _isBooking(Order o) => o.rental?.isShortStay ?? false;

  bool _inKind(Order o) => switch (_kind) {
        _OrderKind.all => true,
        _OrderKind.bookings => _isBooking(o),
        _OrderKind.products => !_isBooking(o),
      };

  static bool _inFilter(Order o, _OrderHistoryFilter f) => switch (f) {
        _OrderHistoryFilter.ongoing =>
          o.group == OrderGroup.ongoing || o.group == OrderGroup.overdue,
        _OrderHistoryFilter.completed => o.group == OrderGroup.completed,
        _OrderHistoryFilter.cancelled => o.group == OrderGroup.cancelled,
      };

  /// Buying-empty-state CTA — web 'Explore Marketplace' → /browse. Navigates
  /// via GoRouter only when tapped so plain-MaterialApp test harnesses that
  /// never press it stay unaffected.
  Widget _exploreMarketplaceButton(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: OutlinedButton.icon(
          onPressed: () => GoRouter.of(context).go('/browse'),
          icon: const Icon(Icons.explore_outlined),
          label: const Text('Explore Marketplace'),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.embedded
          ? null
          : AppBar(
              title: Text(_tab == 'selling' ? 'Selling orders' : 'My orders')),
      body: FutureBuilder<List<Order>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return _scrollBody(const [FeedSkeleton()]);
          }
          if (snap.hasError) {
            // Pull-to-refresh still works from the error state so a transient
            // failure is one gesture away from being retried.
            return _scrollBody([
              const SizedBox(height: 140),
              Center(
                  child: Text(
                      'Could not load orders: ${friendlyApiError(snap.error)}',
                      textAlign: TextAlign.center)),
            ]);
          }
          final all = snap.data ?? const <Order>[];
          // D-6: non-dismissible payout-setup prompt for eligible sellers
          // (async; guarded to fire at most once).
          _maybePromptPayoutSetup(all);
          final sided = _scoped(all);
          final hasBookings = sided.any(_isBooking);
          final scoped = hasBookings ? sided.where(_inKind).toList() : sided;
          final filtered =
              scoped.where((o) => _inFilter(o, _historyFilter)).toList();
          final shown = filtered.take(_visibleCount).toList();
          final hasMore = filtered.length > shown.length;
          if (all.isEmpty) {
            // Web parity (dashboard renderOrdersList): a new buyer with no
            // orders at all gets a path into the marketplace, not a dead end.
            return _scrollBody([
              const SizedBox(height: 120),
              const Center(
                child: Text(
                    'No orders yet.\nWhen you place an order it will appear here.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey)),
              ),
              if (_tab == 'buying')
                Center(child: _exploreMarketplaceButton(context)),
            ]);
          }
          return _scrollBody([
            if (!widget.embedded)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Row(children: [
                  Expanded(
                      child: ChoiceChip(
                          label: const Text('Buying'),
                          selected: _tab == 'buying',
                          onSelected: (_) =>
                              _changeFilter(() => _tab = 'buying'))),
                  const SizedBox(width: 8),
                  Expanded(
                      child: ChoiceChip(
                          label: const Text('Selling'),
                          selected: _tab == 'selling',
                          onSelected: (_) =>
                              _changeFilter(() => _tab = 'selling'))),
                ]),
              ),
            if (hasBookings)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: SegmentedButton<_OrderKind>(
                  key: const ValueKey('order-kind-filter'),
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: _OrderKind.all, label: Text('All')),
                    ButtonSegment(
                        value: _OrderKind.bookings, label: Text('Bookings')),
                    ButtonSegment(
                        value: _OrderKind.products, label: Text('Products')),
                  ],
                  selected: {_kind},
                  onSelectionChanged: (v) =>
                      _changeFilter(() => _kind = v.first),
                ),
              ),
            // Web parity (dashboard :2270-2308 buying, :2754-2792 selling —
            // byte-identical markup): one three-up strip with a count on
            // each tab, then the group's own heading and subtitle.
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: _OrderHistoryFilterStrip(
                selected: _historyFilter,
                counts: {
                  for (final f in _OrderHistoryFilter.values)
                    f: scoped.where((o) => _inFilter(o, f)).length,
                },
                onSelected: (f) => _changeFilter(() => _historyFilter = f),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_historyFilter.heading(selling: _tab == 'selling'),
                      style: TextStyle(
                          fontSize: 24,
                          height: 1.2,
                          letterSpacing: -.4,
                          fontWeight: FontWeight.w600,
                          color: AppPalette.of(context).textPrimary)),
                  const SizedBox(height: 4),
                  Text(_historyFilter.subtitle(selling: _tab == 'selling'),
                      style: TextStyle(
                          fontSize: 14, color: AppPalette.of(context).textSecondary)),
                ],
              ),
            ),
            if (filtered.isEmpty) ...[
              const SizedBox(height: 80),
              Center(
                child: Text(
                    _tab == 'selling'
                        ? 'You have no selling orders yet.'
                        : 'You have no buying orders yet.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.grey)),
              ),
              if (_tab == 'buying') _exploreMarketplaceButton(context),
            ] else
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    for (var i = 0; i < shown.length; i++) ...[
                      if (i > 0) const SizedBox(height: 10),
                      _OrderCard(shown[i], _auth.token!, _api,
                          onChanged: _refresh),
                    ],
                    if (hasMore)
                      Center(
                        child: TextButton.icon(
                          onPressed: _showMore,
                          icon: const Icon(Icons.expand_more),
                          label: const Text('Load more orders'),
                        ),
                      ),
                  ],
                ),
              ),
          ]);
        },
      ),
    );
  }

  /// Every state of this screen is one scroll view whose first children are
  /// the host's [OrdersScreen.header], so the MySpace heading and workspace
  /// tabs scroll away with the orders instead of being pinned above them.
  Widget _scrollBody(List<Widget> children) => RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [...widget.header, ...children],
        ),
      );
}

enum _OrderKind { all, bookings, products }

class _OrderCard extends StatelessWidget {
  final Order order;
  final String token;
  final ApiClient api;
  final Future<void> Function()? onChanged;
  const _OrderCard(this.order, this.token, this.api, {this.onChanged});

  /// Web parity `getOrderActionHint`: the same "what to do next" hint the
  /// detail screen shows, surfaced here too so a glance at the list already
  /// says whether an order is waiting on this person.
  OrderActionHint? get _hint => getOrderActionHint(
        order.normalizedStatus,
        order.isSelling ? 'seller' : 'buyer',
        fulfillmentType: order.fulfillmentType,
        canDispatch: order.canDispatch,
        dispatchBlockedReason: order.dispatchBlockedReason,
      );

  Color _hintColor(BuildContext context, HintTone tone) => switch (tone) {
        HintTone.action => AppColors.brandBlue,
        HintTone.warning => const Color(0xFFDC2626),
        HintTone.success => AppColors.accentGreen,
        HintTone.info => AppPalette.of(context).textSecondary,
      };

  /// ORDERS-09/12 list half: the buyer-selected delivery window is surfaced on
  /// list cards exactly like the web dashboard — hidden only for a cancelled
  /// order (web `milestone !== 'cancelled'`), labelled 'Expected:' on buying
  /// cards, 'Delivery window:' on selling cards and 'Delivered:' once delivered.
  bool get _windowLineHidden {
    final s = order.normalizedStatus;
    return s == 'CANCELLED' || s == 'FAILED' || s == 'EXPIRED';
  }

  String get _windowLineLabel {
    final s = order.normalizedStatus;
    if (s == 'DELIVERED' || s == 'COMPLETED') return 'Delivered';
    return order.isSelling ? 'Delivery window' : 'Expected';
  }

  bool get _paid => (order.paymentStatus ?? '').toUpperCase() == 'PAID';

  /// Web dashboard rental card: the stay's dates, its stage, the other
  /// side once paid, where it is, and the guest's check-in code while
  /// waiting for check-in.
  List<Widget> _rentalBlock(BuildContext context, RentalPresentation rental) {
    final selling = order.isSelling;
    final location = order.rentalLocation;
    return [
      const SizedBox(height: 10),
      RentalStayDates(
          rental: rental, perspective: selling ? 'seller' : 'buyer'),
      const SizedBox(height: 8),
      RentalStageChip(rental: rental, status: order.status),
      if (_paid) ...[
        const SizedBox(height: 8),
        selling
            ? RentalCounterparty(
                label: rental.isShortStay ? 'Guest' : 'Renter',
                name: order.buyerName,
                phone: order.buyerPhone)
            : RentalCounterparty(
                label: rental.isShortStay ? 'Host' : 'Provider',
                name: order.sellerName,
                phone: order.sellerPhone),
      ],
      if (!selling && location != null) ...[
        const SizedBox(height: 6),
        Align(
          alignment: Alignment.centerLeft,
          child: RentalLocationLink(rental: rental, mapUrl: location.mapUrl),
        ),
      ],
      if (!selling && order.normalizedStatus == 'AWAITING_PICKUP') ...[
        const SizedBox(height: 10),
        RentalCodeCard(
          rental: rental,
          code: order.rentalHandoffCode,
          attemptsUsed: order.rentalHandoffCodeAttempts,
          compact: true,
          onGenerate: () async {
            try {
              await api.orderAction(
                  token, order.orderId, 'regenerate-rental-handoff-code');
              await onChanged?.call();
            } catch (e) {
              if (!context.mounted) return;
              ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
                  content: Text('Could not generate a code: ${friendlyApiError(e)}')));
            }
          },
        ),
      ],
    ];
  }

  void _openActionSheet(BuildContext context) {
    showModalBottomSheet<bool>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      builder: (_) => FractionallySizedBox(
        heightFactor: .92,
        child: _OrderQuickActionsSheet(order: order, token: token, api: api),
      ),
    ).then((changed) {
      if (changed == true) onChanged?.call();
    });
  }

  @override
  Widget build(BuildContext context) {
    final thumb = order.items.isNotEmpty ? order.items.first.image : null;
    final extraItems = order.items.length - 1;
    final hint = _hint;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () {
        final router = GoRouter.maybeOf(context);
        if (router != null) {
          router.push('/orders/${Uri.encodeComponent(order.orderId)}');
          return;
        }
        Navigator.of(context).push(
          MaterialPageRoute(
              settings: RouteSettings(
                  name: '/orders/${Uri.encodeComponent(order.orderId)}'),
              builder: (_) => OrderDetailScreen(
                  orderId: order.orderId,
                  token: token,
                  api: api,
                  order: order)),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: AppPalette.of(context).surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppPalette.of(context).border)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Web parity `expat/dashboard` order-card header row: Order ID +
            // Date as a compact metadata line above the item summary, with a
            // divider separating it from the rest of the card.
            Row(
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 14,
                    runSpacing: 2,
                    children: [
                      _CardMeta(
                          '${order.rental?.orderNoun ?? 'Order'} ID',
                          '#${order.orderNumber}'),
                      if (order.createdAtLabel != null)
                        _CardMeta('Date', order.createdAtLabel!),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded,
                    size: 16, color: AppPalette.of(context).accentInk),
              ],
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Divider(height: 1),
            ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _CardActionBadge(
                  orderId: order.orderId,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SizedBox(
                      width: 48,
                      height: 48,
                      child: thumb != null && thumb.isNotEmpty
                          ? AppImage(AppConfig.resolveAssetUrl(thumb),
                              fit: BoxFit.cover)
                          : Container(
                              color: AppPalette.of(context).border,
                              child: Icon(Icons.inventory_2_outlined,
                                  size: 20, color: AppPalette.of(context).textSecondary),
                            ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                          order.items.isNotEmpty
                              ? (extraItems > 0
                                  ? '${order.items.first.productName} +$extraItems more'
                                  : order.items.first.productName)
                              : (order.orderNumber.isEmpty
                                  ? 'Order'
                                  : order.orderNumber),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      // Only a separate line when the title above is the item
                      // name, not the order number itself (no items -> the
                      // title already IS the order number; showing it twice
                      // was the AU-035 test's actual regression here).
                      if (order.items.isNotEmpty &&
                          order.orderNumber.isNotEmpty)
                        Text(order.orderNumber,
                            style: TextStyle(
                                color: AppPalette.of(context).textSecondary,
                                fontSize: 11.5)),
                      if (order.rental != null)
                        Text(order.rental!.kindLabel,
                            style: TextStyle(
                                color: AppPalette.of(context).textSecondary,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                // Web parity: the order rows carry NO status pill. The stage
                // is already stated three times over — by the journey rail,
                // by the hint line under it, and by the CTA — so an amber
                // chip beside the title was pure repetition. A cancelled
                // order still says so: _OrderCardProgress renders its own
                // rose row in place of the rail.
              ],
            ),
            if (order.rental != null) ..._rentalBlock(context, order.rental!),
            const SizedBox(height: 10),
            Text(
                'Total: ${Order.formatAmount(order.totalAmount, order.currency)}',
                style: const TextStyle(
                    fontWeight: FontWeight.w800, color: AppColors.price)),
            // A paid rental names the other side with a phone above; before
            // that, just the name.
            if (order.rental == null || !_paid) ...[
            const SizedBox(height: 4),
            Text(
                order.orderType == 'selling'
                    ? (order.buyerName ?? '')
                    : (order.sellerName ?? ''),
                style: TextStyle(
                    color: AppPalette.of(context).textSecondary, fontSize: 13)),
            ],
            if (order.rental == null &&
                order.deliveryWindowLabel != null &&
                !_windowLineHidden) ...[
              const SizedBox(height: 6),
              Text('$_windowLineLabel: ${order.deliveryWindowLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppPalette.of(context).textSecondary)),
            ],
            const SizedBox(height: 12),
            if (order.rental != null)
              OrderStatusTimeline(
                status: order.status ?? '',
                rental: order.rental,
                perspective: order.isSelling ? 'seller' : 'buyer',
              )
            else
              _OrderCardProgress(order: order),
            if (hint != null) ...[
              // A rental's stage pill already says where it stands; the
              // delivery-worded hint ("Ready for pickup…") would contradict
              // it, so a rental keeps only a real next-step button.
              if (order.rental == null) ...[
              const SizedBox(height: 8),
              Row(children: [
                Icon(
                    hint.tone == HintTone.warning
                        ? Icons.error_outline
                        : hint.tone == HintTone.success
                            ? Icons.check_circle_outline
                            : Icons.info_outline,
                    size: 14,
                    color: _hintColor(context, hint.tone)),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(hint.label,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: _hintColor(context, hint.tone))),
                ),
              ]),
              ],
              // Web parity (dashboard :3384 `{actionHint?.cta && …}`): the
              // button exists only when the hint carries a CTA, and its copy
              // IS that CTA. Keying it off the tone instead put a button on
              // pure wait states, and rewriting the copy locally invented a
              // third vocabulary ("Arrange dispatch") that web never uses.
              // A dispatched order's next step IS its code, so the card
              // shows it right where the button would be.
              if (!order.isSelling &&
                  order.normalizedStatus == 'IN_TRANSIT' &&
                  (order.deliveryCode ?? '').isNotEmpty) ...[
                const SizedBox(height: 10),
                DeliveryCodeCta(
                    orderId: order.orderId, code: order.deliveryCode!),
              ] else if (hint.cta != null) ...[
                const SizedBox(height: 10),
                OrderActionButton(
                  label: hint.cta!,
                  disabled: hint.disabled,
                  onPressed: () => _openActionSheet(context),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

/// The order card's next-step button, to the web dashboard's spec
/// (`h-10 min-w-[150px] flex-1 rounded-xl px-5 text-xs font-bold`): 40px tall,
/// 12px radius, 12px bold label, brand-primary fill — NOT the app's default
/// 50px stadium FilledButton, which read as a different control entirely.
/// A blocked action stays on screen but greys out behind a lock, exactly as
/// web does, so "not yet" never reads as "broken".
class OrderActionButton extends StatelessWidget {
  const OrderActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.disabled = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    // The web disabled triple, resolved for the active theme.
    final palette = AppPalette.of(context);
    final disabledBorder = palette.border;
    final disabledFill = palette.surfaceMuted;
    final disabledText = palette.textSecondary;
    return SizedBox(
      width: double.infinity,
      height: 40,
      child: FilledButton(
        onPressed: disabled ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brandBlue,
          foregroundColor: Colors.white,
          disabledBackgroundColor: disabledFill,
          disabledForegroundColor: disabledText,
          elevation: 0,
          minimumSize: const Size(150, 40),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          side: disabled
              ? BorderSide(color: disabledBorder)
              : BorderSide.none,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle:
              const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (disabled) ...[
              const Icon(Icons.lock_outline_rounded, size: 16),
              const SizedBox(width: 8),
            ],
            Flexible(
              child: Text(label,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      ),
    );
  }
}

/// A buying card's delivery code, in the place the next-step button takes on
/// other cards: the code itself, big enough to read out to a driver, and a
/// copy button. The same 40px height as [OrderActionButton].
class DeliveryCodeCta extends StatelessWidget {
  const DeliveryCodeCta({super.key, required this.orderId, required this.code});
  final String orderId;
  final String code;

  Future<void> _copy(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    await Clipboard.setData(ClipboardData(text: code));
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(
          content: Text('Delivery code copied'),
          duration: Duration(seconds: 2)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Semantics(
      label: 'Delivery code $code',
      child: Container(
        key: ValueKey('order-card-delivery-code-$orderId'),
        height: 44,
        padding: const EdgeInsets.only(left: 14),
        decoration: BoxDecoration(
          color: palette.infoFill,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: palette.infoBorder),
        ),
        child: Row(children: [
          Icon(Icons.pin_outlined, size: 18, color: palette.accentInk),
          const SizedBox(width: 8),
          // The label gives way on a narrow card; the code never does.
          Expanded(
            child: Text('Delivery code',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: palette.accentInk)),
          ),
          Text(code,
              style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 4,
                  color: palette.accentInk)),
          IconButton(
            key: ValueKey('order-card-delivery-code-copy-$orderId'),
            tooltip: 'Copy delivery code',
            visualDensity: VisualDensity.compact,
            onPressed: () => _copy(context),
            icon: Icon(Icons.copy_rounded, size: 18, color: palette.accentInk),
          ),
        ]),
      ),
    );
  }
}

/// Web parity: "ORDER ID" / "DATE" caps label + value, inline on the card's
/// metadata row.
class _CardMeta extends StatelessWidget {
  const _CardMeta(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(children: [
        TextSpan(
            text: '${label.toUpperCase()}  ',
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
                color: AppPalette.of(context).textSecondary)),
        TextSpan(
            text: value,
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppPalette.of(context).textSecondary)),
      ]),
    );
  }
}

/// The per-card level of the pending-work cascade.
///
/// Every other level — the bell, the MySpace tab, the Selling/Buying tab, the
/// Orders/Payments sub-tab — is a sum over the same store. This is the leaf:
/// how many steps *this* order is still waiting on the viewer for. Because it
/// reads the store rather than a read/unread flag, finishing the step takes
/// the badge off this card and decrements every level above it in the same
/// frame. Nothing to tap, nothing to dismiss.
class _CardActionBadge extends StatelessWidget {
  const _CardActionBadge({required this.orderId, required this.child});

  final String orderId;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: PendingActionsStore.instance,
      builder: (context, _) {
        final count = PendingActionsStore.instance.countForOrder(orderId);
        return Stack(
          clipBehavior: Clip.none,
          children: [
            child,
            if (count > 0)
              Positioned(
                right: -4,
                top: -4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  constraints:
                      const BoxConstraints(minWidth: 16, minHeight: 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEA580C),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.white, width: 1.5),
                  ),
                  child: Text(
                    count > 9 ? '9+' : '$count',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        height: 1.4),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// The list card's copy of the order journey — the same rail the order's own
/// page shows under "Order tracking", minus the per-step explanations.
class _OrderCardProgress extends StatelessWidget {
  const _OrderCardProgress({required this.order});
  final Order order;

  @override
  Widget build(BuildContext context) => OrderJourneyRail(order: order);
}

/// The order's progress rail, shared by the list card and the "Order
/// tracking" section inside the order.
///
/// Both surfaces render the SAME journey. Inside the order it gains the
/// desktop's one-line explanation under each step ([detailed]); it does not
/// gain extra steps. The six-step lifecycle timeline
/// ([OrderStatusTimeline]) is a different, lower block on the detail page —
/// the same split the desktop makes.
class OrderJourneyRail extends StatelessWidget {
  const OrderJourneyRail({super.key, required this.order, this.detailed = false});

  final Order order;
  final bool detailed;

  static const _cancelledStatuses = {'CANCELLED', 'FAILED', 'EXPIRED'};

  @override
  Widget build(BuildContext context) {
    if (_cancelledStatuses.contains(order.normalizedStatus)) {
      return Row(children: [
        const Icon(Icons.cancel_outlined, size: 16, color: Color(0xFFDC2626)),
        const SizedBox(width: 6),
        Text(orderStatusLabel(order.status),
            style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: Color(0xFFDC2626))),
      ]);
    }

    final pickup =
        (order.fulfillmentType ?? '').toUpperCase() != 'SELLER_DELIVERY';
    final journey = buildOrderJourney(
      status: order.normalizedStatus,
      selling: order.isSelling,
      pickup: pickup,
      detailed: detailed,
      transporterName: order.transporterName,
      productionAwaitingCompletion:
          !canAssignTransporterAfterProduction(order.production),
      deliveryWindowLabel: order.deliveryWindowLabel,
    );

    // Web `getBuyerOrderTransport`: only the icon changes for a pickup order.
    final transportIcon =
        pickup ? Icons.storefront_outlined : Icons.two_wheeler_outlined;
    IconData? iconFor(OrderJourneyStage stage) => switch (stage) {
          OrderJourneyStage.payment => Icons.credit_card_outlined,
          OrderJourneyStage.confirm => Icons.check_circle_outline,
          // Web gives "Preparing order" no icon on the buyer's rail — it
          // renders a plain dot there.
          OrderJourneyStage.preparing =>
            order.isSelling ? Icons.inventory_2_outlined : null,
          OrderJourneyStage.handover => transportIcon,
          OrderJourneyStage.arrived => Icons.home_outlined,
        };

    return DeliveryJourney(
      steps: [
        for (final step in journey.steps)
          DeliveryJourneyStep(
              label: step.label,
              detail: step.detail,
              icon: iconFor(step.stage)),
      ],
      currentIndex: journey.index,
      semanticLabel: 'Order progress: ${journey.current.label}, step '
          '${journey.index + 1} of ${journey.steps.length}',
    );
  }
}

/// Status chip with the web's per-status colour families (`ORDER_STATUS_COLORS`).
/// Web parity: the dashboard order history offers three groups, with ongoing
/// and overdue merged into one ("Ongoing & overdue").
enum _OrderHistoryFilter { ongoing, completed, cancelled }

extension _OrderHistoryFilterCopy on _OrderHistoryFilter {
  String get label => switch (this) {
        _OrderHistoryFilter.ongoing => 'Ongoing & overdue',
        _OrderHistoryFilter.completed => 'Completed',
        _OrderHistoryFilter.cancelled => 'Cancelled',
      };

  String heading({required bool selling}) => switch (this) {
        _OrderHistoryFilter.ongoing =>
          selling ? 'Active Sales' : 'Active Orders',
        _OrderHistoryFilter.completed =>
          selling ? 'Completed Sales' : 'Past Purchases',
        _OrderHistoryFilter.cancelled =>
          selling ? 'Cancelled Sales' : 'Cancelled Orders',
      };

  String subtitle({required bool selling}) => switch (this) {
        _OrderHistoryFilter.ongoing => selling
            ? 'Confirm, prepare and hand over sales that are still in progress.'
            : 'Track orders that still need attention or are moving through delivery.',
        _OrderHistoryFilter.completed => selling
            ? 'Sales completed by the buyer and kept for your records.'
            : 'Orders you received and completed.',
        _OrderHistoryFilter.cancelled => selling
            ? 'Cancelled sales kept for your records.'
            : 'Cancelled orders kept for your records.',
      };
}

/// Web parity: a three-column track on a white, slate-bordered card. The
/// selected tab fills with brand blue and its count chip turns translucent
/// white; the others stay quiet slate on the card itself.
class _OrderHistoryFilterStrip extends StatelessWidget {
  const _OrderHistoryFilterStrip({
    required this.selected,
    required this.counts,
    required this.onSelected,
  });

  final _OrderHistoryFilter selected;
  final Map<_OrderHistoryFilter, int> counts;
  final ValueChanged<_OrderHistoryFilter> onSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Row(
        children: [
          for (var i = 0; i < _OrderHistoryFilter.values.length; i++) ...[
            if (i > 0) const SizedBox(width: 4),
            Expanded(child: _tab(context, _OrderHistoryFilter.values[i])),
          ],
        ],
      ),
    );
  }

  Widget _tab(BuildContext context, _OrderHistoryFilter filter) {
    final active = filter == selected;
    final count = counts[filter] ?? 0;
    return Material(
      color: active ? AppColors.brandBlue : Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => onSelected(filter),
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: Text(filter.label,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 10,
                      height: 1.6,
                      fontWeight: FontWeight.w600,
                      color: active
                          ? Colors.white
                          : AppPalette.of(context).textSecondary,
                    )),
              ),
              const SizedBox(width: 6),
              Container(
                constraints: const BoxConstraints(minWidth: 20),
                height: 20,
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 6),
                decoration: BoxDecoration(
                  color: active
                      ? Colors.white.withValues(alpha: .2)
                      : AppPalette.of(context).surfaceMuted,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('$count',
                    style: TextStyle(
                      fontSize: 10,
                      height: 1,
                      fontWeight: FontWeight.w700,
                      color: active
                          ? Colors.white
                          : AppPalette.of(context).textSecondary,
                    )),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  const _StatusChip(this.label);
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: _StatusPalette.bgFor(label),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(label,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: _StatusPalette.fgFor(label))),
    );
  }
}

/// Web parity colour families for a normalized status badge; unknown statuses
/// fall back to neutral slate so nothing renders unreadable.
class _StatusPalette {
  _StatusPalette._();

  static String normalize(String label) => normalizeOrderStatus(
      label.replaceAll(' ', '_').toUpperCase() == 'COMPLETED'
          ? 'COMPLETED'
          : label);

  static Color bgFor(String label) {
    final n = normalize(label);
    if (n == 'CANCELLED' || n == 'FAILED') {
      return const Color(0xFFFEE2E2); // red-100
    }
    if (n == 'EXPIRED') {
      return const Color(0xFFFFEDD5); // orange-100
    }
    if (n == 'COMPLETED') {
      return const Color(0xFFDCFCE7); // green-100
    }
    if (n == 'IN_TRANSIT' || n == 'PAID') {
      return const Color(0xFFDBEAFE); // blue-100
    }
    if (n == 'PENDING') {
      return const Color(0xFFFEF9C3); // yellow-100
    }
    return const Color(0xFFFEF3C7); // amber-100 (awaiting family + fallback)
  }

  static Color fgFor(String label) {
    final n = normalize(label);
    if (n == 'CANCELLED' || n == 'FAILED') {
      return const Color(0xFFB91C1C); // red-800
    }
    if (n == 'EXPIRED') {
      return const Color(0xFF9A3412); // orange-800
    }
    if (n == 'COMPLETED') {
      return const Color(0xFF166534); // green-800
    }
    if (n == 'IN_TRANSIT' || n == 'PAID') {
      return const Color(0xFF1E40AF); // blue-800
    }
    if (n == 'PENDING') {
      return const Color(0xFF854D0E); // yellow-800
    }
    return const Color(0xFF92400E); // amber-800
  }
}

/// A deliberately small action surface for an order card. It contains only
/// the control required at the current lifecycle stage; order information
/// remains behind the separate card/detail tap.
class _OrderQuickActionsSheet extends StatefulWidget {
  const _OrderQuickActionsSheet(
      {required this.order, required this.token, required this.api});
  final Order order;
  final String token;
  final ApiClient api;
  @override
  State<_OrderQuickActionsSheet> createState() =>
      _OrderQuickActionsSheetState();
}

class _OrderQuickActionsSheetState extends State<_OrderQuickActionsSheet> {
  bool _busy = false;
  String? _error;
  int _rating = 5;
  final _comment = TextEditingController();
  final _deliveryCode = TextEditingController();

  @override
  void dispose() {
    _comment.dispose();
    _deliveryCode.dispose();
    super.dispose();
  }

  Future<void> _assignTransporter() async {
    final assigned = await showDialog<bool>(
      context: context,
      builder: (_) => AssignTransporterModal(
        token: widget.token,
        orderId: widget.order.orderId,
        api: widget.api,
        windowDate: primaryWindowKey(widget.order.deliveryWindowFields)?.date,
        windowSlot: primaryWindowKey(widget.order.deliveryWindowFields)?.slot,
      ),
    );
    if (assigned == true && mounted) Navigator.pop(context, true);
  }

  Future<void> _requestAnotherTime() async {
    var date = DateTime.now().add(const Duration(days: 1));
    var time = const TimeOfDay(hour: 10, minute: 0);
    final note = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Request another time'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.calendar_today_outlined),
              title: Text('${date.day}/${date.month}/${date.year}'),
              subtitle: const Text('Delivery date'),
              onTap: () async {
                final next = await showDatePicker(
                  context: context,
                  initialDate: date,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (next != null) setLocal(() => date = next);
              },
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.schedule_outlined),
              title: Text(time.format(context)),
              subtitle: const Text('Delivery time'),
              onTap: () async {
                final next =
                    await showTimePicker(context: context, initialTime: time);
                if (next != null) setLocal(() => time = next);
              },
            ),
            TextField(
              controller: note,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Note (optional)',
                prefixIcon: Icon(Icons.notes_rounded),
                border: OutlineInputBorder(),
              ),
            ),
          ]),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel')),
            FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Send request')),
          ],
        ),
      ),
    );
    if (accepted != true) {
      note.dispose();
      return;
    }
    final eatWall =
        DateTime.utc(date.year, date.month, date.day, time.hour, time.minute);
    final body = <String, dynamic>{
      'proposedDeliveryTime': TimeUtils.eatToUtc(eatWall).toIso8601String(),
      if (note.text.trim().isNotEmpty) 'note': note.text.trim(),
    };
    note.dispose();
    await _run('delivery-time/propose', body: body);
  }

  Future<void> _run(String action, {Map<String, dynamic>? body}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api
          .orderAction(widget.token, widget.order.orderId, action, body: body);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = friendlyApiError(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    final status = o.normalizedStatus;
    Widget action;
    if (o.isSelling && status == 'AWAITING_SELLER_CONFIRMATION') {
      action = _SellerAvailabilityGateCard(
        order: o,
        sellerReceives: computeSellerPricingTotals(o.items).sellerReceives,
        onConfirm: () => _run('confirm-availability'),
        onDecline: () => _run('decline-availability'),
      );
    } else if (o.isSelling &&
        const {'PAID', 'AWAITING_DELIVERY'}.contains(status) &&
        o.fulfillmentType == 'SELLER_DELIVERY') {
      action = SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          onPressed: _busy ? null : _assignTransporter,
          icon: const Icon(Icons.local_shipping_outlined),
          label: const Text('Choose transporter'),
        ),
      );
    } else if (o.isSelling &&
        const {'READY_FOR_DISPATCH', 'AWAITING_DISPATCH'}.contains(status)) {
      action = FilledButton.icon(
        onPressed:
            _busy || o.canDispatch != true ? null : () => _run('dispatch'),
        icon: const Icon(Icons.local_shipping_outlined),
        label: Text(o.canDispatch == true
            ? 'Dispatch items'
            : 'Dispatch is not available yet'),
      );
    } else if (o.isSelling && status == 'AWAITING_PICKUP' && o.rental == null) {
      action = FilledButton.icon(
          onPressed: _busy ? null : () => _run('mark-picked-up'),
          icon: const Icon(Icons.shopping_bag_outlined),
          label: const Text('Mark picked up'));
    } else if (o.isSelling &&
        const {'IN_TRANSIT', 'AWAITING_PICKUP'}.contains(status) &&
        o.fulfillmentType != 'SELLER_DELIVERY') {
      action = FilledButton.icon(
          onPressed: _busy ? null : () => _run('mark-delivered'),
          icon: const Icon(Icons.check_circle_outline),
          label: const Text('Mark delivered'));
    } else if (o.isSelling && status == 'IN_TRANSIT') {
      action = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Enter the buyer’s 6-digit delivery code.',
            style: TextStyle(color: AppPalette.of(context).textSecondary)),
        const SizedBox(height: 10),
        TextField(
          controller: _deliveryCode,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(
            labelText: 'Delivery code',
            prefixIcon: Icon(Icons.password_rounded),
            border: OutlineInputBorder(),
          ),
          onChanged: (_) => setState(() {}),
        ),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _busy || _deliveryCode.text.trim().length != 6
                ? null
                : () => _run('verify-delivery',
                    body: {'code': _deliveryCode.text.trim()}),
            icon: const Icon(Icons.verified_outlined),
            label: const Text('Verify and complete delivery'),
          ),
        ),
      ]);
    } else if (!o.isSelling && status == 'AWAITING_BUYER_CONFIRMATION') {
      action = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (o.proposedDeliveryTime != null)
          Text('Proposed: ${o.proposedDeliveryTime}',
              style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _busy ? null : () => _run('delivery-time/confirm'),
            icon: const Icon(Icons.check_circle_outline),
            label: const Text('Confirm delivery time'),
          ),
        ),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _busy ? null : _requestAnotherTime,
            icon: const Icon(Icons.edit_calendar_outlined),
            label: const Text('Request another time'),
          ),
        ),
      ]);
    } else if (!o.isSelling && status == 'IN_TRANSIT') {
      action = Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: AppPalette.of(context).infoFill,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppPalette.of(context).infoBorder),
        ),
        child: Column(children: [
          Text('YOUR DELIVERY CODE',
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.1,
                  color: AppPalette.of(context).accentInk)),
          const SizedBox(height: 8),
          Text(
              o.deliveryCode?.isNotEmpty == true
                  ? o.deliveryCode!
                  : 'Not available yet',
              style: const TextStyle(
                  fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 4)),
          const SizedBox(height: 6),
          Text('Only share this code after you receive your items.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
        ]),
      );
    } else if (!o.isSelling &&
        const {'PICKED_UP', 'DELIVERED'}.contains(status)) {
      action = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('How was your order?',
            style: TextStyle(fontWeight: FontWeight.w700)),
        Row(children: [
          for (var i = 1; i <= 5; i++)
            IconButton(
                onPressed: () => setState(() => _rating = i),
                icon: Icon(
                    i <= _rating
                        ? Icons.star_rounded
                        : Icons.star_outline_rounded,
                    color: const Color(0xFFF59E0B)))
        ]),
        TextField(
            controller: _comment,
            maxLines: 3,
            decoration: InputDecoration(
                labelText: _rating <= 2
                    ? 'Tell us what went wrong *'
                    : 'Comment (optional)',
                border: const OutlineInputBorder())),
        const SizedBox(height: 12),
        SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
                onPressed:
                    _busy || (_rating <= 2 && _comment.text.trim().isEmpty)
                        ? null
                        : () => _run('confirm-receipt', body: {
                              'rating': _rating,
                              'comment': _comment.text.trim()
                            }),
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Confirm received'))),
      ]);
    } else if (!o.isSelling &&
        const {'PENDING', 'AWAITING_PAYMENT'}.contains(status)) {
      action = FilledButton.icon(
          onPressed: () {
            Navigator.pop(context);
            context.push(
                '/checkout?proforma=${Uri.encodeQueryComponent(o.proformaId ?? '')}');
          },
          icon: const Icon(Icons.payment_outlined),
          label: const Text('Complete payment'));
    } else {
      action = Text('There is no action required from you at this stage.',
          style: TextStyle(color: AppPalette.of(context).textSecondary));
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
            getOrderActionHint(
                  o.normalizedStatus,
                  o.isSelling ? 'seller' : 'buyer',
                  fulfillmentType: o.fulfillmentType,
                  canDispatch: o.canDispatch,
                  dispatchBlockedReason: o.dispatchBlockedReason,
                )?.cta ??
                'Order actions',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(o.orderNumber,
            style: TextStyle(color: AppPalette.of(context).textSecondary)),
        const SizedBox(height: 18),
        IgnorePointer(ignoring: _busy, child: action),
        if (_busy)
          const Padding(
              padding: EdgeInsets.only(top: 16),
              child: LinearProgressIndicator()),
        if (_error != null)
          Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, style: const TextStyle(color: Colors.red))),
      ]),
    );
  }
}

/// Order detail — GET /api/v1/orders/{id}. When `admin` is true, shows real
/// escrow/refund lifecycle actions (mark paid, confirm delivery, release payment,
/// refund) wired to the sandbox admin endpoints; each action re-fetches and shows
/// the resulting state (never faked).
class OrderDetailScreen extends StatefulWidget {
  final String orderId;
  final String token;
  final ApiClient api;
  final Order? order;
  final bool admin;
  final bool embedded;

  /// Test seam: the http transport the buyer-payment cross-reference fetch
  /// uses (web orders/[id] calls getMyPayments and merges with
  /// findPaymentForOrder). Null in production ⇒ PaymentsApi builds its own
  /// real client, exactly like the My Payments route does.
  final http.Client? paymentsHttpClient;
  const OrderDetailScreen(
      {super.key,
      required this.orderId,
      required this.token,
      required this.api,
      this.order,
      this.admin = false,
      this.embedded = false,
      this.paymentsHttpClient});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  OrderActionHint? _hint(Order o) => getOrderActionHint(
        o.normalizedStatus,
        o.isSelling ? 'seller' : 'buyer',
        fulfillmentType: o.fulfillmentType,
        canDispatch: o.canDispatch,
        dispatchBlockedReason: o.dispatchBlockedReason,
      );

  Color _hintBg(HintTone tone) => switch (tone) {
        HintTone.action => AppPalette.of(context).infoFill,
        HintTone.warning => AppPalette.of(context).dangerFill,
        HintTone.success => AppPalette.of(context).successFill,
        HintTone.info => AppPalette.of(context).background,
      };

  Color _hintBorder(HintTone tone) => switch (tone) {
        HintTone.action => const Color(0xFF93C5FD),
        HintTone.warning => const Color(0xFFFCA5A5),
        HintTone.success => const Color(0xFF86EFAC),
        HintTone.info => AppPalette.of(context).border,
      };

  /// Null unless the order's own window data proves dispatch is still locked
  /// or has just opened — the backend stays authoritative either way.
  String? _dispatchUnlock(Order o) => o.deliveryWindowFields.isEmpty
      ? null
      : dispatchUnlockLabel(o.deliveryWindowFields);

  late Future<Order> _future = widget.order != null
      ? Future.value(widget.order)
      : widget.api.fetchOrderDetail(widget.token, widget.orderId);
  String? _actionMsg;

  // FINANC-04 (D-4/D-5): buyer-payment cross-reference. PaymentsApi's own
  // endpoints live in my_payments_screen.dart (never on the shared ApiClient).
  late final PaymentsApi _paymentsApi =
      PaymentsApi(client: widget.paymentsHttpClient);

  /// Matched GET /payments/my row for THIS order (web relatedPayment), or null
  /// while the fetch runs / fails / finds nothing. Banners also fall back to
  /// the payment context embedded in the order detail (web embeddedPayment).
  Map<String, dynamic>? _relatedPaymentRaw;
  bool _paymentsStarted = false;

  @override
  void initState() {
    super.initState();
    // Payment context enhances the page but must never block the order render.
    // Kick off once the order resolves; swallow failures (web: "must not block
    // the order").
    _future.then((o) => _kickoffPaymentRecovery(o), onError: (Object _) {});
  }

  Future<void> _kickoffPaymentRecovery(Order o) async {
    if (_paymentsStarted || widget.admin || o.isSelling) return;
    // The recovery UI is only relevant while the buyer's order still waits on
    // payment; skip the cross-reference for settled orders entirely (web's
    // order page fetches more broadly — we fetch just what this page can show).
    if (!const ['PENDING', 'AWAITING_PAYMENT'].contains(o.normalizedStatus)) {
      return;
    }
    _paymentsStarted = true;
    if (widget.token.isEmpty) return;
    try {
      final rows = await _paymentsApi.fetchMyPayments(widget.token);
      if (!mounted) return;
      final matched = findPaymentForOrder(
          [for (final p in rows) p.raw], o.orderId, o.proformaId);
      if (!mounted) return;
      setState(() => _relatedPaymentRaw = matched);
    } catch (_) {
      // Cross-reference is best-effort; the embedded payment context still
      // renders when the order detail carries it.
      if (mounted) setState(() {});
    }
  }

  // In admin mode re-fetch via the admin endpoint (the buyer endpoint 403s on
  // orders the admin does not own), so the post-action escrow/refund state shows.
  // Block body: the setState callback must not RETURN the Future, or Flutter's
  // debug assert ("setState() callback argument returned a Future") fires.
  void _reload() {
    setState(() {
      _future = widget.admin
          ? widget.api.adminFetchOrder(widget.token, widget.orderId)
          : widget.api.fetchOrderDetail(widget.token, widget.orderId);
    });
  }

  Future<void> _adminAction(String action, String label) async {
    setState(() => _actionMsg = null);
    try {
      await widget.api.adminOrderAction(widget.token, widget.orderId, action);
      if (!mounted) return;
      _reload();
      setState(() => _actionMsg = '$label done (state re-fetched).');
    } on ApiException catch (e) {
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      setState(() => _actionMsg = '$label failed: ${e.message}');
    }
  }

  /// AU-037: buyer/seller lifecycle action via the USER orders controller
  /// (never the admin console) — confirm-receipt {rating,comment}, seller-rate,
  /// seller-cancel. The dialog collects rating/reason; backend errors surface
  /// verbatim (ALREADY_RATED, wrong-state 409s — never faked as success).
  Future<void> _lifecycleAction(String action, String label,
      {Map<String, dynamic>? body}) async {
    setState(() => _actionMsg = null);
    try {
      await widget.api
          .orderAction(widget.token, widget.orderId, action, body: body);
      if (!mounted) return;
      _reload();
      setState(() => _actionMsg = '$label done.');
    } on ApiException catch (e) {
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      setState(() => _actionMsg = '$label failed: ${e.message}');
    }
  }

  /// ORDERS-seller-14: the seller card reported a successful handoff-code
  /// verification. The confirmation lives on the detail state so it survives
  /// the re-fetch that moves the rental to PICKED_UP.
  void _rentalHandoffVerified(String msg) {
    setState(() => _actionMsg = msg);
    _reload();
  }

  bool _regenerating = false;

  /// AU-035: rotate the rental handoff code; backend returns the new code.
  Future<void> _regenerateRentalCode() async {
    if (_regenerating) return;
    setState(() => _regenerating = true);
    try {
      await widget.api.orderAction(
          widget.token, widget.orderId, 'regenerate-rental-handoff-code');
      if (!mounted) return;
      setState(() => _regenerating = false);
      _reload();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _regenerating = false;
        _actionMsg = 'Could not generate a new code: ${e.message}';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _regenerating = false);
    }
  }

  /// Logistics-v2: buyer accepts the proposed delivery time. The order moves
  /// to IN_TRANSIT and the backend notifies the seller/transporter (web
  /// delivery-time-confirmation handleConfirm → confirmDeliveryTime).
  Future<void> _confirmDeliveryTime() async {
    setState(() => _actionMsg = null);
    try {
      await widget.api
          .orderAction(widget.token, widget.orderId, 'delivery-time/confirm');
      if (!mounted) return;
      _reload();
      setState(() => _actionMsg =
          'Delivery time confirmed - the seller and transporter have been notified.');
    } on ApiException catch (e) {
      if (!mounted) return;
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      setState(() => _actionMsg = 'Confirmation failed: ${e.message}');
    }
  }

  /// Logistics-v2: buyer counter-proposes a delivery time (web
  /// delivery-time-confirmation handleCounterPropose → proposeDeliveryTime with
  /// {proposedDeliveryTime, note}). The trip returns to PROPOSED for the other
  /// party to re-confirm.
  Future<void> _proposeDeliveryTime() async {
    DateTime? date;
    TimeOfDay? time;
    String? timeError;
    final note = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) {
          Future<void> pickDate() async {
            final now = DateTime.now();
            final picked = await showDatePicker(
              context: ctx,
              initialDate: date ?? now.add(const Duration(days: 1)),
              firstDate: now.subtract(const Duration(days: 1)),
              lastDate: now.add(const Duration(days: 365)),
            );
            if (picked != null) setLocal(() => date = picked);
          }

          Future<void> pickTime() async {
            final picked = await showTimePicker(
              context: ctx,
              initialTime: time ?? const TimeOfDay(hour: 10, minute: 0),
            );
            if (picked != null) setLocal(() => time = picked);
          }

          return AlertDialog(
            title: const Text('Request Another Delivery Time'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                      'Tell the seller when you can receive the delivery. They will re-confirm with the transporter.'),
                  const SizedBox(height: 14),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.calendar_today_outlined),
                    title: Text(date == null
                        ? 'Preferred date *'
                        : _monthDayYear(date!)),
                    subtitle: Text(timeError ?? 'Choose a date'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      setLocal(() => timeError = null);
                      pickDate();
                    },
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.access_time),
                    title: Text(
                        time == null ? 'Preferred time *' : time!.format(ctx)),
                    subtitle: Text(timeError ?? 'Choose a time'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      setLocal(() => timeError = null);
                      pickTime();
                    },
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: note,
                    maxLines: 2,
                    decoration: const InputDecoration(
                        labelText: 'Note (optional)',
                        hintText: "e.g. I'm only home after 5pm",
                        border: OutlineInputBorder()),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancel')),
              FilledButton(
                onPressed: () {
                  if (date == null || time == null) {
                    setLocal(() => timeError =
                        'Pick the date and time that works for you.');
                    return;
                  }
                  Navigator.pop(ctx, true);
                },
                child: const Text('Send Request'),
              ),
            ],
          );
        },
      ),
    );
    if (ok != true) return;
    if (!mounted) return;
    // Picked as EAT wall-clock (the app's display zone) → UTC ISO for the API.
    final eatWall = DateTime.utc(
        date!.year, date!.month, date!.day, time!.hour, time!.minute);
    final iso = TimeUtils.eatToUtc(eatWall).toIso8601String();
    setState(() => _actionMsg = null);
    try {
      await widget.api.orderAction(
          widget.token, widget.orderId, 'delivery-time/propose',
          body: {
            'proposedDeliveryTime': iso,
            if (note.text.trim().isNotEmpty) 'note': note.text.trim(),
          });
      if (!mounted) return;
      _reload();
      setState(() =>
          _actionMsg = 'New time requested - the seller has been notified.');
    } on ApiException catch (e) {
      if (!mounted) return;
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      setState(() => _actionMsg = 'Request failed: ${e.message}');
    }
  }

  /// Logistics-v2: seller dispatches the assigned order during its delivery
  /// window → IN_TRANSIT (web dashboard DISPATCH_ORDER → dispatchOrder).
  /// A 409 maps through the dispatch-failure contract so the seller reads why
  /// (e.g. "too early", "production not complete") instead of a raw enum.
  Future<void> _dispatchOrder() async {
    setState(() => _actionMsg = null);
    try {
      await widget.api.orderAction(widget.token, widget.orderId, 'dispatch');
      if (!mounted) return;
      _reload();
      setState(
          () => _actionMsg = 'Order dispatched - it is now out for delivery.');
    } on ApiException catch (e) {
      if (!mounted) return;
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      final mapped = getDispatchFailureMessage(e.message, e.message);
      setState(() => _actionMsg = 'Dispatch failed: $mapped');
    }
  }

  /// `23 Aug 2026` for a picked wall-clock date (row preview only).
  String _monthDayYear(DateTime d) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }

  /// Rating dialog for Confirm Receipt / Rate Seller (reference modal:
  /// star rating + optional review; default rating 5 like the web).
  ///
  /// Web parity `order-action-modal.tsx`: for a 1–2 star rating the review
  /// becomes REQUIRED — the label flips to 'Review *' and Submit is blocked
  /// with 'Please provide a review for ratings below 3 stars.' until the
  /// reviewer writes something.
  Future<void> _ratingDialog(String action, String title) async {
    int rating = 5;
    final review = TextEditingController();
    String? reviewError;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) {
          final lowRating = rating <= 2;
          return AlertDialog(
            title: Text(title),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 1; i <= 5; i++)
                      IconButton(
                        icon: Icon(i <= rating ? Icons.star : Icons.star_border,
                            color: Colors.amber),
                        onPressed: () => setLocal(() => rating = i),
                      ),
                  ],
                ),
                TextField(
                  controller: review,
                  maxLines: 3,
                  onChanged: (_) {
                    if (reviewError != null) setLocal(() => reviewError = null);
                  },
                  decoration: InputDecoration(
                      labelText: lowRating ? 'Review *' : 'Review (optional)',
                      errorText: reviewError,
                      border: const OutlineInputBorder()),
                ),
              ],
            ),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancel')),
              FilledButton(
                onPressed: () {
                  if (lowRating && review.text.trim().isEmpty) {
                    setLocal(() => reviewError =
                        'Please provide a review for ratings below 3 stars.');
                    return;
                  }
                  Navigator.pop(ctx, true);
                },
                child: const Text('Submit'),
              ),
            ],
          );
        },
      ),
    );
    if (ok != true) return;
    if (!mounted) return;
    // Reference runOrderAction: CONFIRM_RECEIPT sends {rating, comment};
    // rating endpoints use {rating, reviewText} (API_MAP probe).
    final body = action == 'confirm-receipt'
        ? {'rating': rating, 'comment': review.text.trim()}
        : {'rating': rating, 'reviewText': review.text.trim()};
    await _lifecycleAction(action, title, body: body);
  }

  /// D-3 / escrow-release parity: confirming receipt releases the buyer's
  /// escrowed money to the seller, so web gates it behind the dashboard
  /// AlertDialog 'Confirm you received your items' before the rating modal
  /// (app/expat/dashboard/page.tsx confirmDeliveryOrder). Mobile now shows the
  /// same irreversible-action warning before the confirm-receipt PATCH. The
  /// rating dialog only opens once the buyer explicitly confirms.
  Future<void> _confirmReceiptFlow(String title) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm you received your items'),
        content: const Text(
            'This confirms your order has arrived and releases payment to the '
            'seller. Only confirm once you actually have your items in hand.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF059669)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Yes, I received them'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!mounted) return;
    await _ratingDialog('confirm-receipt', title);
  }

  /// AU-038: decline-availability reason dialog — cancels the order,
  /// releases stock, buyer money → REFUND_PENDING (reference gate copy).
  /// Reference requires a non-empty reason before submit (verifier MAJOR:
  /// empty reason was silently replaced with 'Item unavailable').
  Future<void> _declineAvailabilityDialog({bool stay = false}) async {
    final reason = TextEditingController();
    String? error;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(stay ? 'Decline this booking?' : 'Item unavailable?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(stay
                  ? 'This cancels the booking and the guest is refunded in '
                      'full. This cannot be undone.'
                  : 'This cancels the order and the buyer is refunded in full. '
                      'This cannot be undone.'),
              const SizedBox(height: 10),
              TextField(
                controller: reason,
                maxLines: 2,
                onChanged: (_) {
                  if (error != null) {
                    setDialogState(() => error = null);
                  }
                },
                decoration: InputDecoration(
                    labelText:
                        stay ? 'Reason for the guest *' : 'Reason for the buyer *',
                    hintText: stay
                        ? 'e.g. The property is unavailable for these dates'
                        : 'e.g. The item was sold offline',
                    errorText: error,
                    border: const OutlineInputBorder()),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Keep order')),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: inkFill(ctx),
                  foregroundColor: Colors.white),
              onPressed: () {
                // AU-038 parity: a reason is REQUIRED — block submit when
                // blank instead of silently substituting one.
                if (reason.text.trim().isEmpty) {
                  setDialogState(() => error = 'Please enter a reason');
                  return;
                }
                Navigator.pop(ctx, true);
              },
              child: const Text('Cancel & refund buyer'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    if (!mounted) return;
    await _lifecycleAction('decline-availability', 'Availability declined',
        body: {'reason': reason.text.trim()});
  }

  /// Cancel-with-reason dialog (seller-side cancel per the API map; buyers
  /// cancel at proforma level or via availability-decision).
  ///
  /// A reason is required: the backend cancel flow needs it (web parity — the
  /// Cancel button is blocked until a reason is typed rather than silently
  /// substituting a canned value).
  Future<void> _cancelDialog() async {
    final reason = TextEditingController();
    String? error;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Cancel order'),
          content: TextField(
            controller: reason,
            maxLines: 2,
            onChanged: (_) {
              if (error != null) setLocal(() => error = null);
            },
            decoration: InputDecoration(
              labelText: 'Reason *',
              errorText: error,
              border: const OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Keep order')),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: inkFill(ctx),
                  foregroundColor: Colors.white),
              onPressed: () {
                if (reason.text.trim().isEmpty) {
                  setLocal(() => error =
                      'Please provide a reason for cancelling this order.');
                  return;
                }
                Navigator.pop(ctx, true);
              },
              child: const Text('Cancel order'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    if (!mounted) return;
    await _lifecycleAction('seller-cancel', 'Order cancelled',
        body: {'reason': reason.text.trim()});
  }

  /// True when this detail screen shows a buyer-actionable non-rental order
  /// (reference isBuyerActionable: PICKED_UP | DELIVERED while buying).
  bool _buyerActionable(Order o) =>
      o.rental == null &&
      !o.isSelling &&
      ['PICKED_UP', 'DELIVERED'].contains(o.normalizedStatus);

  /// Seller fulfill actions (AU-038): AWAITING_SELLER_CONFIRMATION banner +
  /// mark picked-up/delivered once confirmed.
  bool _sellerFulfillable(Order o) =>
      o.isSelling &&
      ['PAID', 'PROCESSING', 'AWAITING_PICKUP'].contains(o.normalizedStatus);

  /// ORDS-26 web parity: the "Mark production complete" button is hidden once
  /// the order has left the pre-dispatch states (web orders/[id]/page.tsx
  /// `canComplete = orderType === 'selling' && !['PENDING','AWAITING_PAYMENT',
  /// 'AWAITING_SELLER_CONFIRMATION','IN_TRANSIT','PICKED_UP','DELIVERED',
  /// 'COMPLETED','CANCELLED','FAILED','EXPIRED'].includes(status)`). An unknown
  /// status stays permissive so a rendering gap never hides a real control.
  static const _noProductionCompleteStatuses = {
    'PENDING',
    'AWAITING_PAYMENT',
    'AWAITING_SELLER_CONFIRMATION',
    'IN_TRANSIT',
    'PICKED_UP',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
    'FAILED',
    'EXPIRED',
  };

  bool _canCompleteProduction(Order o) =>
      o.isSelling &&
      !_noProductionCompleteStatuses.contains(o.normalizedStatus);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.embedded
          ? null
          : AppBar(
              title: const Text('Order'),
              leading: BackButton(
                onPressed: () => NavigationBoundary.back(
                  context,
                  fallbackLocation: '/orders',
                ),
              ),
            ),
      body: FutureBuilder<Order>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const SkeletonPage();
          }
          if (snap.hasError) {
            return Center(
                child: Text(
                    'Could not load order: ${friendlyApiError(snap.error)}'));
          }
          final o = snap.data!;
          final perspective = o.isSelling ? 'seller' : 'buyer';
          // Logistics-v2 flags shared by the action blocks below.
          final selling = o.isSelling;
          // FINANC-08 / D-1: seller money-transparency totals (stored per-item
          // sellerPayout preferred, reverse-commission fallback otherwise).
          final sellerPricingTotals = computeSellerPricingTotals(o.items);
          // FINANC-04 / D-4/D-5: buyer payment-recovery context. The matched
          // GET /payments/my row wins when found; the order-detail embedded
          // payment is the fallback (web relatedPayment || embeddedPayment).
          final paymentSummary = _relatedPaymentRaw ??
              <String, dynamic>{
                'proformaId': o.proformaId,
                'status': o.paymentStatus,
                'receipts': o.paymentReceipts,
                if (o.paymentMethodType != null)
                  'paymentMethodType': o.paymentMethodType,
                if (o.paymentDeadline != null) 'expiresAt': o.paymentDeadline,
              };
          final payProformaId = (paymentSummary['proformaId'] ?? '').toString();
          final payStatus = paymentSummary['status']?.toString();
          final payReceipts = paymentReceiptsOf(paymentSummary);
          final payRecovery = buyerPaymentRecoveryState(
              status: payStatus, receipts: payReceipts);
          final payReasons =
              paymentRejectionReasons(status: payStatus, receipts: payReceipts);
          final payMethodType = (paymentSummary['paymentMethodType'] ??
                  paymentSummary['paymentMethod'])
              ?.toString();
          final payExpiresAt =
              paymentSummary['expiresAt'] ?? paymentSummary['expires_at'];
          // Web shows the recovery banners only while the buyer's order is
          // still waiting on payment (PENDING / AWAITING_PAYMENT).
          final buyerAwaitingPayment = !selling &&
              const ['PENDING', 'AWAITING_PAYMENT']
                  .contains(o.normalizedStatus);
          final paymentNeedsNewProof =
              buyerAwaitingPayment && payRecovery == 'rejected';
          final paymentUnderReview =
              buyerAwaitingPayment && payRecovery == 'under_review';
          final replacementProofUnderReview =
              paymentUnderReview && payReasons.isNotEmpty;
          final payNowResumable = buyerAwaitingPayment &&
              payProformaId.isNotEmpty &&
              payRecovery == 'pending_payment';
          final dispatchLocked = selling && o.canDispatch == false;
          final dispatchTimingLock =
              dispatchLocked && isDispatchTimingReason(o.dispatchBlockedReason);
          final showDispatch = selling &&
              ['READY_FOR_DISPATCH', 'AWAITING_DISPATCH']
                  .contains(o.normalizedStatus) &&
              (!dispatchLocked || dispatchTimingLock);
          // Buyer sees the delivery-time banner only while the proposed time
          // is waiting on them (web gates on trip.deliveryTimeStatus PROPOSED;
          // AWAITING_BUYER_CONFIRMATION is the order status that exposes it).
          final showDeliveryTimeBanner =
              !selling && o.normalizedStatus == 'AWAITING_BUYER_CONFIRMATION';
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              // Web parity `orders/[id]` redesign: a compact metadata summary
              // (order number / placed / delivery window / item count /
              // status) replaces the old bare title + status chip.
              _OrderMetaSummary(order: o, perspective: perspective),
              // Same rule as the list card: the CTA is the hint's own copy,
              // and no CTA means no button.
              if (_hint(o)?.cta != null) ...[
                const SizedBox(height: 14),
                OrderActionButton(
                  label: _hint(o)!.cta!,
                  disabled: _hint(o)!.disabled,
                  onPressed: () async {
                    final changed = await showModalBottomSheet<bool>(
                      context: context,
                      useSafeArea: true,
                      isScrollControlled: true,
                      showDragHandle: true,
                      builder: (_) => FractionallySizedBox(
                        heightFactor: .72,
                        child: _OrderQuickActionsSheet(
                            order: o, token: widget.token, api: widget.api),
                      ),
                    );
                    if (changed == true) _reload();
                  },
                ),
              ],
              const SizedBox(height: 20),
              // Web parity: "Order tracking" heading + Order ID, with the
              // rail in its own separately bordered card.
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Order tracking',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  Text('Order ID: #${o.orderNumber}',
                      style: TextStyle(
                          fontSize: 12, color: AppPalette.of(context).textSecondary)),
                ],
              ),
              const SizedBox(height: 10),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 18),
                decoration: BoxDecoration(
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppPalette.of(context).border),
                ),
                // The desktop's "Order tracking" section is this rail — the
                // same one the order's list card shows, so an order does not
                // appear to be on two different journeys depending on where
                // it is looked at. The web also carries a six-step lifecycle
                // timeline lower down the page; mobile deliberately does
                // not — one journey per order was the point of the change,
                // and a second, differently-counted rail underneath undid
                // it on the small screen.
                child: OrderJourneyRail(order: o, detailed: true),
              ),
              const SizedBox(height: 12),
              // Web parity: the assigned-transporter card sits directly below
              // the tracking panel, before the retained order information.
              // Buyer-facing only — mobile has no vehicle/plate data, just the
              // name and a reachable phone number. Suppressed while the
              // delivery-time banner shows: that banner already names the
              // transporter, so the card would just repeat it right above.
              if (!selling &&
                  o.transporterName != null &&
                  !showDeliveryTimeBanner) ...[
                _TransporterCard(
                    name: o.transporterName!, phone: o.transporterPhone),
                const SizedBox(height: 12),
              ],
              // Logistics-v2: the buyer must confirm (or counter) the proposed
              // delivery time before the order dispatches (web
              // DeliveryTimeConfirmation banner — wording kept verbatim).
              if (showDeliveryTimeBanner) ...[
                _DeliveryTimeBanner(
                  order: o,
                  onConfirm: _confirmDeliveryTime,
                  onCounter: _proposeDeliveryTime,
                ),
                const SizedBox(height: 12),
              ],
              // Made-to-order preparation. Renders nothing for an ordinary
              // item; only the seller can confirm the work is finished, and
              // until they do, dispatch stays blocked
              // (canAssignTransporterAfterProduction).
              ProductionTimeCard(
                source: o.production,
                canComplete: _canCompleteProduction(o),
                onComplete: () => _lifecycleAction(
                    'production-complete', 'Production complete'),
              ),
              // FINANC-04 / D-4/D-5: buyer payment-recovery panel (web
              // orders/[id] banners + PaymentCountdown) — rejected-proof
              // amber banner + 'Upload new proof', blue under-review banner,
              // or the 'Pay now' card for an unpaid proforma. Display-only.
              if (!selling &&
                  (paymentNeedsNewProof ||
                      paymentUnderReview ||
                      payNowResumable)) ...[
                _BuyerPaymentRecoveryPanel(
                  paymentNeedsNewProof: paymentNeedsNewProof,
                  paymentUnderReview: paymentUnderReview,
                  replacementProofUnderReview: replacementProofUnderReview,
                  reason: payReasons.isNotEmpty ? payReasons.first : null,
                  payNowResumable: payNowResumable,
                  proformaId: payProformaId,
                  proformaStatus: payStatus,
                  expiresAt: payExpiresAt,
                  onUploadNewProof: _openPaymentsRejected,
                  onPayNow: _payNow,
                ),
                const SizedBox(height: 12),
              ],
              // AU-035: real line items with image, qty × unit price, selected
              // choices and rental booking — the detail showed nothing bought.
              if (o.items.isNotEmpty) ...[
                Text(
                    o.rental?.isShortStay == true ? 'Your stay' : 'Items Ordered',
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                for (final item in o.items)
                  _ItemTile(item: item, currency: o.currency),
                const Divider(),
              ],
              // Web parity: a distinct Discount/Delivery card and a distinct
              // Subtotal/Total card directly below the item rows, rather than
              // one flat list of price rows (mobile stacks them - the web
              // reference itself is single-column below its `md` breakpoint).
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppPalette.of(context).border),
                ),
                child: Column(children: [
                  _row('Discount', Order.formatAmount(0, o.currency)),
                  const SizedBox(height: 8),
                  // ORDERS-18: web shows 'Arranged after checkout' (amber) when
                  // a cross-region delivery fee is settled after checkout
                  // instead of a bare 'TSh 0'; the row otherwise shows the fee.
                  if (o.hasDeliveryFee)
                    _row('Delivery',
                        Order.formatAmount(o.deliveryFee, o.currency))
                  else
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                            child: Text('Delivery',
                                style:
                                    TextStyle(color: AppPalette.of(context).textSecondary))),
                        Flexible(
                          child: Text('Arranged after checkout',
                              textAlign: TextAlign.right,
                              style: TextStyle(
                                  color: AppPalette.of(context).warningText,
                                  fontStyle: FontStyle.italic,
                                  fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ),
                ]),
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppPalette.of(context).border),
                ),
                child: Column(children: [
                  _row('Subtotal', Order.formatAmount(o.subtotal, o.currency)),
                  const SizedBox(height: 8),
                  _row('Total', Order.formatAmount(o.totalAmount, o.currency),
                      bold: true),
                ]),
              ),
              const SizedBox(height: 18),
              // The other side of the order: the buyer for a seller, the
              // seller for a buyer ("Guest" / "Host" on a stay).
              if ((selling ? o.buyerName : o.sellerName) != null)
                _row(
                    selling
                        ? (o.rental?.isShortStay == true ? 'Guest' : 'Buyer')
                        : (o.rental?.isShortStay == true ? 'Host' : 'Seller'),
                    (selling ? o.buyerName : o.sellerName) ?? '',
                    bold: true),
              // Web 2026-10: a rental shows its stay — dates, stage, the
              // other side's phone once paid, where it is — never a
              // delivery journey.
              if (o.rental != null) ...[
                const SizedBox(height: 8),
                Text(
                    o.rental!.isShortStay
                        ? 'Stay details'
                        : 'Rental details',
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                RentalStayDates(
                    rental: o.rental!,
                    perspective: selling ? 'seller' : 'buyer'),
                const SizedBox(height: 8),
                RentalStageChip(rental: o.rental!, status: o.status),
                if ((o.paymentStatus ?? '').toUpperCase() == 'PAID') ...[
                  const SizedBox(height: 10),
                  selling
                      ? RentalCounterparty(
                          label: o.rental!.isShortStay ? 'Guest' : 'Renter',
                          name: o.buyerName,
                          phone: o.buyerPhone)
                      : RentalCounterparty(
                          label: o.rental!.isShortStay ? 'Host' : 'Provider',
                          name: o.sellerName,
                          phone: o.sellerPhone),
                ] else if (selling && o.rental!.isShortStay) ...[
                  const SizedBox(height: 6),
                  Text('Guest contact is not available yet.',
                      style: TextStyle(
                          fontSize: 12.5,
                          color: AppPalette.of(context).textSecondary)),
                ],
                if (!selling && o.rentalLocation != null) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: RentalLocationLink(
                        rental: o.rental!, mapUrl: o.rentalLocation!.mapUrl),
                  ),
                ],
              ],
              if (o.rental == null && o.deliveryAddress != null)
                _row('Delivery address', o.deliveryAddress ?? ''),
              if (o.rental == null && o.deliveryCity != null)
                _row('City', o.deliveryCity ?? ''),
              if (o.rental == null && o.deliveryMethod != null)
                _row('Delivery', o.deliveryMethod ?? ''),
              // ORDERS-09/12: web detail "Delivery details" also names the
              // fulfillment type and the buyer's selected window — neither was
              // surfaced anywhere on mobile (only the dispatch-unlock banner
              // consumed the raw window fields).
              if (o.rental == null && o.fulfillmentType != null)
                _row(
                    'Fulfillment type',
                    o.fulfillmentType == 'SELLER_DELIVERY'
                        ? 'Seller delivery'
                        : o.fulfillmentType == 'BUYER_PICKUP'
                            ? 'Buyer pickup'
                            : o.fulfillmentType!.replaceAll('_', ' ')),
              if (o.rental == null && o.deliveryWindowLabel != null)
                _row('Delivery window', o.deliveryWindowLabel!),
              const SizedBox(height: 12),
              const Text('Payment:',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              // AU-036: escrow banner + badge from the §8 state table (replaces
              // the raw status text).
              Builder(builder: (context) {
                final v = Escrow.view(
                  orderStatus: o.status,
                  escrowPending: o.escrowPending,
                  paymentStatus: o.paymentStatus,
                  payoutStatus: o
                      .payoutStatus, // AU-036: detail payload carries HELD/RELEASED
                  refundStatus: o.refundStatus,
                  refundAmount: o.refundAmount,
                );
                if (v.banner.isEmpty) {
                  return Text(o.paymentStatus ?? 'Not paid',
                      style: const TextStyle(
                          color: Colors.orange, fontWeight: FontWeight.w600));
                }
                final toneColor = switch (v.tone) {
                  'success' => AppColors.accentGreen,
                  'warning' => Colors.deepOrange,
                  'info' => AppColors.brandBlue,
                  _ => AppPalette.of(context).textSecondary,
                };
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: toneColor.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(children: [
                        Icon(Icons.verified_user_outlined,
                            size: 18, color: toneColor),
                        const SizedBox(width: 8),
                        Expanded(
                            child: Text(v.banner,
                                style: TextStyle(
                                    color: toneColor,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13))),
                      ]),
                    ),
                    const SizedBox(height: 4),
                    Text(o.paymentStatus ?? '',
                        style: TextStyle(
                            color: AppPalette.of(context).textSecondary, fontSize: 12)),
                  ],
                );
              }),
              // FINANC-04 / D-4: web order-summary 'Payment method' +
              // 'Payment status' rows — the status is overridden with the
              // recovery copy when a proof was rejected or a corrected proof
              // is being reviewed. Buyer view only, when there is data.
              if (!selling &&
                  (payMethodType != null ||
                      paymentNeedsNewProof ||
                      replacementProofUnderReview)) ...[
                const SizedBox(height: 10),
                if (payMethodType != null)
                  _row('Payment method', formatOrderEnumLabel(payMethodType)),
                if (paymentNeedsNewProof)
                  _row('Payment status', 'Rejected - new proof required')
                else if (replacementProofUnderReview)
                  _row('Payment status', 'Submitted - under review'),
              ],
              // FINANC-08 / D-1: seller money-transparency box — how the
              // buyer's payment splits between the seller's proceeds and
              // GloboExpats' commission (web orders/[id] 'Seller gets' /
              // 'GloboExpats gets', rendered only for the seller view and only
              // when there is money to show).
              if (selling && !sellerPricingTotals.isZero) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppPalette.of(context).successFill, // emerald-50
                    border: Border.all(color: AppPalette.of(context).successBorder),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    children: [
                      Row(children: [
                        Expanded(
                            child: Text(
                                o.rental?.isShortStay == true
                                    ? 'Host receives'
                                    : 'Seller gets',
                                style: TextStyle(
                                    color: AppPalette.of(context).successTextStrong,
                                    fontWeight: FontWeight.w500))),
                        Text(
                          Order.formatAmount(
                              sellerPricingTotals.sellerReceives, o.currency),
                          style: TextStyle(
                              color: AppPalette.of(context).successText,
                              fontWeight: FontWeight.w800),
                        ),
                      ]),
                      Divider(color: AppPalette.of(context).successBorder, height: 18),
                      Row(children: [
                        Expanded(
                            child: Text('GloboExpats gets',
                                style: TextStyle(
                                    color: AppPalette.of(context).successTextStrong,
                                    fontWeight: FontWeight.w500))),
                        Text(
                          Order.formatAmount(
                              sellerPricingTotals.globoExpatsCut, o.currency),
                          style: const TextStyle(
                              color: Color(0xFFE11D48),
                              fontWeight: FontWeight.w800),
                        ),
                      ]),
                    ],
                  ),
                ),
              ],
              // AU-035: buyer-only handover codes, exposed by the backend at
              // exactly the lifecycle stage that needs them (never faked).
              if (o.normalizedStatus == 'IN_TRANSIT' &&
                  !o.isSelling &&
                  o.deliveryCode != null) ...[
                const SizedBox(height: 10),
                _DeliveryCodeCard(code: o.deliveryCode!),
              ],
              if (o.rental != null &&
                  o.normalizedStatus == 'AWAITING_PICKUP' &&
                  !o.isSelling) ...[
                const SizedBox(height: 10),
                // ORDERS-16: kind-specific web wording ('Arrival code' for a
                // property, 'Pickup code' for a vehicle rental) replaces the
                // generic 'Rental handoff code'; a still-unissued code shows
                // the web 'Generating your code…' placeholder.
                // Web 2026-10 RentalHandoffCodeCard (buyer): the check-in /
                // pickup code with copy, "I've arrived" for a property, and
                // a new code only after three failed checks (or when none
                // was issued yet).
                RentalCodeCard(
                  rental: o.rental!,
                  code: o.rentalHandoffCode,
                  attemptsUsed: o.rentalHandoffCodeAttempts,
                  onGenerate: _regenerating ? null : _regenerateRentalCode,
                ),
              ],
              // ORDERS-seller-14: the SELLER verifies the renter's six-digit
              // code at handover — the rental countdown starts only after this
              // succeeds (web RentalHandoffCodeCard perspective 'seller').
              if (o.isSelling &&
                  o.rental != null &&
                  o.normalizedStatus == 'AWAITING_PICKUP') ...[
                const SizedBox(height: 10),
                _SellerRentalVerifyCard(
                  key: const ValueKey('seller-rental-verify'),
                  api: widget.api,
                  token: widget.token,
                  orderId: o.orderId,
                  isVehicle: o.rental!.isVehicle,
                  onVerified: _rentalHandoffVerified,
                ),
              ],
              if (o.buyerRated != null || o.sellerRated != null) ...[
                const SizedBox(height: 8),
                Text(
                    'Ratings: buyer ${o.buyerRated == true ? 'done' : 'pending'} · seller ${o.sellerRated == true ? 'done' : 'pending'}',
                    style: TextStyle(
                        color: AppPalette.of(context).textSecondary, fontSize: 13)),
              ],
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: o.orderId.isNotEmpty && o.orderId != 'o-0'
                    ? () => Navigator.of(context).push(MaterialPageRoute(
                        settings: RouteSettings(
                            name: '/orders/${Uri.encodeComponent(o.orderId)}/tracking'),
                        builder: (_) => DeliveryTrackingScreen(
                            orderId: o.orderId,
                            orderNumber:
                                o.orderNumber.isEmpty ? null : o.orderNumber)))
                    : null,
                icon: const Icon(Icons.local_shipping_outlined),
                label: const Text('Track delivery'),
              ),
              // AU-037/038: lifecycle actions (reference /orders/[id] panel).
              if (_buyerActionable(o) ||
                  _sellerFulfillable(o) ||
                  o.normalizedStatus == 'AWAITING_SELLER_CONFIRMATION' &&
                      o.isSelling ||
                  (o.isSelling &&
                      o.normalizedStatus == 'COMPLETED' &&
                      o.sellerRated == false)) ...[
                const SizedBox(height: 14),
                const Divider(height: 30),
                const Text('Actions',
                    style:
                        TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
              ],
              // AU-038 / D-2 stock gate: while AWAITING_SELLER_CONFIRMATION
              // the buyer has paid and the money is held in escrow — the seller
              // must confirm EVERY line item exists before anything dispatches.
              // The gate (web seller-availability-gate.tsx) now shows a
              // per-item checklist with the 'Buyer paid' / emerald 'You
              // receive' amounts, order totals and a production-deadline
              // warning; Confirm stays disabled until every item is checked.
              // Declining cancels the order and puts the money into
              // REFUND_PENDING.
              if (o.isSelling &&
                  o.normalizedStatus == 'AWAITING_SELLER_CONFIRMATION') ...[
                const SizedBox(height: 8),
                _SellerAvailabilityGateCard(
                  key: ValueKey('seller-gate-${o.orderId}'),
                  order: o,
                  sellerReceives:
                      computeSellerPricingTotals(o.items).sellerReceives,
                  onConfirm: () => _lifecycleAction(
                      'confirm-availability', 'Availability confirmed'),
                  onDecline: () => _declineAvailabilityDialog(
                      stay: o.rental?.isShortStay ?? false),
                ),
                const SizedBox(height: 8),
              ],
              // Buyer on a PICKED_UP/DELIVERED order: Confirm Received →
              // escrow-release warning (D-3) → rating dialog; label flips to
              // Rate Seller once DELIVERED. Both PATCHes release the held
              // money to the seller, so both pass through the warning.
              if (_buyerActionable(o))
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF059669)),
                  onPressed: () => _confirmReceiptFlow(
                      o.normalizedStatus == 'DELIVERED'
                          ? 'Rate Seller'
                          : 'Confirm Received'),
                  icon: const Icon(Icons.check_circle_outline),
                  label: Text(o.normalizedStatus == 'DELIVERED'
                      ? 'Rate Seller'
                      : 'Confirm Received'),
                ),
              // AU-038 verifier gap: seller mark picked-up / mark delivered
              // had NO UI surface even though the endpoints work (probed 200).
              // Rentals are excluded — their pickup start is the renter's
              // handoff-code verification card above (web rental handoff).
              if (o.isSelling &&
                  o.normalizedStatus == 'AWAITING_PICKUP' &&
                  o.rental == null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: FilledButton(
                    onPressed: () => _lifecycleAction(
                        'mark-picked-up', 'Marked as picked up'),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.shopping_bag_outlined, size: 18),
                      SizedBox(width: 6),
                      Text('Mark picked up'),
                    ]),
                  ),
                ),
              if (o.isSelling &&
                  ['IN_TRANSIT', 'AWAITING_PICKUP']
                      .contains(o.normalizedStatus) &&
                  // Money-path divergence ORDERS-10 / APISUR-12: a
                  // SELLER_DELIVERY order is delivered by the transporter and
                  // closed by the BUYER's handover code — never by the seller
                  // marking it delivered.
                  o.fulfillmentType != 'SELLER_DELIVERY')
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: FilledButton(
                    onPressed: () => _lifecycleAction(
                        'mark-delivered', 'Marked as delivered'),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.local_shipping_outlined, size: 18),
                      SizedBox(width: 6),
                      Text('Mark delivered'),
                    ]),
                  ),
                ),
              // Logistics-v2 seller dispatch (web dashboard DISPATCH_ORDER →
              // POST /orders/{id}/dispatch). Shown whenever a driver is
              // assigned; when the backend reports a timing lock the button is
              // greyed with the unlock countdown rather than hidden (a
              // non-timing blocker hides it and the blocker list says why).
              if (showDispatch)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: FilledButton.icon(
                    key: const ValueKey('dispatch-order-btn'),
                    onPressed: dispatchLocked ? null : () => _dispatchOrder(),
                    icon: const Icon(Icons.local_shipping_outlined, size: 18),
                    label: const Text('Dispatch items'),
                  ),
                ),
              // AU-038: dispatch too-early blocker explainer (buyer/seller see
              // WHY dispatch is blocked; reference dispatch-errors contract).
              // Phase 3: what this person should do next. The status pill
              // says where the order is; this says whether it is waiting on
              // them (web parity: getOrderActionHint).
              if (_hint(o) != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _hintBg(_hint(o)!.tone),
                      border: Border.all(color: _hintBorder(_hint(o)!.tone)),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(_hint(o)!.label,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ),
              // Phase 3: when the only thing standing in the way is the
              // clock, say when the button unlocks. The seller used to have to
              // tap Dispatch and read the 409 to find out.
              if (o.isSelling &&
                  dispatchGuidanceApplies(o.status) &&
                  _dispatchUnlock(o) != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).warningFill,
                      border: Border.all(color: const Color(0xFFFCD34D)),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(children: [
                      const Icon(Icons.schedule, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(_dispatchUnlock(o)!,
                            style: const TextStyle(
                                fontSize: 12.5, fontWeight: FontWeight.w600)),
                      ),
                    ]),
                  ),
                ),
              if (dispatchGuidanceApplies(o.status) &&
                  o.dispatchBlockers.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).infoFill,
                      border: Border.all(color: const Color(0xFF93C5FD)),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Dispatch status',
                              style: TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 13)),
                          const SizedBox(height: 4),
                          for (final b in o.dispatchBlockers)
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text('• ${kDispatchErrorMessages[b] ?? b}',
                                  style: const TextStyle(fontSize: 12)),
                            ),
                        ]),
                  ),
                ),
              // AU-055/038 + ORDS-08: seller on PAID + SELLER_DELIVERY —
              // arrange transport (assign-transporter registry modal). A
              // made-to-order item whose production is not yet complete must
              // not be assigned a transporter (web gates the button on
              // canAssignTransporterAfterProduction and shows the helper text
              // instead).
              if (o.isSelling &&
                  ['PAID', 'AWAITING_DELIVERY'].contains(o.normalizedStatus) &&
                  o.fulfillmentType == 'SELLER_DELIVERY') ...[
                if (canAssignTransporterAfterProduction(o.production))
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: FilledButton.tonal(
                      // Tonal is the one light-filled variant, so it opts out
                      // of the theme's white label.
                      style: FilledButton.styleFrom(
                          foregroundColor:
                              Theme.of(context).colorScheme.onSecondaryContainer),
                      onPressed: () => showModalBottomSheet<void>(
                        context: context,
                        isScrollControlled: true,
                        builder: (_) => AssignTransporterModal(
                          token: widget.token,
                          orderId: o.orderId,
                          api: widget.api,
                          windowDate:
                              primaryWindowKey(o.deliveryWindowFields)?.date,
                          windowSlot:
                              primaryWindowKey(o.deliveryWindowFields)?.slot,
                        ),
                      ).then((_) => _reload()),
                      child: const Text('Arrange transport'),
                    ),
                  )
                else
                  Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Row(children: [
                      Icon(Icons.info_outline,
                          size: 16, color: AppPalette.of(context).textSecondary),
                      SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Mark production complete before assigning a '
                          'transporter.',
                          style: TextStyle(
                              fontSize: 13, color: AppPalette.of(context).textSecondary),
                        ),
                      ),
                    ]),
                  ),
              ],
              // Completed + buying + unrated: standalone Rate Seller.
              if (o.normalizedStatus == 'COMPLETED' &&
                  !o.isSelling &&
                  o.buyerRated == false)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: OutlinedButton.icon(
                    onPressed: () =>
                        _ratingDialog('seller-rate', 'Rate Seller'),
                    icon: const Icon(Icons.star_border),
                    label: const Text('Rate Seller'),
                  ),
                ),
              // Seller on a completed sale they haven't rated: Rate Buyer.
              if (o.isSelling &&
                  ['COMPLETED', 'CONFIRMED'].contains(o.normalizedStatus) &&
                  o.sellerRated == false)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: OutlinedButton.icon(
                    onPressed: () => _ratingDialog('seller-rate', 'Rate Buyer'),
                    icon: const Icon(Icons.star_border),
                    label: const Text('Rate Buyer'),
                  ),
                ),
              // Cancel while PENDING/AWAITING_PAYMENT — SELLER-only. Web
              // gates the Cancel button to `['PENDING','AWAITING_PAYMENT']`
              // inside isSellerActionable (orders/[id]/page.tsx); a seller may
              // NOT cancel once the order is PAID/being fulfilled, and buyers
              // cancel at proforma level before payment submission.
              if (o.isSelling &&
                  ['PENDING', 'AWAITING_PAYMENT'].contains(o.normalizedStatus))
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                        foregroundColor: AppPalette.of(context).textPrimary),
                    onPressed: _cancelDialog,
                    child: const Text('Cancel'),
                  ),
                ),
              if (_actionMsg != null && !widget.admin) ...[
                const SizedBox(height: 10),
                Text(_actionMsg!,
                    style: TextStyle(
                        color: _actionMsg!.contains('failed')
                            ? Colors.red
                            : Colors.black54)),
              ],
              if (widget.admin) ...[
                const Divider(height: 30),
                const Text('Admin escrow / refund actions',
                    style:
                        TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                FilledButton(
                    onPressed: () => _adminAction('mark-paid', 'Mark paid'),
                    child: const Text('Mark paid')),
                const SizedBox(height: 8),
                FilledButton(
                    onPressed: () =>
                        _adminAction('dispatch', 'Dispatch for delivery'),
                    child: const Text('Dispatch for delivery')),
                const SizedBox(height: 8),
                OutlinedButton(
                    onPressed: () =>
                        _adminAction('confirm-receipt', 'Confirm receipt'),
                    child: const Text('Confirm receipt')),
                const SizedBox(height: 8),
                FilledButton(
                    onPressed: () => _adminAction(
                        'release-payment', 'Release escrow / payout'),
                    child: const Text('Release escrow / payout')),
                const SizedBox(height: 8),
                OutlinedButton(
                    onPressed: () => _adminAction('refund', 'Refund'),
                    child: const Text('Refund')),
                if (_actionMsg != null) ...[
                  const SizedBox(height: 10),
                  Text(_actionMsg!,
                      style: const TextStyle(color: Colors.black54)),
                ],
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Expanded(
                child: Text(label,
                    style: TextStyle(color: AppPalette.of(context).textSecondary))),
            Text(value,
                style: TextStyle(
                    fontWeight: bold ? FontWeight.w800 : FontWeight.w500)),
          ],
        ),
      );

  /// D-4: 'Upload new proof' deep-links the buyer to the My Payments screen
  /// pre-opened on the Rejected tab (web
  /// `/expat/dashboard?tab=orders&sub=payments&paymentStatus=rejected`).
  void _openPaymentsRejected() {
    Navigator.of(context).push(MaterialPageRoute<void>(
      settings: const RouteSettings(name: '/account/payments?status=rejected'),
      builder: (_) => MyPaymentsScreen(
        auth: AuthStore.instance,
        paymentsHttpClient: widget.paymentsHttpClient,
        initialGroup: PaymentGroup.rejected,
      ),
    ));
  }

  /// D-5: 'Pay now' resumes the buyer's proforma payment (web
  /// `/checkout?proforma={id}`), mirroring My Payments' Continue-payment.
  void _payNow(String proformaId) {
    GoRouter.of(context).push('/checkout?proforma=$proformaId');
  }
}

/// FINANC-04 / D-4/D-5: buyer payment-recovery panel on the order detail —
/// the amber rejected-proof banner with 'Upload new proof', the blue
/// under-review banner, or the 'Pay now' card for an unpaid proforma. Port of
/// the web orders/[id] banners + PaymentCountdown. Display-only.
class _BuyerPaymentRecoveryPanel extends StatelessWidget {
  const _BuyerPaymentRecoveryPanel({
    required this.paymentNeedsNewProof,
    required this.paymentUnderReview,
    required this.replacementProofUnderReview,
    required this.reason,
    required this.payNowResumable,
    required this.proformaId,
    required this.proformaStatus,
    required this.expiresAt,
    required this.onUploadNewProof,
    required this.onPayNow,
  });

  final bool paymentNeedsNewProof;
  final bool paymentUnderReview;
  final bool replacementProofUnderReview;
  final String? reason;
  final bool payNowResumable;
  final String proformaId;
  final String? proformaStatus;
  final dynamic expiresAt;
  final VoidCallback onUploadNewProof;
  final ValueChanged<String> onPayNow;

  @override
  Widget build(BuildContext context) {
    if (paymentNeedsNewProof) {
      return _RecoveryBanner(
        backgroundColor: AppPalette.of(context).warningFill, // amber-50
        borderColor: const Color(0xFFFCD34D), // amber-300
        icon: Icons.error_outline,
        iconColor: AppPalette.of(context).warningText, // amber-700
        titleColor: AppPalette.of(context).warningTextStrong, // amber-950
        bodyColor: AppPalette.of(context).warningText, // amber-800
        title: 'Payment proof rejected - upload a corrected proof',
        body: reason ??
            'The submitted payment proof could not be approved. Review the payment and send a new receipt.',
        action: FilledButton.icon(
          style:
              FilledButton.styleFrom(backgroundColor: AppPalette.of(context).warningText),
          onPressed: onUploadNewProof,
          icon: const Icon(Icons.upload_outlined, size: 18),
          label: const Text('Upload new proof'),
        ),
      );
    }
    if (paymentUnderReview) {
      return _RecoveryBanner(
        backgroundColor: AppPalette.of(context).infoFill, // blue-50
        borderColor: AppPalette.of(context).infoBorder, // blue-200
        icon: Icons.schedule_outlined,
        iconColor: AppPalette.of(context).infoText, // blue-700
        titleColor: AppPalette.of(context).infoTextStrong, // blue-950
        bodyColor: AppPalette.of(context).accentInk, // blue-800
        title: replacementProofUnderReview
            ? 'New payment proof submitted - under review'
            : 'Payment submitted - awaiting verification',
        body: replacementProofUnderReview
            ? 'GloboExpats received your corrected proof. No further action is needed unless the review team contacts you.'
            : 'GloboExpats is confirming your payment. You will be notified as soon as it is verified.',
        action: null,
      );
    }
    // Unpaid proforma → Pay now (D-5). An invoice past its deadline gets the
    // disabled/expired treatment rather than a live Pay-now (Countdown.
    // proformaState owns the expired state, web PaymentCountdown parity).
    final cd = Countdown.proformaState(
        proformaStatus: proformaStatus,
        expiresAt: expiresAt,
        nowUtc: DateTime.now().toUtc());
    final expired = cd != null && cd.tone == CountdownTone.expired;
    final urgent = cd != null && cd.tone == CountdownTone.urgent;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: expired
            ? AppPalette.of(context).dangerFill // red-50
            : urgent
                ? AppPalette.of(context).warningFill // amber-50
                : AppPalette.of(context).infoFill, // blue-50
        border: Border.all(
            color: expired
                ? AppPalette.of(context).dangerBorder // red-200
                : urgent
                    ? const Color(0xFFFCD34D) // amber-300
                    : AppPalette.of(context).infoBorder), // blue-200
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(expired ? Icons.timer_off_outlined : Icons.timer_outlined,
                size: 18,
                color: expired
                    ? AppPalette.of(context).dangerText
                    : urgent
                        ? AppPalette.of(context).warningText
                        : AppPalette.of(context).infoText),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                cd?.title ?? 'Complete your payment',
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: expired
                        ? AppPalette.of(context).dangerTextStrong
                        : urgent
                            ? AppPalette.of(context).warningTextStrong
                            : AppPalette.of(context).infoTextStrong),
              ),
            ),
          ]),
          if (cd != null) ...[
            const SizedBox(height: 6),
            Text(cd.label,
                style: TextStyle(
                    fontSize: 13,
                    color: expired
                        ? AppPalette.of(context).dangerText
                        : urgent
                            ? AppPalette.of(context).warningText
                            : AppPalette.of(context).accentInk)),
          ],
          const SizedBox(height: 10),
          FilledButton.icon(
            style: FilledButton.styleFrom(
                backgroundColor: expired
                    ? const Color(0xFF9CA3AF)
                    : const Color(0xFF059669)),
            onPressed: expired ? null : () => onPayNow(proformaId),
            icon: const Icon(Icons.payment, size: 18),
            label: const Text('Pay now'),
          ),
        ],
      ),
    );
  }
}

/// Shared banner chrome for the amber rejected-proof and blue under-review
/// states (web orders/[id] banner markup).
class _RecoveryBanner extends StatelessWidget {
  const _RecoveryBanner({
    required this.backgroundColor,
    required this.borderColor,
    required this.icon,
    required this.iconColor,
    required this.titleColor,
    required this.bodyColor,
    required this.title,
    required this.body,
    this.action,
  });

  final Color backgroundColor;
  final Color borderColor;
  final IconData icon;
  final Color iconColor;
  final Color titleColor;
  final Color bodyColor;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: backgroundColor,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, size: 20, color: iconColor),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                          color: titleColor)),
                  const SizedBox(height: 4),
                  Text(body,
                      style: TextStyle(
                          fontSize: 13, height: 1.35, color: bodyColor)),
                ],
              ),
            ),
          ]),
          if (action != null) ...[
            const SizedBox(height: 12),
            action!,
          ],
        ],
      ),
    );
  }
}

/// Web parity `orders/[id]` "Transporter" section: name + a reachable phone
/// number, with call/WhatsApp actions. Mobile carries only what the order
/// payload embeds (no vehicle type/plate), so this stays a compact card
/// rather than the web's full avatar/vehicle/ETA grid.
class _TransporterCard extends StatelessWidget {
  const _TransporterCard({required this.name, this.phone});
  final String name;
  final String? phone;

  Future<void> _call() => launchUrl(Uri.parse('tel:$phone'));
  Future<void> _whatsApp() => launchUrl(
      Uri.parse('https://wa.me/${phone!.replaceAll(RegExp(r'[^0-9]'), '')}'),
      mode: LaunchMode.externalApplication);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Row(children: [
        CircleAvatar(
          radius: 20,
          backgroundColor: AppPalette.of(context).infoFill,
          child: Icon(Icons.local_shipping_outlined,
              color: AppPalette.of(context).accentInk, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Transporter',
                  style:
                      TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary)),
              Text(name,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 14)),
            ],
          ),
        ),
        if (phone != null && phone!.isNotEmpty) ...[
          IconButton.filledTonal(
              onPressed: _call,
              tooltip: 'Call $name',
              icon: const Icon(Icons.call_outlined, size: 18)),
          const SizedBox(width: 6),
          IconButton.filledTonal(
              style: IconButton.styleFrom(
                  backgroundColor: AppPalette.of(context).successFill,
                  foregroundColor: const Color(0xFF128C7E)),
              onPressed: _whatsApp,
              tooltip: 'WhatsApp $name',
              icon: const Icon(Icons.chat_outlined, size: 18)),
        ],
      ]),
    );
  }
}

/// Web parity: the compact order-details metadata row at the top of the
/// order-detail page (order number / placed date / delivery window / item
/// count / status), replacing the old bare title + a separate status chip.
class _OrderMetaSummary extends StatelessWidget {
  const _OrderMetaSummary({required this.order, required this.perspective});
  final Order order;
  final String perspective;

  @override
  Widget build(BuildContext context) {
    final cancelled = const {'CANCELLED', 'FAILED', 'EXPIRED'}
        .contains(order.normalizedStatus);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Wrap(
        spacing: 22,
        runSpacing: 12,
        children: [
          _MetaCell('${order.rental?.orderNoun ?? 'Order'} number',
              '#${order.orderNumber}'),
          if (order.createdAtLabel != null)
            _MetaCell('Order placed', order.createdAtLabel!),
          if (order.deliveryWindowLabel != null)
            _MetaCell('Delivery window', order.deliveryWindowLabel!),
          _MetaCell('No. of items',
              '${order.items.length} ${order.items.length == 1 ? 'item' : 'items'}'),
          _MetaCell(
            'Status',
            cancelled
                ? 'Cancelled'
                : const {'DELIVERED', 'COMPLETED'}
                        .contains(order.normalizedStatus)
                    ? 'Delivered'
                    : 'Active',
            valueWidget: _StatusChip(
                orderStatusLabel(order.status, perspective: perspective)),
          ),
        ],
      ),
    );
  }
}

class _MetaCell extends StatelessWidget {
  const _MetaCell(this.label, this.value, {this.valueWidget});
  final String label;
  final String value;
  final Widget? valueWidget;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label,
            style: TextStyle(
                fontSize: 11.5, color: AppPalette.of(context).textSecondary)),
        const SizedBox(height: 3),
        valueWidget ??
            Text(value,
                style:
                    const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
      ],
    );
  }
}

/// FINANC-07 / D-2: the seller's stock gate while an order sits at
/// AWAITING_SELLER_CONFIRMATION. Port of web `seller-availability-gate.tsx`:
/// a per-item checklist showing what the buyer paid and (emerald) what the
/// seller receives, the order totals, a production-deadline warning, and a
/// Confirm action that stays disabled until EVERY line item is checked.
class _SellerAvailabilityGateCard extends StatefulWidget {
  final Order order;
  final double sellerReceives;
  final VoidCallback onConfirm;
  final VoidCallback onDecline;
  const _SellerAvailabilityGateCard({
    super.key,
    required this.order,
    required this.sellerReceives,
    required this.onConfirm,
    required this.onDecline,
  });

  @override
  State<_SellerAvailabilityGateCard> createState() =>
      _SellerAvailabilityGateCardState();
}

class _SellerAvailabilityGateCardState
    extends State<_SellerAvailabilityGateCard> {
  final Set<String> _checked = <String>{};

  /// Order items produce stable per-line keys the same way web does
  /// (`orderItemId || productId || index`).
  List<String> get _itemKeys => [
        for (var i = 0; i < widget.order.items.length; i++)
          (widget.order.items[i].orderItemId ?? widget.order.items[i].productId)
              .toString(),
      ];

  bool get _allItemsChecked =>
      _itemKeys.isEmpty || _itemKeys.every(_checked.contains);

  int get _longestProductionTime => widget.order.items.fold<int>(
      0,
      (longest, item) => (item.productionTimeDays?.toInt() ?? 0) > longest
          ? item.productionTimeDays!.toInt()
          : longest);

  String get _currency => widget.order.currency;

  /// Web 2026-10 seller-availability-gate: a host confirms a guest's stay.
  bool get _stay => widget.order.rental?.isShortStay ?? false;

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final items = order.items;
    final longestProduction = _longestProductionTime;
    final stay = _stay;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppPalette.of(context).warningFill, // amber-50
        border: Border.all(color: const Color(0xFFFCD34D)), // amber-200
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.inventory_2_outlined,
                  size: 20, color: AppPalette.of(context).warningText),
              const SizedBox(width: 8),
              Expanded(
                child: Text.rich(TextSpan(
                  style: TextStyle(
                      color: AppPalette.of(context).warningTextStrong, fontSize: 14), // amber-950
                  children: [
                    TextSpan(
                        text: stay
                            ? "Confirm your guest's stay. Check the property is "
                                'available for these dates and ready for your '
                                'guest. The guest has paid and GloboExpats is '
                                'holding their money.'
                            : 'Confirm this item is available. Review every item '
                                'and required quantity before confirming the whole '
                                'order. The buyer has paid and GloboExpats is '
                                'holding their money.',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    if (longestProduction > 0)
                      TextSpan(
                        text:
                            ' Confirm only if you can make or prepare the order '
                            'within $longestProduction calendar '
                            '${longestProduction == 1 ? 'day' : 'days'}.',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                  ],
                )),
              ),
            ],
          ),
          if (items.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (var i = 0; i < items.length; i++)
              _AvailabilityItemRow(
                key: ValueKey('gate-item-$i'),
                item: items[i],
                checked: _checked.contains(_itemKeys[i]),
                currency: _currency,
                stay: stay,
                onChanged: (checked) => setState(() {
                  if (checked) {
                    _checked.add(_itemKeys[i]);
                  } else {
                    _checked.remove(_itemKeys[i]);
                  }
                }),
              ),
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppPalette.of(context).warningFill, // amber-100
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(children: [
                Expanded(
                    child: Text(
                        '${stay ? 'Booking paid' : 'Order paid'}: ${Order.formatAmount(order.totalAmount, _currency)}',
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w600))),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                      '${stay ? 'Host receives' : 'Seller receives'}: '
                      '${Order.formatAmount(widget.sellerReceives, _currency)}',
                      textAlign: TextAlign.right,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ]),
            ),
          ],
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF059669)),
                onPressed: _allItemsChecked ? widget.onConfirm : null,
                icon: const Icon(Icons.check_circle_outline),
                label: Text(
                    stay
                        ? 'Confirm booking'
                        : items.isEmpty
                            ? 'Confirm availability'
                            : 'Confirm all checked items',
                    style: const TextStyle(fontSize: 13)),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                    foregroundColor: AppPalette.of(context).textPrimary),
                onPressed: widget.onDecline,
                icon: const Icon(Icons.block_outlined),
                label: Text(stay ? 'Decline booking' : 'Item is unavailable',
                    style: const TextStyle(fontSize: 13)),
              ),
            ),
          ]),
        ],
      ),
    );
  }
}

/// One checkable row inside the seller availability gate — quantity required,
/// 'Buyer paid' and the emerald 'You receive' payout (web
/// seller-availability-gate.tsx:170-231).
class _AvailabilityItemRow extends StatelessWidget {
  final OrderItem item;
  final bool checked;
  final String currency;
  final ValueChanged<bool> onChanged;

  /// A guest's stay: "Guest paid", no quantity.
  final bool stay;
  const _AvailabilityItemRow({
    super.key,
    required this.item,
    required this.checked,
    required this.currency,
    required this.onChanged,
    this.stay = false,
  });

  @override
  Widget build(BuildContext context) {
    final qty = item.quantity < 1 ? 1 : item.quantity;
    final unitPrice = item.finalTotalSellingPrice?.toDouble() ?? item.price;
    final payout = (item.sellerPayout?.toDouble() ?? 0) * qty;
    final img = item.image;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        border: Border.all(color: AppPalette.of(context).warningBorder), // amber-200
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Checkbox(
            value: checked,
            onChanged: (v) => onChanged(v ?? false),
          ),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 52,
              height: 52,
              child: (img == null || img.isEmpty)
                  ? Container(color: AppPalette.of(context).border)
                  : AppImage(img, fit: BoxFit.cover),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                    item.productName.isEmpty
                        ? 'Ordered item'
                        : item.productName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text.rich(TextSpan(children: [
                  // Web: a rental line has no quantity to confirm.
                  if (!item.hasRental)
                  TextSpan(
                      text:
                          'Quantity required: ',
                      style: TextStyle(
                          fontSize: 12, color: AppPalette.of(context).textSecondary)),
                  TextSpan(
                      text: item.hasRental
                          ? '${stay ? 'Guest' : 'Buyer'} paid: '
                          : '${qty % 1 == 0 ? qty.toInt() : qty} · Buyer paid: ',
                      style: TextStyle(
                          fontSize: 12,
                          color: AppPalette.of(context).textSecondary,
                          fontWeight: FontWeight.w700)),
                  TextSpan(
                      text: Order.formatAmount(unitPrice * qty, currency),
                      style: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w700)),
                ])),
                if (payout > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                        'You receive: ${Order.formatAmount(payout, currency)}',
                        style: TextStyle(
                            fontSize: 12,
                            color: AppPalette.of(context).successText, // emerald-700
                            fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One line of "Items Ordered" — image, title, quantity (Unit for rentals),
/// selected choices and the rental booking summary, mirroring the web's
/// order-detail card.
class _ItemTile extends StatelessWidget {
  final OrderItem item;
  final String currency;
  const _ItemTile({required this.item, required this.currency});

  @override
  Widget build(BuildContext context) {
    final img = item.image;
    // AU-037 D3: the plain Row painted fine but emitted ZERO flt-semantics
    // nodes — screen readers (and the Playwright a11y tree) got nothing
    // between "Items Ordered" and "Subtotal". Wrap in Semantics with the
    // line-item summary so assistive tech sees name/qty/price.
    return Semantics(
      label: '${item.productName.isEmpty ? 'Ordered item' : item.productName}, '
          '${item.hasRental ? 'Unit' : 'Quantity'}: ${item.quantityLabel}, '
          '${Order.formatAmount(item.effectiveUnitPrice, currency)}',
      container: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 72,
                height: 72,
                child: (img == null || img.isEmpty)
                    ? Container(color: AppPalette.of(context).border)
                    : AppImage(img, fit: BoxFit.cover),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                      item.productName.isEmpty
                          ? 'Ordered item'
                          : item.productName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  // Web parity orderItemUnitLabel: rental lines are priced per
                  // Unit, everything else shows Quantity.
                  Text(
                      '${item.hasRental ? 'Unit' : 'Quantity'}: ${item.quantityLabel}',
                      style: TextStyle(
                          color: AppPalette.of(context).textSecondary, fontSize: 13)),
                  for (final choice in item.choiceLabels)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(choice,
                          style: TextStyle(
                              color: AppPalette.of(context).textSecondary, fontSize: 12)),
                    ),
                  if (item.hasRental) ...[
                    const SizedBox(height: 6),
                    _RentalBookingSummary(booking: item.rentalBooking!),
                  ],
                  const SizedBox(height: 4),
                  Text(Order.formatAmount(item.effectiveUnitPrice, currency),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, color: AppColors.price)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Rental window summary inside a line item ("Rental booking · 3 days",
/// check-in/return stamps) — compact port of the web's RentalBookingSummary.
class _RentalBookingSummary extends StatelessWidget {
  final Map<String, dynamic> booking;
  const _RentalBookingSummary({required this.booking});

  String? _field(List<String> keys) {
    for (final k in keys) {
      final v = booking[k];
      if (v != null && v.toString().isNotEmpty) return v.toString();
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final start = _field(['startDate']);
    final end = _field(['endDate']);
    final pickupTime = _field(['pickupTime']);
    final returnTime = _field(['returnTime']);
    final units = (booking['billableUnits'] as num?)?.toInt();
    final period = (_field(['ratePeriod']) ?? '').toLowerCase();
    final kind = booking['ratePeriod'] == 'HOUR'
        ? 'hours'
        : period.isEmpty
            ? 'days'
            : '${period}s';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppPalette.of(context).infoFill, // blue-50
        border: Border.all(color: AppPalette.of(context).infoBorder), // blue-100
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.calendar_month_outlined,
                size: 14, color: AppPalette.of(context).accentInk),
            const SizedBox(width: 6),
            Text('Rental booking',
                style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                    color: AppPalette.of(context).accentInk)),
          ]),
          if (start != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                  '$start${pickupTime != null ? ' at $pickupTime' : ''} to '
                  '${end ?? '?'}${returnTime != null ? ' at $returnTime' : ''}',
                  style:
                      TextStyle(fontSize: 12, color: AppPalette.of(context).accentInk)),
            ),
          if (units != null)
            Text('$units $kind',
                style: TextStyle(fontSize: 12, color: AppPalette.of(context).infoText)),
        ],
      ),
    );
  }
}

/// Six-digit handover code card (delivery OTP / rental handoff code).
class _DeliveryCodeCard extends StatelessWidget {
  /// Null while the backend has not yet generated the code.
  final String? code;

  // Rental codes moved to RentalCodeCard (web 2026-10); this card is the
  // delivery code only.
  static const title = 'Your delivery code';
  static const subtitle =
      'Give this code to the driver only when you have your items. '
      'It confirms delivery and releases payment to the seller.';
  static const copyNoun = 'delivery code';

  const _DeliveryCodeCard({required this.code});

  Future<void> _copy(BuildContext context) async {
    final text = code;
    if (text == null) return;
    final messenger = ScaffoldMessenger.of(context);
    await Clipboard.setData(ClipboardData(text: text));
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(
      content: Text('${_capitalize(copyNoun)} copied'),
      duration: const Duration(seconds: 2),
    ));
  }

  static String _capitalize(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).infoFill,
        border: Border.all(color: const Color(0xFF93C5FD)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text(title,
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: AppPalette.of(context).accentInk)),
              ),
              // ORDERS-04/16/SWEEP-23: copy-to-clipboard lives on the detail
              // card too, not only on the tracking screen (web
              // delivery-code-card.tsx / rental-handoff-code-card.tsx Copy).
              IconButton(
                tooltip: 'Copy $copyNoun',
                visualDensity: VisualDensity.compact,
                onPressed: code == null ? null : () => _copy(context),
                icon: Icon(Icons.copy_rounded,
                    size: 18, color: AppPalette.of(context).accentInk),
              ),
            ],
          ),
          if (code == null)
            Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Generating your code…',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppPalette.of(context).textSecondary)),
            )
          else
            SelectableText(code!,
                style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 6,
                    color: AppPalette.of(context).accentInk)),
          const SizedBox(height: 4),
          Text(subtitle,
              style: TextStyle(fontSize: 12, color: AppPalette.of(context).accentInk)),
        ],
      ),
    );
  }
}

/// ORDERS-seller-14: seller-side rental start. Web parity with
/// `RentalHandoffCodeCard` perspective 'seller' — the renter's six-digit code
/// is entered and verified (POST /orders/{id}/verify-rental-handoff), which is
/// what starts the rental countdown. Wrong codes consume an attempt; three
/// misses lock the card until the booker regenerates.
class _SellerRentalVerifyCard extends StatefulWidget {
  final ApiClient api;
  final String token;
  final String orderId;
  final bool isVehicle;

  /// Receives the success confirmation once the code verifies. The parent
  /// holds the message so it survives the detail re-fetch (the card itself is
  /// torn down while the FutureBuilder reloads).
  final ValueChanged<String> onVerified;
  const _SellerRentalVerifyCard({
    super.key,
    required this.api,
    required this.token,
    required this.orderId,
    required this.isVehicle,
    required this.onVerified,
  });

  @override
  State<_SellerRentalVerifyCard> createState() =>
      _SellerRentalVerifyCardState();
}

class _SellerRentalVerifyCardState extends State<_SellerRentalVerifyCard> {
  final _code = TextEditingController();
  bool _busy = false;
  bool _locked = false;
  int _remaining = 3;
  String? _msg;

  String get _title => widget.isVehicle ? 'Confirm pickup' : 'Confirm check-in';
  String get _confirmedLabel =>
      widget.isVehicle ? 'Pickup confirmed' : 'Check-in confirmed';

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify(String code) async {
    if (_busy || _locked) return;
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      await widget.api.orderAction(
          widget.token, widget.orderId, 'verify-rental-handoff',
          body: {'code': code});
      if (!mounted) return;
      _code.clear();
      setState(() {
        _busy = false;
        _remaining = 3;
        _msg = null;
      });
      widget.onVerified('$_confirmedLabel — the rental has started and its '
          'countdown is now active.');
    } on ApiException catch (e) {
      if (!mounted) return;
      final m = e.message;
      final lockedOut = m.contains('Too many incorrect attempts') ||
          m.contains('LOCKED') ||
          m.contains('429');
      // The backend answers wrong codes with attemptsRemaining in the body
      // (same contract as delivery-code verification).
      final serverRem =
          RegExp(r'attemptsRemaining[":\s]+(\d+)').firstMatch(m)?.group(1) ??
              RegExp(r'(\d+)\s*attempt').firstMatch(m)?.group(1);
      final n = lockedOut
          ? 0
          : (serverRem != null
              ? int.parse(serverRem).clamp(0, 3)
              : (_remaining - 1).clamp(0, 3));
      setState(() {
        _busy = false;
        _locked = n <= 0;
        _remaining = n;
        _msg = n <= 0
            ? 'Three attempts have been used. Ask the booker to generate a new code.'
            : serverRem != null
                ? 'That code did not match. $n of 3 attempts remaining.'
                : '$_title failed: $m';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _msg = '$_title failed. Try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: '$_title. '
          'Ask the booker for their six-digit code when they '
          '${widget.isVehicle ? 'collect the vehicle' : 'arrive'}. The countdown '
          'starts only after you verify it.',
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
            Text(_title,
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: AppPalette.of(context).accentInk)),
            const SizedBox(height: 4),
            Text(
              widget.isVehicle
                  ? 'Ask the booker for their six-digit code when they collect '
                      'the vehicle. The countdown starts only after you verify it.'
                  : 'Ask your guest for their six-digit check-in code when they arrive. '
                      'The countdown starts only after you verify it.',
              style: TextStyle(fontSize: 12, color: AppPalette.of(context).accentInk),
            ),
            const SizedBox(height: 10),
            TextField(
              key: const ValueKey('rental-handoff-code-input'),
              controller: _code,
              enabled: !_locked && !_busy,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              maxLength: 6,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: widget.isVehicle ? 'Pickup code' : 'Check-in code',
                hintText: '6-digit code',
                counterText: '',
                border: const OutlineInputBorder(),
                errorText: _locked ? 'Locked — ask for a new code' : null,
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const ValueKey('rental-handoff-verify-btn'),
              onPressed: (_locked || _busy || _code.text.length != 6)
                  ? null
                  : () => _verify(_code.text),
              icon: _busy
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.key_outlined),
              label: Text(_title),
            ),
            const SizedBox(height: 6),
            Text(
              _locked
                  ? 'Three attempts have been used. Ask the booker to generate a new code.'
                  : '$_remaining of 3 attempts remaining',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: _locked
                      ? AppPalette.of(context).dangerText
                      : AppPalette.of(context).accentInk),
            ),
            if (_msg != null && !_locked)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(_msg!,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _msg!.startsWith('Pickup confirmed') ||
                                _msg!.startsWith('Arrival confirmed')
                            ? AppPalette.of(context).successText
                            : AppPalette.of(context).dangerText)),
              ),
          ],
        ),
      ),
    );
  }
}

/// Logistics-v2 buyer banner: "Can you receive this delivery?" with confirm /
/// request-another-time actions (web `DeliveryTimeConfirmation`, copy kept
/// verbatim). Green confirm calls `onConfirm`; the outline button opens the
/// counter-proposal dialog via `onCounter`.
class _DeliveryTimeBanner extends StatelessWidget {
  final Order order;
  final VoidCallback onConfirm;
  final VoidCallback onCounter;

  const _DeliveryTimeBanner({
    required this.order,
    required this.onConfirm,
    required this.onCounter,
  });

  @override
  Widget build(BuildContext context) {
    final time = order.proposedDeliveryTime;
    final when = time == null ? null : _exactStamp(time);
    final who = order.transporterName;
    final body = when != null
        ? who != null
            ? '$who is scheduled to deliver on $when. Please confirm you will '
                'be available, or request another time.'
            : 'Your delivery is scheduled for $when. Please confirm you will '
                'be available, or request another time.'
        : who != null
            ? '$who is preparing your delivery. Please confirm you will be '
                'available to receive it, or request another time.'
            : 'A delivery time is proposed for this order. Please confirm you '
                'will be available, or request another time.';
    return Container(
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
          Row(
            children: [
              Icon(Icons.event_available, color: AppPalette.of(context).infoText, size: 18),
              SizedBox(width: 8),
              Expanded(
                child: Text('Can you receive this delivery?',
                    style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                        color: AppPalette.of(context).accentInk)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(body,
              style: TextStyle(
                  fontSize: 12.5, color: AppPalette.of(context).accentInk, height: 1.4)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF059669)),
                onPressed: onConfirm,
                icon: const Icon(Icons.check_circle_outline, size: 18),
                label: const Text('Yes, I can receive it'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                onPressed: onCounter,
                child: const Text('Request another time'),
              ),
            ),
          ]),
        ],
      ),
    );
  }
}

/// `23 Aug 2026, 14:05` EAT stamp for the detail header.
String _exactStamp(String? raw) {
  final t = TimeUtils.tryParseBackendTimestamp(raw);
  if (t == null) return raw ?? '';
  final e = TimeUtils.toEat(t);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  String two(int n) => n.toString().padLeft(2, '0');
  return '${e.day} ${months[e.month - 1]} ${e.year}, ${two(e.hour)}:${two(e.minute)}';
}
