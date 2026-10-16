import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';

/// Reads the currently entered code from the nearest [OtpBoxField] in the
/// tree (lets a submit button outside the field read the joined value without
/// hoisting state).
String? otpCodeOfContext(BuildContext context) {
  final state = context.findAncestorStateOfType<_OtpBoxFieldState>();
  if (state == null) return null;
  final code = state.value;
  return code.isEmpty ? null : code;
}

/// Six-box one-time-code input, mirroring the web reference's split digit
/// boxes (`components/ui/otp-input.tsx` and the register page's digit row).
///
/// - Digits only; typing a digit advances focus to the next box.
/// - Pasting (or typing) a multi-digit string into any box distributes the
///   digits across all boxes (web `handleOtpPaste` parity).
/// - [onChanged] fires with the joined value on every edit; [onCompleted]
///   fires once every box is filled (web `onComplete`).
class OtpBoxField extends StatefulWidget {
  const OtpBoxField({
    super.key,
    this.length = 6,
    this.onChanged,
    this.onCompleted,
    this.enabled = true,
    this.autofocusFirst = false,
  });

  /// Joined code from the nearest [OtpBoxField] above [context], or null.
  static String? of(BuildContext context) => otpCodeOfContext(context);

  final int length;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onCompleted;
  final bool enabled;
  final bool autofocusFirst;

  @override
  State<OtpBoxField> createState() => _OtpBoxFieldState();
}

class _OtpBoxFieldState extends State<OtpBoxField> {
  late final List<TextEditingController> _controllers;
  late final List<FocusNode> _focusNodes;

  @override
  void initState() {
    super.initState();
    _controllers =
        List.generate(widget.length, (_) => TextEditingController());
    _focusNodes = List.generate(widget.length, (_) => FocusNode());
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  /// Joined digits across every box (the current code).
  String get value => _controllers.map((c) => c.text).join();

  void _emit() {
    widget.onChanged?.call(value);
    if (value.length == widget.length) {
      widget.onCompleted?.call(value);
    }
  }

  void _handleChange(int index, String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 1) {
      // Paste / swipe-typing: spread across the boxes from the first box.
      for (var i = 0; i < widget.length; i++) {
        _controllers[i].text = i < digits.length ? digits[i] : '';
      }
      final target = digits.length.clamp(0, widget.length - 1);
      _focusNodes[target].requestFocus();
    } else {
      _controllers[index].text = digits;
      if (digits.isNotEmpty && index < widget.length - 1) {
        _focusNodes[index + 1].requestFocus();
      }
    }
    setState(() {});
    _emit();
  }

  void _handleBackspace(int index) {
    if (_controllers[index].text.isEmpty && index > 0) {
      _controllers[index - 1].clear();
      _focusNodes[index - 1].requestFocus();
      setState(() {});
      _emit();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Verification code',
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(widget.length, (i) {
          return Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: i == widget.length - 1 ? 0 : 8),
              child: CallbackShortcuts(
                bindings: {
                  const SingleActivator(LogicalKeyboardKey.backspace): () =>
                      _handleBackspace(i),
                },
                child: TextField(
                  controller: _controllers[i],
                  focusNode: _focusNodes[i],
                  enabled: widget.enabled,
                  autofocus: widget.autofocusFirst && i == 0,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: AppPalette.of(context).textPrimary,
                  ),
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(
                    counterText: '',
                    filled: true,
                    fillColor: AppPalette.of(context).background,
                    contentPadding: const EdgeInsets.symmetric(vertical: 14),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: AppPalette.of(context).border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(
                        color: AppColors.brandBlue,
                        width: 2,
                      ),
                    ),
                  ),
                  onChanged: (v) => _handleChange(i, v),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

/// Masks an email for display, web parity with `/verify-email`
/// (`email.replace(/(.{2})(.+)(@.+)/, '$1***$3')`).
String maskEmail(String email) {
  final at = email.indexOf('@');
  if (at <= 0) return email;
  final local = email.substring(0, at);
  if (local.length <= 2) return email;
  return '${local.substring(0, 2)}***${email.substring(at)}';
}
