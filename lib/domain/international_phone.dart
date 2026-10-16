/// Building and checking a WhatsApp number to SEND — the writing half of web
/// `lib/international-phone.ts` (`phone_display.dart` is the reading half).
///
/// The backend (`ContactPhone.toE164`) rejects anything it cannot turn into
/// `+<country><number>`, with "Enter a complete WhatsApp phone number with its
/// country code." Checking the same shape here means a user learns that
/// while typing, not after a failed save.
///
/// Unlike the web, no country is assumed: members dial from everywhere, so a
/// number only becomes complete once its country code is chosen (or pasted).
library;

import 'countries.dart';

String _digits(String s) => s.replaceAll(RegExp(r'\D'), '');

/// Web `internationalDigits`: drop a `00` exit prefix and repair only the
/// Tanzanian "+255 0…" slip — other countries can have significant zeros.
String _internationalDigits(String raw) {
  var d = _digits(raw);
  if (d.startsWith('00')) d = d.substring(2);
  final tz = RegExp(r'^2550([2-9]\d{8})$').firstMatch(d);
  return tz == null ? d : '255${tz.group(1)}';
}

/// True when [raw] already carries its country code (`+…`, `00…`, or a
/// Tanzanian number written with 255 and no plus).
bool hasInternationalPrefix(String raw) =>
    raw.trim().startsWith('+') ||
    raw.trim().startsWith('00') ||
    RegExp(r'^2550?[2-9]\d{8}$').hasMatch(_digits(raw));

/// The country whose dial code starts [number] (longest code wins, so +255
/// beats +25). Where two countries share a code (+1, +7), [preferIso] keeps
/// the one the user picked, else the first listed.
Country? countryForNumber(String number, {String? preferIso}) {
  if (!hasInternationalPrefix(number)) return null;
  final digits = _internationalDigits(number);
  Country? best;
  for (final c in kCountries) {
    final code = c.dialCode.substring(1);
    if (!digits.startsWith(code)) continue;
    if (best == null ||
        code.length > best.dialCode.length - 1 ||
        (code.length == best.dialCode.length - 1 && c.iso == preferIso)) {
      best = c;
    }
  }
  return best;
}

/// The digits after [country]'s dial code in an international [number].
String nationalPart(String number, Country country) =>
    _internationalDigits(number).substring(country.dialCode.length - 1);

/// Web `formatInternationalPhone`: the country box plus what was typed, as
/// the canonical `+…` value. A number pasted with its own `+code` wins over
/// the box.
String formatInternationalPhone(String dialCode, String nationalInput) {
  final raw = nationalInput.trim();
  if (hasInternationalPrefix(raw)) return '+${_internationalDigits(raw)}';
  final dial = _digits(dialCode);
  final digits = _digits(raw);
  // Most national formats carry one trunk zero that is not part of E.164.
  final national = dial == '39' ? digits : digits.replaceFirst(RegExp(r'^0'), '');
  return '+$dial$national';
}

/// The canonical `+…` form of a number that carries its country code; a bare
/// national number comes back as plain digits, since its country is unknown.
String normalizeInternationalPhone(String value) {
  final raw = value.trim();
  if (raw.isEmpty) return '';
  if (hasInternationalPrefix(raw)) return '+${_internationalDigits(raw)}';
  return _digits(raw);
}

/// Web `isValidInternationalPhone`, minus the web's Tanzania default: a
/// country code, then 8–15 digits in all, and never Tanzania's trunk zero
/// kept after +255.
bool isValidInternationalPhone(String? value) {
  final raw = (value ?? '').trim();
  if (!RegExp(r'^[+\d\s().-]+$').hasMatch(raw)) return false;
  final canonical = normalizeInternationalPhone(raw);
  if (canonical.startsWith('+2550')) return false;
  return RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(canonical);
}

/// A number stored on a profile, however old: the backend has always taken
/// national Tanzanian digits too, so a legacy value without `+` still counts
/// as the account having a number.
bool hasStoredPhone(String? value) => _digits(value ?? '').length >= 8;
