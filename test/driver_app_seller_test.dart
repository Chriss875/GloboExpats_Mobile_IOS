import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/domain/driver_app.dart';
import 'package:globoexpats_mobile/widgets/assign_transporter_modal.dart';
import 'package:globoexpats_mobile/widgets/driver_app_widgets.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, dynamic> rider({
  String? appStatus,
  String role = 'OWNER',
  bool active = true,
  Object? load,
}) =>
    {
      'transporterId': 8,
      'fullName': 'Baraka Mwita',
      'phoneNumber': '0712345678',
      'vehicleType': 'MOTORBIKE',
      'active': active,
      'relationshipRole': role,
      if (appStatus != null) 'appStatus': appStatus,
      if (load != null) 'assignedInWindow': load,
    };

/// A fake backend: records every request and answers from [routes].
class Backend {
  final requests = <http.Request>[];
  final routes = <String, http.Response Function(http.Request)>{};

  ApiClient api() => ApiClient(
        baseUrl: 'https://test.local',
        client: MockClient((request) async {
          requests.add(request);
          final handler = routes['${request.method} ${request.url.path}'];
          return handler == null
              ? http.Response('{"message":"not found"}', 404)
              : handler(request);
        }),
      );
}

http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  group('what the backend says about a rider', () {
    test('app status, in words', () {
      expect(riderAppStatus(rider(appStatus: 'ACTIVE')), RiderAppStatus.active);
      expect(riderAppStatusLabel(riderAppStatus(rider(appStatus: 'INVITED'))), 'Invited');
      expect(riderAppStatusLabel(riderAppStatus(rider(appStatus: 'MANUAL'))), 'No app');
      expect(riderAppStatus(rider()), isNull, reason: 'driver app off: nothing is sent');
    });

    test('the load line in the assign picker', () {
      expect(riderLoadLabel(rider(appStatus: 'ACTIVE', load: 3)),
          'Uses the app · 3 already in this window');
      expect(riderLoadLabel(rider(appStatus: 'MANUAL', load: 0)), 'Free in this window');
      expect(riderLoadLabel(rider(appStatus: 'MANUAL')), isNull);
      expect(riderLoadLabel(rider()), isNull);
    });

    test('who may invite and who may remove', () {
      expect(canInviteRider(rider(appStatus: 'MANUAL')), isTrue);
      expect(canInviteRider(rider(appStatus: 'INVITED', role: 'MANAGER')), isTrue);
      expect(canInviteRider(rider(appStatus: 'ACTIVE')), isTrue, reason: 'owner can remove');
      expect(canInviteRider(rider(appStatus: 'ACTIVE', role: 'MANAGER')), isFalse);
      expect(canInviteRider(rider(appStatus: 'MANUAL', active: false)), isFalse);
      expect(canInviteRider(rider()), isFalse, reason: 'driver app off');
    });

    test('the order window the list is asked about', () {
      final key = primaryWindowKey({
        'preferredDeliveryWindows': [
          {'date': '2026-10-02', 'slot': 'MORNING'},
          {'date': '2026-10-03', 'slot': 'EVENING'},
        ],
      });
      expect(key, (date: '2026-10-02', slot: 'MORNING'));
      expect(primaryWindowKey({'preferredDeliveryDate': '2026-10-05', 'preferredDeliverySlot': 'AFTERNOON'}),
          (date: '2026-10-05', slot: 'AFTERNOON'));
      expect(primaryWindowKey(const {}), isNull);
    });

    test('each step the rider reports, for a buyer', () {
      expect(describeTripEvent({'type': 'DISPATCHED'}), 'On the way to you');
      expect(describeTripEvent({'type': 'FAILED', 'reason': 'BUYER_NOT_AVAILABLE'}),
          'Could not be delivered: nobody was available');
      expect(describeTripEvent({'type': 'LEFT_OUT', 'reason': 'NOT_READY_YET'}),
          'Not collected yet (not ready yet)');
      expect(describeTripEvent({'type': 'SOMETHING_NEW'}), 'SOMETHING_NEW');
    });
  });

  group('the API calls', () {
    test('the registry is asked about the order\'s window', () async {
      final b = Backend()..routes['GET /api/v1/transporters'] = (_) => json([rider(appStatus: 'ACTIVE', load: 2)]);
      final rows = await b.api().fetchTransporterRegistry('tok',
          activeOnly: true, windowDate: '2026-10-02', windowSlot: 'MORNING');
      expect(rows.single['assignedInWindow'], 2);
      final q = b.requests.single.url.queryParameters;
      expect(q['windowDate'], '2026-10-02');
      expect(q['windowSlot'], 'MORNING');
      expect(q['active'], 'true');
      expect(b.requests.single.headers['Authorization'], 'Bearer tok');
    });

    test('without a window it is the same request as before', () async {
      final b = Backend()..routes['GET /api/v1/transporters'] = (_) => json([]);
      await b.api().fetchTransporterRegistry('tok', activeOnly: true);
      expect(b.requests.single.url.queryParameters.keys, ['active']);
    });

    test('invite, remove and progress use the new endpoints', () async {
      final b = Backend()
        ..routes['POST /api/v1/transporters/8/invite'] =
            ((_) => json({'code': 'ABCD2345', 'expiresAt': '2026-10-07T12:00:00+03:00', 'shareText': 'x'}, 201))
        ..routes['DELETE /api/v1/transporters/8/app-link'] = ((_) => http.Response('', 204))
        ..routes['GET /api/v1/orders/O1/trip-events'] = ((_) => json([
              {'type': 'ASSIGNED', 'occurredAt': '2026-10-01T06:00:00Z'},
            ]));
      final api = b.api();
      expect((await api.createDriverInvite('t', 8))['code'], 'ABCD2345');
      await api.removeDriverAppAccess('t', 8);
      expect((await api.fetchOrderTripEvents('t', 'O1')).single['type'], 'ASSIGNED');
    });

    test('a refused invite is an error the screen can show', () async {
      final b = Backend()
        ..routes['POST /api/v1/transporters/8/invite'] =
            ((_) => json({'success': false, 'message': 'ALREADY_USING_THE_APP'}, 409));
      await expectLater(b.api().createDriverInvite('t', 8), throwsA(isA<ApiException>()));
    });
  });

  group('the widgets', () {
    Widget host(Widget child) => MaterialApp(home: Scaffold(body: Center(child: child)));

    testWidgets('the badge names the state and is silent when the backend is', (tester) async {
      await tester.pumpWidget(host(RiderAppBadge(transporter: rider(appStatus: 'ACTIVE'))));
      expect(find.text('Uses the app'), findsOneWidget);
      await tester.pumpWidget(host(RiderAppBadge(transporter: rider())));
      expect(find.byKey(const ValueKey('rider-app-badge')), findsNothing);
    });

    testWidgets('Invite to app shows the code and refreshes the list', (tester) async {
      final b = Backend()
        ..routes['POST /api/v1/transporters/8/invite'] = ((_) => json({
              'code': 'ABCD2345',
              'expiresAt': '2026-10-07T12:00:00+03:00',
              'shareText': 'Hi Baraka, enter ABCD2345'
            }, 201));
      var refreshed = 0;
      await tester.pumpWidget(host(RiderAppActions(
        api: b.api(),
        token: 't',
        transporter: rider(appStatus: 'MANUAL'),
        onChanged: () => refreshed++,
      )));
      await tester.tap(find.byKey(const ValueKey('rider-invite')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('invite-code')), findsOneWidget);
      expect(find.text('ABCD2345'), findsOneWidget);
      expect(find.byKey(const ValueKey('invite-whatsapp')), findsOneWidget,
          reason: 'the rider has a phone number to send it to');
      expect(refreshed, 1);
    });

    testWidgets('an open invite offers a fresh code', (tester) async {
      await tester.pumpWidget(host(RiderAppActions(
        api: Backend().api(),
        token: 't',
        transporter: rider(appStatus: 'INVITED'),
        onChanged: () {},
      )));
      expect(find.text('New invite code'), findsOneWidget);
    });

    testWidgets('removing access asks first, then does it', (tester) async {
      final b = Backend()..routes['DELETE /api/v1/transporters/8/app-link'] = ((_) => http.Response('', 204));
      var refreshed = 0;
      await tester.pumpWidget(host(RiderAppActions(
        api: b.api(),
        token: 't',
        transporter: rider(appStatus: 'ACTIVE'),
        onChanged: () => refreshed++,
      )));
      await tester.tap(find.byKey(const ValueKey('rider-remove-access')));
      await tester.pumpAndSettle();
      expect(b.requests, isEmpty, reason: 'nothing happens until they confirm');
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      expect(b.requests.single.method, 'DELETE');
      expect(refreshed, 1);
    });

    testWidgets('keeping them cancels the removal', (tester) async {
      final b = Backend();
      await tester.pumpWidget(host(RiderAppActions(
        api: b.api(),
        token: 't',
        transporter: rider(appStatus: 'ACTIVE'),
        onChanged: () {},
      )));
      await tester.tap(find.byKey(const ValueKey('rider-remove-access')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Keep'));
      await tester.pumpAndSettle();
      expect(b.requests, isEmpty);
    });

    testWidgets('a manager cannot end access, and nothing shows with the flag off', (tester) async {
      await tester.pumpWidget(host(RiderAppActions(
        api: Backend().api(),
        token: 't',
        transporter: rider(appStatus: 'ACTIVE', role: 'MANAGER'),
        onChanged: () {},
      )));
      expect(find.byType(TextButton), findsNothing);
      await tester.pumpWidget(host(RiderAppActions(
        api: Backend().api(),
        token: 't',
        transporter: rider(),
        onChanged: () {},
      )));
      expect(find.byType(TextButton), findsNothing);
    });

    testWidgets('progress lists the steps and hides when there are none', (tester) async {
      final b = Backend()
        ..routes['GET /api/v1/orders/O1/trip-events'] = ((_) => json([
              {'type': 'ASSIGNED', 'occurredAt': '2026-10-01T06:00:00Z'},
              {'type': 'DISPATCHED', 'occurredAt': '2026-10-01T07:05:00Z'},
            ]))
        ..routes['GET /api/v1/orders/O2/trip-events'] = ((_) => json([]))
        ..routes['GET /api/v1/orders/O3/trip-events'] = ((_) => json({'message': 'nope'}, 404));
      await tester.pumpWidget(host(DriverProgressCard(api: b.api(), token: 't', orderId: 'O1')));
      await tester.pumpAndSettle();
      expect(find.text('A rider was assigned'), findsOneWidget);
      expect(find.text('On the way to you'), findsOneWidget);
      expect(find.text('10:05'), findsOneWidget, reason: 'shown in East Africa time');

      await tester.pumpWidget(host(DriverProgressCard(api: b.api(), token: 't', orderId: 'O2')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('driver-progress')), findsNothing);

      await tester.pumpWidget(host(DriverProgressCard(api: b.api(), token: 't', orderId: 'O3')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('driver-progress')), findsNothing);
    });

    testWidgets('the assign picker shows each rider\'s load in the window', (tester) async {
      final b = Backend()
        ..routes['GET /api/v1/transporters'] = ((_) => json([
              rider(appStatus: 'ACTIVE', load: 3),
            ]));
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showDialog<void>(
                context: context,
                builder: (_) => AssignTransporterModal(
                  token: 't',
                  orderId: 'O1',
                  api: b.api(),
                  windowDate: '2026-10-02',
                  windowSlot: 'MORNING',
                ),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('rider-load-8')), findsOneWidget);
      expect(find.text('Uses the app · 3 already in this window'), findsOneWidget);
      expect(b.requests.single.url.queryParameters['windowSlot'], 'MORNING');
    });
  });
}
