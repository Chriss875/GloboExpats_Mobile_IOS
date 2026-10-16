import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart' show Uint8List;
import 'package:globoexpats_mobile/domain/delivery_fare.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AU-041: delivery fare vectors (SELL_FLOW_SPEC §3 table)', () {
    test('BODA 25 km → 17000 (normative)', () {
      expect(transportFare(TransportMode.boda, 25), 17000);
    });
    test('BODA same/outside bands', () {
      final b = DeliveryFeeBands.forMode(TransportMode.boda);
      expect(b.sameRegionMin, 3000); // fare(2)
      expect(b.sameRegionMax, 17000); // fare(25)
      expect(b.outsideRegionMin, 17000);
      expect(b.outsideRegionMax, 62000); // fare(100)
    });
    test('SEMI_TRUCK 100 km → 489000; CAR 25km → 41000', () {
      expect(transportFare(TransportMode.semiTruck, 100), 489000);
      expect(transportFare(TransportMode.car, 25), 41000);
    });
    test('under 1.5 km charges base fare only', () {
      expect(transportFare(TransportMode.guta, 1.0), 5000); // base only under 1.5km
      expect(transportFare(TransportMode.guta, 2), 6000); // sameMin vector
    });
    test('mode name round-trips through the API enum', () {
      expect(transportModeFromName('MINI_TRUCK'), TransportMode.miniTruck);
      expect(transportModeFromName('mini_truck'), TransportMode.miniTruck);
      expect(transportModeFromName(null), isNull);
      expect(TransportMode.miniTruck.apiName, 'MINI_TRUCK');
    });
  });

  group('AU-040/041: SellFormState cascade + validation + payload', () {
    SellFormState make() {
      final s = SellFormState();
      s.setCategory(id: 3, name: 'Real Estate', commissionRate: 0.08);
      return s;
    }

    test('real-estate category forces transport EXEMPT', () {
      final s = make();
      expect(s.transportRequirement, TransportRequirement.exempt);
      // and the payload never sends a mode when exempt
      s.title = 'Flat';
      s.description = 'd';
      s.selectedAddressId = 152;
      s.latitude = -6.7892;
      s.longitude = 39.2887;
      s.setPricingAmount(100000, forward: true);
      final j = s.buildProductJson();
      expect(j['deliveryTransportMode'], isNull);
      expect(j['transportRequirement'], 'EXEMPT');
    });

    test('vehicle-supplies daily-rental subcategory enables FOR_RENT/DAY '
        'and hides quantity in the payload', () {
      final s = SellFormState();
      s.setCategory(id: 4, name: 'Vehicle & Supplies', commissionRate: 0.06);
      s.setSubcategory(12);
      s.setRental(const RentalConfiguration(
          enabled: true, listingType: 'FOR_RENT', ratePeriod: 'DAY'));
      expect(s.isRental, isTrue);
      expect(s.quantity, 1); // rentals are qty 1
      expect(s.effectiveTransport, TransportRequirement.exempt);
      final j = s.buildProductJson();
      expect((j['rentalConfiguration'] as Map)['ratePeriod'], 'DAY');
      expect(j['productQuantity'], 1);
    });

    test('mode selection auto-fills the four legacy fee fields', () {
      final s = SellFormState();
      s.setCategory(id: 1, name: 'Electronics', commissionRate: 0.10);
      s.setTransportMode(TransportMode.boda);
      expect(s.feeBands!.sameRegionMin, 3000);
      final j = s.buildProductJson();
      expect(j['sameRegionDeliveryFeeMin'], 3000);
      expect(j['outsideRegionDeliveryFeeMax'], 62000);
    });

    test('commission fields land in the payload with normative values', () {
      final s = SellFormState();
      s.setCategory(id: 1, name: 'Electronics', commissionRate: 0.10);
      s.title = 'Test item';
      s.description = 'desc';
      s.selectedAddressId = 152;
      s.setLocationFromAddress(
        addressId: 152,
        region: 'dar es salaam',
        country: 'tanzania',
        streetName: '44 coco beach rd',
        lat: -6.7892,
        lng: 39.2887,
        place: 'Coco Beach Plaza',
        hood: 'Oysterbay',
      );
      s.addImage("x.webp", Uint8List(4));
      s.setDescription('desc');
      s.setPricingAmount(100000, forward: true);
      expect(s.price, 117000); // forward vector
      final j = s.buildProductJson();
      expect(j['askingPrice'], 117000);
      expect(j['sellerPayout'], 100000);
      expect(j['grossPlatformCommission'], closeTo(12406.78, 0.01));
      expect(j['vat'], closeTo(2593.22, 0.01));
      expect(j['selcomCommissionFee'], 2340);
      expect(j['roundingAdjustment'], closeTo(66.78, 0.01));
      expect(j['latitude'], -6.7892);
      expect(j['placeName'], 'Coco Beach Plaza');
      expect(j['currency'], 'TZS'); // submit always converts to TZS
      expect(j.toString(), isNot(contains("'CARD'")));
    });

    test('step validation blocks publish until pin + mode exist', () {
      final s = SellFormState();
      s.setCategory(id: 1, name: 'Electronics', commissionRate: 0.10);
      s.title = 'T';
      s.setDescription('d');
      s.addImage("x.webp", Uint8List(4));
      s.setPricingAmount(100000, forward: true);
      expect(s.validateStep(3), contains('map pin'));
      s.setLocationFromAddress(
        addressId: 1, region: 'r', country: 'c', streetName: 's',
        lat: 0, lng: 0, // (0,0) is NOT a valid pin
      );
      expect(s.validateStep(3), contains('map pin'));
      s.setLocationFromAddress(
        addressId: 1, region: 'r', country: 'c', streetName: 's',
        lat: -6.7892, lng: 39.2887,
      );
      expect(s.validateStep(3), contains('delivery vehicle'));
      s.setTransportMode(TransportMode.car);
      expect(s.validateStep(3), isNull);
    });
  });
}
