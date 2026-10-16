import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Gives a full-screen route a safe parent when it was opened as a cold deep
/// link and therefore has no page underneath it.
class NavigationBoundary extends StatelessWidget {
  final Widget child;
  final String fallbackLocation;

  const NavigationBoundary({
    super.key,
    required this.child,
    required this.fallbackLocation,
  });

  static void back(BuildContext context, {required String fallbackLocation}) {
    final router = GoRouter.maybeOf(context);
    if (router != null && router.canPop()) {
      router.pop();
    } else if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else if (router != null) {
      router.go(fallbackLocation);
    }
  }

  @override
  Widget build(BuildContext context) {
    final router = GoRouter.maybeOf(context);
    final canPop = router?.canPop() ?? Navigator.of(context).canPop();
    return PopScope<Object?>(
      canPop: canPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) router?.go(fallbackLocation);
      },
      child: child,
    );
  }
}
