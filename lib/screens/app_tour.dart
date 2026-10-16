import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_store.dart';
import '../storage/kv_store.dart';
import '../theme.dart';
import '../widgets/motion.dart';
import '../widgets/tour_anchor.dart';

/// One stop on the tour: the feature to light up, what to say about it, and
/// the screen it lives on.
class TourStep {
  const TourStep({
    required this.anchor,
    required this.title,
    required this.body,
    this.route,
    this.needsSignIn = false,
    this.signedOutOnly = false,
  });

  /// The [TourAnchor] id to spotlight.
  final String anchor;
  final String title;
  final String body;

  /// Where to go first, when the feature is on another screen.
  final String? route;

  /// Features only a signed-in user has (the bell, My Space's workspace).
  final bool needsSignIn;

  /// Stops shown only to a signed-out user (My Space's sign-in card).
  final bool signedOutOnly;
}

/// The step-by-step tour: it dims the app, cuts a spotlight around one
/// feature at a time, says what it is for, and walks the user to the
/// screens those features live on — My Space included.
class AppTour {
  AppTour._();

  static const steps = [
    TourStep(
      anchor: 'home-search',
      route: '/',
      title: 'Search everything',
      body: 'Find items, homes, cars and services. Tap × to clear a search.',
    ),
    TourStep(
      anchor: 'currency',
      title: 'Your currency',
      body: 'Show prices in the currency you think in. You always pay in TZS.',
    ),
    TourStep(
      anchor: 'cart',
      title: 'Your cart',
      body: 'Items from different sellers check out together, on one invoice.',
    ),
    TourStep(
      anchor: 'notifications',
      needsSignIn: true,
      title: 'Updates and to-dos',
      body: 'Order updates, and anything waiting on you, arrive here.',
    ),
    TourStep(
      anchor: 'nav-community',
      title: 'Community',
      body: 'Post what you need and let sellers come to you — or help '
          'someone else find theirs.',
    ),
    TourStep(
      anchor: 'nav-sell',
      title: 'Sell in minutes',
      body: 'Get verified once, then list with photos and the amount you '
          'want to receive. We handle payment and delivery.',
    ),
    TourStep(
      // Pointed at on the bar, not opened: My Space is locked until the
      // user signs in, so a new user's tour stays on the bottom bar.
      anchor: 'nav-myspace',
      title: 'My Space',
      body: 'Everything you are buying and selling, in one place, once '
          'you sign in.',
    ),
    TourStep(
      anchor: 'myspace-tabs',
      route: '/expat/dashboard',
      needsSignIn: true,
      title: 'Your workspace',
      body: 'Overview at a glance, Selling for listings and orders, Buying '
          'for purchases and payments — plus Saved items and your Requests.',
    ),
    TourStep(
      anchor: 'nav-account',
      title: 'Account',
      body: 'Profile, verification and security — and this tour, any time, '
          'under App guide.',
    ),
  ];

  /// My Space, section by section. The main tour can only point at My
  /// Space on the bottom bar — it is locked until sign-in — so a user meets
  /// these the first time they open it signed in.
  static const mySpaceSteps = [
    TourStep(
      anchor: 'myspace-tab-overview',
      title: 'Overview',
      body: 'Your space at a glance: what needs you next, recent orders and '
          'how your listings are doing.',
    ),
    TourStep(
      anchor: 'myspace-tab-selling',
      title: 'Selling',
      body: 'Your listings, the orders buyers place with you, the payments '
          'you receive and your riders. A number means something is '
          'waiting on you.',
    ),
    TourStep(
      anchor: 'myspace-tab-buying',
      title: 'Buying',
      body: 'Everything you have ordered — delivery codes, invoices and '
          'payments.',
    ),
    TourStep(
      anchor: 'myspace-tab-saved',
      title: 'Saved',
      body: 'Items you tapped the heart on, kept here for later.',
    ),
    TourStep(
      anchor: 'myspace-tab-requests',
      title: 'Requests',
      body: 'What you have asked the community for, and the offers sellers '
          'send you.',
    ),
  ];

  /// Off under widget tests unless a test turns it on.
  static bool? debugMySpaceEnabled;
  static bool get _mySpaceEnabled =>
      debugMySpaceEnabled ??
      !WidgetsBinding.instance.runtimeType
          .toString()
          .contains('TestWidgetsFlutterBinding');

  static String _mySpaceKey(String who) => 'myspace_tour_seen:$who';

  /// Walks a signed-in account through My Space the first time it opens it.
  /// Waits for anything already on top (the setup sheet, a dialog) to close,
  /// and gives up quietly if the user moves on.
  static Future<void> maybeStartMySpace(BuildContext context) async {
    if (!_mySpaceEnabled) return;
    final auth = AuthStore.instance;
    if (auth == null || !auth.isAuthenticated) return;
    final who = auth.email ?? auth.token ?? '';
    if (who.isEmpty || KvStore.instance.getString(_mySpaceKey(who)) == '1') {
      return;
    }
    for (var attempt = 0; attempt < 40; attempt++) {
      await Future<void>.delayed(const Duration(milliseconds: 750));
      if (!context.mounted || running) return;
      if (AuthStore.instance?.isAuthenticated != true) return;
      final onTop = ModalRoute.of(context)?.isCurrent ?? true;
      final visible = TickerMode.of(context);
      if (!onTop || !visible) continue;
      if (TourAnchor.rectOf('myspace-tab-overview') == null) continue;
      await KvStore.instance.setString(_mySpaceKey(who), '1');
      if (!context.mounted) return;
      start(Navigator.of(context, rootNavigator: true), only: mySpaceSteps);
      return;
    }
  }

  static OverlayEntry? _entry;

  static bool get running => _entry != null;

  /// Starts the tour over the app. Needs the root navigator (the router's),
  /// both for its overlay and so the tour can move between screens.
  static void start(NavigatorState navigator, {List<TourStep>? only}) {
    if (_entry != null) return;
    final signedIn = AuthStore.instance?.isAuthenticated ?? false;
    final list = (only ?? steps)
        .where((s) => signedIn ? !s.signedOutOnly : !s.needsSignIn)
        .toList(growable: false);
    if (list.isEmpty) return;
    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (context) => _TourOverlay(
        steps: list,
        onClose: () {
          entry.remove();
          _entry = null;
        },
      ),
    );
    _entry = entry;
    navigator.overlay?.insert(entry);
  }
}

class _TourOverlay extends StatefulWidget {
  const _TourOverlay({required this.steps, required this.onClose});
  final List<TourStep> steps;
  final VoidCallback onClose;

  @override
  State<_TourOverlay> createState() => _TourOverlayState();
}

class _TourOverlayState extends State<_TourOverlay>
    with TickerProviderStateMixin {
  int _index = 0;

  /// The spotlight travelling from the last feature to this one.
  late final AnimationController _move = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 520));

  /// The whole overlay fading in at the start and out at the end.
  late final AnimationController _fade = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 320));

  Rect? _from;
  Rect? _to;
  bool _finding = true;
  String? _route;

  Rect? get _spot {
    final to = _to;
    if (to == null) return null;
    final t = Curves.easeInOutCubic.transform(_move.value);
    return Rect.lerp(_from ?? to, to, t);
  }

  @override
  void initState() {
    super.initState();
    _fade.forward();
    WidgetsBinding.instance.addPostFrameCallback((_) => _show(0, forward: true));
  }

  @override
  void dispose() {
    _move.dispose();
    _fade.dispose();
    super.dispose();
  }

  void _go(String route) {
    if (_route == route) return;
    _route = route;
    GoRouter.maybeOf(context)?.go(route);
  }

  Future<void> _show(int i, {required bool forward}) async {
    if (i < 0) return;
    if (i >= widget.steps.length) return _close(done: true);
    final step = widget.steps[i];
    setState(() {
      _index = i;
      _finding = true;
    });
    if (step.route != null) _go(step.route!);

    // Wait for the feature to be on screen — a new route takes a moment to
    // build and slide in — then give it a beat to settle before measuring.
    Rect? rect;
    for (var frame = 0; frame < 120 && rect == null && mounted; frame++) {
      await WidgetsBinding.instance.endOfFrame;
      rect = TourAnchor.rectOf(step.anchor);
    }
    if (step.route != null && rect != null) {
      // ~⅓ s of frames for the page transition to finish before measuring.
      for (var frame = 0; frame < 22 && mounted; frame++) {
        await WidgetsBinding.instance.endOfFrame;
      }
      rect = TourAnchor.rectOf(step.anchor) ?? rect;
    }
    if (!mounted) return;
    if (rect == null) {
      // Not here for this user (signed out, hidden): skip it quietly.
      return _show(forward ? i + 1 : i - 1, forward: forward);
    }
    HapticFeedback.selectionClick();
    setState(() {
      _from = _spot ?? rect!.inflate(math.max(rect.width, rect.height));
      _to = rect;
      _finding = false;
    });
    _move.forward(from: 0);
  }

  Future<void> _close({bool done = false}) async {
    await _fade.reverse();
    if (!mounted) return widget.onClose();
    // Leave the user somewhere sensible: home, where the tour began.
    if (_route != null && _route != '/') {
      GoRouter.maybeOf(context)?.go('/');
    }
    widget.onClose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final step = widget.steps[_index];
    return FadeTransition(
      opacity: _fade,
      child: Material(
        type: MaterialType.transparency,
        child: AnimatedBuilder(
          animation: _move,
          builder: (context, _) {
            final spot = _spot;
            return Stack(children: [
              // The dimmed app with a hole where the feature is. Taps on
              // the dim do nothing, so the tour cannot be lost by accident.
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {},
                  child: CustomPaint(
                    painter: _SpotlightPainter(
                        spot: spot?.inflate(8), reveal: _move.value),
                  ),
                ),
              ),
              if (spot != null && !_finding)
                _placeCard(context, size, spot, step),
            ]);
          },
        ),
      ),
    );
  }

  Widget _placeCard(
      BuildContext context, Size size, Rect spot, TourStep step) {
    final width = math.min(size.width - 32, 360.0);
    final below = spot.center.dy < size.height * .55;
    final left = (spot.center.dx - width / 2).clamp(16.0, size.width - width - 16);
    final pad = MediaQuery.paddingOf(context);
    return Positioned(
      left: left,
      width: width,
      top: below ? spot.bottom + 18 : null,
      bottom: below ? null : size.height - spot.top + 18,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 280),
        switchInCurve: kEmphasizedIn,
        transitionBuilder: (child, a) => FadeTransition(
          opacity: a,
          child: SlideTransition(
            position: Tween(
                    begin: Offset(0, below ? -.06 : .06), end: Offset.zero)
                .animate(a),
            child: child,
          ),
        ),
        child: ConstrainedBox(
          key: ValueKey(_index),
          constraints: BoxConstraints(
              maxHeight: (below
                      ? size.height - spot.bottom - pad.bottom
                      : spot.top - pad.top) -
                  30),
          child: SingleChildScrollView(
            child: _TourCard(
              step: step,
              index: _index,
              count: widget.steps.length,
              onBack: _index == 0
                  ? null
                  : () => _show(_index - 1, forward: false),
              onNext: () => _show(_index + 1, forward: true),
              onSkip: () => _close(),
            ),
          ),
        ),
      ),
    );
  }
}

class _TourCard extends StatelessWidget {
  const _TourCard({
    required this.step,
    required this.index,
    required this.count,
    required this.onBack,
    required this.onNext,
    required this.onSkip,
  });

  final TourStep step;
  final int index;
  final int count;
  final VoidCallback? onBack;
  final VoidCallback onNext;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final last = index == count - 1;
    return Container(
      key: const ValueKey('app-tour-card'),
      padding: const EdgeInsets.fromLTRB(18, 14, 14, 12),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.border),
      ),
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  color: palette.infoFill,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('${index + 1} of $count',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: palette.accentInk)),
              ),
              const Spacer(),
              if (!last)
                TextButton(
                  key: const ValueKey('app-tour-skip'),
                  onPressed: onSkip,
                  style: TextButton.styleFrom(
                    foregroundColor: palette.textSecondary,
                    visualDensity: VisualDensity.compact,
                  ),
                  child: const Text('Skip tour'),
                ),
            ]),
            const SizedBox(height: 8),
            Text(step.title,
                style: const TextStyle(
                    fontFamily: 'Lexend',
                    fontSize: 18,
                    height: 1.2,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(step.body,
                style: TextStyle(
                    fontSize: 14, height: 1.45, color: palette.textSecondary)),
            const SizedBox(height: 12),
            Row(children: [
              // Progress: one short bar per stop, the passed ones filled.
              Expanded(
                child: Row(children: [
                  for (var i = 0; i < count; i++)
                    Expanded(
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        height: 4,
                        margin: const EdgeInsets.only(right: 3),
                        decoration: BoxDecoration(
                          color: i <= index
                              ? AppColors.brandAmber
                              : palette.border,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                ]),
              ),
              const SizedBox(width: 10),
              if (onBack != null)
                IconButton(
                  key: const ValueKey('app-tour-back'),
                  tooltip: 'Back',
                  onPressed: onBack,
                  icon: const Icon(Icons.arrow_back_rounded, size: 20),
                ),
              FilledButton(
                key: const ValueKey('app-tour-next'),
                onPressed: onNext,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brandBlue,
                  foregroundColor: BrandStage.ink,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: Text(last ? 'Finish' : 'Next'),
              ),
            ]),
          ]),
    );
  }
}

class _SpotlightPainter extends CustomPainter {
  _SpotlightPainter({required this.spot, required this.reveal});
  final Rect? spot;
  final double reveal;

  @override
  void paint(Canvas canvas, Size size) {
    final dim = Path()..addRect(Offset.zero & size);
    final s = spot;
    if (s != null) {
      final hole = RRect.fromRectAndRadius(
          s, Radius.circular(math.min(18, s.shortestSide / 2)));
      dim
        ..addRRect(hole)
        ..fillType = PathFillType.evenOdd;
      canvas.drawPath(dim, Paint()..color = const Color(0xB3070F2B));
      // A crisp brand-amber outline — no glow.
      canvas.drawRRect(
        hole,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = AppColors.brandAmber,
      );
    } else {
      canvas.drawPath(dim, Paint()..color = const Color(0xB3070F2B));
    }
  }

  @override
  bool shouldRepaint(_SpotlightPainter old) =>
      old.spot != spot || old.reveal != reveal;
}
