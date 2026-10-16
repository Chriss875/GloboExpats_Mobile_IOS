library;

/// Port of the web `lib/listing-submit-utils.ts` helpers the sell flow needs.

String _normalizeConditionForBackend(String condition) {
  final normalized = condition.trim().toLowerCase().replaceAll(RegExp(r'[\s_]+'), '-');
  if (normalized == 'new') return 'NEW';
  if (normalized == 'like-new') return 'LIKE_NEW';
  if (normalized == 'excellent') return 'EXCELLENT';
  if (normalized == 'very-good') return 'VERY_GOOD';
  if (normalized == 'good') return 'GOOD';
  if (normalized == 'fair') return 'FAIR';
  return normalized.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]+'), '_');
}

bool isNewProductCondition(String condition) =>
    _normalizeConditionForBackend(condition) == 'NEW';

/// Rejects empty strings and the literal placeholders that leak in from a
/// missing value, so they never reach a saved listing (web parity
/// `isMeaningfulValue`).
bool _isMeaningfulValue(String? value) {
  if (value == null) return false;
  final trimmed = value.trim();
  if (trimmed.isEmpty) return false;
  return !['undefined', 'null', 'nan'].contains(trimmed.toLowerCase());
}

/// Item Age is not a backend field — web folds it into the description under
/// a SPECIFICATIONS block, and skips it entirely for a brand-new item.
String appendItemAgeToDescription(String description, String itemAge, String condition) {
  if (!_isMeaningfulValue(itemAge) || isNewProductCondition(condition)) return description;
  final trimmedAge = itemAge.trim();
  if (description.contains('--- SPECIFICATIONS ---')) {
    return '${description}Item Age: $trimmedAge\n';
  }
  return '$description\n\n--- SPECIFICATIONS ---\nItem Age: $trimmedAge\n';
}
