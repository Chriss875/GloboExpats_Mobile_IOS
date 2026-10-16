import 'time_utils.dart';

/// Made-to-order preparation timing — port of web `lib/production-time.ts`.
///
/// This is the order-side end of the chain the seller starts in the sell
/// wizard: they promise N calendar days, checkout offers the buyer only
/// delivery windows past that period, and here the order shows how that
/// promise is tracking and gates dispatch until the seller confirms.
enum ProductionState { notApplicable, inProgress, overdue, complete }

class ProductionTiming {
  final ProductionState state;

  /// Positive while there is time left, negative once overdue, 0 otherwise.
  final Duration remaining;
  const ProductionTiming(this.state, this.remaining);
}

/// The inputs an order carries about its preparation period.
class ProductionSource {
  final int? productionTimeDays;
  final DateTime? expectedCompletionAt;
  final DateTime? completedAt;
  const ProductionSource({
    this.productionTimeDays,
    this.expectedCompletionAt,
    this.completedAt,
  });
}

/// A made-to-order sale cannot move into delivery until the seller confirms
/// production is done — an ordinary item is never held up by this.
bool canAssignTransporterAfterProduction(ProductionSource s) {
  final days = s.productionTimeDays;
  return days == null || days <= 0 || s.completedAt != null;
}

ProductionTiming getProductionTiming(ProductionSource s, {DateTime? now}) {
  final days = s.productionTimeDays;
  if (days == null || days <= 0 || s.expectedCompletionAt == null) {
    return const ProductionTiming(ProductionState.notApplicable, Duration.zero);
  }
  if (s.completedAt != null) {
    return const ProductionTiming(ProductionState.complete, Duration.zero);
  }
  final remaining =
      s.expectedCompletionAt!.difference((now ?? DateTime.now()).toUtc());
  return ProductionTiming(
    remaining > Duration.zero ? ProductionState.inProgress : ProductionState.overdue,
    remaining,
  );
}

/// "2 days 3 hours remaining" / "5 hours overdue". Hours round UP, so a
/// promise never looks closer to done than it is.
String formatProductionRemaining(Duration remaining) {
  final overdue = remaining <= Duration.zero;
  final absMs = remaining.inMilliseconds.abs();
  final totalHours = (absMs / 3600000).ceil();
  final days = totalHours ~/ 24;
  final hours = totalHours % 24;
  final parts = <String>[
    if (days > 0) '$days ${days == 1 ? 'day' : 'days'}',
    if (hours > 0) '$hours ${hours == 1 ? 'hour' : 'hours'}',
  ];
  final amount = parts.isEmpty ? 'less than 1 hour' : parts.join(' ');
  return '$amount ${overdue ? 'overdue' : 'remaining'}';
}

/// Reads the timing fields off a raw order map, tolerating the timestamp
/// shapes the backend uses (offset ISO, naive ISO, Jackson array, epoch).
ProductionSource productionSourceFromJson(Map<String, dynamic> j) => ProductionSource(
      productionTimeDays: (j['productionTimeDays'] as num?)?.toInt(),
      expectedCompletionAt: _ts(j['productionExpectedCompletionAt']),
      completedAt: _ts(j['productionCompletedAt']),
    );

DateTime? _ts(Object? raw) {
  if (raw == null || '$raw'.isEmpty) return null;
  try {
    return TimeUtils.parseBackendTimestamp(raw);
  } on FormatException {
    return null;
  }
}
