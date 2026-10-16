// Photos reach the backend with names it stores safely (web parity with
// `addProductImages`), and the property-rental fields only go to a backend
// that knows them — an older one refuses the whole listing over them.
import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/config.dart';
import 'package:globoexpats_mobile/domain/image_upload.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';

void main() {
  test('upload names lose spaces, odd characters and ".."', () {
    expect(safeUploadFilename('IMG 2024 (1).webp'), 'IMG_2024__1_.webp');
    expect(safeUploadFilename('../../etc.webp'), '_._etc.webp');
    expect(safeUploadFilename('nyumba..webp'), 'nyumba.webp');
    expect(safeUploadFilename('چای.webp'), '___.webp');
    expect(safeUploadFilename('???'), 'photo');
  });

  group('the property-rental switch', () {
    tearDown(() => AppConfig.propertyRentals = true);

    SellFormState stay() => SellFormState()
      ..setCategory(id: 9, name: 'Real Estate', slug: 'real-estate')
      ..setSubcategory(45, slug: 'short-stays-holiday-rentals');

    test('on: the listing carries the short-stay terms', () {
      final s = stay()..setMinimumStay(2);
      final r = s.buildProductJson()['rentalConfiguration'] as Map;
      expect(r['shortStay'], isTrue);
      expect(r['minimumNights'], 2);
    });

    test('off: only what an older backend accepts, and no minimum to set', () {
      AppConfig.propertyRentals = false;
      final s = stay();
      final r = s.buildProductJson()['rentalConfiguration'] as Map;
      expect(r.keys.toSet(), {'enabled', 'listingType', 'ratePeriod'});
      expect(s.rentalConfiguration.minimumKind(vehicle: false), isNull);
      expect(s.groupsPhotos, isFalse);
    });
  });
}
