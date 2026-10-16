import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/production_time.dart';
import 'package:globoexpats_mobile/models/order.dart';
import 'package:globoexpats_mobile/widgets/production_time_card.dart';

final _now = DateTime.utc(2026, 3, 1, 9);

void main() {
  group('production timing (web parity lib/production-time.ts)', () {
    test('an ordinary item is never in production', () {
      const s = ProductionSource();
      expect(getProductionTiming(s, now: _now).state, ProductionState.notApplicable);
      // ...and is therefore never blocked from dispatch.
      expect(canAssignTransporterAfterProduction(s), isTrue);
    });

    test('a made-to-order item blocks dispatch until it is confirmed done', () {
      final pending = ProductionSource(
          productionTimeDays: 5, expectedCompletionAt: _now.add(const Duration(days: 2)));
      expect(canAssignTransporterAfterProduction(pending), isFalse);

      final done = ProductionSource(
        productionTimeDays: 5,
        expectedCompletionAt: _now.add(const Duration(days: 2)),
        completedAt: _now,
      );
      expect(canAssignTransporterAfterProduction(done), isTrue);
      expect(getProductionTiming(done, now: _now).state, ProductionState.complete);
    });

    test('past the expected date it is overdue, not silently in progress', () {
      final late = ProductionSource(
          productionTimeDays: 5,
          expectedCompletionAt: _now.subtract(const Duration(hours: 5)));
      final timing = getProductionTiming(late, now: _now);
      expect(timing.state, ProductionState.overdue);
      expect(formatProductionRemaining(timing.remaining), '5 hours overdue');
    });

    test('remaining time rounds hours UP so it never looks closer than it is', () {
      expect(formatProductionRemaining(const Duration(hours: 48)), '2 days remaining');
      expect(formatProductionRemaining(const Duration(hours: 26)),
          '1 day 2 hours remaining');
      // 25h30m rounds up to a whole 26 hours rather than down to 25.
      expect(formatProductionRemaining(const Duration(hours: 25, minutes: 30)),
          '1 day 2 hours remaining');
      expect(formatProductionRemaining(const Duration(minutes: 10)),
          '1 hour remaining');
      expect(formatProductionRemaining(Duration.zero), 'less than 1 hour overdue');
    });

    test('the order model reads the timing fields off the wire', () {
      final o = Order.fromJson({
        'orderId': 1,
        'productionTimeDays': 5,
        'productionExpectedCompletionAt': '2026-03-06T09:00:00Z',
      });
      expect(o.production.productionTimeDays, 5);
      expect(o.production.expectedCompletionAt, isNotNull);
      expect(o.production.completedAt, isNull);
    });
  });

  group('ProductionTimeCard', () {
    Future<void> pump(WidgetTester tester, ProductionSource s,
            {bool canComplete = false, Future<void> Function()? onComplete}) =>
        tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: ProductionTimeCard(
              source: s,
              canComplete: canComplete,
              onComplete: onComplete,
              now: _now,
            ),
          ),
        ));

    testWidgets('renders nothing at all for an ordinary item', (tester) async {
      await pump(tester, const ProductionSource());
      expect(find.textContaining('Production'), findsNothing);
    });

    testWidgets('shows progress and the remaining time', (tester) async {
      await pump(
          tester,
          ProductionSource(
              productionTimeDays: 5,
              expectedCompletionAt: _now.add(const Duration(days: 2))));
      expect(find.text('Production in progress'), findsOneWidget);
      expect(find.text('2 days remaining'), findsOneWidget);
    });

    testWidgets('the buyer is never offered the seller action', (tester) async {
      await pump(
          tester,
          ProductionSource(
              productionTimeDays: 5,
              expectedCompletionAt: _now.add(const Duration(days: 2))));
      expect(find.byKey(const ValueKey('mark-production-complete')), findsNothing);
    });

    testWidgets('the seller confirms through a dialog, not a stray tap',
        (tester) async {
      var completed = false;
      await pump(
        tester,
        ProductionSource(
            productionTimeDays: 5,
            expectedCompletionAt: _now.add(const Duration(days: 2))),
        canComplete: true,
        onComplete: () async => completed = true,
      );

      await tester.tap(find.byKey(const ValueKey('mark-production-complete')));
      await tester.pumpAndSettle();
      expect(find.text('Mark production complete?'), findsOneWidget);

      // Backing out must not mark anything.
      await tester.tap(find.text('Keep in production'));
      await tester.pumpAndSettle();
      expect(completed, isFalse);

      await tester.tap(find.byKey(const ValueKey('mark-production-complete')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Yes, production is complete'));
      await tester.pumpAndSettle();
      expect(completed, isTrue);
    });

    testWidgets('a completed order shows who marked it, with no action left',
        (tester) async {
      await pump(
        tester,
        ProductionSource(
            productionTimeDays: 5,
            expectedCompletionAt: _now.add(const Duration(days: 2)),
            completedAt: _now),
        canComplete: true,
      );
      expect(find.text('Production complete'), findsOneWidget);
      expect(find.text('Marked ready by the seller'), findsOneWidget);
      expect(find.byKey(const ValueKey('mark-production-complete')), findsNothing);
    });
  });
}
