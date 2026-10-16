import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/widgets/delivery_journey.dart';

/// The rail's step labels used to sit in a fixed 84px box centred on each
/// node. From four steps up on a phone-width card the boxes were wider than
/// the gap between nodes, so neighbouring labels painted over each other —
/// and once that was fixed by sizing each box to its slot, the labels filled
/// their slots edge to edge and still read as one run of words.
///
/// The sizing is deliberately tested as pure geometry: `flutter test` renders
/// with a fixed em-square test font roughly twice the width of the real one,
/// so any assertion about wrapping or gutters measured off rendered text is
/// testing the test font, not the app.
void main() {
  // Slots as the rail computes them: the span between the midpoints of a
  // step's neighbours, with the end steps running out to the content edge.
  List<double> slots(int n, double width) {
    const node = 34.0;
    final track = width - node;
    double cx(int i) => n <= 1 ? width / 2 : node / 2 + track * (i / (n - 1));
    return [
      for (var i = 0; i < n; i++)
        (i == n - 1 ? width : (cx(i) + cx(i + 1)) / 2) -
            (i == 0 ? 0 : (cx(i - 1) + cx(i)) / 2),
    ];
  }

  group('a label box fits its slot without crowding its neighbour', () {
    // 300 is a 360dp phone minus the order card's own padding; 264 is the
    // same card on a 320dp handset, the narrowest Android still shipping.
    for (final width in [300.0, 264.0, 351.0]) {
      for (final n in [4, 5, 6]) {
        test('$n steps at ${width.toInt()}px', () {
          // ~48px is the real-font width of the longest step word
          // ("Preparing"/"Delivered") at 10px semibold.
          const floor = 48.0;
          final boxes = [
            for (final slot in slots(n, width))
              DeliveryJourney.boxWidthFor(slot, floor: floor),
          ];

          const cap = 60.0;
          const gutter = 10.0;
          for (var i = 0; i < boxes.length; i++) {
            final slot = slots(n, width)[i];
            expect(boxes[i], lessThanOrEqualTo(slot + 0.01),
                reason: 'step $i: a box may never exceed its own slot');
            expect(boxes[i], lessThanOrEqualTo(cap + 0.01),
                reason: 'step $i: the cap is what makes the words stack');
            // Never clips: the box holds the longest word unless the slot
            // itself is smaller than that word.
            expect(boxes[i], greaterThanOrEqualTo((floor < slot ? floor : slot) - 0.01),
                reason: 'step $i: ${boxes[i]}px box would clip a ${floor}px word');
            // Whenever the slot can hold word + gutter, the gutter is intact.
            if (slot >= floor + gutter) {
              expect(boxes[i], lessThanOrEqualTo(slot - gutter + 0.01),
                  reason: 'step $i: ${boxes[i]}px box in a ${slot}px slot '
                      'crowds its neighbour');
            }
          }
        });
      }
    }
  });

  test('a word wider than the cap still gets a box that fits it', () {
    // The regression: `cap` was applied last and unconditionally, so on the
    // six-step seller rail it clamped the box BELOW the measured floor and
    // "Completed" broke into "Complete" / "d" — the exact failure the floor
    // exists to prevent.
    const wideWord = 78.0; // wider than the 60px cap
    expect(DeliveryJourney.boxWidthFor(200, floor: wideWord),
        greaterThanOrEqualTo(wideWord),
        reason: 'the cap must never clamp a box narrower than its widest word');
  });

  test('a slot narrower than the word is the one case the word loses', () {
    // Nothing can fit here; the box takes the whole slot rather than
    // overflowing into the neighbour.
    expect(DeliveryJourney.boxWidthFor(40, floor: 78), 40);
  });

  test('the cap is what makes a multi-word label stack', () {
    // A roomy slot still yields a capped box, so "Out for delivery" wraps
    // rather than stretching into one line beside its neighbours.
    expect(DeliveryJourney.boxWidthFor(200, floor: 48), 60);
    expect(DeliveryJourney.boxWidthFor(90, floor: 48), 60);
  });

  test('the gutter is given up only when the word would otherwise clip', () {
    // Slot comfortably bigger than the cap: full gutter, box stays at the cap.
    expect(DeliveryJourney.boxWidthFor(80, floor: 48), 60);
    // Slot smaller than cap + gutter (a dense rail): the box drops to the
    // floor so the longest word still fits, rather than to slot - gutter.
    expect(DeliveryJourney.boxWidthFor(50, floor: 48), 48);
    // Slot large enough for cap + gutter exactly.
    expect(DeliveryJourney.boxWidthFor(70, floor: 48), 60);
  });

  testWidgets('every step label renders, wraps and is never ellipsised',
      (tester) async {
    const labels = [
      'Payment secured',
      'Seller confirms',
      'Preparing order',
      'Out for delivery',
      'Delivered',
    ];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 300,
            child: DeliveryJourney(
              steps: [
                for (final l in labels)
                  DeliveryJourneyStep(label: l, icon: Icons.circle_outlined),
              ],
              currentIndex: 2,
            ),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    for (final label in labels) {
      expect(find.text(label), findsOneWidget);
      final text = tester.widget<Text>(find.text(label));
      expect(text.overflow, isNot(TextOverflow.ellipsis),
          reason: '"$label" must wrap onto its own lines, not truncate');
      expect(text.maxLines, greaterThanOrEqualTo(2),
          reason: '"$label" needs room for the words it stacks');
    }
  });
}
