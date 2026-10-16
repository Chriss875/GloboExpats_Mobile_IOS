import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';

/// Shared building blocks for the account screens (Profile information,
/// Addresses, Verification): soft filled inputs, pill tabs, titled section
/// cards and the web's big "choice" buttons. Every colour comes from the
/// palette, so all of it follows light and dark mode.

/// Soft, filled text inputs for everything below it: a muted fill, a hairline
/// border, a brand ring on focus. Fields that still pass their own
/// `border:` keep the shape but take these colours.
class AccountFormTheme extends StatelessWidget {
  const AccountFormTheme({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    OutlineInputBorder edge(Color c, [double w = 1]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: c, width: w),
        );
    final base = Theme.of(context);
    return Theme(
      data: base.copyWith(
        inputDecorationTheme: base.inputDecorationTheme.copyWith(
          filled: true,
          fillColor: palette.surfaceMuted,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          border: edge(palette.border),
          enabledBorder: edge(palette.border),
          disabledBorder: edge(palette.border),
          focusedBorder: edge(palette.accentInk, 1.6),
          errorBorder: edge(palette.dangerText),
          focusedErrorBorder: edge(palette.dangerText, 1.6),
          labelStyle: TextStyle(color: palette.textSecondary, fontSize: 14),
          floatingLabelStyle: TextStyle(
              color: palette.accentInk, fontWeight: FontWeight.w600),
          hintStyle: TextStyle(color: palette.textMuted),
          prefixIconColor: palette.textSecondary,
          helperStyle: TextStyle(color: palette.textSecondary, fontSize: 12),
        ),
      ),
      child: child,
    );
  }
}

class PillTab<T> {
  const PillTab(this.value, this.label, {this.icon, this.attention = false});
  final T value;
  final String label;
  final IconData? icon;

  /// A small red dot: this section still needs something.
  final bool attention;
}

/// Pill tabs in the style of MySpace's tab strip: a muted track and a brand
/// gradient pill under the chosen tab. Every tab shares the width.
class PillTabs<T> extends StatelessWidget {
  const PillTabs({
    super.key,
    required this.tabs,
    required this.selected,
    required this.onChanged,
  });
  final List<PillTab<T>> tabs;
  final T selected;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: palette.surfaceMuted,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.border),
      ),
      child: Row(children: [
        for (final tab in tabs)
          Expanded(
            child: _PillTabButton<T>(
              tab: tab,
              selected: tab.value == selected,
              onTap: () {
                if (tab.value == selected) return;
                HapticFeedback.selectionClick();
                onChanged(tab.value);
              },
            ),
          ),
      ]),
    );
  }
}

class _PillTabButton<T> extends StatelessWidget {
  const _PillTabButton(
      {required this.tab, required this.selected, required this.onTap});
  final PillTab<T> tab;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final ink = selected ? BrandStage.ink : palette.textSecondary;
    return Semantics(
      selected: selected,
      button: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          height: 40,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: selected
                ? const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.brandBlue, AppColors.heroBlue600])
                : null,
          ),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (tab.icon != null) ...[
              Icon(tab.icon, size: 16, color: ink),
              const SizedBox(width: 5),
            ],
            Flexible(
              child: Text(tab.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                      color: ink)),
            ),
            if (tab.attention) ...[
              const SizedBox(width: 4),
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                    color: palette.dangerText, shape: BoxShape.circle),
              ),
            ],
          ]),
        ),
      ),
    );
  }
}

/// A titled card grouping one part of a form.
class AccountSection extends StatelessWidget {
  const AccountSection({
    super.key,
    required this.child,
    this.title,
    this.icon,
    this.subtitle,
    this.trailing,
    this.padding = const EdgeInsets.all(16),
  });
  final Widget child;
  final String? title;
  final IconData? icon;
  final String? subtitle;
  final Widget? trailing;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null) ...[
            Row(children: [
              if (icon != null) ...[
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: palette.infoFill,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, size: 17, color: palette.accentInk),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title!,
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: palette.textPrimary)),
                    if (subtitle != null)
                      Text(subtitle!,
                          style: TextStyle(
                              fontSize: 12, color: palette.textSecondary)),
                  ],
                ),
              ),
              if (trailing != null) trailing!,
            ]),
            const SizedBox(height: 14),
          ],
          child,
        ],
      ),
    );
  }
}

/// Web `VerificationChoice`: a big tappable answer — icon tile, title, one
/// line of detail and an arrow.
class ChoiceTile extends StatelessWidget {
  const ChoiceTile({
    super.key,
    required this.title,
    required this.description,
    required this.icon,
    required this.onTap,
    this.compact = false,
  });
  final String title;
  final String description;
  final IconData icon;
  final VoidCallback onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Material(
      color: palette.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: EdgeInsets.all(compact ? 12 : 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: palette.border),
          ),
          child: Row(children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: palette.infoFill,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 21, color: palette.accentInk),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: palette.textPrimary)),
                  const SizedBox(height: 2),
                  Text(description,
                      style: TextStyle(
                          fontSize: 12.5,
                          height: 1.35,
                          color: palette.textSecondary)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.arrow_forward_rounded,
                size: 18, color: palette.textMuted),
          ]),
        ),
      ),
    );
  }
}

/// The eyebrow / title / description header of a step (web
/// `ConversationPanel` / `QuestionHeader`).
class StepHeader extends StatelessWidget {
  const StepHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.description,
  });
  final String eyebrow;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(eyebrow,
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: palette.accentInk)),
        const SizedBox(height: 6),
        Text(title,
            style: TextStyle(
                fontSize: 21,
                height: 1.3,
                fontWeight: FontWeight.w800,
                color: palette.textPrimary)),
        const SizedBox(height: 8),
        Text(description,
            style: TextStyle(
                fontSize: 13.5, height: 1.45, color: palette.textSecondary)),
      ],
    );
  }
}
