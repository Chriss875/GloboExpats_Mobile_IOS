import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/description_parser.dart';

/// Web-parity round-trip for the edit-listing SPECIFICATIONS block. The web
/// app builds the enhanced description with
/// `formatDescriptionWithCategoryFields` + `appendItemAgeToDescription`
/// (lib/listing-submit-utils.ts); edit-listing must parse that block back out,
/// let the seller edit the prose, and re-emit it on save — without duplicating
/// the block or dropping rows it has no field for.
void main() {
  group('formatDescriptionWithSpecifications', () {
    test('plain prose with no specs passes through trimmed', () {
      expect(formatDescriptionWithSpecifications('  Just prose.  ', const {}),
          'Just prose.');
    });

    test('prose + specs re-emits the --- SPECIFICATIONS --- block', () {
      final out = formatDescriptionWithSpecifications('Hand carved bowl.', {
        'Material': 'Teak',
        'Size': '30cm',
      });
      expect(out,
          'Hand carved bowl.\n\n--- SPECIFICATIONS ---\nMaterial: Teak\nSize: 30cm');
    });

    test('round-trips through parseProductDescription losslessly', () {
      const original =
          'Antique chair.\n\n--- SPECIFICATIONS ---\nMaterial: Oak\nBrand: Mwanza\nItem Age: 2 years';
      final parsed = parseProductDescription(original);
      final reEmitted = formatDescriptionWithSpecifications(
          parsed.description, parsed.specifications);
      expect(reEmitted, original);
    });

    test('blank/whitespace/null spec rows are dropped, not written', () {
      final out = formatDescriptionWithSpecifications('Prose.', {
        '  ': ' x',
        'NullLabel': 'null',
        'Good': '  Value  ',
        'BlankVal': '   ',
      });
      expect(out, 'Prose.\n\n--- SPECIFICATIONS ---\nGood: Value');
    });

    test('empty prose still emits a valid block; leading blank trimmed', () {
      final out = formatDescriptionWithSpecifications('', {'Brand': 'X'});
      expect(out, '--- SPECIFICATIONS ---\nBrand: X');
    });

    test('empty description AND empty specs yields empty string', () {
      expect(formatDescriptionWithSpecifications('   ', const {}), '');
    });
  });
}
