import 'package:flutter/material.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../auth/auth_store.dart';
import '../auth/apple_sign_in_service.dart';
import '../config.dart';
import '../theme.dart';
import '../widgets/auth_card.dart';
import '../widgets/brand_logo.dart';
import 'otp_input.dart';

/// Register screen, mirroring the web reference's three-stage signup
/// (`app/register/page.tsx`):
///
/// 1. **Info** — first/last name + email → `sendSignupOtp` (POST
///    `/api/v1/email/send-signup-Otp?signupEmail=&firstName=&lastName=`).
/// 2. **Verify** — six-box OTP → `verifySignupOtp` (POST
///    `/api/v1/email/verify-signup-otp` `{email,otp}`); success is confirmed
///    from the response body message (web `isSignupOtpVerified`).
/// 3. **Password** — password + confirm → `register` (POST `/api/v1/auth/register`
///    `{firstName,lastName,emailAddress,password}`), then auto-login.
///
/// Duplicate-email defense: the backend answers the register call with HTTP 409
/// `EMAIL_ALREADY_EXISTS`; the error text is surfaced inline (web shows it in a
/// destructive Alert).
class RegisterScreen extends StatefulWidget {
  final AuthStore store;
  const RegisterScreen({super.key, required this.store});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

/// RFC-5322-ish email check (same shape as web `validateEmail`).
bool isValidEmail(String email) {
  if (email.isEmpty) return false;
  final re = RegExp(
    "^[a-zA-Z0-9.!#\$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\$",
  );
  return re.hasMatch(email);
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  /// 1 = info/OTP send, 2 = OTP verify, 3 = password (web `step`).
  int _step = 1;

  /// Web parity: the name/email form is collapsed behind "Sign up with
  /// Email" (`showEmailForm`), so the first screen offers the two ways in
  /// rather than a form.
  bool _showEmailForm = false;
  bool _obscure = true;
  bool _sending = false;
  bool _verifying = false;

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_onStore);
  }

  void _onStore() {
    if (!mounted) return;
    setState(() {});
    if (widget.store.error != null && widget.store.error!.isNotEmpty) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
              content: Text(widget.store.error!),
              behavior: SnackBarBehavior.floating),
        );
    }
  }

  @override
  void dispose() {
    widget.store.removeListener(_onStore);
    _first.dispose();
    _last.dispose();
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String get _emailTrimmed => _email.text.trim();

  /// Signs up with Google, which on Google's side is the same call as
  /// signing in — an account is created on first use. A dismissed picker
  /// returns false with no error, so nothing is shown for it.
  Future<void> _googleSignUp() async {
    final ok = await widget.store.signInWithGoogle();
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Signed in with Google.'),
        behavior: SnackBarBehavior.floating,
      ));
      if (Navigator.of(context).canPop()) {
        Navigator.of(context).pop(true);
      }
    }
    // A failure already reached the user through the store listener.
  }

  Future<void> _appleSignUp() async {
    final ok = await widget.store.signInWithApple();
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Signed in with Apple.'),
        behavior: SnackBarBehavior.floating,
      ));
      if (Navigator.of(context).canPop()) Navigator.of(context).pop(true);
    }
  }

  /// Step 1 → 2: validate fields then send the signup OTP.
  Future<void> _sendOtp() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _sending = true;
      _obscure = true;
    });
    try {
      final ok = await widget.store.sendSignupOtp(
        email: _emailTrimmed,
        firstName: _first.text.trim(),
        lastName: _last.text.trim(),
      );
      if (!mounted) return;
      // AU-010 skeptic DECISIVE fix: a failed send (e.g. 409 DATA_CONFLICT on
      // an over-long address) returns false — advancing to the OTP step would
      // strand the user on a step they can never pass. Stay + surface error.
      if (!ok) {
        setState(() => _sending = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(widget.store.error ??
              'Could not send the verification code. Please try again.'),
          behavior: SnackBarBehavior.floating,
        ));
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            "Verification code sent. We've emailed you — check your spam folder too."),
        behavior: SnackBarBehavior.floating,
      ));
      setState(() {
        _step = 2;
        _sending = false;
      });
    } catch (_) {
      // Error already surfaced through AuthStore.error via the listener.
      if (mounted) setState(() => _sending = false);
    }
  }

  /// Step 2 → 3: verify the entered code. NEVER re-sends.
  Future<void> _verifyOtp(String code) async {
    if (code.length != 6) return;
    setState(() => _verifying = true);
    final ok =
        await widget.store.verifySignupOtp(email: _emailTrimmed, otp: code);
    if (!mounted) return;
    setState(() => _verifying = false);
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'Email verified! Now set your password to complete your account.'),
        behavior: SnackBarBehavior.floating,
      ));
      setState(() => _step = 3);
    }
  }

  /// Step 3: create the account and auto-login.
  Future<void> _completeRegistration() async {
    if (!_formKey.currentState!.validate()) return;
    if (_password.text.length < 8) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(
          content: Text('Password must be at least 8 characters.'),
          behavior: SnackBarBehavior.floating,
        ));
      return;
    }
    if (_password.text != _confirm.text) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(
          content: Text('Passwords do not match.'),
          behavior: SnackBarBehavior.floating,
        ));
      return;
    }
    final ok = await widget.store.register(
      firstName: _first.text.trim(),
      lastName: _last.text.trim(),
      email: _emailTrimmed,
      password: _password.text,
    );
    if (!ok || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content:
          Text('Registration Successful! Welcome! You can start buying now.'),
      duration: Duration(seconds: 4),
      behavior: SnackBarBehavior.floating,
    ));
    // Auto-login after registration (web parity) then hand back.
    await widget.store.login(email: _emailTrimmed, password: _password.text);
    if (mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = _sending || _verifying || widget.store.busy;
    return PopScope(
      canPop: true,
      // The same blue-gradient card as the login screen (web parity: both
      // auth pages are one white card on the brand gradient). Signup used to
      // be a bare white page under a titled app bar, which read as a
      // different product from the screen one tap away.
      child: AuthCardScaffold(
        child: Form(
          key: _formKey,
          autovalidateMode: AutovalidateMode.disabled,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: GloboExpatsWordmark(fontSize: 30)),
              const SizedBox(height: 14),
              Text(
                _step == 1
                    ? 'Create Your Account'
                    : _step == 2
                        ? 'Verify Your Email'
                        : 'Complete Security',
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: AppColors.neutral800),
              ),
              if (_step == 2) ...[
                const SizedBox(height: 4),
                Text(
                  'Enter the code sent to $_emailTrimmed',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppPalette.of(context).textSecondary),
                ),
              ],
              if (_step == 3) ...[
                const SizedBox(height: 4),
                Text(
                  'Secure your account with a strong password',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppPalette.of(context).textSecondary),
                ),
              ],
              // Match the web route: Google, Apple, then email. These only
              // appear on the first step — once a code has been sent the
              // account is already an email one.
              // Google sits above the email route and only on the first step
              // — once a code has been sent the account is already an email
              // one (web shows both buttons under `step === 1` only).
              if (_step == 1 && AppConfig.googleSignInConfigured) ...[
                const SizedBox(height: 22),
                AuthPillButton(
                  icon: const GoogleGLogo(size: 20),
                  label: 'Sign up with Google',
                  onPressed: busy ? null : _googleSignUp,
                ),
              ],
              if (_step == 1 && appleSignInSupported) ...[
                SizedBox(height: AppConfig.googleSignInConfigured ? 12 : 22),
                SignInWithAppleButton(
                  onPressed: busy ? null : _appleSignUp,
                  text: 'Sign up with Apple',
                  height: 54,
                  style: SignInWithAppleButtonStyle.whiteOutlined,
                  borderRadius: const BorderRadius.all(Radius.circular(27)),
                ),
              ],
              if (_step == 1 &&
                  (AppConfig.googleSignInConfigured ||
                      appleSignInSupported)) ...[
                const SizedBox(height: 18),
                const Divider(height: 1),
              ],
              if (_step == 1) ...[
                const SizedBox(height: 20),
                AuthPillButton(
                  icon: const Icon(Icons.mail_outline_rounded, size: 20),
                  label: _showEmailForm
                      ? 'Hide Email Signup'
                      : 'Sign up with Email',
                  onPressed: busy
                      ? null
                      : () => setState(() => _showEmailForm = !_showEmailForm),
                ),
              ],
              if (_step != 1 || _showEmailForm) ...[
                const SizedBox(height: 20),
                ..._buildStep(context, busy),
              ],
              const SizedBox(height: 10),
              // Wrap, not Row: the prompt plus the button do not fit one line
              // on a narrow phone (nor under the test font).
              Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text('Already have an account?',
                      style: TextStyle(
                          color: AppPalette.of(context).textSecondary,
                          fontSize: 14)),
                  TextButton(
                    onPressed: () =>
                        Navigator.of(context, rootNavigator: false).maybePop(),
                    child: Text('Sign In',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: AppPalette.of(context).accentInk)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildStep(BuildContext context, bool busy) {
    switch (_step) {
      case 2:
        return _otpStep(busy);
      case 3:
        return _passwordStep(busy);
      default:
        return _infoStep(busy);
    }
  }

  List<Widget> _infoStep(bool busy) {
    return [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: TextFormField(
              controller: _first,
              enabled: !_sending,
              decoration: const InputDecoration(
                labelText: 'First Name',
                hintText: 'First Name',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: TextFormField(
              controller: _last,
              enabled: !_sending,
              decoration: const InputDecoration(
                labelText: 'Last Name',
                hintText: 'Last Name',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
          ),
        ],
      ),
      const SizedBox(height: 14),
      TextFormField(
        controller: _email,
        enabled: !_sending,
        keyboardType: TextInputType.emailAddress,
        autofillHints: const [AutofillHints.email],
        decoration: const InputDecoration(
          labelText: 'Email Address',
          hintText: 'your.email@example.com',
          border: OutlineInputBorder(),
        ),
        validator: (v) {
          final value = v?.trim() ?? '';
          if (value.isEmpty) return 'Enter your email';
          if (!isValidEmail(value)) {
            return 'Please enter a valid personal email address.';
          }
          return null;
        },
      ),
      if (_sending) ...[
        const SizedBox(height: 14),
        _SignupEmailProgress(email: _emailTrimmed, phase: _SignupPhase.sending),
      ],
      const SizedBox(height: 20),
      FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brandBlue,
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
        onPressed: _sending ? null : _sendOtp,
        child: _sending
            ? SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: AppPalette.of(context).surface),
              )
            : const Text('Continue',
                style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    ];
  }

  List<Widget> _otpStep(bool busy) {
    return [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Flexible: the heading and the button share one line inside a
          // 440-wide card, so at a large text scale the heading has to give
          // rather than push the button off the edge.
          const Flexible(
            child: Text('Verification Code',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          ),
          TextButton(
            onPressed: busy
                ? null
                : () {
                    setState(() => _step = 1);
                  },
            child: const Text('Change Email'),
          ),
        ],
      ),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppPalette.of(context).infoFill, // blue-50
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(Icons.mail_outline, color: AppPalette.of(context).accentInk),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Be sure to check your JUNK or SPAM folder!',
                style: TextStyle(
                    color: AppPalette.of(context).accentInk,
                    fontWeight: FontWeight.w500),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 14),
      OtpBoxField(
        onChanged: (_) {},
        onCompleted: _verifyOtp,
        autofocusFirst: true,
      ),
      if (_verifying) ...[
        const SizedBox(height: 12),
        const LinearProgressIndicator(minHeight: 2),
      ],
      const SizedBox(height: 16),
      Center(
        child: TextButton(
          onPressed: busy ? null : _sendOtp,
          child: RichText(
            text: TextSpan(
              style: TextStyle(
                  color: AppPalette.of(context).textSecondary, fontSize: 13),
              children: [
                TextSpan(text: "Didn't receive the code? "),
                TextSpan(
                  text: 'Resend Code',
                  style: TextStyle(
                    color: AppPalette.of(context).accentInk,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      const SizedBox(height: 8),
      FilledButton(
        key: const ValueKey('register-verify-submit'),
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brandBlue,
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
        onPressed: busy
            ? null
            : () {
                // Read the joined code from the OTP boxes (never re-sends).
                final code = OtpBoxField.of(context);
                if (code == null || code.length != 6) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('Please enter the complete 6-digit code.'),
                    behavior: SnackBarBehavior.floating,
                  ));
                  return;
                }
                _verifyOtp(code);
              },
        child: _verifying
            ? SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: AppPalette.of(context).surface))
            : const Text('Verify & Continue',
                style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    ];
  }

  List<Widget> _passwordStep(bool busy) {
    return [
      TextFormField(
        controller: _password,
        obscureText: _obscure,
        autofillHints: const [AutofillHints.newPassword],
        decoration: InputDecoration(
          labelText: 'Create Password',
          hintText: 'At least 8 characters',
          helperText: 'Must be at least 8 characters',
          border: const OutlineInputBorder(),
          suffixIcon: IconButton(
            icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
            tooltip: _obscure ? 'Show password' : 'Hide password',
            onPressed: () => setState(() => _obscure = !_obscure),
          ),
        ),
        validator: (v) => (v == null || v.isEmpty) ? 'Enter a password' : null,
      ),
      const SizedBox(height: 14),
      TextFormField(
        controller: _confirm,
        obscureText: _obscure,
        autofillHints: const [AutofillHints.newPassword],
        decoration: const InputDecoration(
          labelText: 'Confirm Password',
          hintText: 'Repeat password',
          border: OutlineInputBorder(),
        ),
        validator: (v) =>
            (v == null || v.isEmpty) ? 'Re-enter your password' : null,
      ),
      const SizedBox(height: 20),
      FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brandBlue,
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
        onPressed: busy ? null : _completeRegistration,
        child: widget.store.busy
            ? SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: AppPalette.of(context).surface))
            : const Text('Complete Registration',
                style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    ];
  }
}

enum _SignupPhase { sending, queued }

/// Blue status card mirroring the reference `SignupEmailProgress` component.
class _SignupEmailProgress extends StatelessWidget {
  const _SignupEmailProgress({required this.email, required this.phase});
  final String email;
  final _SignupPhase phase;

  @override
  Widget build(BuildContext context) {
    final queued = phase == _SignupPhase.queued;
    return Container(
      key: const ValueKey('signup-email-progress'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).infoFill,
        border: Border.all(color: AppPalette.of(context).infoBorder),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: AppPalette.of(context).surface,
            child: Icon(Icons.mark_email_read_outlined,
                size: 18, color: AppPalette.of(context).accentInk),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  queued
                      ? "We've sent your verification code"
                      : 'Preparing your verification code',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Text(
                  queued
                      ? "We've sent an email to $email. Make sure to check your spam folder too."
                      : "We're sending it to $email. Keep this page open; this usually takes a few seconds.",
                  style: TextStyle(
                      fontSize: 12,
                      color: AppPalette.of(context).textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
