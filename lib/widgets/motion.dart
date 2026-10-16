import 'package:flutter/widgets.dart';

/// Whether endless, decorative motion (a breathing glow, a spinning ring, a
/// floating illustration) may run here.
///
/// Off when the phone asks for reduced motion (Android "Remove animations"),
/// and off under the widget-test binding, where a loop that never settles
/// would hang every `pumpAndSettle` in the suite. One-shot transitions are
/// unaffected — they finish, so they are always allowed.
bool loopingMotionAllowed(BuildContext context) {
  if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return false;
  return !_underTest;
}

final bool _underTest = WidgetsBinding.instance.runtimeType
    .toString()
    .contains('TestWidgetsFlutterBinding');

/// Emphasized-decelerate: the curve Material 3 uses for things arriving.
const Curve kEmphasizedIn = Cubic(0.05, 0.7, 0.1, 1.0);
