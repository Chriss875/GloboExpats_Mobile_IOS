import 'package:flutter/foundation.dart' show Uint8List;
import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/checkout_proforma.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';

SellFormState _listing() {
  final s = SellFormState();
  s.setCategory(id: 1, name: 'Electronics', commissionRate: 0.10);
  s.title = 'Phone';
  s.setDescription('desc');
  s.addImage('a.webp', Uint8List(4));
  s.setLocationFromAddress(
    addressId: 1, region: 'Dar es Salaam', country: 'Tanzania',
    streetName: '44 Coco Beach Rd', lat: -6.7892, lng: 39.2887,
  );
  s.setPricingAmount(100000, forward: true);
  return s;
}

void main() {
  _taxonomyEdgeCases();
  _profitParity();
  group('sell payload: every key web sends must exist, even when unused', () {
    // The backend DTO boxes every numeric (Double/Integer/Boolean), so an
    // omitted key arrives as null - which is NOT the 0 web sends. These keys
    // must therefore be present unconditionally.
    const alwaysPresent = [
      'productName', 'categoryId', 'subcategoryId', 'productCountry',
      'productRegion', 'productStreet', 'productZipCode', 'whatsappNumber',
      'productDescription', 'currency', 'askingPrice',
      'categoryCommissionPercentage', 'sellerPayout', 'finalTotalSellingPrice',
      'sellerFacingCommissionAmount', 'grossPlatformCommission', 'vat',
      'selcomCommissionFee', 'selcomTransactionFee',
      'platformNetProfitBeforeCuts', 'platformNetProfit',
      'platformNetProfitAfterCuts', 'roundingAdjustment', 'originalPrice',
      'productQuantity', 'requiresProductionTime', 'productionTimeDays',
      'deliveryTransportMode', 'transportRequirement', 'latitude', 'longitude',
      'placeName', 'neighbourhood', 'sameRegionDeliveryFeeMin',
      'sameRegionDeliveryFeeMax', 'outsideRegionDeliveryFeeMin',
      'outsideRegionDeliveryFeeMax', 'choiceConfiguration',
      'rentalConfiguration',
    ];

    test('a minimal listing still carries all of them', () {
      final j = _listing().buildProductJson();
      for (final key in alwaysPresent) {
        expect(j.containsKey(key), isTrue, reason: '$key must be sent');
      }
    });

    test('an EXEMPT listing zeroes the legacy fees rather than dropping them', () {
      final s = _listing()..setTransportRequirement(TransportRequirement.exempt);
      final j = s.buildProductJson();
      expect(j['sameRegionDeliveryFeeMin'], 0);
      expect(j['outsideRegionDeliveryFeeMax'], 0);
      expect(j['deliveryTransportMode'], isNull);
      expect(j['transportRequirement'], 'EXEMPT');
    });

    test('a blank street falls back to "Not specified" like web', () {
      final s = _listing();
      s.street = '';
      expect(s.buildProductJson()['productStreet'], 'Not specified');
    });

    test('no original price sends 0, not a missing key', () {
      expect(_listing().buildProductJson()['originalPrice'], 0);
    });

    test('a non-rental still sends rentalConfiguration: null', () {
      final j = _listing().buildProductJson();
      expect(j.containsKey('rentalConfiguration'), isTrue);
      expect(j['rentalConfiguration'], isNull);
    });

    test('transport enums are always real backend values', () {
      final j = _listing().buildProductJson();
      expect(['REQUIRED', 'OPTIONAL', 'EXEMPT'], contains(j['transportRequirement']));
      final mode = j['deliveryTransportMode'];
      if (mode != null) {
        expect(['BODA', 'BAJAJI', 'GUTA', 'CAR', 'MINI_TRUCK', 'SEMI_TRUCK'],
            contains(mode));
      }
    });

    test('requiresProductionTime is never true with a null day count', () {
      // The backend throws IllegalArgumentException on that combination.
      final s = _listing()..setRequiresProductionTime(true);
      final j = s.buildProductJson();
      if (j['requiresProductionTime'] == true) {
        expect(j['productionTimeDays'], isNotNull);
      }
      // Step 2 is what guarantees it - prove the gate is really there.
      expect(s.validateStep(2), isNotNull);
    });
  });

  group('checkout payload', () {
    test('address joins the street and neighbourhood like web', () {
      final d = buildBuyDetails(
        address: const CheckoutAddressInput(
          firstName: 'A', lastName: 'B', emailAddress: 'a@b.com',
          phoneNumber: '+255700000000', address: '44 Coco Beach Rd',
          neighbourhood: 'Oysterbay', city: 'Dar', country: 'Tanzania',
        ),
        fulfillmentType: 'BUYER_PICKUP',
        paymentMethodType: 'MOBILE_MONEY',
        deliveryFee: 0,
        subtotal: 1000,
        selectedWindowValues: const {},
        nowUtc: DateTime.utc(2026, 3, 1, 7),
      );
      expect(d['address'], '44 Coco Beach Rd, Oysterbay');
      expect(d['deliveryNeighbourhood'], 'Oysterbay');
    });

    test('a street already ending in the neighbourhood is not doubled up', () {
      expect(joinStreetAndNeighbourhood('44 Rd, Oysterbay', 'Oysterbay'),
          '44 Rd, Oysterbay');
      expect(joinStreetAndNeighbourhood('44 Rd', ''), '44 Rd');
      expect(joinStreetAndNeighbourhood('', 'Oysterbay'), 'Oysterbay');
      expect(joinStreetAndNeighbourhood('', ''), '');
    });

    test('quantity is clamped to at least 1', () {
      final payload =
          buildItemsPayload([const CheckoutLine(productId: 1, quantity: 0, price: 10)]);
      expect(payload.single['quantity'], 1);
    });
  });
}

// Appended: taxonomy + step-gate edge cases that would otherwise only fail
// server-side.
void _taxonomyEdgeCases() {
  group('taxonomy gates', () {
    test('a listing without a subcategory is blocked before publish', () {
      final s = SellFormState();
      s.setCategory(id: 1, name: 'Electronics', commissionRate: 0.10);
      s.title = 'Phone';
      s.selectedAddressId = 1;
      // A WhatsApp number is required by step 1 too (web app/sell/page.tsx
      // validateStep case 1), so the fixture provides one - the gate under
      // test is the taxonomy one.
      s.whatsappNumber = '+255700000000';
      // ProductTaxonomyService throws "Subcategory is required" - the seller
      // must be told inline, not by a 400 after uploading their photos.
      expect(s.validateStep(1), 'Please select a subcategory');
      s.setSubcategory(10, slug: 'phones');
      expect(s.validateStep(1), isNull);
    });

    test('changing the category clears a now-invalid subcategory', () {
      // The backend also rejects a subcategory from a different category.
      final s = SellFormState();
      s.setCategory(id: 1, name: 'Electronics', commissionRate: 0.10);
      s.setSubcategory(10, slug: 'phones');
      s.setCategory(id: 2, name: 'Furniture', commissionRate: 0.10);
      expect(s.subcategoryId, isNull);
    });
  });
}

// Appended: the money field that was being overstated on the edit path.
void _profitParity() {
  test('platformNetProfit equals platformNetProfitAfterCuts, never inflated', () {
    final s = SellFormState();
    s.setCategory(id: 1, name: 'Electronics', commissionRate: 0.10);
    s.setPricingAmount(100000, forward: true);
    final j = s.buildProductJson();
    expect(j['platformNetProfit'], j['platformNetProfitAfterCuts']);
    // Guard the specific regression: it must not carry the Selcom fee.
    expect(j['platformNetProfit'],
        isNot(equals((j['platformNetProfitAfterCuts'] as double) +
            (j['selcomCommissionFee'] as double))));
  });
}
