import 'package:flutter/material.dart';

import 'storage/kv_store.dart';

/// The app's light/dark preference, persisted across restarts.
///
/// Three states, matching what every OS settings panel offers: follow the
/// system, or pin light/dark regardless of it.
///
/// LIGHT is the default, not "system". Dark mode is still being swept screen
/// by screen, so a phone set to dark used to open the app straight into the
/// least-finished surface. Following the system is one tap away in
/// Appearance, and a choice already made is honoured — only accounts that
/// never picked get light.
///
/// [KvStore] is loaded before `runApp`, so [restore] is synchronous and the
/// first frame already paints in the right mode — no flash of the wrong theme.
class ThemeController extends ChangeNotifier {
  ThemeController._();
  static final ThemeController instance = ThemeController._();

  static const _key = 'theme_mode';

  /// What an account that has never opened Appearance gets.
  static const ThemeMode defaultMode = ThemeMode.light;

  ThemeMode _mode = defaultMode;
  ThemeMode get mode => _mode;

  /// Read the persisted choice. Safe to call before the store has loaded — an
  /// unreadable or unknown value simply leaves the system default in place.
  void restore() {
    _mode = _parse(KvStore.instance.getString(_key));
  }

  Future<void> setMode(ThemeMode mode) async {
    if (_mode == mode) return;
    _mode = mode;
    notifyListeners();
    await KvStore.instance.setString(_key, mode.name);
  }

  static ThemeMode _parse(String? raw) => switch (raw) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        // An explicit "system" is a choice the user made and it stands; an
        // absent or unreadable value falls to the default.
        'system' => ThemeMode.system,
        _ => defaultMode,
      };

  /// What the setting row reads out loud.
  static String labelFor(ThemeMode mode) => switch (mode) {
        ThemeMode.light => 'Light',
        ThemeMode.dark => 'Dark',
        ThemeMode.system => 'System',
      };

  static IconData iconFor(ThemeMode mode) => switch (mode) {
        ThemeMode.light => Icons.light_mode_outlined,
        ThemeMode.dark => Icons.dark_mode_outlined,
        ThemeMode.system => Icons.brightness_auto_outlined,
      };
}
