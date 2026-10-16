import 'package:flutter/material.dart';

import '../domain/countries.dart';
import '../domain/international_phone.dart';
import '../theme.dart';

/// A WhatsApp number input: a country box, then the national digits. No
/// country is assumed — members dial from everywhere — so a new number starts
/// on "Code" and the user picks from the full, searchable country list (or
/// pastes a number with its `+code`, which picks the country for them).
///
/// [onChanged] hands back the canonical `+…` value once a country is known,
/// the bare typed digits while none is (callers treat those as incomplete),
/// and '' when blank.
class PhoneNumberField extends StatefulWidget {
  const PhoneNumberField({
    super.key,
    this.initialValue,
    required this.onChanged,
    this.errorText,
    this.autofocus = false,
    this.label = 'WhatsApp number',
    this.helperText,
    this.onSubmitted,
  });

  /// A stored number (`+255…`, or legacy national digits).
  final String? initialValue;
  final ValueChanged<String> onChanged;
  final String? errorText;
  final bool autofocus;
  final String label;
  final String? helperText;
  final VoidCallback? onSubmitted;

  @override
  State<PhoneNumberField> createState() => _PhoneNumberFieldState();
}

class _PhoneNumberFieldState extends State<PhoneNumberField> {
  Country? _country;
  late final TextEditingController _national;

  @override
  void initState() {
    super.initState();
    final initial = (widget.initialValue ?? '').trim();
    _country = countryForNumber(initial);
    _national = TextEditingController(
        text: _country != null
            ? nationalPart(initial, _country!)
            : initial.replaceAll(RegExp(r'\D'), ''));
  }

  @override
  void dispose() {
    _national.dispose();
    super.dispose();
  }

  void _typed(String text) {
    // A pasted "+44 7911 …" chooses its own country.
    if (hasInternationalPrefix(text)) {
      final found = countryForNumber(text, preferIso: _country?.iso);
      if (found != null) {
        final rest = nationalPart(text, found);
        setState(() => _country = found);
        _national.value = TextEditingValue(
            text: rest, selection: TextSelection.collapsed(offset: rest.length));
      }
    }
    _emit();
  }

  void _emit() {
    final typed = _national.text.trim();
    if (typed.isEmpty) {
      widget.onChanged('');
    } else if (_country == null) {
      widget.onChanged(typed.replaceAll(RegExp(r'\D'), ''));
    } else {
      widget.onChanged(formatInternationalPhone(_country!.dialCode, typed));
    }
  }

  Future<void> _pickCountry() async {
    final picked = await showCountryPicker(context, selectedIso: _country?.iso);
    if (picked == null) return;
    setState(() => _country = picked);
    _emit();
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final country = _country;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Material(
          color: palette.background,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            key: const ValueKey('phone-country'),
            borderRadius: BorderRadius.circular(12),
            onTap: _pickCountry,
            child: Container(
              height: 56,
              padding: const EdgeInsets.only(left: 12, right: 4),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: widget.errorText == null
                        ? palette.borderStrong
                        : palette.dangerText),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (country == null)
                  Icon(Icons.public_rounded,
                      size: 20, color: palette.textSecondary)
                else
                  Text(country.flag, style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 6),
                Text(country?.dialCode ?? 'Code',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: country == null
                            ? palette.textSecondary
                            : palette.textPrimary)),
                Icon(Icons.arrow_drop_down_rounded,
                    color: palette.textSecondary),
              ]),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: TextField(
            key: const ValueKey('phone-national'),
            controller: _national,
            autofocus: widget.autofocus,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.telephoneNumber],
            onChanged: _typed,
            onSubmitted: (_) => widget.onSubmitted?.call(),
            decoration: InputDecoration(
              labelText: widget.label,
              hintText: 'Phone number',
              helperText: widget.helperText,
              helperMaxLines: 2,
              errorText: widget.errorText,
              errorMaxLines: 3,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
      ],
    );
  }
}

/// The country list most apps use: search by name or code, the popular
/// countries first, then every other country A–Z.
Future<Country?> showCountryPicker(BuildContext context, {String? selectedIso}) {
  return showModalBottomSheet<Country>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _CountrySheet(selectedIso: selectedIso),
  );
}

class _CountrySheet extends StatefulWidget {
  const _CountrySheet({this.selectedIso});
  final String? selectedIso;

  @override
  State<_CountrySheet> createState() => _CountrySheetState();
}

class _CountrySheetState extends State<_CountrySheet> {
  String _query = '';

  bool _matches(Country c, String q) {
    if (q.isEmpty) return true;
    final digits = q.replaceAll(RegExp(r'\D'), '');
    return c.name.toLowerCase().contains(q) ||
        c.iso.toLowerCase() == q ||
        (digits.isNotEmpty && c.dialCode.substring(1).startsWith(digits));
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final q = _query.trim().toLowerCase();
    final popular = kCountries.take(kCommonCountryCount);
    final rest = kCountries.skip(kCommonCountryCount).toList()
      ..sort((a, b) => a.name.compareTo(b.name));
    final rows = <Object>[
      if (q.isEmpty) ...[
        'Popular',
        ...popular,
        'All countries',
        ...rest,
      ] else
        ...[...popular, ...rest].where((c) => _matches(c, q)),
    ];

    Widget heading(String text) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
          child: Text(text.toUpperCase(),
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: palette.textSecondary)),
        );

    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.8,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              key: const ValueKey('country-search'),
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                hintText: 'Search country or code',
                isDense: true,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          Expanded(
            child: rows.isEmpty
                ? Center(
                    child: Text('No country matches “${_query.trim()}”',
                        style: TextStyle(color: palette.textSecondary)))
                : ListView.builder(
                    padding: EdgeInsets.only(
                        bottom: MediaQuery.of(context).viewInsets.bottom),
                    itemCount: rows.length,
                    itemBuilder: (context, i) {
                      final row = rows[i];
                      if (row is String) return heading(row);
                      final c = row as Country;
                      final on = c.iso == widget.selectedIso;
                      return ListTile(
                        key: ValueKey('country-${c.iso}'),
                        leading:
                            Text(c.flag, style: const TextStyle(fontSize: 22)),
                        title: Text(c.name,
                            style: TextStyle(
                                fontWeight:
                                    on ? FontWeight.w700 : FontWeight.w500,
                                color: palette.textPrimary)),
                        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                          Text(c.dialCode,
                              style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  color: on
                                      ? palette.accentInk
                                      : palette.textSecondary)),
                          if (on) ...[
                            const SizedBox(width: 8),
                            Icon(Icons.check_rounded,
                                size: 18, color: palette.accentInk),
                          ],
                        ]),
                        onTap: () => Navigator.pop(context, c),
                      );
                    },
                  ),
          ),
        ]),
      ),
    );
  }
}
