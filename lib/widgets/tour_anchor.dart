import 'package:flutter/widgets.dart';

/// Marks a feature the app tour can point at, by name.
///
/// Anchors register themselves while mounted. There are no GlobalKeys here
/// on purpose: the same header can be on screen twice during a route
/// transition, and a duplicated GlobalKey would crash the app — a registry
/// just picks the copy the user is actually looking at.
class TourAnchor extends StatefulWidget {
  const TourAnchor({super.key, required this.id, required this.child});

  final String id;
  final Widget child;

  /// Where [id] is on screen right now, or null when it is not visible on
  /// the current route.
  static Rect? rectOf(String id) {
    final live = _live[id];
    if (live == null) return null;
    for (final state in live.reversed) {
      if (!state.mounted) continue;
      final box = state.context.findRenderObject();
      if (box is! RenderBox || !box.attached || !box.hasSize) continue;
      final route = ModalRoute.of(state.context);
      if (route != null && !route.isCurrent) continue;
      final rect = box.localToGlobal(Offset.zero) & box.size;
      if (rect.isEmpty) continue;
      return rect;
    }
    return null;
  }

  static final Map<String, List<State<TourAnchor>>> _live = {};

  @override
  State<TourAnchor> createState() => _TourAnchorState();
}

class _TourAnchorState extends State<TourAnchor> {
  @override
  void initState() {
    super.initState();
    (TourAnchor._live[widget.id] ??= []).add(this);
  }

  @override
  void didUpdateWidget(TourAnchor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.id != widget.id) {
      TourAnchor._live[oldWidget.id]?.remove(this);
      (TourAnchor._live[widget.id] ??= []).add(this);
    }
  }

  @override
  void dispose() {
    TourAnchor._live[widget.id]?.remove(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
