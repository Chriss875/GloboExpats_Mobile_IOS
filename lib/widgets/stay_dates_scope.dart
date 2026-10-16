import 'package:flutter/widgets.dart';

import '../domain/stay_listing.dart';

/// The check-in / checkout of a Short Stays search, above its results. A
/// listing opened from them carries the dates (`?checkIn=&checkOut=`), so the
/// booking sheet opens with them picked — web `ProductCard detailsQuery`.
class StayDatesScope extends InheritedWidget {
  const StayDatesScope({super.key, required this.dates, required super.child});

  final StayDates dates;

  static StayDates of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<StayDatesScope>()?.dates ??
      StayDates.none;

  /// `/product/<id>`, with the search's dates when it has them.
  static String productPath(BuildContext context, int productId) {
    final query = of(context).query;
    return Uri(path: '/product/$productId',
            queryParameters: query.isEmpty ? null : query)
        .toString();
  }

  @override
  bool updateShouldNotify(StayDatesScope oldWidget) => dates != oldWidget.dates;
}
