import 'package:flutter/material.dart';

import '../theme.dart';

/// The shell both auth screens sit in (web parity `app/login/page.tsx` and
/// `app/register/page.tsx`): a full-bleed diagonal blue gradient with one
/// white rounded card floating on it, no app-bar chrome beyond a back
/// affordance.
///
/// Extracted from the login screen so signup cannot drift away from it again
/// — signup used to be a bare white page with a titled app bar, which read as
/// a different product from the login screen one tap away.
class AuthCardScaffold extends StatelessWidget {
  const AuthCardScaffold({super.key, required this.child});

  /// The card's contents. Sized by its own content — see the constraint note
  /// below, which is what keeps the card from stretching into an empty slab.
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: Colors.white,
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppColors.brandBlue,
              AppColors.brandBlueMid,
              AppColors.brandBlue,
            ],
          ),
        ),
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              // Symmetric on purpose: whatever the card does not use shows as
              // an even margin rather than a band that collects at one edge.
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                // A reserved column, NOT a stretched card. This box only has
                // to be tall enough for [Center] to have somewhere to centre
                // in; the card is [Center]'s child, so it keeps its own
                // content height. Putting `minHeight` here rather than on the
                // card is the whole point: with it on the card, the card is
                // forced to fill the page and the form becomes a mostly-empty
                // white slab.
                //
                // The 40 is the scroll view's own padding (20 top + 20
                // bottom). Guarded, because `BoxConstraints(minHeight:)`
                // asserts on a negative value and a short viewport (a raised
                // keyboard) can make `maxHeight` smaller than the padding.
                constraints: BoxConstraints(
                    minHeight: constraints.maxHeight > 40
                        ? constraints.maxHeight - 40
                        : 0.0),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(22, 28, 22, 28),
                      decoration: BoxDecoration(
                        color: AppPalette.of(context).surface,
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: const [
                          BoxShadow(
                              color: Color(0x33000000),
                              blurRadius: 30,
                              offset: Offset(0, 12)),
                        ],
                      ),
                      child: child,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The outlined pill both auth screens use for their two entry points
/// (web parity: `h-14 rounded-full border-2`).
class AuthPillButton extends StatelessWidget {
  const AuthPillButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final Widget icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    // A Row with a Flexible label rather than OutlinedButton.icon: the icon
    // and label of `.icon` are laid out unbounded, so a long label at a large
    // text scale overflows the button instead of shortening.
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        backgroundColor: AppPalette.of(context).surface,
        foregroundColor: AppColors.neutral800,
        padding: const EdgeInsets.symmetric(vertical: 15),
        minimumSize: const Size.fromHeight(54),
        side: BorderSide(color: AppPalette.of(context).border, width: 2),
      ),
      onPressed: onPressed,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          icon,
          const SizedBox(width: 10),
          Flexible(
            child: Text(label,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          ),
        ],
      ),
    );
  }
}
