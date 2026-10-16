import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/screens/contact_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Widget _wrap(ContactScreen screen) => MaterialApp(home: screen);

void main() {
  testWidgets('AU-062: contact form posts to /contact/submit with DTO fields',
      (tester) async {
    http.Request? captured;
    final api = ApiClient(
      client: MockClient((req) async {
        captured = req;
        if (req.url.path == '/api/v1/contact/submit') {
          return _json({
            'success': true,
            'message': 'Your message has been sent successfully.',
            'id': 9,
          }, 201);
        }
        return _json({}, 404);
      }),
    );
    await tester.pumpWidget(_wrap(ContactScreen(api: api)));
    await tester.enterText(find.widgetWithText(TextFormField, 'Your name'), 'Neema O.');
    await tester.enterText(find.widgetWithText(TextFormField, 'Email address'), 'n@t.local');
    await tester.enterText(find.widgetWithText(TextFormField, 'Subject'), 'Payout question');
    await tester.enterText(find.widgetWithText(TextFormField, 'Message'), 'When are payouts released?');
    // pick reason
    await tester.tap(find.text('Reason'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Payments').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send message'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    // (no pumpAndSettle here: the floating SnackBar animates indefinitely)

    expect(captured, isNotNull);
    expect(captured!.url.path, '/api/v1/contact/submit');
    final body = jsonDecode(captured!.body) as Map<String, dynamic>;
    expect(body['name'], 'Neema O.');
    expect(body['email'], 'n@t.local');
    expect(body['reason'], 'PAYMENTS');
    expect(body['subject'], 'Payout question');
    expect(body['message'], 'When are payouts released?');
  });

  testWidgets('AU-062: validation blocks empty required fields', (tester) async {
    var called = false;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/contact/submit') {
          called = true;
          return _json({'success': true}, 201);
        }
        return _json({});
      }),
    );
    await tester.pumpWidget(_wrap(ContactScreen(api: api)));
    await tester.tap(find.text('Send message'));
    await tester.pump();
    expect(called, isFalse, reason: 'client-side validation blocks submit');
    expect(find.text('Name is required'), findsOneWidget);
  });
}
