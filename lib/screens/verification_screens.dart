import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../theme.dart';
import '../auth/auth_store.dart';
import 'otp_input.dart';

/// Standalone email-verification screen (covers `/verify-email`).
///
/// Mirrors `app/verify-email/page.tsx`:
/// - shows the masked email the code was sent to;
/// - six-box code entry; **Verify** calls `verifySignupOtp` with the ENTERED
///   code — it never re-sends;
/// - "Resend" calls `sendSignupOtp` again behind a 60s cooldown;
/// - a wrong/expired code surfaces the backend message ("Wrong OTP",
///   "OTP has expired") and an expired one redirects back to `/register`
///   with a message, matching web behaviour of bouncing the user out.
class VerifyEmailScreen extends StatefulWidget {
  const VerifyEmailScreen({super.key, this.api, this.email = ''});
  final ApiClient? api;

  /// Email that received the code (web passes it as a query param).
  final String email;

  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  static const _resendCooldownSeconds = 60;

  late final ApiClient _api = widget.api ?? ApiClient();
  late final String _email = widget.email;
  bool _busy = false;
  bool _resending = false;
  bool _success = false;
  int _cooldown = 0;
  String? _error;
  String? _code;
  Timer? _cooldownTimer;

  @override
  void initState() {
    super.initState();
    if (_email.isNotEmpty) _startCooldown();
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    super.dispose();
  }


  /// Router-optional redirect (GoRouter.maybeOf returns null when the screen
  /// is mounted standalone, e.g. in widget tests).
  void _goRegister() {
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      router.go('/register');
    } else {
      Navigator.of(context).popUntil((r) => r.isFirst);
    }
  }

  /// Starts the 60s resend countdown (web `RESEND_COOLDOWN_SECONDS`).
  void _startCooldown() {
    if (_cooldown > 0) return;
    _cooldown = _resendCooldownSeconds;
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() => _cooldown--);
      if (_cooldown <= 0) t.cancel();
    });
  }

  /// Verifies [code]. Success shows the confirmation state and returns to
  /// login (web pushes `/login?verified=true&email=…`). A body saying the OTP
  /// has expired clears the flow and bounces back to register with a message.
  Future<void> _verify(String code) async {
    if (_email.isEmpty || code.length != 6 || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await _api.verifySignupOtp(_email, code);
      if (!mounted) return;
      if (result.verified) {
        setState(() {
          _success = true;
          _busy = false;
        });
        return;
      }
      final expired = result.message.toLowerCase().contains('expired');
      setState(() {
        _busy = false;
        _error = result.message.isEmpty
            ? 'Verification failed. Please check your code and try again.'
            : result.message;
        _code = null;
      });
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text('Verification Failed: ${_error ?? ''}'),
          behavior: SnackBarBehavior.floating,
        ));
      if (expired) {
        // Expired codes are cleared server-side; the user must start again.
        Future<void>.delayed(const Duration(milliseconds: 1200), () {
          if (mounted) _goRegister();
        });
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      AuthStore.instance?.handleUnauthorized();
      final expired = e.message.toLowerCase().contains('expired');
      setState(() {
        _busy = false;
        _error = e.message;
        _code = null;
      });
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text('Verification Failed: ${e.message}'),
          behavior: SnackBarBehavior.floating,
        ));
      if (expired) {
        Future<void>.delayed(const Duration(milliseconds: 1200), () {
          if (mounted) _goRegister();
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Verification failed. Please try again.'),
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  Future<void> _resend() async {
    if (_email.isEmpty || _cooldown > 0 || _resending) return;
    setState(() {
      _resending = true;
      _error = null;
    });
    try {
      await _api.sendSignupOtp(_email);
      if (!mounted) return;
      _startCooldown();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Code Sent! A new verification code has been sent to your email.'),
        behavior: SnackBarBehavior.floating,
      ));
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      if (mounted) {
        setState(() => _error = e.message);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Failed to Send Code: ${e.message}'),
          behavior: SnackBarBehavior.floating,
        ));
      }
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final masked = maskEmail(_email);
    return Scaffold(
      appBar: AppBar(title: const Text('Verify your email')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_success) ...[
                const Icon(Icons.check_circle, color: Colors.green, size: 64),
                const SizedBox(height: 12),
                const Text(
                  'Email Verified!',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 6),
                Text(
                  'Your email has been verified successfully. Redirecting to login...',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppPalette.of(context).textSecondary),
                ),
                const SizedBox(height: 18),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandBlue,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  onPressed: () => context.go('/login'),
                  child: const Text('Go to login', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ] else ...[
                Icon(Icons.mail_outline, color: AppPalette.of(context).accentInk, size: 56),
                const SizedBox(height: 12),
                const Text(
                  'Verify your email',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(
                  "We've emailed a one time security code to "
                  "${masked.isEmpty ? 'your inbox' : masked}. It should arrive in the next few "
                  'minutes. If you don\'t see it in your inbox, please check your spam/junk '
                  'folder. Please enter it below:',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 13),
                ),
                const SizedBox(height: 20),
                OtpBoxField(
                  autofocusFirst: true,
                  onChanged: (v) {
                    _code = v;
                    if (_error != null) setState(() => _error = null);
                  },
                  onCompleted: _verify,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).dangerFill,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, color: Colors.red, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(_error!,
                              style: const TextStyle(color: Colors.red, fontSize: 13)),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  key: const ValueKey('verify-email-submit'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandBlue,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  onPressed: (_busy || (_code ?? '').length != 6)
                      ? null
                      : () {
                          final code = OtpBoxField.of(context) ?? _code ?? '';
                          _verify(code);
                        },
                  child: _busy
                      ? SizedBox(
                          height: 20,
                          width: 20,
                          child:
                              CircularProgressIndicator(strokeWidth: 2, color: AppPalette.of(context).surface))
                      : const Text('Confirm email',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                ),
                const SizedBox(height: 12),
                Center(
                  child: _cooldown > 0
                      ? Text('Resend code in ${_cooldown}s',
                          style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 13))
                      : TextButton(
                          onPressed: _resending ? null : _resend,
                          child: Text(
                            _resending
                                ? 'Sending...'
                                : "Didn't receive the code? Resend",
                            style: TextStyle(
                              color: AppPalette.of(context).accentInk,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                ),
                const SizedBox(height: 4),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: BorderSide(color: AppPalette.of(context).border),
                  ),
                  onPressed: () => context.go('/register'),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.arrow_back, size: 16),
                      SizedBox(width: 6),
                      Text('Go back'),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
