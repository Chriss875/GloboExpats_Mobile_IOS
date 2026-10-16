import 'package:flutter/material.dart';

import '../theme.dart';

/// Web `HalalBadge` (components/ui/halal-badge.tsx): the Halal certification
/// logo on a white disc with a soft green ring, pinned to the top-left of a
/// listing's photo. Shown when the listing's choices mark it Halal
/// (`hasHalalChoice`). The same in both themes — it is a certification mark,
/// not UI chrome.
class HalalBadge extends StatelessWidget {
  const HalalBadge({super.key, this.size = 32});

  /// Web sizes: compact 32, card 36, detail 48–56 logical px.
  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Halal product',
      image: true,
      child: Tooltip(
        message: 'Halal',
        child: Container(
          key: const ValueKey('halal-badge'),
          width: size,
          height: size,
          padding: const EdgeInsets.all(1),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: HalalBadgeColors.disc,
            border: Border.all(color: HalalBadgeColors.ring),
            boxShadow: const [
              BoxShadow(
                  color: HalalBadgeColors.shadow,
                  blurRadius: 3,
                  offset: Offset(0, 1)),
            ],
          ),
          child: Image.asset('assets/images/brand/halal-logo.webp',
              fit: BoxFit.contain),
        ),
      ),
    );
  }
}
