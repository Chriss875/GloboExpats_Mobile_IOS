import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/theme.dart';

/// Dark mode reaches a screen only if that screen asks the THEME for its
/// neutrals. Every light-mode literal left in the source is a patch of the app
/// that stays white when the rest goes dark.
///
/// These are ratchets, not absolutes: a handful of sites legitimately cannot
/// resolve a palette (a `static const` field, a helper with no BuildContext),
/// so the budgets below record where the migration landed. They may fall; if a
/// change pushes one up, that change is re-introducing a light-only colour and
/// should read its neutral from [AppPalette] instead.
void main() {
  /// The light-palette neutrals: slate/gray text, surfaces and borders, plus
  /// the tinted status-panel families. Brand and semantic colours (the action
  /// red, brand blues, Sell green, price amber) are deliberately absent —
  /// those mean the same thing in both modes and are meant to stay literal.
  final neutralLiteral = RegExp(
    r'Color\(0xFF(0F172A|020617|1E293B|475569|64748B|6B7280|94A3B8'
    r'|F8FAFC|F1F5F9|F9FAFB|E2E8F0|E5E7EB|CBD5E1|D1D5DB'
    r'|EFF6FF|DBEAFE|BFDBFE|1D4ED8|ECFDF5|D1FAE5|A7F3D0|047857|065F46'
    r'|FFFBEB|FEF3C7|FDE68A|B45309|92400E|78350F'
    r'|FEF2F2|FEE2E2|FECACA|B91C1C)\)'
    r'|AppColors\.(textPrimary|textSecondary|border|background|surface)\b',
  );
  final whiteFill = RegExp(r'\bcolor:\s*Colors\.white\b(?!\.)');

  List<File> libSources() {
    final dir = Directory('lib');
    if (!dir.existsSync()) {
      fail('run this from the package root; lib/ was not found');
    }
    return dir
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))
        // theme.dart IS the palette: its literals are the definition itself.
        .where((f) => !f.path.replaceAll(r'\', '/').endsWith('lib/theme.dart'))
        .toList();
  }

  int countIn(RegExp pattern) {
    var n = 0;
    for (final file in libSources()) {
      n += pattern.allMatches(file.readAsStringSync()).length;
    }
    return n;
  }

  test('light-only neutrals stay within the post-migration budget', () {
    // Was ~700 before the migration; 82 after the first sweep, 43 after the
    // third, 26 once the product page, checkout and the sell wizard threaded
    // a context into their context-less helpers.
    expect(countIn(neutralLiteral), lessThanOrEqualTo(24),
        reason: 'a new hardcoded light neutral will stay white in dark mode — '
            'read it from AppPalette.of(context) instead');
  });

  test('white surface fills stay within the post-migration budget', () {
    // The survivors are white INK on the brand-blue chrome, which is correct
    // in both modes, not white surfaces. 39 since the header's currency
    // toggle joined them — its code label sits on that same blue bar.
    expect(countIn(whiteFill), lessThanOrEqualTo(39),
        reason: 'a new `color: Colors.white` card fill will not follow the '
            'theme — use AppPalette.of(context).surface');
  });

  test('no new opaque near-white surface literals', () {
    // The neutral ratchet above keys on a hand-kept list of Tailwind hexes,
    // and that list is how `Color(0xFFF7FAFF)` — the product page's own
    // Scaffold, one shade off slate-50 — survived three passes and showed as
    // a white band behind the sticky Buy bar. This rule does not care what a
    // colour is called: opaque and bright in every channel is a light-mode
    // surface.
    final literal = RegExp(r'Color\(0x([0-9A-Fa-f]{8})\)');
    const inkCtors = {'TextStyle', 'Icon', 'IconTheme', 'IconThemeData',
        'Shadow'};

    /// The identifier in front of the nearest unclosed bracket: white INSIDE
    /// a TextStyle is lettering on a brand ground and is meant to stay.
    String enclosingCtor(String src, int offset) {
      var depth = 0;
      var i = offset;
      while (i > 0) {
        i -= 1;
        final c = src[i];
        if (c == ')' || c == ']' || c == '}') {
          depth += 1;
        } else if (c == '(' || c == '[' || c == '{') {
          if (depth == 0) {
            var j = i;
            bool wordChar(String ch) =>
                RegExp(r'[A-Za-z0-9_.]').hasMatch(ch);
            while (j > 0 && wordChar(src[j - 1])) {
              j -= 1;
            }
            return src.substring(j, i).split('.').first;
          }
          depth -= 1;
        }
      }
      return '';
    }

    final offenders = <String>[];
    for (final file in libSources()) {
      final src = file.readAsStringSync();
      for (final m in literal.allMatches(src)) {
        final argb = int.parse(m.group(1)!, radix: 16);
        final a = argb >> 24;
        final r = (argb >> 16) & 0xFF;
        final g = (argb >> 8) & 0xFF;
        final b = argb & 0xFF;
        // Translucent counts too: white at 40% over a dark page is still a
        // pale grey block — that is what `Color(0x66EFF6FF)` did to the
        // product page's "We handle delivery" panel. Below 0x20 the colour is
        // a hairline or a scrim, not a surface.
        if (a < 0x20) continue;
        if (r < 0xDC || g < 0xDC || b < 0xDC) continue;
        if (inkCtors.contains(enclosingCtor(src, m.start))) continue;
        final line = '\n'.allMatches(src.substring(0, m.start)).length + 1;
        offenders.add('${file.path}:$line ${m.group(0)}');
      }
    }
    // The survivors: the two remaining `_StatusPalette` chip fills, which are
    // a complete light badge table, and the app bar's own white pulse ring.
    expect(offenders.length, lessThanOrEqualTo(4),
        reason: 'opaque near-white literals found:\n'
            '${offenders.join('\n')}');
  });

  test('every palette token differs between the two modes where it must', () {
    // A token that forgot to change is a token that breaks one of the modes.
    final pairs = <String, List<Color>>{
      'background': [AppPalette.light.background, AppPalette.dark.background],
      'surface': [AppPalette.light.surface, AppPalette.dark.surface],
      'surfaceMuted': [
        AppPalette.light.surfaceMuted,
        AppPalette.dark.surfaceMuted
      ],
      'textPrimary': [AppPalette.light.textPrimary, AppPalette.dark.textPrimary],
      'border': [AppPalette.light.border, AppPalette.dark.border],
      'chrome': [AppPalette.light.chrome, AppPalette.dark.chrome],
      'chromeField': [
        AppPalette.light.chromeField,
        AppPalette.dark.chromeField
      ],
      'infoFill': [AppPalette.light.infoFill, AppPalette.dark.infoFill],
      'infoText': [AppPalette.light.infoText, AppPalette.dark.infoText],
      'successFill': [AppPalette.light.successFill, AppPalette.dark.successFill],
      'successText': [AppPalette.light.successText, AppPalette.dark.successText],
      'warningFill': [AppPalette.light.warningFill, AppPalette.dark.warningFill],
      'warningText': [AppPalette.light.warningText, AppPalette.dark.warningText],
      'dangerFill': [AppPalette.light.dangerFill, AppPalette.dark.dangerFill],
      'dangerText': [AppPalette.light.dangerText, AppPalette.dark.dangerText],
    };
    pairs.forEach((name, both) {
      expect(both[0], isNot(both[1]), reason: '$name is identical in both modes');
    });
  });

  test('text stays legible on the surface it sits on, in both modes', () {
    double contrast(Color fg, Color bg) {
      final a = fg.computeLuminance();
      final b = bg.computeLuminance();
      final hi = a > b ? a : b;
      final lo = a > b ? b : a;
      return (hi + 0.05) / (lo + 0.05);
    }

    for (final entry in {
      'light': AppPalette.light,
      'dark': AppPalette.dark,
    }.entries) {
      final p = entry.value;
      // WCAG AA for body text is 4.5:1; the tinted panels carry short labels,
      // so they are held to the 3:1 large-text bar.
      expect(contrast(p.textPrimary, p.surface), greaterThanOrEqualTo(4.5),
          reason: '${entry.key}: primary text on surface');
      expect(contrast(p.textPrimary, p.background), greaterThanOrEqualTo(4.5),
          reason: '${entry.key}: primary text on background');
      expect(contrast(p.textSecondary, p.surface), greaterThanOrEqualTo(3.0),
          reason: '${entry.key}: secondary text on surface');
      // The top bar's ink is white in both modes, so the chrome behind it has
      // to stay dark enough to carry it.
      expect(contrast(const Color(0xFFFFFFFF), p.chrome),
          greaterThanOrEqualTo(4.5),
          reason: '${entry.key}: white ink on the top bar');
      for (final panel in [
        ['info', p.infoText, p.infoFill],
        ['success', p.successText, p.successFill],
        ['warning', p.warningText, p.warningFill],
        ['danger', p.dangerText, p.dangerFill],
      ]) {
        expect(contrast(panel[1] as Color, panel[2] as Color),
            greaterThanOrEqualTo(3.0),
            reason: '${entry.key}: ${panel[0]} text on its own fill');
      }
    }
  });
}
