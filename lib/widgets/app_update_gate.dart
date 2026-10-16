
import 'package:flutter/material.dart';

import '../domain/app_update_policy.dart';
import '../services/app_update_service.dart';
import '../theme.dart';

/// Offers the newest version from Google Play each time the app is entered.
///
/// Wraps the whole app. On a cold start, and on every return to the
/// foreground after [kUpdateCheckAfterBackground] away, it asks Play whether
/// a newer build is live; if one is, it offers it — **Update now** or
/// **Later**. "Later" is not remembered: the next entry asks again, so an
/// install cannot drift many versions behind unnoticed.
///
/// It never blocks the app. No update, no Play, or any error at all simply
/// means nothing is shown.
class AppUpdateGate extends StatefulWidget {
  const AppUpdateGate({
    super.key,
    required this.child,
    required this.navigatorKey,
    this.source = const PlayAppUpdateSource(),
    this.clock = DateTime.now,
  });

  final Widget child;

  /// The app's root navigator: the gate sits above it, so the prompt is
  /// shown through it.
  final GlobalKey<NavigatorState> navigatorKey;
  final AppUpdateSource source;

  /// Test seam for measuring time spent in the background.
  final DateTime Function() clock;

  @override
  State<AppUpdateGate> createState() => _AppUpdateGateState();
}

class _AppUpdateGateState extends State<AppUpdateGate>
    with WidgetsBindingObserver {
  DateTime? _backgroundedAt;

  /// One check, and one prompt, at a time.
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Cold start: after the first frame, so the prompt has a screen to sit
    // on and never delays the app appearing.
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeOffer());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        _backgroundedAt ??= widget.clock();
      case AppLifecycleState.resumed:
        final since = _backgroundedAt;
        _backgroundedAt = null;
        if (since == null) return;
        _maybeOffer(backgroundFor: widget.clock().difference(since));
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        break;
    }
  }

  Future<void> _maybeOffer({Duration? backgroundFor}) async {
    if (_busy || !mounted) return;
    if (!shouldCheckForUpdate(backgroundFor: backgroundFor)) return;
    _busy = true;
    try {
      final offer = await widget.source.check();
      if (offer == null || !mounted) return;
      // Already agreed to and interrupted: carry on, don't ask twice.
      if (offer.alreadyStarted) {
        await widget.source.install(offer);
        return;
      }
      final dialogContext = widget.navigatorKey.currentContext;
      if (dialogContext == null || !dialogContext.mounted) return;
      final accepted = await showUpdateOffer(dialogContext);
      if (accepted == true) await widget.source.install(offer);
    } catch (_) {
      // An update check must never take the app down with it.
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// The update offer: a calm, professional card with the app's own mark. It
/// fades up over a dimmed screen and waits; nothing loops or sparkles.
Future<bool?> showUpdateOffer(BuildContext context) => showGeneralDialog<bool>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Dismiss update',
      barrierColor: Colors.black.withValues(alpha: .5),
      transitionDuration: const Duration(milliseconds: 260),
      pageBuilder: (context, _, __) => const _UpdateDialog(),
      transitionBuilder: (context, animation, _, child) {
        final curved =
            CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween(begin: const Offset(0, .03), end: Offset.zero)
                .animate(curved),
            child: child,
          ),
        );
      },
    );

class _UpdateDialog extends StatelessWidget {
  const _UpdateDialog();

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final size = MediaQuery.sizeOf(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        child: ConstrainedBox(
          constraints: BoxConstraints(
              maxWidth: 380, maxHeight: size.height - 48),
          child: Material(
            key: const ValueKey('app-update-dialog'),
            color: palette.surface,
            borderRadius: BorderRadius.circular(24),
            clipBehavior: Clip.antiAlias,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: Image.asset('assets/images/brand/app-mark.webp',
                            width: 52,
                            height: 52,
                            filterQuality: FilterQuality.high),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Update available',
                                  style: TextStyle(
                                      fontFamily: 'Lexend',
                                      fontSize: 20,
                                      height: 1.2,
                                      fontWeight: FontWeight.w700)),
                              const SizedBox(height: 2),
                              Text('A new version of GloboExpats',
                                  style: TextStyle(
                                      fontSize: 13,
                                      color: palette.textSecondary)),
                            ]),
                      ),
                    ]),
                    const SizedBox(height: 18),
                    Text(
                      'Update to get the latest features, fixes and security '
                      'improvements.',
                      style: TextStyle(
                          fontSize: 14.5,
                          height: 1.5,
                          color: palette.textPrimary),
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: palette.surfaceMuted,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(children: [
                        Icon(Icons.lock_outline_rounded,
                            size: 17, color: palette.textSecondary),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                              'You stay signed in, and your cart and saved '
                              'items are kept.',
                              style: TextStyle(
                                  fontSize: 12.5,
                                  height: 1.35,
                                  color: palette.textSecondary)),
                        ),
                      ]),
                    ),
                    const SizedBox(height: 20),
                    Row(children: [
                      Expanded(
                        child: OutlinedButton(
                          key: const ValueKey('app-update-later'),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(48),
                            foregroundColor: palette.textPrimary,
                            side: BorderSide(color: palette.border),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          onPressed: () => Navigator.of(context).pop(false),
                          child: const Text('Later',
                              style: TextStyle(fontWeight: FontWeight.w600)),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          key: const ValueKey('app-update-now'),
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(48),
                            backgroundColor: AppColors.brandBlue,
                            foregroundColor: BrandStage.ink,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          onPressed: () => Navigator.of(context).pop(true),
                          child: const Text('Update now',
                              style: TextStyle(fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ]),
                  ]),
            ),
          ),
        ),
      ),
    );
  }
}
