/// Port of the reference `lib/description-parser.ts` (web parity): splits a
/// product description from its structured `--- SPECIFICATIONS ---` block so
/// the detail screen can render a spec table (AU-017).
library;

/// Result of parsing a raw backend description.
class ParsedDescription {
  final String description;
  final Map<String, String> specifications;
  const ParsedDescription({required this.description, this.specifications = const {}});
}

final RegExp _specSeparator = RegExp(r'\s*-{1,3}\s*SPECIFICATIONS\s*-{1,3}\s*', caseSensitive: false);

/// Parse a product description to extract specifications. The web contract:
/// everything before the SPECIFICATIONS separator is prose; every following
/// `Label: value` line becomes a spec row. No separator → no specs.
ParsedDescription parseProductDescription(String? rawDescription) {
  final raw = rawDescription ?? '';
  if (raw.isEmpty) return const ParsedDescription(description: '');

  final normalized = raw.replaceAll('\r\n', '\n');
  final parts = normalized.split(_specSeparator);
  if (parts.length < 2) {
    return ParsedDescription(description: normalized.trim());
  }

  final description = parts.first.trim();
  final specsSection = parts.sublist(1).join(' ').trim();

  final specs = <String, String>{};
  if (specsSection.isNotEmpty) {
    for (final line in specsSection.split('\n')) {
      final trimmed = line.trim();
      if (trimmed.isEmpty || !trimmed.contains(':')) continue;
      final idx = trimmed.indexOf(':');
      final key = trimmed.substring(0, idx).trim();
      final value = trimmed.substring(idx + 1).trim();
      if (key.isNotEmpty && value.isNotEmpty) specs[key] = value;
    }
    // Older submissions were flattened inline ("Label: value Label: value");
    // recover those pairs when line parsing found at most one field.
    if (specs.length <= 1 && specsSection.contains(':')) {
      final inline = RegExp(r'([A-Za-z][A-Za-z0-9 /&()\-]{0,40}?):\s*([^:]+?)(?=\s+[A-Za-z][A-Za-z0-9 /&()\-]{0,40}:\s|$)');
      final recovered = <String, String>{};
      for (final m in inline.allMatches(specsSection)) {
        final label = m.group(1)?.trim();
        final value = m.group(2)?.trim();
        if (label != null && label.isNotEmpty && value != null && value.isNotEmpty) {
          recovered[label] = value;
        }
      }
      if (recovered.length > specs.length) {
        specs
          ..clear()
          ..addAll(recovered);
      }
    }
  }
  return ParsedDescription(description: description, specifications: specs);
}

/// Re-emit the `--- SPECIFICATIONS ---` block (web parity
/// `formatDescriptionWithCategoryFields` + `appendItemAgeToDescription`): the
/// prose part followed by a `Label: value` block built from [specifications]
/// in insertion order. Empty specs produce plain prose with no trailing header.
///
/// This is what lets edit-listing round-trip the structured spec rows (Brand,
/// Model, Item Age, ...) instead of dropping them on save: parse on load into
/// a map, keep the map in screen state, and call this before submitting.
String formatDescriptionWithSpecifications(
  String description,
  Map<String, String> specifications,
) {
  final prose = description.trim();
  final rows = <String>[];
  specifications.forEach((label, value) {
    final v = value.trim();
    if (label.trim().isNotEmpty && v.isNotEmpty && v.toLowerCase() != 'null') {
      rows.add('${label.trim()}: $v');
    }
  });
  if (rows.isEmpty) return prose;
  final buffer = StringBuffer();
  if (prose.isNotEmpty) buffer.write(prose);
  buffer.write('\n\n--- SPECIFICATIONS ---\n');
  for (final row in rows) {
    buffer.write(row);
    buffer.write('\n');
  }
  return buffer.toString().trim();
}
