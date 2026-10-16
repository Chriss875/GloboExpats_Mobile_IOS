import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/delivery_region.dart';
import 'package:globoexpats_mobile/domain/transport_requirements.dart';

/// Pure-logic parity tests for the two new domain ports added in Phase 4A:
/// `transport_requirements.dart` (rental/EXEMPT lines never use delivery
/// logistics — CARTCH-06) and `delivery_region.dart` (cross-region delivery is
/// force-nulled at quote time and arranged after checkout — CARTCH-05 /
/// APISUR-02). Mirrors the web Vitest behavior.
void main() {
  group('itemUsesDeliveryLogistics (CARTCH-06)', () {
    test('rentals never use delivery logistics', () {
      expect(
          itemUsesDeliveryLogistics(
              isRentalBooking: true, transportRequirement: 'REQUIRED'),
          isFalse);
      expect(
          itemUsesDeliveryLogistics(
              isRentalBooking: true, transportRequirement: null),
          isFalse);
    });

    test('EXEMPT never uses delivery logistics', () {
      expect(
          itemUsesDeliveryLogistics(
              isRentalBooking: false, transportRequirement: 'EXEMPT'),
          isFalse);
    });

    test('OPTIONAL needs a transport mode', () {
      expect(
          itemUsesDeliveryLogistics(
              isRentalBooking: false,
              transportRequirement: 'OPTIONAL',
              deliveryTransportMode: ''),
          isFalse);
      expect(
          itemUsesDeliveryLogistics(
              isRentalBooking: false,
              transportRequirement: 'OPTIONAL',
              deliveryTransportMode: 'BODA_BODA'),
          isTrue);
      // snake_case backend alias is honoured too.
      expect(
          itemUsesDeliveryLogistics(
              isRentalBooking: false,
              transportRequirement: 'OPTIONAL',
              delivery_transport_mode: 'BODA_BODA'),
          isTrue);
    });

    test('REQUIRED (and the null/unknown default) use delivery logistics', () {
      expect(
          itemUsesDeliveryLogistics(
              isRentalBooking: false, transportRequirement: 'REQUIRED'),
          isTrue);
      expect(
          itemUsesDeliveryLogistics(
              isRentalBooking: false, transportRequirement: null),
          isTrue);
      expect(
          itemUsesDeliveryLogistics(
              isRentalBooking: false, transportRequirement: 'WHATEVER'),
          isTrue);
    });
  });

  group('resolveCheckoutTransportRequirement', () {
    test('most demanding non-rental wins; rentals are skipped', () {
      expect(
          resolveCheckoutTransportRequirement([
            (isRental: true, transportRequirement: 'EXEMPT'),
            (isRental: false, transportRequirement: 'OPTIONAL'),
          ]),
          'OPTIONAL');
      expect(
          resolveCheckoutTransportRequirement([
            (isRental: false, transportRequirement: 'OPTIONAL'),
            (isRental: false, transportRequirement: 'REQUIRED'),
          ]),
          'REQUIRED');
      expect(
          resolveCheckoutTransportRequirement(
              [(isRental: true, transportRequirement: null)]),
          'EXEMPT');
    });

    test('defaults and listing resolution', () {
      expect(getDefaultTransportRequirement('real-estate'), 'EXEMPT');
      expect(getDefaultTransportRequirement('vehicles'), 'REQUIRED');
      expect(resolveListingTransportRequirement('REQUIRED', true), 'EXEMPT');
    });
  });

  group('isCrossRegionDelivery / getCrossRegionSellerKeys', () {
    test('country mismatch always counts; region mismatch when both known', () {
      expect(
          isCrossRegionDelivery(
              buyerRegion: 'Dar es Salaam',
              buyerCountry: 'Tanzania',
              sellerRegion: 'Dar es Salaam',
              sellerCountry: 'Kenya'),
          isTrue);
      expect(
          isCrossRegionDelivery(
              buyerRegion: 'Dar es Salaam',
              buyerCountry: 'Tanzania',
              sellerRegion: 'Arusha',
              sellerCountry: 'Tanzania'),
          isTrue);
      expect(
          isCrossRegionDelivery(
              buyerRegion: 'Dar es Salaam',
              buyerCountry: 'Tanzania',
              sellerRegion: 'Dar es Salaam',
              sellerCountry: 'Tanzania'),
          isFalse);
    });

    test('unknown legacy locations stay local (→ false)', () {
      expect(
          isCrossRegionDelivery(
              buyerRegion: null,
              buyerCountry: null,
              sellerRegion: null,
              sellerCountry: null),
          isFalse);
    });

    test('getCrossRegionSellerKeys returns id/key/name keys of the sellers '
        'outside the buyer region', () {
      // seller name maps to expatName (as checkout_screen._clientCrossRegionSellerKeys does).
      final items = [
        const CrossRegionItem(
            sellerId: '10',
            expatName: 'Arusha Seller',
            productRegion: 'Arusha',
            productCountry: 'Tanzania'),
        const CrossRegionItem(
            sellerId: '20',
            expatName: 'Local Seller',
            productRegion: 'Dar es Salaam',
            productCountry: 'Tanzania'),
      ];
      final keys = getCrossRegionSellerKeys(items,
          buyerRegion: 'Dar es Salaam', buyerCountry: 'Tanzania');
      expect(keys, {'10', 'Arusha Seller'});
    });
  });

  group('applyCrossRegionDeliveryPolicy', () {
    final quote = {
      'deliveryTotal': 15000.0,
      'sellerGroups': [
        {
          'sellerKey': '20',
          'sellerId': 20,
          'consolidatedDeliveryFee': 4000.0,
          'consolidatedDeliveryFeeMin': 2000.0,
          'distanceKm': 6.0,
        },
        {
          'sellerKey': '10',
          'sellerId': 10,
          'consolidatedDeliveryFee': 11000.0,
          'consolidatedDeliveryFeeMin': 5000.0,
          'distanceKm': 300.0,
        },
      ],
    };

    test('nulls the quoted fees of cross-region groups and recomputes total',
        () {
      final adjusted =
          applyCrossRegionDeliveryPolicy(quote, {'10', 'Arusha Seller'});
      expect(adjusted, isNotNull);
      final groups = adjusted!['sellerGroups'] as List;
      final local = groups.firstWhere((g) => '${g['sellerId']}' == '20');
      final remote = groups.firstWhere((g) => '${g['sellerId']}' == '10');
      expect(local['consolidatedDeliveryFee'], 4000.0);
      expect(remote['consolidatedDeliveryFee'], isNull);
      expect(remote['distanceKm'], isNull);
      expect(remote['crossRegionDelivery'], isTrue);
      expect(adjusted['deliveryTotal'], 4000.0);
    });

    test('returns quote unchanged for null quote or no cross-region keys', () {
      expect(applyCrossRegionDeliveryPolicy(quote, {}), same(quote));
      expect(applyCrossRegionDeliveryPolicy(null, {'10'}), isNull);
    });

    test('quoteHasDeferredCrossRegion flags a nulled/deferred group', () {
      final adjusted =
          applyCrossRegionDeliveryPolicy(quote, {'10', 'Arusha Seller'});
      expect(quoteHasDeferredCrossRegion(adjusted), isTrue);
      expect(quoteHasDeferredCrossRegion(quote), isFalse);
    });

    test('sellerGroupIsCrossRegion matches by numeric id after the policy', () {
      final adjusted =
          applyCrossRegionDeliveryPolicy(quote, {'10', 'Arusha Seller'});
      expect(
          sellerGroupIsCrossRegion(adjusted,
              sellerKey: '10', crossRegionSellerKeys: const {}),
          isTrue);
      expect(
          sellerGroupIsCrossRegion(adjusted,
              sellerKey: '20', crossRegionSellerKeys: const {}),
          isFalse);
    });
  });

  group('locationTail', () {
    test('parses trailing region + country', () {
      expect(locationTail('Mikocheni, Dar es Salaam, Tanzania'),
          (region: 'Dar es Salaam', country: 'Tanzania'));
      expect(locationTail('Dar es Salaam, Tanzania'),
          (region: 'Dar es Salaam', country: 'Tanzania'));
      expect(locationTail('Dar es Salaam'),
          (region: null, country: null));
    });
  });
}
