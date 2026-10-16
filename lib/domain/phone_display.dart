/// Splitting a stored E.164 number for display — the read-only half of web
/// `lib/international-phone.ts` (`parseInternationalPhone`).
///
/// The sell and checkout forms never let the seller type a number here: it is
/// pulled from their profile, and the web still shows it the way it shows an
/// editable one — a country box holding the dial code, then the national
/// digits. Only the display split is ported; nothing here builds a number to
/// send.
library;

import 'countries.dart';

/// Tanzania, like the web's `DEFAULT_PHONE_COUNTRY_ISO`.
const String defaultDialCode = '+255';

/// Dial code → flag, for the country box: every country the phone picker
/// lists. Where two share a code (+1, +7) the first listed wins. A number
/// whose code is not listed still renders: it keeps its own `+…` prefix and a
/// neutral flag.
final Map<String, String> kDialCodeFlags = () {
  final flags = <String, String>{};
  for (final c in kCountries) {
    flags.putIfAbsent(c.dialCode, () => c.flag);
  }
  return flags;
}();

class DisplayPhone {
  final String dialCode;
  final String nationalNumber;

  /// The flag for [dialCode], or a globe when the code is not one we list.
  final String flag;
  const DisplayPhone(this.dialCode, this.nationalNumber, this.flag);
}

/// Splits [value] into its dial code and national digits.
///
/// Longest dial code wins (+255 before +25), matching the web's sort. A value
/// with no `+` is treated as national digits under [fallbackDial], and a lone
/// leading trunk zero is kept — it is what the seller's profile shows.
DisplayPhone splitPhoneForDisplay(String? value,
    {String fallbackDial = defaultDialCode}) {
  final raw = (value ?? '').trim();
  String flagFor(String dial) => kDialCodeFlags[dial] ?? '🌐';

  if (raw.startsWith('+')) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    final codes = kDialCodeFlags.keys.toList()
      ..sort((a, b) => b.length.compareTo(a.length));
    for (final code in codes) {
      if (digits.startsWith(code.substring(1))) {
        return DisplayPhone(
            code, digits.substring(code.length - 1), flagFor(code));
      }
    }
    // An unlisted country: show what it says rather than mislabelling it.
    return DisplayPhone('+${digits.isEmpty ? '' : digits.substring(0, 1)}',
        digits.isEmpty ? '' : digits.substring(1), '🌐');
  }

  return DisplayPhone(
      fallbackDial, raw.replaceAll(RegExp(r'\D'), ''), flagFor(fallbackDial));
}
