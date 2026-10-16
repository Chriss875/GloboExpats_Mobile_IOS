import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/widgets/assign_transporter_modal.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('AU-057: registry lists transporters; assign posts to /orders/{id}/transporter',
      (tester) async {
    final calls = <String>[];
    var assigned = false;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Builder(builder: (context) {
      return Center(
        child: FilledButton(
          onPressed: () => showDialog<bool>(
            context: context,
            builder: (_) => AssignTransporterModal(
              token: 'jwt',
              orderId: 'o-1',
              api: ApiClient(client: MockClient((req) async {
                calls.add('${req.method} ${req.url.path}');
                if (req.url.path == '/api/v1/transporters') {
                  return _json([
                    {'transporterId': 1, 'fullName': 'Abdallah K.', 'vehicleType': 'MOTORBIKE', 'plateNumber': 'MC900 DPN', 'tripCount': 5},
                    {'transporterId': 2, 'fullName': 'Juma P.', 'vehicleType': 'MINI_TRUCK', 'plateNumber': '', 'tripCount': 0},
                  ]);
                }
                if (req.method == 'POST' && req.url.path == '/api/v1/orders/o-1/transporter') {
                  assigned = true;
                  final body = jsonDecode(req.body) as Map<String, dynamic>;
                  expect(body['transporterId'], 1);
                  return _json({'tripId': 9, 'deliveryTimeStatus': 'AWAITING_BUYER_CONFIRMATION'}, 201);
                }
                return _json({});
              })),
            ),
          ),
          child: const Text('open'),
        ),
      );
    }))));

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('Abdallah K.'), findsOneWidget);
    expect(find.textContaining('Boda'), findsNothing); // vehicle shown in subtitle
    expect(find.textContaining('MC900 DPN'), findsOneWidget);
    expect(find.textContaining('5 trips'), findsOneWidget);

    await tester.tap(find.text('Abdallah K.'));
    await tester.pump();
    await tester.tap(find.text('Assign'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(assigned, isTrue);
  });

  testWidgets('AU-057: inline-create posts POST /transporters then selects the new id',
      (tester) async {
    final calls = <String>[];
    int createdId = 0;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Builder(builder: (context) => Center(
      child: FilledButton(
        onPressed: () => showDialog(context: context, builder: (_) => AssignTransporterModal(
          token: 'jwt',
          orderId: 'o-2',
          api: ApiClient(client: MockClient((req) async {
            calls.add('${req.method} ${req.url.path}');
            if (req.url.path == '/api/v1/transporters' && req.method == 'GET') {
              if (createdId == 0) return _json([]);
              return _json([
                {'transporterId': createdId, 'fullName': 'New Guy', 'vehicleType': 'CAR', 'tripCount': 0},
              ]);
            }
            if (req.method == 'POST' && req.url.path == '/api/v1/transporters') {
              createdId = 42;
              return _json({'transporterId': 42}, 201);
            }
            return _json({});
          })),
        )),
        child: const Text('open'),
      ),
    )))));

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add a new transporter'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Full name'), 'New Guy');
    await tester.enterText(find.widgetWithText(TextField, 'Phone number'), '+255700111222');
    await tester.ensureVisible(find.text('Save transporter'));
    await tester.pump();
    await tester.tap(find.text('Save transporter'), warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(calls.contains('POST /api/v1/transporters'), isTrue,
        reason: 'calls so far: $calls');
    // The create form closes and the registry row shows the new transporter.
    expect(find.text('New Guy'), findsOneWidget);
    expect(find.byType(RadioListTile<int>), findsOneWidget);
    final radios = tester.widgetList<RadioListTile<int>>(find.byType(RadioListTile<int>)).toList();

    expect(radios.first.groupValue, 42);
  });
}
