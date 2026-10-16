import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/theme.dart';

/// Every filled button in this app sits on a fill we pick ourselves — brand
/// blue, the Sell green, the action red — while the LABEL was left to the
/// ColorScheme. A dark scheme's `onPrimary` is dark, correct for its own
/// light primary and wrong for ours, so "Buy now" rendered navy-on-blue at
/// night. No source-level rule could see this: the defect is the *absence*
/// of a foreground, not a light literal.
void main() {
  Color inkOf(ThemeData theme, {Set<WidgetState> states = const {}}) {
    final resolved = theme.filledButtonTheme.style?.foregroundColor;
    expect(resolved, isNotNull,
        reason: 'the filled-button theme must state its own label colour');
    return resolved!.resolve(states)!;
  }

  double contrast(Color fg, Color bg) {
    final a = fg.computeLuminance();
    final b = bg.computeLuminance();
    final hi = a > b ? a : b;
    final lo = a > b ? b : a;
    return (hi + 0.05) / (lo + 0.05);
  }

  for (final entry in {
    'light': buildAppTheme(),
    'dark': buildAppDarkTheme(),
  }.entries) {
    test('${entry.key}: a filled button reads on the brand fills', () {
      final ink = inkOf(entry.value);
      for (final fill in [
        ['brand blue', AppColors.brandBlue],
        ['Sell green', AppColors.accentGreen],
        ['action red', const Color(0xFFDC2626)],
      ]) {
        expect(contrast(ink, fill[1] as Color), greaterThanOrEqualTo(3.0),
            reason: '${entry.key}: button label on ${fill[0]}');
      }
    });
  }

  test('a disabled filled button is visibly muted, not just white', () {
    final theme = buildAppDarkTheme();
    expect(inkOf(theme, states: {WidgetState.disabled}),
        isNot(inkOf(theme)),
        reason: 'a disabled label that keeps the full-strength ink reads as '
            'tappable');
  });

  testWidgets('the rendered label is white on a brand-blue button in dark',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      darkTheme: buildAppDarkTheme(),
      themeMode: ThemeMode.dark,
      home: Scaffold(
        body: FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppColors.brandBlue),
          onPressed: () {},
          child: const Text('Buy now'),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    final label = tester.widget<Text>(find.text('Buy now'));
    final style = DefaultTextStyle.of(
            tester.element(find.text('Buy now')))
        .style
        .merge(label.style);
    expect(contrast(style.color!, AppColors.brandBlue),
        greaterThanOrEqualTo(3.0));
  });
}
