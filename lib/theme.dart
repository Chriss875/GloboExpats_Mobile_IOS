import 'package:flutter/material.dart';

/// GloboExpats mobile theme, derived from the web reference.
/// Primary brand blue `#1e40af` (hero/dark chrome), accent green for Sell
/// actions, slate neutral background.
class AppColors {
  AppColors._();
  static const Color brandBlue = Color(0xFF1E40AF); // web hero bg
  static const Color brandBlueDark = Color(0xFF172554);

  /// Web `brand.primary` gradient mid-stop (`from-[#1e40af] via-[#1e3a8a]`).
  static const Color brandBlueMid = Color(0xFF1E3A8A);

  /// Web hero banner stops (`via-blue-700 to-blue-600`) — the seller page
  /// and the Account tab's Shop profile banner.
  static const Color heroBlue700 = Color(0xFF1D4ED8);
  static const Color heroBlue600 = Color(0xFF2563EB);

  /// Web `brand.secondary` (tailwind.config.ts) — the amber half of the
  /// two-tone "Globo**expats**" wordmark. Distinct from [accentGreen], which
  /// is the Sell CTA.
  static const Color brandAmber = Color(0xFFF59E0B);

  /// Web `neutral-800` in their custom scale — the submit button fill on the
  /// auth screens, which is deliberately NOT the brand blue.
  static const Color neutral800 = Color(0xFF334155);

  static const Color accentGreen = Color(0xFF16A34A); // Sell CTA
  static const Color background = Color(0xFFF8FAFC); // slate-50
  static const Color surface = Colors.white;
  static const Color textPrimary = Color(0xFF0F172A); // slate-900
  static const Color textSecondary = Color(0xFF64748B); // slate-500
  static const Color border = Color(0xFFE2E8F0); // slate-200
  /// Web PriceDisplay `secondary`: prices are amber, never link-blue.
  static const Color price = brandAmber;
}

/// The neutral surface/text/border tokens, resolved for the ACTIVE brightness.
///
/// The brand "stage": the navy scenes — the welcome guide, the update
/// emblem, the Sell gem — that look the same in light AND dark mode on
/// purpose. They are not surfaces that should follow the theme, so they are
/// named here, beside the palette, instead of living as literals in widgets.
/// The Halal trust badge: the certification logo on its own white disc with
/// a soft green ring (web `HalalBadge`: `bg-white/95 border-emerald-200`).
/// Constant across themes — it is a certification mark, not chrome.
class HalalBadgeColors {
  HalalBadgeColors._();
  static const Color disc = Color(0xF2FFFFFF);
  static const Color ring = Color(0xFFA7F3D0);
  static const Color shadow = Color(0x26000000);
}

class BrandStage {
  BrandStage._();
  static const Color navy = Color(0xFF070F2B);

  /// Text and icons painted on the navy stage or a coloured gem.
  static const Color ink = Color(0xFFFFFFFF);

  /// The white cards and emblems that float on the stage, and their ink.
  static const Color card = Color(0xFFFFFFFF);
  static const Color cardTint = Color(0xFFDDE7FF);
  static const Color cardInk = Color(0xFF0F172A);
  static const Color cardInkMuted = Color(0xFF64748B);
  static const Color emblemInk = Color(0xFF1E40AF);

  /// The Next button's lower stop.
  static const Color buttonTint = Color(0xFFE0E7FF);

  /// The light that sweeps across a primary button.
  static const Color shimmer = Color(0x40FFFFFF);
  static const Color shimmerClear = Color(0x00FFFFFF);

  /// Frosted panels and secondary ink on a brand-blue card (the Account
  /// tab's shop card).
  static const Color glass = Color(0x1FFFFFFF);
  static const Color glassLine = Color(0x2EFFFFFF);
  static const Color inkSoft = Color(0xD1FFFFFF);
}

/// The Share Kit's printed artwork (web `share-cards.module.css`). A poster
/// is a picture that leaves the app, so its colours are the same in light
/// and dark mode — they are defined here, not resolved from the palette.
class ShareArt {
  ShareArt._();
  static const Color blue = Color(0xFF1E40AF);
  static const Color navy = Color(0xFF14275B);
  static const Color deepBlue = Color(0xFF17378F);
  static const Color frameBlue = Color(0xFF345BD0);
  static const Color frameBlueLight = Color(0xFF4166C2);
  static const Color orange = Color(0xFFFF9800);
  static const Color orangeLight = Color(0xFFFFC36B);
  static const Color orangeSoft = Color(0xFFFFB84D);
  static const Color orangeDeep = Color(0xFFB76B00);
  static const Color flatPrice = Color(0xFFFFBD59);
  static const Color white = Color(0xFFFFFFFF);
  static const Color muted = Color(0xFFE4EDFF);
  static const Color photo = Color(0xFFEEF1F6);
  static const Color whiteMuted = Color(0xFF465167);
  static const Color whitePhoto = Color(0xFFF2F4F7);
  static const Color whiteRule = Color(0xFFD8DFE9);
  static const Color minimal = Color(0xFF202124);
  static const Color minimalMuted = Color(0xFFD5D7DA);
  static const Color minimalPhoto = Color(0xFF2B2D30);
  static const Color rule = Color(0x35FFFFFF);
  static const Color shadow = Color(0x40091B50);
  static const Color swatchFill = Color(0x33FFFFFF);
  static const Color priceTag = Color(0xD914275B);
  static const Color collageShade = Color(0xB314275B);
  static const Color swatchLine = Color(0x80FFFFFF);

  /// The preview stage behind a poster in the share sheet (web `#f2f4f7`).
  static const Color stage = Color(0xFFF2F4F7);
}

/// [AppColors] is the light palette as literal constants — usable in `const`
/// widgets, which is why the app is written against it. Those constants cannot
/// follow a theme, so anything that must respond to dark mode reads its
/// neutrals from here instead: `AppPalette.of(context).surface`.
///
/// Brand and semantic colours (blue, green, amber, the status reds) are NOT
/// here: they carry meaning and stay put across both modes.
/// A black fill for buttons and badges — Selcom's black, used instead of red.
/// It stays black on the dark theme (a light fill there would glare), always
/// with white on it; black TEXT and outlines use `textPrimary` instead.
Color inkFill(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF000000)
        : AppPalette.of(context).textPrimary;

@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.background,
    required this.surface,
    required this.surfaceMuted,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.border,
    required this.borderStrong,
    required this.chrome,
    required this.chromeField,
    required this.accentInk,
    required this.infoFill,
    required this.infoBorder,
    required this.infoText,
    required this.infoTextStrong,
    required this.successFill,
    required this.successBorder,
    required this.successText,
    required this.successTextStrong,
    required this.warningFill,
    required this.warningBorder,
    required this.warningText,
    required this.warningTextStrong,
    required this.dangerFill,
    required this.dangerBorder,
    required this.dangerText,
    required this.dangerTextStrong,
  });

  /// Behind the scrollable content.
  final Color background;

  /// Cards, sheets, list groups.
  final Color surface;

  /// A panel that must read as recessed against [surface].
  final Color surfaceMuted;

  final Color textPrimary;
  final Color textSecondary;

  /// The faintest readable text - captions, disabled states, placeholders.
  final Color textMuted;

  final Color border;

  /// A border meant to be seen rather than merely felt (inputs, dividers
  /// inside a tinted panel).
  final Color borderStrong;

  /// The app's own chrome: the top bar. Brand blue in light, and in dark the
  /// raised surface — a saturated brand blue beside a dark page reads as a
  /// leftover light bar rather than as chrome. White stays the ink on it in
  /// both modes, so the wordmark and icons are unaffected.
  final Color chrome;

  /// The search field that sits ON [chrome].
  final Color chromeField;

  /// Tinted status panels, each a fill / border / on-fill text triple. Light
  /// mode uses the familiar blue-50 . blue-200 . blue-700 family; dark mode
  /// uses a low-alpha wash of the same hue with a LIGHT text colour, because
  /// the light pairing (blue-700 on blue-50) inverts to unreadable.
  /// Brand blue as INK — a label, an icon, a link on a page surface. The
  /// brand's own `#1E40AF` is near-black against a dark background, so the
  /// dark theme lightens it. Use [AppColors.brandBlue] only where the blue
  /// is a FILL carrying white ink.
  final Color accentInk;

  final Color infoFill;
  final Color infoBorder;
  final Color infoText;

  /// The HEADING shade of a tinted panel: a step darker in light mode than
  /// its body text, so a notice reads as title-then-text. In dark mode both
  /// go light and the heading is the BRIGHTER of the two. The light pairing
  /// (blue-950 title over blue-800 body on blue-50) inverts to two near-black
  /// inks on a navy panel, which is the "info text ... dont show well"
  /// report.
  final Color infoTextStrong;
  final Color successFill;
  final Color successBorder;
  final Color successText;
  final Color successTextStrong;
  final Color warningFill;
  final Color warningBorder;
  final Color warningText;
  final Color warningTextStrong;
  final Color dangerFill;
  final Color dangerBorder;
  final Color dangerText;
  final Color dangerTextStrong;

  static const light = AppPalette(
    background: AppColors.background,
    surface: Colors.white,
    surfaceMuted: Color(0xFFF1F5F9), // slate-100
    textPrimary: AppColors.textPrimary,
    textSecondary: AppColors.textSecondary,
    textMuted: Color(0xFF94A3B8), // slate-400
    border: AppColors.border,
    borderStrong: Color(0xFFCBD5E1), // slate-300
    chrome: AppColors.brandBlue,
    chromeField: Colors.white,
    infoFill: Color(0xFFEFF6FF), // blue-50
    infoBorder: Color(0xFFBFDBFE), // blue-200
    accentInk: AppColors.brandBlue,
    infoText: Color(0xFF1D4ED8), // blue-700
    infoTextStrong: Color(0xFF172554), // blue-950
    successFill: Color(0xFFECFDF5), // emerald-50
    successBorder: Color(0xFFA7F3D0), // emerald-200
    successText: Color(0xFF047857), // emerald-700
    successTextStrong: Color(0xFF064E3B), // emerald-950
    warningFill: Color(0xFFFFFBEB), // amber-50
    warningBorder: Color(0xFFFDE68A), // amber-200
    warningText: Color(0xFFB45309), // amber-700
    warningTextStrong: Color(0xFF451A03), // amber-950
    dangerFill: Color(0xFFFEF2F2), // red-50
    dangerBorder: Color(0xFFFECACA), // red-200
    dangerText: Color(0xFFB91C1C), // red-700
    dangerTextStrong: Color(0xFF7F1D1D), // red-950
  );

  /// Slate, not pure black: the brand blue stays legible on it and the cards
  /// keep a visible edge without a hard white border.
  static const dark = AppPalette(
    background: Color(0xFF0B1220),
    surface: Color(0xFF111A2B),
    surfaceMuted: Color(0xFF1B2638),
    textPrimary: Color(0xFFE2E8F0), // slate-200
    textSecondary: Color(0xFF94A3B8), // slate-400
    textMuted: Color(0xFF64748B), // slate-500
    border: Color(0xFF243044),
    borderStrong: Color(0xFF334155), // slate-700
    chrome: Color(0xFF111A2B),
    chromeField: Color(0xFF1B2638),
    infoFill: Color(0xFF15233C),
    infoBorder: Color(0xFF1E3A5F),
    accentInk: Color(0xFF60A5FA), // blue-400 — readable on the dark surface
    infoText: Color(0xFF93C5FD), // blue-300
    infoTextStrong: Color(0xFFBFDBFE), // blue-200
    successFill: Color(0xFF0E2A22),
    successBorder: Color(0xFF14513F),
    successText: Color(0xFF6EE7B7), // emerald-300
    successTextStrong: Color(0xFFA7F3D0), // emerald-200
    warningFill: Color(0xFF2B2113),
    warningBorder: Color(0xFF5A421B),
    warningText: Color(0xFFFCD34D), // amber-300
    warningTextStrong: Color(0xFFFDE68A), // amber-200
    dangerFill: Color(0xFF2E1517),
    dangerBorder: Color(0xFF5E2326),
    dangerText: Color(0xFFFCA5A5), // red-300
    dangerTextStrong: Color(0xFFFECACA), // red-200
  );

  static AppPalette of(BuildContext context) =>
      Theme.of(context).extension<AppPalette>() ?? light;

  @override
  AppPalette copyWith({
    Color? background,
    Color? surface,
    Color? surfaceMuted,
    Color? textPrimary,
    Color? textSecondary,
    Color? border,
    Color? textMuted,
    Color? borderStrong,
    Color? chrome,
    Color? chromeField,
    Color? accentInk,
    Color? infoFill,
    Color? infoBorder,
    Color? infoText,
    Color? infoTextStrong,
    Color? successFill,
    Color? successBorder,
    Color? successText,
    Color? successTextStrong,
    Color? warningFill,
    Color? warningBorder,
    Color? warningText,
    Color? warningTextStrong,
    Color? dangerFill,
    Color? dangerBorder,
    Color? dangerText,
    Color? dangerTextStrong,
  }) =>
      AppPalette(
        background: background ?? this.background,
        surface: surface ?? this.surface,
        surfaceMuted: surfaceMuted ?? this.surfaceMuted,
        textPrimary: textPrimary ?? this.textPrimary,
        textSecondary: textSecondary ?? this.textSecondary,
        border: border ?? this.border,
        textMuted: textMuted ?? this.textMuted,
        borderStrong: borderStrong ?? this.borderStrong,
        chrome: chrome ?? this.chrome,
        chromeField: chromeField ?? this.chromeField,
        infoFill: infoFill ?? this.infoFill,
        infoBorder: infoBorder ?? this.infoBorder,
        accentInk: accentInk ?? this.accentInk,
        infoText: infoText ?? this.infoText,
        infoTextStrong: infoTextStrong ?? this.infoTextStrong,
        successFill: successFill ?? this.successFill,
        successBorder: successBorder ?? this.successBorder,
        successText: successText ?? this.successText,
        successTextStrong: successTextStrong ?? this.successTextStrong,
        warningFill: warningFill ?? this.warningFill,
        warningBorder: warningBorder ?? this.warningBorder,
        warningText: warningText ?? this.warningText,
        warningTextStrong: warningTextStrong ?? this.warningTextStrong,
        dangerFill: dangerFill ?? this.dangerFill,
        dangerBorder: dangerBorder ?? this.dangerBorder,
        dangerText: dangerText ?? this.dangerText,
        dangerTextStrong: dangerTextStrong ?? this.dangerTextStrong,
      );

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    return AppPalette(
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceMuted: Color.lerp(surfaceMuted, other.surfaceMuted, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      border: Color.lerp(border, other.border, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      chrome: Color.lerp(chrome, other.chrome, t)!,
      chromeField: Color.lerp(chromeField, other.chromeField, t)!,
      infoFill: Color.lerp(infoFill, other.infoFill, t)!,
      infoBorder: Color.lerp(infoBorder, other.infoBorder, t)!,
      accentInk: Color.lerp(accentInk, other.accentInk, t)!,
      infoText: Color.lerp(infoText, other.infoText, t)!,
      infoTextStrong: Color.lerp(infoTextStrong, other.infoTextStrong, t)!,
      successFill: Color.lerp(successFill, other.successFill, t)!,
      successBorder: Color.lerp(successBorder, other.successBorder, t)!,
      successText: Color.lerp(successText, other.successText, t)!,
      successTextStrong: Color.lerp(successTextStrong, other.successTextStrong, t)!,
      warningFill: Color.lerp(warningFill, other.warningFill, t)!,
      warningBorder: Color.lerp(warningBorder, other.warningBorder, t)!,
      warningText: Color.lerp(warningText, other.warningText, t)!,
      warningTextStrong: Color.lerp(warningTextStrong, other.warningTextStrong, t)!,
      dangerFill: Color.lerp(dangerFill, other.dangerFill, t)!,
      dangerBorder: Color.lerp(dangerBorder, other.dangerBorder, t)!,
      dangerText: Color.lerp(dangerText, other.dangerText, t)!,
      dangerTextStrong: Color.lerp(dangerTextStrong, other.dangerTextStrong, t)!,
    );
  }
}

ThemeData buildAppTheme({Brightness brightness = Brightness.light}) {
  final dark = brightness == Brightness.dark;
  final palette = dark ? AppPalette.dark : AppPalette.light;
  // Dark mode lifts the brand blue: #1E40AF is a hero-banner colour and goes
  // muddy against a dark ground, so the scheme's primary steps up to blue-500
  // while brand chrome (the app bar, the wordmark) keeps the real brand blue.
  final primary = dark ? const Color(0xFF3B82F6) : AppColors.brandBlue;
  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    fontFamily: 'Inter',
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.brandBlue,
      brightness: brightness,
      primary: primary,
      surface: palette.surface,
    ),
    scaffoldBackgroundColor: palette.background,
    appBarTheme: AppBarTheme(
      backgroundColor: palette.surface,
      foregroundColor: palette.textPrimary,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
    ),
    dividerColor: palette.border,
    extensions: [palette],
  );

  return base.copyWith(
    textTheme: base.textTheme
        .apply(
          fontFamily: 'Inter',
          bodyColor: palette.textPrimary,
          displayColor: palette.textPrimary,
        )
        .copyWith(
          displayLarge: base.textTheme.displayLarge
              ?.copyWith(fontFamily: 'Lexend', fontWeight: FontWeight.w600),
          displayMedium: base.textTheme.displayMedium
              ?.copyWith(fontFamily: 'Lexend', fontWeight: FontWeight.w600),
          displaySmall: base.textTheme.displaySmall
              ?.copyWith(fontFamily: 'Lexend', fontWeight: FontWeight.w600),
          headlineLarge: base.textTheme.headlineLarge
              ?.copyWith(fontFamily: 'Lexend', fontWeight: FontWeight.w600),
          headlineMedium: base.textTheme.headlineMedium
              ?.copyWith(fontFamily: 'Lexend', fontWeight: FontWeight.w600),
          headlineSmall: base.textTheme.headlineSmall
              ?.copyWith(fontFamily: 'Lexend', fontWeight: FontWeight.w600),
        ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: palette.surface,
      selectedItemColor: primary,
      unselectedItemColor: palette.textSecondary,
      type: BottomNavigationBarType.fixed,
      elevation: 0,
      selectedLabelStyle:
          const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
      unselectedLabelStyle: const TextStyle(fontSize: 11),
    ),
    cardTheme: CardThemeData(
      color: palette.surface,
      surfaceTintColor: Colors.transparent,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: palette.surface,
      surfaceTintColor: Colors.transparent,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: palette.surface,
      surfaceTintColor: Colors.transparent,
    ),
    listTileTheme: ListTileThemeData(
      iconColor: palette.textSecondary,
      textColor: palette.textPrimary,
    ),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: ZoomPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
    }),
    filledButtonTheme: FilledButtonThemeData(
      style: ButtonStyle(
        // Every filled button in this app sits on a saturated fill we chose
        // ourselves — brand blue, the Sell green, the action red. Leaving the
        // label to the scheme meant a DARK ColorScheme handed back its own
        // dark `onPrimary`, so "Buy now" rendered navy-on-blue at night.
        // `FilledButton.tonal` is the one variant with a light fill, and both
        // of its two uses pass their own foreground.
        foregroundColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.disabled)
                ? palette.textMuted
                : Colors.white),
        minimumSize: const WidgetStatePropertyAll(Size(48, 50)),
        padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: 20, vertical: 13)),
        shape: const WidgetStatePropertyAll(StadiumBorder()),
        textStyle: const WidgetStatePropertyAll(
            TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
        animationDuration: const Duration(milliseconds: 180),
        overlayColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.pressed)
                ? Colors.white.withValues(alpha: .18)
                : null),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(48, 50)),
        padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: 18, vertical: 12)),
        shape: const WidgetStatePropertyAll(StadiumBorder()),
        side: WidgetStatePropertyAll(BorderSide(color: palette.border)),
        textStyle: const WidgetStatePropertyAll(
            TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
        animationDuration: const Duration(milliseconds: 180),
        overlayColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.pressed)
                ? AppColors.brandBlue.withValues(alpha: .08)
                : null),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(44, 44)),
        shape: const WidgetStatePropertyAll(StadiumBorder()),
        animationDuration: const Duration(milliseconds: 180),
      ),
    ),
    // Feedback stays above navigation and never becomes a page-wide banner.
    // Rounded floating notices preserve context while remaining easy to read.
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: dark ? const Color(0xFF243044) : AppColors.textPrimary,
      contentTextStyle: const TextStyle(
        color: Colors.white,
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
      insetPadding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
      ),
      elevation: 3,
    ),
  );
}

/// The dark counterpart of [buildAppTheme], handed to `MaterialApp.darkTheme`.
ThemeData buildAppDarkTheme() => buildAppTheme(brightness: Brightness.dark);
