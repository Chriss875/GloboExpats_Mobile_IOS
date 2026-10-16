import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/domain/pending_actions.dart';
import 'package:globoexpats_mobile/models/order.dart';
import 'package:globoexpats_mobile/screens/shell.dart';

/// The "act now" strip under the top bar.
///
/// The behaviour under test is the whole point of the design: the strip is a
/// projection of live order/payment state, so the only thing that clears it is
/// the work actually being done. There is no dismiss and no "mark done" — a
/// control like that would hide the reminder while the work stayed
/// outstanding, which is what the web deliberately does not have.
void main() {
  Map<String, dynamic> orderJson(String id, String status,
          {String type = 'buying',
          String? fulfillmentType,
          Map<String, dynamic> extra = const {}}) =>
      {
        'orderId': id,
        'orderNumber': 'ORD-$id',
        'status': status,
        'orderType': type,
        if (fulfillmentType != null) 'fulfillmentType': fulfillmentType,
        'totalAmount': 1000,
        'currency': 'TZS',
        'createdAt': '2026-09-01T00:00:00Z',
        ...extra,
      };

  Order order(String id, String status,
          {String type = 'buying', String? fulfillmentType}) =>
      Order.fromJson(
          orderJson(id, status, type: type, fulfillmentType: fulfillmentType));

  group('isPendingActionDestination (web lib/pending-action-destination.ts)', () {
    test('matches the same path with no query', () {
      expect(isPendingActionDestination('/orders/42', '/orders/42', const {}),
          isTrue);
      expect(isPendingActionDestination('/orders/42', '/orders/43', const {}),
          isFalse);
    });

    test('ignores a trailing slash on either side', () {
      expect(isPendingActionDestination('/orders/42/', '/orders/42', const {}),
          isTrue);
    });

    test('requires every destination param to match', () {
      const dest = '/expat/dashboard?tab=buying&sub=payments&paymentStatus=rejected';
      expect(
          isPendingActionDestination(dest, '/expat/dashboard', const {
            'tab': 'buying',
            'sub': 'payments',
            'paymentStatus': 'rejected',
          }),
          isTrue);
      expect(
          isPendingActionDestination(dest, '/expat/dashboard', const {
            'tab': 'buying',
            'sub': 'payments',
          }),
          isFalse);
      expect(
          isPendingActionDestination(dest, '/expat/dashboard', const {
            'tab': 'selling',
            'sub': 'payments',
            'paymentStatus': 'rejected',
          }),
          isFalse);
    });

    test('unrelated extra params on the current URL are ignored', () {
      // Web matches one-way: the destination's params must be present, but the
      // current URL carrying more is still the same destination.
      expect(
          isPendingActionDestination('/expat/dashboard?tab=buying',
              '/expat/dashboard', const {'tab': 'buying', 'id': '9'}),
          isTrue);
    });

    test('a bare /checkout counts, with or without a resume query', () {
      // Web: a newly created invoice is displayed at /checkout without the
      // resume query, so the reminder must not linger there either.
      expect(
          isPendingActionDestination(
              '/checkout?proforma=p1', '/checkout', const {}),
          isTrue);
      expect(
          isPendingActionDestination('/checkout?proforma=p1', '/checkout',
              const {'proforma': 'p1'}),
          isTrue);
      expect(
          isPendingActionDestination(
              '/checkout?proforma=p1', '/checkout', const {'proforma': 'p2'}),
          isFalse);
    });
  });

  group('the cascade reads one source', () {
    tearDown(() => PendingActionsStore.instance.clear());

    test('tab, sub-tab and card counts are sums over the same entries', () {
      final store = PendingActionsStore.instance;
      store.clear();
      store.replace(
        orders: [
          order('a', 'AWAITING_BUYER_CONFIRMATION'), // buyer: confirm time
          order('b', 'AWAITING_SELLER_CONFIRMATION', type: 'selling'),
          order('c', 'AWAITING_SELLER_CONFIRMATION', type: 'selling'),
          order('d', 'COMPLETED'), // nothing outstanding
        ],
        payments: const [],
      );

      expect(store.buyingPending, 1);
      expect(store.sellingPending, 2);
      expect(store.total, 3, reason: 'the bell/MySpace badge is the sum');

      // The leaf agrees with the aggregates.
      expect(store.countForOrder('a'), 1);
      expect(store.countForOrder('b'), 1);
      expect(store.countForOrder('d'), 0);

      // Completing b's step removes it from every level at once.
      store.replace(
        orders: [
          order('a', 'AWAITING_BUYER_CONFIRMATION'),
          order('b', 'PAID',
              type: 'selling',
              fulfillmentType: 'SELLER_DELIVERY'), // still work: fulfil it
          order('c', 'AWAITING_SELLER_CONFIRMATION', type: 'selling'),
          order('d', 'COMPLETED'),
        ],
        payments: const [],
      );
      expect(store.sellingPending, 2);
      expect(store.forOrder('b')!.actionLabel, 'Arrange delivery',
          reason: 'b advanced to its next step, it did not vanish');

      store.replace(
        orders: [
          order('a', 'COMPLETED'), // buyer confirmed receipt
          order('b', 'COMPLETED', type: 'selling'),
          order('c', 'COMPLETED', type: 'selling'),
          order('d', 'COMPLETED'),
        ],
        payments: const [],
      );
      expect(store.total, 0, reason: 'all work done → every badge clears');
      expect(store.entries, isEmpty);
    });

    test('payments feed the same cascade as orders', () {
      final store = PendingActionsStore.instance;
      store.clear();
      store.replace(orders: const [], payments: [
        // Rejected: the buyer has 48 hours to re-upload proof.
        {
          'proformaId': 'p1',
          'proformaNumber': 'PRO-1',
          'status': 'REJECTED',
          'submittedAt': '2026-09-01T00:00:00Z',
        },
        // A replacement receipt outranks the older rejected audit row.
        {
          'proformaId': 'p2',
          'proformaNumber': 'PRO-2',
          'status': 'REJECTED',
          'receipts': [
            {'status': 'REJECTED'},
            {'status': 'SUBMITTED'},
          ],
          'submittedAt': '2026-09-02T00:00:00Z',
        },
        // Live proforma, no receipt yet — web's default state.
        {'proformaId': 'p3', 'proformaNumber': 'PRO-3', 'status': ''},
        // Verified: the money is in, nothing to chase.
        {'proformaId': 'p4', 'status': 'VERIFIED'},
        // Cancelled/expired proformas are gone, not pending.
        {'proformaId': 'p5', 'status': 'CANCELLED'},
      ]);

      expect(store.buyingPaymentsPending, 2,
          reason: 'rejected p1 + unfinished p3; p2 is under review');
      expect(store.buyingOrdersPending, 0);
      expect(store.total, 2);
      // A rejected payment outranks an unfinished one, whenever each landed.
      expect(store.entries.first.actionLabel, 'Update payment');
      expect(store.entries.first.priority, 0);
      expect(store.entries.last.actionLabel, 'Continue payment');
      expect(store.forOrder('p1'), isNull,
          reason: 'payments are not order steps — no card badge by order id');

      // Uploading the replacement proof moves it to review and the badge
      // drops, with no control anywhere having been pressed.
      store.replace(orders: const [], payments: [
        {
          'proformaId': 'p1',
          'proformaNumber': 'PRO-1',
          'status': 'REJECTED',
          'receipts': [
            {'status': 'SUBMITTED'}
          ],
        },
        {'proformaId': 'p3', 'proformaNumber': 'PRO-3', 'status': ''},
      ]);
      expect(store.buyingPaymentsPending, 1);
      expect(store.total, 1);
    });

    test('visibleFor hides the step whose destination is on screen', () {
      final store = PendingActionsStore.instance;
      store.clear();
      store.replace(
        orders: [order('a', 'AWAITING_BUYER_CONFIRMATION')],
        payments: const [],
      );

      expect(store.visibleFor('/', const {}), hasLength(1));
      // Standing on the order the strip is pointing at: it has already
      // delivered its message, so it stands down.
      expect(store.visibleFor('/orders/a', const {}), isEmpty);
      // The count behind the badges is unaffected — the work is still real.
      expect(store.total, 1);
    });
  });

  group('the strip under the top bar', () {
    Widget shell({Uri? location, required ApiClient api, AuthStore? store}) =>
        MaterialApp(
          home: AppShell(
            store: store ??
                AuthStore(initialToken: 'jwt', initialEmail: 'a@b.com'),
            api: api,
            location: location,
          ),
        );

    ApiClient apiWith(List<Map<String, dynamic>> orders) => ApiClient(
          client: MockClient((request) async {
            final path = request.url.path;
            if (path == '/api/v1/userManagement/user-details') {
              return http.Response(jsonEncode({'userId': 7}), 200,
                  headers: {'content-type': 'application/json'});
            }
            if (path == '/api/v1/orders') {
              return http.Response(jsonEncode(orders), 200,
                  headers: {'content-type': 'application/json'});
            }
            return http.Response('{}', 200,
                headers: {'content-type': 'application/json'});
          }),
        );

    setUp(() {
      PendingActionsStore.instance.clear();
      // Snoozes persist by design (that is the point of them), so a test that
      // puts a step down must not leave it down for the next test.
      PendingActionsStore.instance.clearSnoozes();
    });
    tearDown(() {
      PendingActionsStore.instance.clear();
      PendingActionsStore.instance.clearSnoozes();
    });

    testWidgets('shows the most urgent step and counts the rest',
        (tester) async {
      await tester.pumpWidget(shell(
        api: apiWith([
          orderJson('a', 'AWAITING_BUYER_CONFIRMATION'),
          orderJson('b', 'AWAITING_SELLER_CONFIRMATION', type: 'selling'),
        ]),
      ));
      await tester.pumpAndSettle();

      // Seller fulfilment outranks the buyer's delivery-time confirmation
      // (web KIND_PRIORITY: seller_fulfillment 1 vs
      // buyer_confirm_delivery_time 4), and the rest are stated rather than
      // offered as a picker.
      expect(find.textContaining('confirm availability'), findsOneWidget,
          reason: 'the seller step is the one worth doing first');
      expect(find.textContaining('+1 more task'), findsOneWidget);
      // Web parity `KIND_CTA`: the strip's button names the KIND of work in
      // two words rather than repeating the per-action label, which on one
      // line would crowd out the title that says which order it is. The order
      // card's own button still carries the long label.
      expect(find.text('Open order'), findsOneWidget);
      expect(find.text('Confirm availability'), findsNothing);
      expect(find.textContaining('delivery time'), findsNothing,
          reason: 'the lower-ranked step is counted, not shown');
    });

    testWidgets('stays compact on a narrow phone without hiding its controls',
        (tester) async {
      tester.view.physicalSize = const Size(960, 2001);
      tester.view.devicePixelRatio = 3;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(shell(
        api: apiWith([
          orderJson('a', 'AWAITING_BUYER_CONFIRMATION'),
          orderJson('b', 'AWAITING_SELLER_CONFIRMATION', type: 'selling'),
        ]),
      ));
      await tester.pumpAndSettle();

      expect(
          tester
              .getSize(find.byKey(const ValueKey('pending-action-banner')))
              .height,
          lessThanOrEqualTo(76));
      expect(find.text('Open order'), findsOneWidget);
      expect(find.byTooltip('Reminder options'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('stands down when the user is already on the destination',
        (tester) async {
      await tester.pumpWidget(shell(
        location: Uri(path: '/orders/a'),
        api: apiWith([orderJson('a', 'AWAITING_BUYER_CONFIRMATION')]),
      ));
      await tester.pumpAndSettle();

      expect(find.textContaining('Confirm delivery time'), findsNothing,
          reason: 'the strip must not nag from the screen it points at');
    });

    testWidgets('clears itself once the work is done — no dismiss control',
        (tester) async {
      await tester.pumpWidget(shell(
        api: apiWith([orderJson('a', 'AWAITING_BUYER_CONFIRMATION')]),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('Confirm delivery time'), findsOneWidget);

      // The action succeeds elsewhere and the state advances; the next refresh
      // publishes the new snapshot. Nothing is dismissed by hand.
      PendingActionsStore.instance.replace(
        orders: [order('a', 'COMPLETED')],
        payments: const [],
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Confirm delivery time'), findsNothing);
    });

    testWidgets('offers no dismiss or mark-done affordance while pending',
        (tester) async {
      await tester.pumpWidget(shell(
        api: apiWith([orderJson('a', 'AWAITING_BUYER_CONFIRMATION')]),
      ));
      await tester.pumpAndSettle();

      // A control that CLEARS the reminder without doing the work would make
      // the strip lie about the account. "Remind me later" is the one
      // affordance offered, and the test below pins down why that is
      // different.
      for (final label in ['Dismiss', 'Mark done', 'Mark as done', 'Clear']) {
        expect(find.text(label), findsNothing,
            reason: '"$label" would hide the reminder without doing the work');
      }
    });

    testWidgets('remind-me-later quiets the strip without dropping the work',
        (tester) async {
      await tester.pumpWidget(shell(
        api: apiWith([orderJson('a', 'AWAITING_BUYER_CONFIRMATION')]),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('Confirm delivery time'), findsOneWidget);
      final before = PendingActionsStore.instance.total;
      expect(before, 1);

      await tester.tap(find.byTooltip('Reminder options'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remind me later'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Confirm delivery time'), findsNothing,
          reason: 'the interruption stops');
      expect(PendingActionsStore.instance.total, before,
          reason: 'the WORK does not: the bell badge and the MySpace counts '
              'read from entries, not from what the strip is showing');
      expect(PendingActionsStore.instance.forOrder('a'), isNotNull,
          reason: "the order's own card still shows its badge");
    });

    testWidgets('a step that has slipped its delivery window says so',
        (tester) async {
      // The complaint this answers: the strip repeated a neutral sentence
      // about an order whose window had long passed, so it read as furniture.
      await tester.pumpWidget(shell(
        api: apiWith([
          orderJson('a', 'AWAITING_SELLER_CONFIRMATION',
              type: 'selling',
              extra: {
                'deliveryDeadline':
                    DateTime.now().toUtc().subtract(const Duration(days: 3)).toIso8601String(),
              }),
        ]),
      ));
      await tester.pumpAndSettle();

      expect(find.textContaining('Overdue'), findsOneWidget);
      expect(find.textContaining('3d'), findsOneWidget);
    });

    testWidgets('a payments outage does not hide the order reminders',
        (tester) async {
      await tester.pumpWidget(shell(
        api: ApiClient(
          client: MockClient((request) async {
            final path = request.url.path;
            if (path == '/api/v1/userManagement/user-details') {
              return http.Response(jsonEncode({'userId': 7}), 200,
                  headers: {'content-type': 'application/json'});
            }
            if (path == '/api/v1/orders') {
              return http.Response(
                  jsonEncode([orderJson('a', 'AWAITING_BUYER_CONFIRMATION')]),
                  200,
                  headers: {'content-type': 'application/json'});
            }
            // The payments endpoint is down while orders are fine.
            return http.Response('boom', 500);
          }),
        ),
      ));
      await tester.pumpAndSettle();

      // Web catches each endpoint on its own; a shared catch here would blank
      // the strip and hide real, outstanding work.
      expect(find.text('Confirm time'), findsOneWidget);
    });
  });
}
