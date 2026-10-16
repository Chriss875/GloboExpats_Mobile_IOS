import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../auth/auth_store.dart';
import '../storage/kv_store.dart';
import '../theme.dart';
import '../widgets/brand_logo.dart';
import '../widgets/motion.dart';
import 'app_tour.dart';

/// The first-run guide: five slides that show a new user what the app is
/// for and how its money and delivery rules work, drawn from the web Help
/// Center (`app/help/help-content.ts`) so the two never disagree.
///
/// It is an immersive navy stage in both light and dark mode — the brand
/// chrome's own blue — with the app's high-resolution cut-out illustrations
/// floating over drifting light, parallax between the picture and the words,
/// and a Next button that grows into "Get started" on the last slide.
class WelcomeGuideScreen extends StatefulWidget {
  const WelcomeGuideScreen({super.key, this.onDone});

  /// Called once: true after "Get started" (the step-by-step tour follows),
  /// false when the guide was skipped.
  final ValueChanged<bool>? onDone;

  /// Set once the guide has been seen, so it never shows again by itself.
  static const seenKey = 'welcome_guide_seen_v1';

  static bool get seen => KvStore.instance.getString(seenKey) == 'yes';
  static Future<void> markSeen() => KvStore.instance.setString(seenKey, 'yes');

  /// Full-screen, rising in from a soft zoom.
  /// Completes with true when the user finished with "Get started".
  static Route<bool> route() => PageRouteBuilder<bool>(
        settings: const RouteSettings(name: '/welcome-guide'),
        opaque: true,
        transitionDuration: const Duration(milliseconds: 650),
        reverseTransitionDuration: const Duration(milliseconds: 380),
        pageBuilder: (context, _, __) => WelcomeGuideScreen(
          onDone: (completed) => Navigator.of(context).maybePop(completed),
        ),
        transitionsBuilder: (context, animation, _, child) {
          final a = CurvedAnimation(parent: animation, curve: kEmphasizedIn);
          return FadeTransition(
            opacity: a,
            child: ScaleTransition(
                scale: Tween(begin: 1.06, end: 1.0).animate(a), child: child),
          );
        },
      );

  @override
  State<WelcomeGuideScreen> createState() => _WelcomeGuideScreenState();
}

class _GuideSlide {
  const _GuideSlide({
    required this.eyebrow,
    required this.title,
    required this.body,
    required this.tint,
    required this.chips,
    this.image,
  });

  final String eyebrow;
  final String title;
  final String body;

  /// The light this slide casts on the stage.
  final Color tint;
  final String? image;
  final List<(IconData, String)> chips;
}

/// The brand blue, a step brighter so it reads as light on the navy stage.
const _brandBlue = Color(0xFF2563EB);

const _slides = [
  _GuideSlide(
    eyebrow: 'WELCOME',
    title: 'Buy. Sell. Connect.',
    body: "Tanzania's marketplace for expats and locals — trusted people, "
        'real listings, handled end to end.',
    tint: _brandBlue,
    image: 'assets/images/home/globoexpats-community-delivery.webp',
    chips: [
      (Icons.verified_rounded, 'Verified community'),
      (Icons.local_shipping_rounded, 'We handle delivery'),
    ],
  ),
  _GuideSlide(
    eyebrow: 'SHOP',
    title: 'Find it, choose it, check out once',
    body: 'Pick your options and pay one invoice for every seller in your '
        'cart. Your items are held for you while you pay.',
    tint: AppColors.brandAmber,
    image: 'assets/images/home/globoexpats-listing-electronics.webp',
    chips: [
      (Icons.receipt_long_rounded, 'One invoice'),
      (Icons.lock_clock_rounded, 'Reserved while you pay'),
    ],
  ),
  _GuideSlide(
    eyebrow: 'PAY SAFELY',
    title: 'Pay your way, in TZS',
    body: 'Bank transfer, Mobile Money or the Selcom App. Only ever pay to '
        'the details shown in checkout — never ones sent in a message.',
    tint: AppColors.accentGreen,
    chips: [
      (Icons.shield_rounded, 'Checked by our team'),
      (Icons.payments_rounded, 'M-Pesa, Airtel, Mixx, Halopesa'),
    ],
  ),
  _GuideSlide(
    eyebrow: 'HOMES, CARS & DELIVERY',
    title: 'Book a stay. Track every handover.',
    body: 'Rent apartments and cars by the night, day or month. Deliveries '
        'are handed over with a 6-digit code only you receive.',
    tint: _brandBlue,
    image: 'assets/images/home/globoexpats-listing-property.webp',
    chips: [
      (Icons.event_available_rounded, 'Pick your dates'),
      (Icons.pin_rounded, '6-digit handover code'),
    ],
  ),
  _GuideSlide(
    eyebrow: 'SELL & COMMUNITY',
    title: 'Sell, get paid, ask the community',
    body: 'Get verified, list in minutes and receive payouts to your bank '
        'or mobile money. Need something? Post it in Community.',
    tint: AppColors.brandAmber,
    image: 'assets/images/home/globoexpats-services-jobs.webp',
    chips: [
      (Icons.account_balance_wallet_rounded, 'Payouts to you'),
      (Icons.forum_rounded, 'Post a request'),
    ],
  ),
];

const _navy = BrandStage.navy;

class _WelcomeGuideScreenState extends State<WelcomeGuideScreen>
    with TickerProviderStateMixin {
  final PageController _pages = PageController();
  int _index = 0;
  bool _finished = false;

  /// The opening slide plays its entrance once; after the first swipe every
  /// slide is driven by the swipe position alone, so nothing blinks.
  bool _swiped = false;

  /// Endless drift for the stage: light, orbit and floating picture.
  late final AnimationController _loop =
      AnimationController(vsync: this, duration: const Duration(seconds: 14));

  /// One-shot, per slide: the chips and the words arriving.
  late final AnimationController _arrive = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 900))
    ..forward();

  bool get _last => _index == _slides.length - 1;

  bool _precached = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (loopingMotionAllowed(context)) {
      if (!_loop.isAnimating) _loop.repeat();
    } else {
      _loop.stop();
    }
    // Decode every slide's picture up front, so the next one is already
    // there when the swipe reveals it instead of popping in late.
    if (!_precached) {
      _precached = true;
      for (final slide in _slides) {
        final image = slide.image;
        if (image != null) precacheImage(AssetImage(image), context);
      }
      precacheImage(
          const AssetImage('assets/images/payments/selcom-app-icon.jpeg'),
          context);
    }
  }

  @override
  void dispose() {
    _pages.dispose();
    _loop.dispose();
    _arrive.dispose();
    super.dispose();
  }

  void _onPage(int i) {
    HapticFeedback.selectionClick();
    setState(() {
      _index = i;
      _swiped = true;
    });
  }

  void _next() {
    if (_last) {
      _finish(completed: true);
      return;
    }
    _pages.nextPage(
        duration: const Duration(milliseconds: 520), curve: kEmphasizedIn);
  }

  Future<void> _finish({bool completed = false}) async {
    if (_finished) return;
    _finished = true;
    HapticFeedback.mediumImpact();
    await WelcomeGuideScreen.markSeen();
    widget.onDone?.call(completed);
  }

  /// The page position as a double, before the controller is attached too.
  double get _page =>
      _pages.hasClients && _pages.position.haveDimensions
          ? (_pages.page ?? _index.toDouble())
          : _index.toDouble();

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        key: const ValueKey('welcome-guide'),
        backgroundColor: _navy,
        body: AnimatedBuilder(
          animation: Listenable.merge([_pages, _loop]),
          builder: (context, _) {
            final page = _page;
            return Stack(children: [
              Positioned.fill(
                child: CustomPaint(
                  painter: _AuroraPainter(page: page, t: _loop.value),
                ),
              ),
              SafeArea(
                bottom: false,
                child: Column(children: [
                  _TopBar(
                    index: _index,
                    showSkip: !_last,
                    onSkip: _finish,
                  ),
                  Expanded(
                    child: PageView.builder(
                      controller: _pages,
                      itemCount: _slides.length,
                      onPageChanged: _onPage,
                      itemBuilder: (context, i) => _SlideView(
                        slide: _slides[i],
                        index: i,
                        page: page,
                        t: _loop.value,
                        arrive: i == 0 && !_swiped ? _arrive : null,
                      ),
                    ),
                  ),
                  Padding(
                    padding: EdgeInsets.fromLTRB(28, 8, 24, 20 + bottomInset),
                    child: Row(children: [
                      _Dots(page: page, count: _slides.length),
                      const Spacer(),
                      _NextButton(last: _last, onPressed: _next),
                    ]),
                  ),
                ]),
              ),
            ]);
          },
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar(
      {required this.index, required this.showSkip, required this.onSkip});
  final int index;
  final bool showSkip;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 10, 12, 0),
      child: Row(children: [
        const GloboExpatsWordmark(fontSize: 19, globoColor: Colors.white),
        const Spacer(),
        AnimatedOpacity(
          opacity: showSkip ? 1 : 0,
          duration: const Duration(milliseconds: 250),
          child: IgnorePointer(
            ignoring: !showSkip,
            child: TextButton(
              key: const ValueKey('welcome-guide-skip'),
              onPressed: onSkip,
              style: TextButton.styleFrom(
                foregroundColor: Colors.white.withValues(alpha: .8),
                shape: const StadiumBorder(),
              ),
              child: const Text('Skip',
                  style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ),
      ]),
    );
  }
}

class _SlideView extends StatelessWidget {
  const _SlideView({
    required this.slide,
    required this.index,
    required this.page,
    required this.t,
    required this.arrive,
  });

  final _GuideSlide slide;
  final int index;
  final double page;
  final double t;

  /// The arrival timeline, only for the slide in view.
  final Animation<double>? arrive;

  @override
  Widget build(BuildContext context) {
    // -1 … 0 … 1 as the slide passes through the screen.
    final delta = (index - page).clamp(-1.0, 1.0);
    final fade = (1 - delta.abs() * 1.4).clamp(0.0, 1.0);
    final height = MediaQuery.sizeOf(context).height;
    final compact = height < 700;

    // Each slide stays inside its own page: nothing of it is left drawn
    // over the next slide while the swipe finishes.
    return ClipRect(child: LayoutBuilder(builder: (context, box) {
      return Column(children: [
        Expanded(
          child: Opacity(
            // The picture fades as its slide leaves, so it never lingers.
            opacity: (1 - delta.abs() * 1.3).clamp(0.0, 1.0),
            child: Transform.translate(
              // The picture travels a little slower than the page: depth.
              offset: Offset(delta * box.maxWidth * -.18, 0),
              child: _Stage(
                slide: slide,
                delta: delta,
                t: t,
                arrive: arrive,
              ),
            ),
          ),
        ),
        Transform.translate(
          // …and the words a little faster.
          offset: Offset(delta * 70, 0),
          child: Opacity(
            opacity: fade,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(28, 4, 28, 8),
              child: _SlideText(slide: slide, compact: compact, arrive: arrive),
            ),
          ),
        ),
      ]);
    }));
  }
}

class _SlideText extends StatelessWidget {
  const _SlideText(
      {required this.slide, required this.compact, required this.arrive});
  final _GuideSlide slide;
  final bool compact;
  final Animation<double>? arrive;

  Widget _rise(double from, double to, Widget child) {
    final a = arrive;
    if (a == null) return child;
    final c = CurvedAnimation(
        parent: a, curve: Interval(from, to, curve: kEmphasizedIn));
    return AnimatedBuilder(
      animation: c,
      builder: (context, child) => Opacity(
        opacity: c.value,
        child: Transform.translate(
            offset: Offset(0, 18 * (1 - c.value)), child: child),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        _rise(
          0,
          .5,
          Row(children: [
            Container(
              width: 18,
              height: 3,
              decoration: BoxDecoration(
                color: slide.tint,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(slide.eyebrow,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: Color.lerp(slide.tint, Colors.white, .35),
                      fontSize: 11.5,
                      letterSpacing: 1.6,
                      fontWeight: FontWeight.w800)),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        _rise(
          .1,
          .65,
          Text(slide.title,
              style: TextStyle(
                  fontFamily: 'Lexend',
                  color: BrandStage.ink,
                  fontSize: compact ? 25 : 30,
                  height: 1.12,
                  letterSpacing: -.6,
                  fontWeight: FontWeight.w700)),
        ),
        SizedBox(height: compact ? 8 : 12),
        _rise(
          .2,
          .8,
          Text(slide.body,
              style: TextStyle(
                  color: Colors.white.withValues(alpha: .74),
                  fontSize: compact ? 14 : 15.5,
                  height: 1.5)),
        ),
      ],
    );
  }
}

/// The picture area: a glowing orb, a slow orbit, the floating cut-out and
/// two glass chips that swing in from the sides.
class _Stage extends StatelessWidget {
  const _Stage({
    required this.slide,
    required this.delta,
    required this.t,
    required this.arrive,
  });

  final _GuideSlide slide;
  final double delta;
  final double t;
  final Animation<double>? arrive;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final side = math.min(box.maxWidth, box.maxHeight);
      final bob = math.sin(t * math.pi * 2 * 3) * 6;
      return Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
        // Orb and orbit.
        Positioned.fill(
          child: CustomPaint(
            painter: _OrbitPainter(tint: slide.tint, t: t, radius: side * .38),
          ),
        ),
        Transform.translate(
          offset: Offset(0, bob),
          child: Transform.rotate(
            angle: delta * .12,
            child: SizedBox(
              width: side * .86,
              height: side * .86,
              child: slide.image != null
                  ? Image.asset(
                      slide.image!,
                      fit: BoxFit.contain,
                      filterQuality: FilterQuality.high,
                    )
                  : _PaymentStack(tint: slide.tint, delta: delta, t: t),
            ),
          ),
        ),
        for (final (i, chip) in slide.chips.indexed)
          _FloatingChip(
            icon: chip.$1,
            label: chip.$2,
            tint: slide.tint,
            // Out in the corners, clear of faces and products.
            alignment: i == 0
                ? const Alignment(-.95, -.86)
                : const Alignment(.95, .8),
            fromLeft: i == 0,
            delta: delta,
            t: t + i * .37,
            arrive: arrive,
            delay: .25 + i * .15,
          ),
      ]);
    });
  }
}

class _FloatingChip extends StatelessWidget {
  const _FloatingChip({
    required this.icon,
    required this.label,
    required this.tint,
    required this.alignment,
    required this.fromLeft,
    required this.delta,
    required this.t,
    required this.arrive,
    required this.delay,
  });

  final IconData icon;
  final String label;
  final Color tint;
  final Alignment alignment;
  final bool fromLeft;
  final double delta;
  final double t;
  final Animation<double>? arrive;
  final double delay;

  @override
  Widget build(BuildContext context) {
    final chip = Container(
          padding: const EdgeInsets.fromLTRB(8, 8, 14, 8),
          decoration: BoxDecoration(
            color: const Color(0xE6101A45),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: .18)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [tint, Color.lerp(tint, Colors.white, .35)!],
                ),
                borderRadius: BorderRadius.circular(10),
                boxShadow: [
                  BoxShadow(
                      color: tint.withValues(alpha: .6), blurRadius: 12),
                ],
              ),
              child: Icon(icon, size: 17, color: BrandStage.ink),
            ),
            const SizedBox(width: 10),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 150),
              child: Text(label,
                  maxLines: 2,
                  style: const TextStyle(
                      color: BrandStage.ink,
                      fontSize: 12.5,
                      height: 1.2,
                      fontWeight: FontWeight.w700)),
            ),
          ]),
    );

    final float = math.sin(t * math.pi * 2 * 2) * 5;
    // Swipe-driven: a chip slides out to its side and fades as its slide
    // leaves, and back in as it arrives — continuous, never replayed.
    final away = delta.abs();
    return Align(
      alignment: alignment,
      child: Transform.translate(
        offset: Offset(delta * -60 + (fromLeft ? -1 : 1) * away * 40, float),
        child: arrive == null
            ? Opacity(opacity: (1 - away * 1.6).clamp(0.0, 1.0), child: chip)
            : AnimatedBuilder(
                animation: arrive!,
                builder: (context, child) {
                  final a = Interval(delay, (delay + .6).clamp(0, 1),
                          curve: Curves.easeOutBack)
                      .transform(arrive!.value);
                  return Opacity(
                    opacity: a.clamp(0.0, 1.0),
                    child: Transform.translate(
                      offset: Offset((fromLeft ? -40 : 40) * (1 - a), 0),
                      child: Transform.scale(scale: .85 + .15 * a, child: child),
                    ),
                  );
                },
                child: chip,
              ),
      ),
    );
  }
}

/// The payments slide has no photo: the three checkout methods, fanned out
/// as cards, in the order checkout lists them.
class _PaymentStack extends StatelessWidget {
  const _PaymentStack(
      {required this.tint, required this.delta, required this.t});
  final Color tint;
  final double delta;
  final double t;

  @override
  Widget build(BuildContext context) {
    // The fan opens as the slide settles in.
    final open = (1 - delta.abs()).clamp(0.0, 1.0);
    final breathe = math.sin(t * math.pi * 2 * 2) * .02;
    Widget card(int i, String title, String sub, Widget leading) {
      final angle = (i - 1) * .16 * open + breathe * (i - 1);
      final dy = (i - 1) * 64.0 * open;
      return Transform.translate(
        offset: Offset((i - 1) * 16.0 * open, dy),
        child: Transform.rotate(
          angle: angle,
          child: Container(
            width: 250,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: BrandStage.card,
              borderRadius: BorderRadius.circular(20),
              boxShadow: const [
                BoxShadow(
                    color: Color(0x66000000),
                    blurRadius: 30,
                    offset: Offset(0, 14)),
              ],
            ),
            child: Row(children: [
              leading,
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: const TextStyle(
                              color: BrandStage.cardInk,
                              fontSize: 15,
                              fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(sub,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: BrandStage.cardInkMuted, fontSize: 11.5)),
                    ]),
              ),
              Icon(Icons.check_circle_rounded,
                  color: i == 0 ? AppColors.accentGreen : const Color(0x00000000),
                  size: 20),
            ]),
          ),
        ),
      );
    }

    Widget tile(IconData icon, Color color) => Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: color.withValues(alpha: .12),
            borderRadius: BorderRadius.circular(13),
          ),
          child: Icon(icon, color: color, size: 22),
        );

    return Center(
      child: Stack(
          alignment: Alignment.center,
          clipBehavior: Clip.none,
          children: [
        card(
          2,
          'Selcom App',
          'Approve in the app',
          ClipRRect(
            borderRadius: BorderRadius.circular(13),
            child: Image.asset('assets/images/payments/selcom-app-icon.jpeg',
                width: 42,
                height: 42,
                fit: BoxFit.cover,
                filterQuality: FilterQuality.high),
          ),
        ),
        card(1, 'Mobile Money', 'M-Pesa, Airtel & more',
            tile(Icons.smartphone_rounded, const Color(0xFF16A34A))),
        card(0, 'Bank Account', 'From your bank',
            tile(Icons.account_balance_rounded, BrandStage.emblemInk)),
      ]),
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.page, required this.count});
  final double page;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      for (var i = 0; i < count; i++)
        Builder(builder: (context) {
          final near = (1 - (page - i).abs()).clamp(0.0, 1.0);
          final tint = _slides[i].tint;
          return Container(
            margin: const EdgeInsets.only(right: 7),
            width: 8 + 22 * near,
            height: 8,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(4),
              color: Color.lerp(
                  Colors.white.withValues(alpha: .25), tint, near),
              boxShadow: near > .5
                  ? [BoxShadow(color: tint.withValues(alpha: .6), blurRadius: 10)]
                  : null,
            ),
          );
        }),
    ]);
  }
}

/// A round arrow that stretches into "Get started" on the last slide.
class _NextButton extends StatelessWidget {
  const _NextButton({required this.last, required this.onPressed});
  final bool last;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 420),
      curve: kEmphasizedIn,
      width: last ? 172 : 60,
      height: 60,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(30),
        gradient: LinearGradient(
          colors: last
              ? const [AppColors.brandAmber, Color(0xFFFBBF24)]
              : const [BrandStage.card, BrandStage.buttonTint],
        ),
        boxShadow: [
          BoxShadow(
            color: (last ? AppColors.brandAmber : Colors.white)
                .withValues(alpha: .35),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          key: const ValueKey('welcome-guide-next'),
          borderRadius: BorderRadius.circular(30),
          onTap: onPressed,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 260),
            transitionBuilder: (child, a) => FadeTransition(
              opacity: a,
              child: ScaleTransition(scale: a, child: child),
            ),
            child: last
                // Scales down while the button is still growing into place.
                ? const FittedBox(
                    key: ValueKey('start'),
                    fit: BoxFit.scaleDown,
                    child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 18),
                    child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Get started',
                          style: TextStyle(
                              color: _navy,
                              fontSize: 15.5,
                              fontWeight: FontWeight.w800)),
                      SizedBox(width: 8),
                      Icon(Icons.arrow_forward_rounded, color: _navy, size: 20),
                    ],
                  )))
                : const Icon(Icons.arrow_forward_rounded,
                    key: ValueKey('next'), color: _navy, size: 26),
          ),
        ),
      ),
    );
  }
}

/// Two slow lights drifting behind everything, coloured by the slides the
/// user is between.
class _AuroraPainter extends CustomPainter {
  _AuroraPainter({required this.page, required this.t});
  final double page;
  final double t;

  Color _tintAt(double p) {
    final i = p.floor().clamp(0, _slides.length - 1);
    final j = (i + 1).clamp(0, _slides.length - 1);
    return Color.lerp(_slides[i].tint, _slides[j].tint, p - p.floor())!;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final tint = _tintAt(page.clamp(0, _slides.length - 1.0));
    final a = t * math.pi * 2;

    void glow(Offset c, double r, Color color, double alpha) {
      canvas.drawCircle(
        c,
        r,
        Paint()
          ..shader = RadialGradient(colors: [
            color.withValues(alpha: alpha),
            color.withValues(alpha: 0),
          ]).createShader(Rect.fromCircle(center: c, radius: r)),
      );
    }

    glow(
      Offset(size.width * (.2 + .1 * math.sin(a)),
          size.height * (.28 + .05 * math.cos(a))),
      size.width * .9,
      tint,
      .38,
    );
    glow(
      Offset(size.width * (.85 + .08 * math.cos(a * 1.3)),
          size.height * (.72 + .06 * math.sin(a))),
      size.width * .8,
      const Color(0xFF1E40AF),
      .55,
    );

    // A faint grain of stars.
    final star = Paint()..color = Colors.white.withValues(alpha: .06);
    final rnd = math.Random(7);
    for (var i = 0; i < 60; i++) {
      final o = Offset(rnd.nextDouble() * size.width,
          rnd.nextDouble() * size.height * .7);
      canvas.drawCircle(o, rnd.nextDouble() * 1.2 + .3, star);
    }
  }

  @override
  bool shouldRepaint(_AuroraPainter old) => old.page != page || old.t != t;
}

class _OrbitPainter extends CustomPainter {
  _OrbitPainter({required this.tint, required this.t, required this.radius});
  final Color tint;
  final double t;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    // The orb.
    canvas.drawCircle(
      c,
      radius,
      Paint()
        ..shader = RadialGradient(colors: [
          tint.withValues(alpha: .45),
          tint.withValues(alpha: .08),
          tint.withValues(alpha: 0),
        ], stops: const [
          0,
          .7,
          1
        ]).createShader(Rect.fromCircle(center: c, radius: radius)),
    );
    // The orbit ring, and a bead travelling on it.
    final ring = Rect.fromCircle(center: c, radius: radius * 1.12);
    canvas.drawOval(
      ring,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Colors.white.withValues(alpha: .14),
    );
    final angle = t * math.pi * 2 * 2 - math.pi / 2;
    final bead = c + Offset(math.cos(angle), math.sin(angle)) * radius * 1.12;
    canvas.drawCircle(
        bead, 9, Paint()..color = tint.withValues(alpha: .35));
    canvas.drawCircle(bead, 3.5, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(_OrbitPainter old) =>
      old.t != t || old.tint != tint || old.radius != radius;
}

/// Shows the guide once, on the first launch of a fresh install, before
/// anyone has signed in. An existing user who updates never sees it
/// uninvited; everyone can replay it from Account → App guide.
class WelcomeGuideGate extends StatefulWidget {
  const WelcomeGuideGate({
    super.key,
    required this.child,
    required this.navigatorKey,
    this.enabled,
  });

  final Widget child;
  final GlobalKey<NavigatorState> navigatorKey;

  /// Null means "on in the app, off under tests".
  final bool? enabled;

  @override
  State<WelcomeGuideGate> createState() => _WelcomeGuideGateState();
}

class _WelcomeGuideGateState extends State<WelcomeGuideGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShow());
  }

  Future<void> _maybeShow() async {
    if (!mounted) return;
    final enabled = widget.enabled ??
        !WidgetsBinding.instance.runtimeType
            .toString()
            .contains('TestWidgetsFlutterBinding');
    if (!enabled || WelcomeGuideScreen.seen) return;
    final token = AuthStore.instance?.token;
    if (token != null && token.isNotEmpty) {
      // Signed in already: not a new user. Never ambush them later either.
      await WelcomeGuideScreen.markSeen();
      return;
    }
    final nav = widget.navigatorKey.currentState;
    if (nav == null) return;
    final completed = await nav.push(WelcomeGuideScreen.route());
    // Leaving with the system back button still counts as seen.
    await WelcomeGuideScreen.markSeen();
    // "Get started" carries on into the step-by-step tour of the real app.
    if (completed == true && mounted) AppTour.start(nav);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
