import 'package:flutter/material.dart';

/// An invisible marker a long form can scroll to.
///
/// Both multi-step forms in the app — the sell wizard and checkout — keep one
/// scroll view per step and never moved it: arriving at step 3 left the page
/// wherever step 2 had been scrolled to, and an error could be raised several
/// screens away from whatever the seller was looking at.
class ScrollAnchor extends StatelessWidget {
  const ScrollAnchor(this.anchor, {super.key});

  final GlobalKey anchor;

  @override
  Widget build(BuildContext context) => SizedBox(key: anchor, height: 0);
}

const Duration _kScrollDuration = Duration(milliseconds: 260);

/// Takes a form back to its first field.
///
/// Deferred a frame because it is called straight from the `setState` that
/// changes the step: the new content does not exist yet at that moment.
void scrollToStart(ScrollController controller,
    {Duration duration = _kScrollDuration}) {
  _afterThisFrame(() {
    if (!controller.hasClients) return;
    if (controller.position.pixels <= controller.position.minScrollExtent) {
      return;
    }
    controller.animateTo(controller.position.minScrollExtent,
        duration: duration, curve: Curves.easeOut);
  });
}

/// Scrolls [anchor] into view, building it first if it has been scrolled out.
///
/// A `ListView` does not lay out children that are off screen, so
/// `Scrollable.ensureVisible` alone cannot reach one: `anchor.currentContext`
/// is null precisely in the case that matters. Running to the end of the list
/// builds the tail — which is where every error in these forms sits, just
/// above the button that raised it — and the anchor can then be aligned
/// properly.
void revealAnchor(
  GlobalKey anchor,
  ScrollController controller, {
  double alignment = 0,
  Duration duration = _kScrollDuration,
}) {
  _afterThisFrame(() async {
    if (!controller.hasClients) return;
    if (anchor.currentContext == null) {
      await controller.animateTo(controller.position.maxScrollExtent,
          duration: duration, curve: Curves.easeOut);
    }
    final context = anchor.currentContext;
    if (context == null || !context.mounted) return;
    if (Scrollable.maybeOf(context) == null) return;
    await Scrollable.ensureVisible(context,
        alignment: alignment, duration: duration, curve: Curves.easeOut);
  });
}

/// Runs [action] once the frame in flight has been laid out.
///
/// `addPostFrameCallback` on its own does not ask for a frame, so a caller
/// that is not already inside one — an error raised from an async response,
/// or a test driving the helper directly — would wait indefinitely.
void _afterThisFrame(VoidCallback action) {
  WidgetsBinding.instance
    ..addPostFrameCallback((_) => action())
    ..ensureVisualUpdate();
}
