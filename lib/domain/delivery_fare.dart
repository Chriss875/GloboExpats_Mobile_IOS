/// Transport-mode fare bands — exact port of web `lib/delivery-fare.ts`
/// fallback math (SELL_FLOW_SPEC §3).
///
/// `fare(km) = ceil((baseFare + max(0, km-1.5) * ratePerKm) / 1000) * 1000`
/// sameRegion  min/max = fare(2),  fare(25)
/// outsideRegion min/max = fare(25), fare(100)
///
/// Test vectors (normative, test/sell_test.dart):
/// BODA 25km → 17000 · CAR 25km → 41000 · SEMI_TRUCK 100km → 489000.
enum TransportMode { boda, bajaji, guta, car, miniTruck, semiTruck }

/// Transport mode from a backend/legacy name, normalizing whitespace/dashes to
/// underscores and mapping the legacy 4-vehicle model + common synonyms onto
/// the current 6-mode ladder — web parity `normalizeDeliveryTransportMode`
/// (lib/delivery-fare.ts:94-131). Null for unknowns (the "Choose a delivery
/// vehicle" validation state), matching the web's undefined.
TransportMode? transportModeFromName(String? name) {
  switch ((name ?? '').trim().toUpperCase().replaceAll(RegExp(r'[\s-]+'), '_')) {
    case 'BODA':
    case 'MOTORBIKE':
    case 'MOTORCYCLE':
    case 'BIKE':
    case 'BODA_BODA':
      return TransportMode.boda;
    case 'BAJAJI':
    case 'TUKTUK':
    case 'TUK_TUK':
      return TransportMode.bajaji;
    case 'GUTA':
      return TransportMode.guta;
    case 'CAR':
      return TransportMode.car;
    case 'MINI_TRUCK':
    case 'VAN':
    case 'PICKUP':
    case 'PICKUP_TRUCK':
      return TransportMode.miniTruck;
    case 'SEMI_TRUCK':
    case 'TRUCK':
      return TransportMode.semiTruck;
    default:
      return null;
  }
}

extension TransportModeApi on TransportMode {
  String get apiName {
    switch (this) {
      case TransportMode.boda:
        return 'BODA';
      case TransportMode.bajaji:
        return 'BAJAJI';
      case TransportMode.guta:
        return 'GUTA';
      case TransportMode.car:
        return 'CAR';
      case TransportMode.miniTruck:
        return 'MINI_TRUCK';
      case TransportMode.semiTruck:
        return 'SEMI_TRUCK';
    }
  }

  double get baseFare {
    switch (this) {
      case TransportMode.boda:
        return 2000;
      case TransportMode.bajaji:
        return 3000;
      case TransportMode.guta:
        return 5000;
      case TransportMode.car:
        return 5000;
      case TransportMode.miniTruck:
        return 15000;
      case TransportMode.semiTruck:
        return 45000;
    }
  }

  double get ratePerKm {
    switch (this) {
      case TransportMode.boda:
        return 600;
      case TransportMode.bajaji:
        return 800;
      case TransportMode.guta:
        return 1000;
      case TransportMode.car:
        return 1500;
      case TransportMode.miniTruck:
        return 2800;
      case TransportMode.semiTruck:
        return 4500;
    }
  }

  /// "baseFare covers first 1.5 km, then ratePerKm/km" review banner copy.
  String get bannerCopy =>
      '$apiName: TSh ${_fmt(baseFare)} covers the first 1.5 km, '
      'then TSh ${_fmt(ratePerKm)} per km.';

  /// Card-grid copy — verbatim port of web `DELIVERY_TRANSPORT_OPTIONS`
  /// (lib/delivery-fare.ts). Note GUTA's label is "Guta/Toyo", not "Guta".
  String get label {
    switch (this) {
      case TransportMode.boda:
        return 'Boda';
      case TransportMode.bajaji:
        return 'Bajaji';
      case TransportMode.guta:
        return 'Guta/Toyo';
      case TransportMode.car:
        return 'Car';
      case TransportMode.miniTruck:
        return 'Mini Truck';
      case TransportMode.semiTruck:
        return 'Semi Truck';
    }
  }

  String get description {
    switch (this) {
      case TransportMode.boda:
        return 'Fastest option for small, light products';
      case TransportMode.bajaji:
        return 'Affordable, protected transport for small to medium products';
      case TransportMode.guta:
        return 'Local cargo transport for compact loads';
      case TransportMode.car:
        return 'Protected transport for medium-sized products';
      case TransportMode.miniTruck:
        return 'Extra room for bulky or multiple packages';
      case TransportMode.semiTruck:
        return 'Heavy transport for large furniture and equipment';
    }
  }

  String get examples {
    switch (this) {
      case TransportMode.boda:
        return 'Phones, documents, clothing, small parcels';
      case TransportMode.bajaji:
        return 'Backpacks, small boxes, groceries';
      case TransportMode.guta:
        return 'Crates, small furniture, market goods';
      case TransportMode.car:
        return 'Computers, appliances, boxed household items';
      case TransportMode.miniTruck:
        return 'TVs, desks, mattresses, several boxes';
      case TransportMode.semiTruck:
        return 'Sofas, fridges, machinery, house moves';
    }
  }

  /// Bundled artwork — web parity `VehicleTypeImage` (webp, not literal SVG).
  String get assetPath {
    switch (this) {
      case TransportMode.boda:
        return 'assets/images/transport/boda.webp';
      case TransportMode.bajaji:
        return 'assets/images/transport/bajaji.webp';
      case TransportMode.guta:
        return 'assets/images/transport/guta.webp';
      case TransportMode.car:
        return 'assets/images/transport/car.webp';
      case TransportMode.miniTruck:
        return 'assets/images/transport/mini-truck.webp';
      case TransportMode.semiTruck:
        return 'assets/images/transport/semi-truck.webp';
    }
  }
}

String _fmt(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toString();

double transportFare(TransportMode mode, double km) {
  final chargeable = (km - 1.5).clamp(0, double.infinity).toDouble();
  final raw = mode.baseFare + chargeable * mode.ratePerKm;
  return (raw / 1000).ceilToDouble() * 1000;
}

/// The four legacy fee fields a listing carries, auto-filled from the mode.
class DeliveryFeeBands {
  final double sameRegionMin;
  final double sameRegionMax;
  final double outsideRegionMin;
  final double outsideRegionMax;
  const DeliveryFeeBands({
    required this.sameRegionMin,
    required this.sameRegionMax,
    required this.outsideRegionMin,
    required this.outsideRegionMax,
  });

  static DeliveryFeeBands forMode(TransportMode m) => DeliveryFeeBands(
        sameRegionMin: transportFare(m, 2),
        sameRegionMax: transportFare(m, 25),
        outsideRegionMin: transportFare(m, 25),
        outsideRegionMax: transportFare(m, 100),
      );
}
