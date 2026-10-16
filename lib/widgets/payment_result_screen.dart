import 'dart:math' as math;
import 'dart:ui' show PathMetric;

import 'package:flutter/material.dart';

import '../domain/selcom_payment.dart';
import '../theme.dart';

/// Result of a Selcom wallet payment, shown at Checkout Step 04 — web
/// `components/checkout/payment-result-screen.tsx` rendered `embedded`.
///
/// The web used to leave checkout for a full-page result route; it now keeps
/// the buyer inside checkout and shows this in place of the order summary,
/// with "Try again" returning to the Payment step. Mobile follows suit: every
/// terminal wallet outcome lands here, including a poll that simply ran out
/// (which reads as [PaymentResultKind.failed], never as a decline).
///
/// Motion mirrors the web's and has the same rule — every movement says
/// something: the badge lands, the glyph draws itself in, the copy follows in
/// reading order, and confetti falls once on success only. With animations
/// disabled at the OS level all of it collapses to a plain render.
class PaymentResultScreen extends StatefulWidget {
  const PaymentResultScreen({
    super.key,
    required this.kind,
    required this.onPrimaryAction,
    this.amountLabel,
    this.reference,
    this.phoneLabel,
    this.viewOrderLabel,
    this.onViewOrder,
  });

  final PaymentResultKind kind;

  /// Success → continue shopping; failed / declined → back to Step 03.
  final VoidCallback onPrimaryAction;

  /// e.g. "TZS 800,000" — shown on success only.
  final String? amountLabel;

  /// The invoice number, e.g. "PF-2026-000058".
  final String? reference;

  /// The wallet number the request went to — shown on a decline only.
  final String? phoneLabel;

  /// A second button under the primary one, e.g. "View Order Details" after
  /// a successful payment. Hidden when [onViewOrder] is null.
  final String? viewOrderLabel;
  final VoidCallback? onViewOrder;

  @override
  State<PaymentResultScreen> createState() => _PaymentResultScreenState();
}

/// Web badge colours per kind: a soft halo behind a solid disc.
({Color halo, Color disc}) _badgeColours(PaymentResultKind kind) =>
    switch (kind) {
      PaymentResultKind.success => (
          halo: const Color(0x2410B981), // emerald-500 / 0.14
          disc: const Color(0xFF10B981),
        ),
      PaymentResultKind.failed => (
          halo: const Color(0x1ADC2626), // red-600 / 0.10
          disc: const Color(0xFFDC2626),
        ),
      PaymentResultKind.declined => (
          halo: const Color(0x24F59E0B), // amber-500 / 0.14
          disc: const Color(0xFFD97706),
        ),
    };

class _PaymentResultScreenState extends State<PaymentResultScreen>
    with TickerProviderStateMixin {
  /// Badge, glyph and copy: web timings (420ms ease-out, 60ms stagger,
  /// glyph drawn from 260ms).
  late final AnimationController _entry = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1300));

  /// Confetti, once, success only.
  late final AnimationController _confetti = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 4200));

  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _entry.value = 1;
      return;
    }
    _entry.forward();
    if (widget.kind == PaymentResultKind.success) _confetti.forward();
  }

  @override
  void dispose() {
    _entry.dispose();
    _confetti.dispose();
    super.dispose();
  }

  /// A piece of copy that fades and rises in at its place in reading order.
  Widget _stagger(int index, Widget child) {
    const ease = Cubic(0.23, 1, 0.32, 1);
    final start = (140 + index * 60) / 1300;
    final end = math.min(1.0, start + 420 / 1300);
    final curve = CurvedAnimation(
        parent: _entry, curve: Interval(start, end, curve: ease));
    return AnimatedBuilder(
      animation: curve,
      child: child,
      builder: (context, child) => Opacity(
        opacity: curve.value,
        child: Transform.translate(
          offset: Offset(0, 8 * (1 - curve.value)),
          child: Transform.scale(
              scale: 0.96 + 0.04 * curve.value, child: child),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final copy = paymentResultCopy(widget.kind);
    final colours = _badgeColours(widget.kind);
    final success = widget.kind == PaymentResultKind.success;
    final declined = widget.kind == PaymentResultKind.declined;
    final showPhone =
        declined && (widget.phoneLabel ?? '').trim().isNotEmpty;
    final showReference = (widget.reference ?? '').trim().isNotEmpty;

    return Container(
      key: ValueKey('payment-result-${widget.kind.name}'),
      constraints: const BoxConstraints(minHeight: 480),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Stack(children: [
        if (success)
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _confetti,
                builder: (context, _) => CustomPaint(
                    painter: _ConfettiPainter(_confetti.value)),
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 48, 24, 40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _stagger(
                0,
                SizedBox(
                  width: 144,
                  height: 144,
                  child: Stack(alignment: Alignment.center, children: [
                    Container(
                        decoration: BoxDecoration(
                            color: colours.halo, shape: BoxShape.circle)),
                    Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                          color: colours.disc, shape: BoxShape.circle),
                      child: Center(
                        child: SizedBox(
                          width: 48,
                          height: 48,
                          child: AnimatedBuilder(
                            animation: _entry,
                            builder: (context, _) => CustomPaint(
                              painter: _GlyphPainter(
                                widget.kind,
                                // Drawn after the badge lands (web: 260ms,
                                // over 520ms).
                                Interval(260 / 1300, 780 / 1300,
                                        curve: const Cubic(0.23, 1, 0.32, 1))
                                    .transform(_entry.value),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ]),
                ),
              ),
              const SizedBox(height: 32),
              _stagger(
                0,
                Text(copy.title,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 28,
                        height: 1.15,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.4,
                        color: palette.textPrimary)),
              ),
              if (success && (widget.amountLabel ?? '').isNotEmpty) ...[
                const SizedBox(height: 12),
                _stagger(
                  1,
                  Text(widget.amountLabel!,
                      key: const ValueKey('payment-result-amount'),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: palette.textPrimary)),
                ),
              ],
              const SizedBox(height: 16),
              _stagger(
                2,
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 448),
                  child: Text(copy.body,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 15,
                          height: 1.55,
                          color: palette.textSecondary)),
                ),
              ),
              if (showReference || showPhone) ...[
                const SizedBox(height: 12),
                _stagger(
                  3,
                  Text.rich(
                    key: const ValueKey('payment-result-reference'),
                    TextSpan(
                      style: TextStyle(
                          fontSize: 13.5, color: palette.textMuted),
                      children: [
                        if (showReference) ...[
                          const TextSpan(text: 'Invoice '),
                          TextSpan(
                              text: widget.reference,
                              style: TextStyle(
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.w600,
                                  color: palette.textSecondary)),
                        ],
                        if (showReference && showPhone)
                          const TextSpan(text: ' · '),
                        if (showPhone) ...[
                          const TextSpan(text: 'Number '),
                          TextSpan(
                              text: widget.phoneLabel,
                              style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  color: palette.textSecondary)),
                        ],
                      ],
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
              const SizedBox(height: 40),
              _stagger(
                4,
                ConstrainedBox(
                  constraints:
                      const BoxConstraints(minWidth: 240, minHeight: 56),
                  child: FilledButton(
                    key: const ValueKey('payment-result-primary'),
                    onPressed: widget.onPrimaryAction,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brandBlue,
                      foregroundColor: Colors.white,
                      // The theme's button icon colour is dark navy, which
                      // vanished on the blue pill.
                      iconColor: BrandStage.ink,
                      shape: const StadiumBorder(),
                      elevation: 4,
                      padding: const EdgeInsets.symmetric(horizontal: 32),
                    ),
                    // The label may shrink but never push past the pill: a
                    // narrow phone or a large system text size otherwise
                    // overflows it.
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(
                          success
                              ? Icons.shopping_bag_outlined
                              : Icons.replay_rounded,
                          size: 20),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(copy.cta,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(width: 8),
                      const Icon(Icons.arrow_forward_rounded, size: 16),
                    ]),
                  ),
                ),
              ),
              if (widget.onViewOrder != null) ...[
                const SizedBox(height: 12),
                _stagger(
                  4,
                  ConstrainedBox(
                    constraints:
                        const BoxConstraints(minWidth: 240, minHeight: 52),
                    child: OutlinedButton.icon(
                      key: const ValueKey('payment-result-view-order'),
                      onPressed: widget.onViewOrder,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: palette.accentInk,
                        side: BorderSide(color: palette.border, width: 1.5),
                        shape: const StadiumBorder(),
                        padding: const EdgeInsets.symmetric(horizontal: 28),
                      ),
                      icon: const Icon(Icons.receipt_long_outlined, size: 19),
                      label: Text(widget.viewOrderLabel ?? 'View Order Details',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ]),
    );
  }
}

/// The web's three glyphs, from their 48x48 SVG paths, drawn in by
/// [progress] (0 → nothing, 1 → complete).
class _GlyphPainter extends CustomPainter {
  _GlyphPainter(this.kind, this.progress);

  final PaymentResultKind kind;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 48, size.height / 48);
    final stroke = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final fill = Paint()..color = Colors.white;

    void drawIn(Path path, double width, {double delay = 0}) {
      final t = ((progress - delay) / (1 - delay)).clamp(0.0, 1.0);
      if (t <= 0) return;
      stroke.strokeWidth = width;
      for (final PathMetric metric in path.computeMetrics()) {
        canvas.drawPath(metric.extractPath(0, metric.length * t), stroke);
      }
    }

    switch (kind) {
      case PaymentResultKind.success:
        // M13 25.5 21 33 35 17
        drawIn(
            Path()
              ..moveTo(13, 25.5)
              ..lineTo(21, 33)
              ..lineTo(35, 17),
            4);
      case PaymentResultKind.failed:
        // Signal arcs with a break — "the network dropped".
        if (progress > 0) canvas.drawCircle(const Offset(24, 34), 2.4, fill);
        drawIn(
            Path()
              ..moveTo(17.5, 27.5)
              ..arcToPoint(const Offset(30.5, 27.5),
                  radius: const Radius.circular(9)),
            3);
        drawIn(
            Path()
              ..moveTo(12, 22)
              ..arcToPoint(const Offset(36, 22),
                  radius: const Radius.circular(16.5)),
            3,
            delay: 0.25);
        drawIn(
            Path()
              ..moveTo(31, 9)
              ..relativeLineTo(-6, 8)
              ..relativeLineTo(6, 4)
              ..relativeLineTo(-6, 8),
            2.5,
            delay: 0.4);
      case PaymentResultKind.declined:
        // A wallet with its card half out, and a slash — "the wallet said no".
        drawIn(
            Path()
              ..addRRect(RRect.fromLTRBR(
                  9, 12.5, 37, 35.5, const Radius.circular(4))),
            3);
        drawIn(
            Path()
              ..moveTo(29, 21)
              ..lineTo(39, 21)
              ..lineTo(39, 29)
              ..lineTo(29, 29)
              ..arcToPoint(const Offset(29, 21),
                  radius: const Radius.circular(4)),
            3);
        if (progress > 0.5) {
          canvas.drawCircle(const Offset(30.5, 25), 1.6, fill);
        }
        drawIn(
            Path()
              ..moveTo(12, 37)
              ..lineTo(36, 11),
            3.5,
            delay: 0.5);
    }
  }

  @override
  bool shouldRepaint(_GlyphPainter old) =>
      old.progress != progress || old.kind != kind;
}

/// Web `Confetti`: 36 pieces on a deterministic spread, each falling,
/// drifting and tumbling once.
class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.t);

  /// 0 → 1 across the whole 4.2s run.
  final double t;

  static const _colours = [
    Color(0xFFF59E0B),
    Color(0xFF10B981),
    Color(0xFF3B82F6),
    Color(0xFFEC4899),
    Color(0xFF111827),
    Color(0xFFF3E8D3),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    if (t <= 0 || t >= 1) return;
    const total = 4200.0;
    final now = t * total;
    for (var i = 0; i < 36; i++) {
      final seed = (i * 9301 + 49297) % 233280;
      double rnd(int n) => ((seed * (n + 1)) % 1000) / 1000;
      final duration = 2200 + rnd(4) * 1200;
      final delay = rnd(5) * 700;
      final p = ((now - delay) / duration).clamp(0.0, 1.0);
      if (p <= 0 || p >= 1) continue;
      // Web keyframes: fade in over the first 8%, fade out to the end.
      final opacity = p < 0.08 ? p / 0.08 : 1 - (p - 0.08) / 0.92;
      final eased = Curves.easeOutQuad.transform(p);
      final x = size.width * ((i / 36) + rnd(1) * 0.02) +
          (rnd(2) - 0.5) * 160 * eased;
      final y = -12 + (size.height * 1.05 + 12) * eased;
      final angle = (540 + rnd(3) * 540) * p * math.pi / 180;
      final scale = 0.7 + rnd(6) * 0.6;
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(angle);
      canvas.scale(scale);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
            const Rect.fromLTWH(-4, -7, 8, 14), const Radius.circular(2)),
        Paint()
          ..color = _colours[i % _colours.length]
              .withValues(alpha: opacity.clamp(0.0, 1.0)),
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) => old.t != t;
}
