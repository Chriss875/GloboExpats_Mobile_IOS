import '../config.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../auth/auth_store.dart';
import '../auth/apple_sign_in_service.dart';
import '../theme.dart';
import '../widgets/auth_card.dart';
import '../widgets/brand_logo.dart';

/// Login screen: email + password, mirrors the web reference's login form
/// (`/login`). Uses JWT auth against the sandbox backend. Honours
/// [returnUrl] (web RouteGuard parity): after a successful login the user is
/// pushed back to the route that triggered the auth gate.
class LoginScreen extends StatefulWidget {
  final AuthStore store;

  /// Route to navigate to after login (e.g. the gated deep link that
  /// redirected here). Null → stay put (tab-based flow).
  final String? returnUrl;
  const LoginScreen({super.key, required this.store, this.returnUrl});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _showEmailForm = false;

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_onStore);
  }

  void _onStore() => setState(() {});

  @override
  void dispose() {
    widget.store.removeListener(_onStore);
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  /// Signs in with Google. A dismissed picker returns false with no error, so
  /// nothing is shown for it.
  Future<void> _googleSignIn() async {
    final ok = await widget.store.signInWithGoogle();
    if (ok && mounted) {
      _afterSignIn('Signed in with Google.');
    } else if (mounted && widget.store.error != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(widget.store.error!)));
    }
  }

  Future<void> _appleSignIn() async {
    final ok = await widget.store.signInWithApple();
    if (ok && mounted) {
      _afterSignIn('Signed in with Apple.');
    } else if (mounted && widget.store.error != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(widget.store.error!)));
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final ok = await widget.store.login(
      email: _email.text.trim(),
      password: _password.text,
    );
    if (ok && mounted) {
      _afterSignIn('Logged in. Welcome back!');
    }
  }

  /// Where every successful sign-in lands, however it was performed.
  void _afterSignIn(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
    // The mobile product flow has one predictable post-auth landing point.
    // Account remains available in the bottom bar and Login remains in the
    // header while signed out, but a successful sign-in always starts at Home.
    if (context.mounted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    return AuthCardScaffold(
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(child: GloboExpatsWordmark(fontSize: 30)),
            const SizedBox(height: 14),
            const Text('Login into your account',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: AppColors.neutral800)),
            if (widget.returnUrl != null) ...[
              const SizedBox(height: 16),
              Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                      color: AppPalette.of(context).infoFill,
                      borderRadius: BorderRadius.circular(12)),
                  child: Row(children: [
                    Icon(Icons.lock_outline_rounded,
                        size: 18, color: AppPalette.of(context).accentInk),
                    SizedBox(width: 10),
                    Expanded(
                        child: Text(
                            'Sign in to continue. We’ll take you right back.',
                            style: TextStyle(
                                color: AppPalette.of(context).accentInk,
                                fontSize: 12)))
                  ])),
            ],
            if (appleSignInSupported) ...[
              const SizedBox(height: 22),
              SignInWithAppleButton(
                onPressed: widget.store.busy ? null : _appleSignIn,
                height: 48,
                borderRadius: const BorderRadius.all(Radius.circular(24)),
              ),
            ],
            // Web order: Google sits ABOVE the email form, as an
            // outlined pill with the real brand mark. Shown only
            // when a Google client id is configured, since the
            // button cannot do anything without one.
            if (AppConfig.googleSignInConfigured) ...[
              SizedBox(height: appleSignInSupported ? 12 : 22),
              AuthPillButton(
                icon: const GoogleGLogo(size: 20),
                label: 'Login with Google',
                onPressed: widget.store.busy ? null : _googleSignIn,
              ),
              const SizedBox(height: 18),
              const Divider(height: 1),
            ],
            const SizedBox(height: 20),
            AuthPillButton(
              icon: const Icon(Icons.mail_outline_rounded, size: 20),
              label: _showEmailForm ? 'Hide Email Login' : 'Login with Email',
              onPressed: widget.store.busy
                  ? null
                  : () => setState(() => _showEmailForm = !_showEmailForm),
            ),
            if (_showEmailForm) ...[
              const SizedBox(height: 20),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                    labelText: 'Email Address',
                    hintText: 'your.email@example.com',
                    filled: true,
                    fillColor: AppPalette.of(context).background,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide:
                            BorderSide(color: AppPalette.of(context).border)),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide:
                            BorderSide(color: AppPalette.of(context).border))),
                validator: (v) => (v == null || !v.contains('@'))
                    ? 'Enter a valid email'
                    : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _password,
                obscureText: _obscure,
                autofillHints: const [AutofillHints.password],
                decoration: InputDecoration(
                  labelText: 'Password',
                  hintText: '••••••••••••••••',
                  filled: true,
                  fillColor: AppPalette.of(context).background,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                  enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide:
                          BorderSide(color: AppPalette.of(context).border)),
                  suffixIcon: IconButton(
                    icon: Icon(
                        _obscure ? Icons.visibility_off : Icons.visibility),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                validator: (v) =>
                    (v == null || v.isEmpty) ? 'Enter your password' : null,
                onFieldSubmitted: (_) => _submit(),
              ),
              if (widget.store.error != null) ...[
                const SizedBox(height: 10),
                Text(widget.store.error!,
                    style: const TextStyle(color: Colors.red, fontSize: 13)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.neutral800,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    minimumSize: const Size.fromHeight(48)),
                onPressed: widget.store.busy ? null : _submit,
                child: widget.store.busy
                    ? SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppPalette.of(context).surface))
                    : const Text('Sign In',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 16)),
              ),
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.center,
                child: TextButton(
                  onPressed: () => context.push('/reset-password'),
                  child: Text('Forgot your password?',
                      style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppPalette.of(context).accentInk)),
                ),
              ),
            ],
            const SizedBox(height: 4),
            // Wrap, not Row: the prompt plus the button do not fit
            // one line on a narrow phone (nor under the test
            // font), and a button should drop to the next line
            // rather than overflow.
            Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text("Don't have an account?",
                    style: TextStyle(
                        color: AppPalette.of(context).textSecondary,
                        fontSize: 14)),
                TextButton(
                  onPressed: () => context.push('/register'),
                  child: Text('Sign up',
                      style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppPalette.of(context).accentInk)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
