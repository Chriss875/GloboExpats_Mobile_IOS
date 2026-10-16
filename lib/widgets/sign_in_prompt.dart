import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme.dart';
import 'brand_logo.dart';

/// The card a signed-out user meets on a page that needs an account (My
/// Space, Account, Saved) and in the Community sign-in sheet.
///
/// A brand header with one of the app's own illustrations, what signing in
/// unlocks on THIS page, then Sign in and Create an account — the page says
/// what it is for instead of just blocking the way.
class SignInPrompt extends StatelessWidget {
  final String title;
  final String message;
  final String returnUrl;
  final VoidCallback? onSignIn;
  final VoidCallback? onRegister;

  /// What an account unlocks here — three short lines.
  final List<(IconData, String)> highlights;

  const SignInPrompt({
    super.key,
    this.title = 'Make yourself at home',
    this.message =
        'Sign in to save your favourites, manage orders and connect with sellers.',
    this.returnUrl = '/expat/dashboard',
    this.onSignIn,
    this.onRegister,
    this.highlights = const [
      (Icons.shopping_bag_outlined, 'Follow your orders and payments'),
      (Icons.favorite_border_rounded, 'Keep the items you love'),
      (Icons.storefront_outlined, 'Sell and get paid'),
    ],
  });

  void _signIn(BuildContext context) => onSignIn != null
      ? onSignIn!()
      : context.push(Uri(path: '/login', queryParameters: {'returnUrl': returnUrl})
          .toString());

  void _register(BuildContext context) =>
      onRegister != null ? onRegister!() : context.push('/register');

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            key: const ValueKey('sign-in-prompt'),
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: palette.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _BrandHeader(),
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 20, 22, 18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: const TextStyle(
                              fontFamily: 'Lexend',
                              fontSize: 22,
                              height: 1.2,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -.3)),
                      const SizedBox(height: 8),
                      Text(message,
                          style: TextStyle(
                              fontSize: 14.5,
                              height: 1.5,
                              color: palette.textSecondary)),
                      const SizedBox(height: 16),
                      for (final (icon, label) in highlights)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Row(children: [
                            Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: palette.infoFill,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(icon,
                                  size: 17, color: palette.accentInk),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(label,
                                  style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      color: palette.textPrimary)),
                            ),
                          ]),
                        ),
                      const SizedBox(height: 10),
                      FilledButton(
                        key: const ValueKey('sign-in-prompt-sign-in'),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(50),
                          backgroundColor: AppColors.brandBlue,
                          foregroundColor: BrandStage.ink,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                        onPressed: () => _signIn(context),
                        child: const Text('Sign in',
                            style: TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton(
                        key: const ValueKey('sign-in-prompt-register'),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(50),
                          foregroundColor: palette.textPrimary,
                          side: BorderSide(color: palette.border),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                        onPressed: () => _register(context),
                        child: const Text('Create an account',
                            style: TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w600)),
                      ),
                      const SizedBox(height: 14),
                      Center(
                        child: Text(
                            'You can keep exploring without an account.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                fontSize: 12,
                                color: palette.textSecondary)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The brand band across the top: the app's blue, the wordmark, and the
/// GloboExpats courier cut-out standing in the corner.
class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 132,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.brandBlueDark, AppColors.brandBlue],
          ),
        ),
        child: Stack(children: [
          const Positioned(
            left: 22,
            top: 22,
            child: GloboExpatsWordmark(fontSize: 18, globoColor: BrandStage.ink),
          ),
          const Positioned(
            left: 22,
            top: 50,
            child: Text('Buy · Sell · Connect',
                style: TextStyle(
                    color: Color(0xCCFFFFFF),
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    letterSpacing: .3)),
          ),
          Positioned(
            right: 8,
            bottom: 0,
            top: 8,
            child: Image.asset(
              'assets/images/home/globoexpats-community-delivery.webp',
              fit: BoxFit.contain,
              alignment: Alignment.bottomRight,
              filterQuality: FilterQuality.high,
            ),
          ),
        ]),
      ),
    );
  }
}

Future<void> showSignInPrompt(BuildContext context,
    {required String message, required String returnUrl}) async {
  final choice = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => SingleChildScrollView(
          child: SignInPrompt(
              title: 'Join the conversation',
              message: message,
              returnUrl: returnUrl,
              highlights: const [
                (Icons.forum_outlined, 'Post what you need'),
                (Icons.local_offer_outlined, 'Offer to help others'),
                (Icons.chat_bubble_outline_rounded, 'Talk to buyers and sellers'),
              ],
              onSignIn: () => Navigator.pop(sheetContext, 'login'),
              onRegister: () => Navigator.pop(sheetContext, 'register'))));
  if (!context.mounted) return;
  if (choice == 'login') {
    context.push(
        Uri(path: '/login', queryParameters: {'returnUrl': returnUrl}).toString());
  } else if (choice == 'register') {
    context.push('/register');
  }
}
