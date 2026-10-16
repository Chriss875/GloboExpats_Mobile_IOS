import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/theme.dart';

/// "all text that use that very dark blue in dark mode dont show well
/// especially the info text telling abt smth that usualy have like a light
/// blue bg".
///
/// The brand blue (#1E40AF) and its darker relatives are correct as a FILL
/// carrying white ink. As INK they are near-black, so on a dark surface —
/// or on the navy the blue-50 info panels become in dark mode — they all but
/// disappear. Ink has to come from the theme.
void main() {
  double luminance(Color c) => c.computeLuminance();

  double contrast(Color a, Color b) {
    final l1 = luminance(a), l2 = luminance(b);
    final hi = l1 > l2 ? l1 : l2;
    final lo = l1 > l2 ? l2 : l1;
    return (hi + 0.05) / (lo + 0.05);
  }

  group('the dark palette', () {
    test('keeps brand ink readable on every dark background', () {
      const dark = AppPalette.dark;
      for (final pair in <(String, Color, Color)>[
        ('accentInk on the page', dark.accentInk, dark.background),
        ('accentInk on a card', dark.accentInk, dark.surface),
        ('accentInk on an info panel', dark.accentInk, dark.infoFill),
        ('info body', dark.infoText, dark.infoFill),
        ('info heading', dark.infoTextStrong, dark.infoFill),
        ('success heading', dark.successTextStrong, dark.successFill),
        ('warning heading', dark.warningTextStrong, dark.warningFill),
        ('danger heading', dark.dangerTextStrong, dark.dangerFill),
      ]) {
        expect(contrast(pair.$2, pair.$3), greaterThanOrEqualTo(4.5),
            reason: '${pair.$1} fails WCAG AA for body text');
      }
    });

    test('shows a panel heading more strongly than its body', () {
      // Light mode makes the heading DARKER than the body; dark mode has to
      // invert that relationship, not keep it.
      const light = AppPalette.light;
      const dark = AppPalette.dark;
      expect(luminance(light.infoTextStrong),
          lessThan(luminance(light.infoText)));
      expect(luminance(dark.infoTextStrong),
          greaterThan(luminance(dark.infoText)));
    });

    test('leaves light mode exactly as it was', () {
      // The *Strong tokens were introduced to HOLD the literals that were in
      // the screens, so nothing moved in light mode.
      const light = AppPalette.light;
      expect(light.accentInk, AppColors.brandBlue);
      expect(light.infoTextStrong, const Color(0xFF172554)); // blue-950
      expect(light.successTextStrong, const Color(0xFF064E3B)); // emerald-950
      expect(light.warningTextStrong, const Color(0xFF451A03)); // amber-950
      expect(light.dangerTextStrong, const Color(0xFF7F1D1D)); // red-950
    });
  });

  group('the source', () {
    /// A colour used as the `color:` of a text or icon constructor — ink, as
    /// opposed to the same value used as a fill, which is fine in both modes.
    RegExp inkUse(String value) => RegExp(
          r'(?:TextStyle|TextSpan|Icon|IconTheme(?:Data)?)\((?:[^()]|\([^()]*\))*?'
          r'color:\s*(?:[^,()]*\?\s*)?'
          '$value'
          r'\b',
          dotAll: true,
        );

    final brandInk = inkUse(r'AppColors\.brandBlue');

    List<File> libSources() => Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))
        .where((f) => !f.path.replaceAll(r'\', '/').endsWith('lib/theme.dart'))
        .toList();

    test('no longer paints text or icons with the raw brand blue', () {
      final offenders = <String>[];
      for (final file in libSources()) {
        for (final m in brandInk.allMatches(file.readAsStringSync())) {
          offenders.add('${file.path}: ${m.group(0)!.split('\n').last.trim()}');
        }
      }
      expect(offenders, isEmpty,
          reason: 'brand blue as INK is near-black in dark mode — use '
              'AppPalette.of(context).accentInk');
    });

    test('keeps the very dark status inks out of the screens', () {
      // blue-800/900/950, emerald-950, amber-950, red-950: the panel
      // headings and bodies. Each now has a token that inverts. The same
      // values as a FILL are untouched — the brand-blue chrome, the home
      // hero gradient and a status pill's own background are all correct in
      // both modes.
      final banned = inkUse(
          r'(?:const )?Color\(0xFF(?:1E40AF|1E3A8A|172554|064E3B|451A03|7F1D1D)\)');
      final offenders = <String>[];
      for (final file in libSources()) {
        for (final m in banned.allMatches(file.readAsStringSync())) {
          offenders.add('${file.path}: ${m.group(0)!.split('\n').last.trim()}');
        }
      }
      expect(offenders, isEmpty,
          reason: 'these invert to unreadable — read them from AppPalette');
    });
  });
}
