import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../theme.dart';
import '../auth/auth_store.dart';

/// Password reset, mirroring the web reference `app/reset-password/page.tsx`:
///
/// 1. **Email** — request a code (`POST /api/v1/userManagement/reset-passwordEmail?email=`).
/// 2. **Verify OTP** — `POST /api/v1/userManagement/verify-otp?loggingEmail=&otp=`.
///    Sandbox quirk (verified by curl): a WRONG code answers HTTP 200 with the
///    body "Wrong OTP", so success is decided from the body message.
/// 3. **New password** — `POST /api/v1/userManagement/new-password`
///    `{loggingEmail,newPassword}`; requires >=6 chars + confirmation match.
/// 4. **Success** — confirmation card, then back to `/login`.
class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key, this.api});
  final ApiClient? api;

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

enum _ResetStep { email, otp, password, success }

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();

  _ResetStep _step = _ResetStep.email;
  final _email = TextEditingController();
  final _otp = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirm = TextEditingController();
  bool _showPassword = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _otp.dispose();
    _newPassword.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _showError(String msg) {
    if (!mounted) return;
    setState(() => _error = msg);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg),
        behavior: SnackBarBehavior.floating,
      ));
  }

  /// Step 1: send the reset code.
  Future<void> _sendOtp() async {
    final email = _email.text.trim();
    final re = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
    if (email.isEmpty) return _showError('Please enter your email address');
    if (!re.hasMatch(email)) return _showError('Please enter a valid email address');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _api.sendPasswordResetOtp(email);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _step = _ResetStep.otp;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('OTP Sent! Check your email for the verification code.'),
        behavior: SnackBarBehavior.floating,
      ));
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      setState(() => _busy = false);
      _showError(_isNotFoundMessage(e.message)
          ? 'No account found with this email address. Please check and try again.'
          : e.message);
    } catch (_) {
      setState(() => _busy = false);
      _showError('Failed to send OTP. Please try again.');
    }
  }

  /// Step 2: verify the code.
  Future<void> _verifyOtp() async {
    final otp = _otp.text.trim();
    if (otp.isEmpty) return _showError('Please enter the OTP code');
    if (otp.length < 4) return _showError('Please enter a valid OTP code');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result =
          await _api.verifyPasswordResetOtp(_email.text.trim(), otp);
      if (!mounted) return;
      setState(() => _busy = false);
      if (result.verified) {
        setState(() => _step = _ResetStep.password);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('OTP Verified! Now set your new password.'),
          behavior: SnackBarBehavior.floating,
        ));
      } else {
        // Body-level rejection ("Wrong OTP", "OTP has expired", "User not found").
        _showError(result.message.toLowerCase().contains('expired') ||
                result.message.toLowerCase().contains('wrong')
            ? 'Invalid or expired OTP. Please request a new one.'
            : result.message);
      }
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      setState(() => _busy = false);
      _showError(_isNotFoundMessage(e.message)
          ? 'OTP not found. Please request a new one.'
          : e.message);
    } catch (_) {
      setState(() => _busy = false);
      _showError('Failed to verify OTP. Please try again.');
    }
  }

  /// Step 3: set the new password.
  Future<void> _resetPassword() async {
    final pw = _newPassword.text;
    if (pw.isEmpty) return _showError('Please enter a new password');
    if (pw.length < 6) return _showError('Password must be at least 6 characters');
    if (pw != _confirm.text) return _showError('Passwords do not match');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _api.resetPasswordWithOtp(_email.text.trim(), pw);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _step = _ResetStep.success;
      });
      Future<void>.delayed(const Duration(seconds: 2), () {
        if (!mounted) return;
        // GoRouter.of asserts when absent, so probe the inherited element
        // first — standalone/test usage falls back to plain Navigator.
        final hasRouter =
            GoRouter.maybeOf(context) != null;
        if (hasRouter) {
          GoRouter.maybeOf(context)!.go('/login');
        } else {
          Navigator.of(context).popUntil((r) => r.isFirst);
        }
      });
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      setState(() => _busy = false);
      _showError(e.message);
    } catch (_) {
      setState(() => _busy = false);
      _showError('Failed to reset password. Please try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_step == _ResetStep.success) {
      return Scaffold(
        appBar: AppBar(title: const Text('Reset password')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.check_circle, color: Colors.green, size: 72),
                const SizedBox(height: 16),
                const Text('Password Reset!',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Text(
                  'Your password has been successfully reset. Redirecting to login...',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppPalette.of(context).textSecondary),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    SizedBox(width: 8),
                    Text('Taking you to login page',
                        style: TextStyle(fontSize: 13, color: AppPalette.of(context).textSecondary)),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextButton.icon(
                onPressed: () => context.go('/login'),
                icon: const Icon(Icons.arrow_back, size: 16),
                label: const Text('Back to login'),
              ),
              _ProgressIndicator(step: _stepNumber),
              const SizedBox(height: 18),
              Text(
                switch (_step) {
                  _ResetStep.email => 'Reset Your Password',
                  _ResetStep.otp => 'Verify Your Email',
                  _ => 'Set New Password',
                },
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              Text(
                switch (_step) {
                  _ResetStep.email =>
                    "Enter your email address and we'll send you a verification code.",
                  _ResetStep.otp => 'Enter the 6-digit code we sent to ${_email.text.trim()}',
                  _ => 'Create a strong password for your account.',
                },
                style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 18),
              ...switch (_step) {
                _ResetStep.email => [_emailForm()],
                _ResetStep.otp => [_otpForm()],
                _ => [_passwordForm()],
              },
              const Divider(height: 32),
              Center(
                child: TextButton(
                  onPressed: () => context.go('/login'),
                  child: Text.rich(
                    TextSpan(
                      text: "Remember your password? ",
                      style: TextStyle(color: AppPalette.of(context).textSecondary),
                      children: [
                        TextSpan(
                          text: 'Sign in',
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
            ],
          ),
        ),
      ),
    );
  }

  int get _stepNumber => switch (_step) {
        _ResetStep.email => 1,
        _ResetStep.otp => 2,
        _ResetStep.password => 3,
        _ => 3,
      };

  bool _isNotFoundMessage(String message) =>
      message.toLowerCase().contains('not found');

  Widget _emailForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _email,
          enabled: !_busy,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(
            labelText: 'Email Address',
            hintText: 'your.email@example.com',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.mail_outline),
          ),
        ),
        const SizedBox(height: 14),
        FilledButton(
          key: const ValueKey('reset-send-otp'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brandBlue,
            padding: const EdgeInsets.symmetric(vertical: 15),
          ),
          onPressed: _busy ? null : _sendOtp,
          child: _busy
              ? SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppPalette.of(context).surface))
              : const Text('Send Verification Code',
                  style: TextStyle(fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }

  Widget _otpForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _otp,
          enabled: !_busy,
          keyboardType: TextInputType.number,
          maxLength: 6,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 18, letterSpacing: 6),
          decoration: const InputDecoration(
            labelText: 'Verification Code',
            hintText: 'Enter 6-digit code',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.shield_outlined),
            helperText: 'Check your email inbox and spam folder',
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
        ],
        const SizedBox(height: 12),
        FilledButton(
          key: const ValueKey('reset-verify-otp'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brandBlue,
            padding: const EdgeInsets.symmetric(vertical: 15),
          ),
          onPressed: _busy ? null : _verifyOtp,
          child: _busy
              ? SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppPalette.of(context).surface))
              : const Text('Verify Code', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
        const SizedBox(height: 10),
        Center(
          child: TextButton(
            onPressed: _busy
                ? null
                : () async {
                    await _sendOtp();
                    if (mounted) _otp.clear();
                  },
            child: Text("Didn't receive the code? Resend",
                style: TextStyle(color: AppPalette.of(context).accentInk)),
          ),
        ),
        OutlinedButton(
          onPressed: _busy
              ? null
              : () => setState(() {
                    _step = _ResetStep.email;
                    _otp.clear();
                    _error = null;
                  }),
          child: const Text('Change Email Address'),
        ),
      ],
    );
  }

  Widget _passwordForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _newPassword,
          obscureText: !_showPassword,
          enabled: !_busy,
          decoration: InputDecoration(
            labelText: 'New Password',
            hintText: 'Enter new password',
            helperText: 'Must be at least 6 characters',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility),
              tooltip: _showPassword ? 'Hide new password' : 'Show new password',
              onPressed: () => setState(() => _showPassword = !_showPassword),
            ),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _confirm,
          obscureText: !_showPassword,
          enabled: !_busy,
          decoration: const InputDecoration(
            labelText: 'Confirm Password',
            hintText: 'Confirm new password',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.lock_outline),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          key: const ValueKey('reset-new-password'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brandBlue,
            padding: const EdgeInsets.symmetric(vertical: 15),
          ),
          onPressed: _busy ? null : _resetPassword,
          child: _busy
              ? SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppPalette.of(context).surface))
              : const Text('Reset Password', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

/// Three-dot progress strip mirroring the web card's numbered step indicator.
class _ProgressIndicator extends StatelessWidget {
  const _ProgressIndicator({required this.step});
  final int step;

  @override
  Widget build(BuildContext context) {
    final labels = ['Email', 'Verify OTP', 'New Password'];
    return Column(
      children: [
        Row(
          children: [
            for (var i = 1; i <= 3; i++) ...[
              Expanded(
                child: CircleAvatar(
                  radius: 15,
                  backgroundColor:
                      i <= step ? AppColors.brandBlue : AppPalette.of(context).border,
                  foregroundColor:
                      i <= step ? Colors.white : AppPalette.of(context).textSecondary,
                  child: i < step
                      ? const Icon(Icons.check, size: 16)
                      : Text('$i', style: const TextStyle(fontSize: 13)),
                ),
              ),
              if (i < 3)
                Expanded(
                  flex: 2,
                  child: Container(
                    height: 3,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    color: i < step ? AppColors.brandBlue : AppPalette.of(context).border,
                  ),
                ),
            ],
          ],
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            for (var i = 0; i < labels.length; i++)
              Text(
                labels[i],
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: i + 1 == step ? FontWeight.w700 : FontWeight.w400,
                  color:
                      i + 1 == step ? AppPalette.of(context).accentInk : AppPalette.of(context).textSecondary,
                ),
              ),
          ],
        ),
      ],
    );
  }
}
