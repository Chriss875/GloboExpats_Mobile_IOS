import 'package:flutter/material.dart';

import '../theme.dart';

/// One node in a [DeliveryJourney] rail.
class DeliveryJourneyStep {
  final String label;
  final String? detail;
  final IconData? icon;
  const DeliveryJourneyStep({required this.label, this.detail, this.icon});
}

/// Web parity `components/orders/delivery-journey.tsx`: a horizontal rail of
/// icon nodes joined by a dotted track with a solid progress overlay, the
/// first and last node anchored to the content's own left/right edge
/// ("edge-aligned" on web) rather than inset within the row. Used both on the
/// order-card mini journey and the order-detail tracking card so the two
/// surfaces read as one visual language instead of two different progress
/// bars.
class DeliveryJourney extends StatelessWidget {
  const DeliveryJourney({
    super.key,
    required this.steps,
    required this.currentIndex,
    this.cancelled = false,
    this.semanticLabel,
  });

  final List<DeliveryJourneyStep> steps;

  /// Index of the active step. When [cancelled] every node renders as failed
  /// and this is ignored for coloring (only used to compute a11y text).
  final int currentIndex;
  final bool cancelled;
  final String? semanticLabel;

  static const _green = Color(0xFF10B981);
  static Color _greenTextOf(BuildContext c) => AppPalette.of(c).successText;
  static const _orange = Color(0xFFF97316);
  static const _rose = Color(0xFFFB7185);
  static const _roseText = Color(0xFFBE123C);
  static Color _slateLineOf(BuildContext c) => AppPalette.of(c).borderStrong;
  static const double _nodeSize = 34;

  /// Web `text-[10px] font-semibold leading-3` on the label paragraph.
  static const double _labelFontSize = 10;
  static const double _labelLineHeight = 12;
  static const int _labelMaxLines = 3;
  static const double _detailLineHeight = 11;

  /// Clear space kept between one label's box and the next one's.
  static const double _labelGutter = 10;

  /// Hard cap on a label's box so a multi-word step stacks its words instead
  /// of running on one long line. At a phone's rail spacing "Seller confirms"
  /// measures wider than the gap between two nodes, so without this the
  /// labels sit shoulder to shoulder and read as one sentence. Wide enough
  /// for the longest single word in the step vocabulary ("Preparing").
  static const double _labelMaxWidth = 60;

  /// How far the rail may step its labels down to fit an unbreakable word.
  /// 10px * 0.75 is 7.5px — small, still legible, and the point past which a
  /// rail this dense should be carrying fewer steps instead.
  static const double _labelMinScale = 0.75;

  @override
  Widget build(BuildContext context) {
    final n = steps.length;
    final last = n - 1;
    final progress = (cancelled || n <= 1)
        ? 0.0
        : (currentIndex.clamp(0, last) / last).clamp(0.0, 1.0);

    // Resolved exactly as the label Text will resolve it — Text merges its
    // own style into the inherited DefaultTextStyle, so the family comes from
    // the app theme, not from a bare TextStyle.
    final labelStyle = DefaultTextStyle.of(context).style.copyWith(
          fontSize: _labelFontSize,
          height: _labelLineHeight / _labelFontSize,
          fontWeight: FontWeight.w600,
        );

    return Semantics(
      label: semanticLabel ??
          (cancelled
              ? 'Order did not complete'
              : n > 0
                  ? 'Order progress: ${steps[currentIndex.clamp(0, last)].label}, step ${currentIndex.clamp(0, last) + 1} of $n'
                  : null),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final trackWidth = (width - _nodeSize).clamp(0.0, double.infinity);
          double centerX(int i) =>
              n <= 1 ? width / 2 : _nodeSize / 2 + trackWidth * (i / last);

          // A label can only wrap between words, so the cap that makes the
          // words stack must never pull the box below the longest single word
          // — "Delivered" has no break point and would simply truncate.
          var widestWord = _widestWord(steps, labelStyle);

          // The end steps' nodes sit on the rail's ends, so their cells are
          // half a middle cell wide — and no cap or gutter rule can widen a
          // box past the slot its neighbour leaves it. When the longest word
          // does not fit that narrowest cell, the rail steps its label size
          // down by exactly the shortfall instead of letting the word break
          // mid-word ("Complete" / "d" on the six-step seller journey).
          final narrowestSlot = n <= 1
              ? width
              : (centerX(1) - centerX(0)) / 2 + _nodeSize / 2;
          var scaledStyle = labelStyle;
          if (widestWord > narrowestSlot && widestWord > 0) {
            // Bounded: past this the labels stop being readable, and a rail
            // that dense wants fewer steps, not smaller type.
            // Against `narrowestSlot - 1`, so the slack `_widestWord` adds
            // back after re-measuring cannot tip the word over again.
            final scale = ((narrowestSlot - 1) / widestWord)
                .clamp(_labelMinScale, 1.0);
            scaledStyle = labelStyle.copyWith(
              fontSize: _labelFontSize * scale,
              height: _labelLineHeight / (_labelFontSize * scale),
            );
            widestWord = _widestWord(steps, scaledStyle);
          }

          final hasDetail = steps.any((s) => s.detail != null);
          final height = _nodeSize +
              4 +
              _labelMaxLines * _labelLineHeight +
              (hasDetail ? 2 + 2 * _detailLineHeight : 0);

          return SizedBox(
            width: width,
            height: height,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  left: _nodeSize / 2,
                  right: _nodeSize / 2,
                  top: _nodeSize / 2 - 1,
                  height: 2,
                  child: CustomPaint(
                    painter: _DottedLinePainter(
                      color: cancelled
                          ? _rose.withValues(alpha: 0.5)
                          : _slateLineOf(context),
                    ),
                  ),
                ),
                if (!cancelled)
                  Positioned(
                    left: _nodeSize / 2,
                    top: _nodeSize / 2 - 1,
                    width: trackWidth * progress,
                    height: 2,
                    child: const ColoredBox(color: _green),
                  ),
                for (var i = 0; i < n; i++)
                  _buildStep(context, i, n, centerX(i),
                      // Each label owns the span between the midpoints of its
                      // neighbours — the widest box that cannot collide with
                      // the next one (web gets this from its `repeat(n,1fr)`
                      // grid). A fixed 84px box overlapped its neighbour from
                      // four steps up, which is why the words ran together.
                      labelLeft:
                          i == 0 ? 0 : (centerX(i - 1) + centerX(i)) / 2,
                      labelRight: i == last
                          ? width
                          : (centerX(i) + centerX(i + 1)) / 2,
                      floor: widestWord,
                      labelStyle: scaledStyle),
              ],
            ),
          );
        },
      ),
    );
  }

  /// How wide one label's box is inside its [slot].
  ///
  /// Three rules, in priority order:
  ///  * never wider than [cap] — that is what makes "Out for delivery" stack
  ///    as "Out for" / "delivery" instead of stretching into one long line;
  ///  * keep [_labelGutter] of clear space inside the slot, so neighbouring
  ///    labels have visible air between them rather than merely not colliding;
  ///  * never narrower than [floor], the longest word in the rail, because a
  ///    label breaks on spaces only and would otherwise truncate.
  ///
  /// On a rail too dense to honour all three, the word wins and eats into the
  /// gutter — a tight label beats a truncated one.
  @visibleForTesting
  static double boxWidthFor(double slot,
      {double cap = _labelMaxWidth, required double floor}) {
    final withGutter = slot - _labelGutter;
    final target = withGutter < floor ? floor : withGutter;
    // The cap is an aesthetic preference; the floor is a correctness bound.
    // Applying the cap unconditionally let it clamp BELOW the floor, which is
    // how a six-step seller rail still broke "Completed" into "Complete"/"d"
    // even though the floor had measured the word correctly.
    final ceiling = cap < floor ? floor : cap;
    final capped = target > ceiling ? ceiling : target;
    return capped > slot ? slot : capped;
  }

  /// Widest single word across every step label — the narrowest a label box
  /// can be without clipping, since labels break on spaces only.
  ///
  /// [style] MUST be the style the label actually paints with, inherited
  /// family and all. Measuring a bare `TextStyle(fontSize:…)` here silently
  /// measures the platform default font instead of the app's, under-provisions
  /// the floor, and lets a long word break mid-word ("Delivere" / "d").
  static double _widestWord(List<DeliveryJourneyStep> steps, TextStyle style) {
    var widest = 0.0;
    for (final step in steps) {
      for (final word in step.label.split(RegExp(r'\s+'))) {
        if (word.isEmpty) continue;
        final painter = TextPainter(
          text: TextSpan(text: word, style: style),
          textDirection: TextDirection.ltr,
        )..layout();
        if (painter.width > widest) widest = painter.width;
      }
    }
    // A hair of slack so sub-pixel rounding in the real layout cannot tip a
    // word one pixel over its box and break it mid-word.
    return widest > 0 ? widest + 1 : 0;
  }

  Widget _buildStep(BuildContext context, int i, int n, double cx,
      {required double labelLeft,
      required double labelRight,
      required double floor,
      required TextStyle labelStyle}) {
    final step = steps[i];
    final complete = !cancelled && (i < currentIndex || currentIndex == n - 1);
    final current = !cancelled && i == currentIndex && currentIndex != n - 1;
    final color = cancelled
        ? _rose
        : complete
            ? _green
            : current
                ? _orange
                : _slateLineOf(context);
    final textColor = cancelled
        ? _roseText
        : complete
            ? _greenTextOf(context)
            : current
                ? AppColors.brandBlue
                : AppPalette.of(context).textSecondary;

    // The slot is the span between the neighbours' midpoints; the box keeps a
    // gutter inside it and never grows past [_labelMaxWidth], so the words
    // stack rather than stretching into the next step's label.
    final slot = (labelRight - labelLeft).clamp(0.0, double.infinity);
    final boxWidth = boxWidthFor(slot, floor: floor);
    // Centre the box in its slot, except at the ends, where it hugs the
    // content edge its node is anchored to.
    final labelLeftInset =
        i == 0 ? labelLeft : labelLeft + (slot - boxWidth) / 2;

    // The end labels hug the content edges their nodes are anchored to; the
    // rest centre under their own node.
    final align = i == 0
        ? CrossAxisAlignment.start
        : i == n - 1
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.center;
    final textAlign = i == 0
        ? TextAlign.left
        : i == n - 1
            ? TextAlign.right
            : TextAlign.center;

    return Stack(clipBehavior: Clip.none, children: [
      Positioned(
        left: cx - _nodeSize / 2,
        top: 0,
        child: Container(
          width: _nodeSize,
          height: _nodeSize,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppPalette.of(context).surface,
            border: Border.all(color: color, width: 2),
            boxShadow: current
                ? [
                    BoxShadow(
                      color: _orange.withValues(alpha: 0.16),
                      blurRadius: 0,
                      spreadRadius: 4,
                    ),
                  ]
                : null,
          ),
          child: Center(
            child: step.icon != null
                ? Icon(step.icon, size: 18, color: color)
                : Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                        color: color, shape: BoxShape.circle),
                  ),
          ),
        ),
      ),
      Positioned(
        left: i == n - 1 ? null : labelLeftInset,
        right: i == n - 1 ? 0 : null,
        top: _nodeSize + 4,
        width: boxWidth,
        child: Column(
          crossAxisAlignment: align,
          children: [
            // No ellipsis: the label wraps onto its own lines instead, so
            // "Out for delivery" stacks as "Out for" / "delivery" rather than
            // running into the next step's words.
            Text(step.label,
                textAlign: textAlign,
                maxLines: _labelMaxLines,
                // The very style the floor was measured with, so the box can
                // never be provisioned for a different font than it paints.
                style: labelStyle.copyWith(color: textColor)),
            if (step.detail != null) ...[
              const SizedBox(height: 2),
              Text(step.detail!,
                  textAlign: textAlign,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 9,
                      height: _detailLineHeight / 9,
                      color: AppPalette.of(context).textSecondary)),
            ],
          ],
        ),
      ),
    ]);
  }
}

class _DottedLinePainter extends CustomPainter {
  const _DottedLinePainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    const dashWidth = 4.0;
    const gapWidth = 4.0;
    var x = 0.0;
    final y = size.height / 2;
    while (x < size.width) {
      canvas.drawLine(Offset(x, y), Offset((x + dashWidth).clamp(0, size.width), y), paint);
      x += dashWidth + gapWidth;
    }
  }

  @override
  bool shouldRepaint(covariant _DottedLinePainter oldDelegate) =>
      oldDelegate.color != color;
}
