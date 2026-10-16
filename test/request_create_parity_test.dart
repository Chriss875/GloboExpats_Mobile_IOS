import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/create_request_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Phase 4, unit 1: request creation against the web's `CreateRequestPayload`.
///
/// Two fields of that contract never left the mobile screen — the request
/// could not carry a start date, and could not carry photos at all despite the
/// API client accepting them.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<Map<String, dynamic>> posted;
  late ApiClient api;

  setUp(() {
    posted = [];
    api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.contains('/request-board')) {
          // The payload rides a multipart `request` field.
          final body = req is http.MultipartRequest ? '' : '';
          posted.add({'path': req.url.path, 'body': body});
          return http.Response(jsonEncode({'id': 1}), 201,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 200,
            headers: {'content-type': 'application/json'});
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
  });

  tearDown(() => AuthStore.instance = null);

  testWidgets('offers both a start date and a deadline', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CreateRequestScreen(api: api)));
    await tester.pumpAndSettle();
    // The form is a lazy ListView, so the date rows are only built once
    // scrolled into view.
    await tester.drag(find.byType(ListView).first, const Offset(0, -400));
    await tester.pumpAndSettle();

    // The web payload carries fulfillmentStartDate as well as the deadline;
    // mobile used to expose only the deadline.
    expect(find.text('Needed from (optional)'), findsOneWidget);
    expect(find.text('Needed by (optional)'), findsOneWidget);
  });

  testWidgets('offers photos on a new request', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CreateRequestScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, -400));
    await tester.pumpAndSettle();

    expect(find.text('Add photos (optional)'), findsOneWidget);
  });

  testWidgets('keeps the goods/service split', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CreateRequestScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Looking to buy'), findsOneWidget);
    expect(find.text('Need a service'), findsOneWidget);

    // Switching to a service swaps the category label, as on the web.
    await tester.tap(find.text('Need a service'));
    await tester.pumpAndSettle();
    expect(find.text('Service category'), findsOneWidget);
  });

  testWidgets('REQUES-12: goods requests without an image are blocked', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CreateRequestScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.widgetWithText(TextFormField, 'Title'), 'Looking for a camera');
    await tester.tap(find.text('Category'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Furniture').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Describe what you need'),
        'A DSLR body under 500k.');
    await tester.dragUntilVisible(
        find.text('Post request'), find.byType(ListView).first, const Offset(0, -200));
    await tester.pump();
    await tester.tap(find.text('Post request'), warnIfMissed: false);
    await tester.pump();

    expect(find.text('At least one image is required for goods requests'), findsOneWidget);
    expect(posted, isEmpty,
        reason: 'no /request-board POST should fire for an image-less goods request');
  });

  testWidgets('REQUES-15: max budget below min budget is rejected', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CreateRequestScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.widgetWithText(TextFormField, 'Title'), 'A service please');
    await tester.tap(find.text('Need a service'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Service category'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cleaning').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Describe what you need'),
        'Deep clean.');
    await tester.enterText(find.widgetWithText(TextFormField, 'Min budget (TZS)'), '600000');
    await tester.enterText(find.widgetWithText(TextFormField, 'Max budget (TZS)'), '200000');
    await tester.dragUntilVisible(
        find.text('Post request'), find.byType(ListView).first, const Offset(0, -200));
    await tester.pump();
    await tester.tap(find.text('Post request'), warnIfMissed: false);
    await tester.pump();

    expect(
        find.text('Maximum budget must be greater than or equal to minimum budget'),
        findsOneWidget);
    expect(posted, isEmpty);
  });
}
