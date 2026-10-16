import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart' show PendingImage;
import 'package:globoexpats_mobile/screens/create_request_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('AU-056: GOODS request posts multipart to /request-board',
      (tester) async {
    http.Request? captured;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/request-board') {
          captured = req;
          return _json({'id': 12, 'title': 'Standing desk'}, 201);
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(
      home: CreateRequestScreen(
        api: api,
        // The web contract requires at least one image for GOODS requests
        // (REQUES-12); inject a photo so the multipart create can be exercised
        // without the platform image picker.
        initialImages: [
          PendingImage(name: 'desk.webp', bytes: Uint8List.fromList(const [1, 2, 3, 4])),
        ],
      ),
    ));
    await tester.enterText(find.widgetWithText(TextFormField, 'Title'), 'Standing desk');
    await tester.tap(find.text('Category'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Furniture').last);
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Describe what you need'),
        'Height-adjustable desk, pickup in Masaki.');
    await tester.enterText(find.widgetWithText(TextFormField, 'Min budget (TZS)'), '300000');
    await tester.enterText(find.widgetWithText(TextFormField, 'Max budget (TZS)'), '600000');
    // drag the list to reveal the submit button (ListView builds lazily)
    await tester.dragUntilVisible(
        find.text('Post request'), find.byType(ListView).first, const Offset(0, -200));
    await tester.pump();
    await tester.tap(find.text('Post request'), warnIfMissed: false);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(captured, isNotNull);
    expect(captured!.url.path, '/api/v1/request-board');
    // multipart `request` JSON part carries the payload
    final body = captured!.body;
    final jsonPart = body.contains('"title"');
    expect(jsonPart, isTrue, reason: 'request part carries the payload JSON');
    AuthStore.instance = null;
  });

  testWidgets('AU-056: SERVICE type posts to /request-board with service category',
      (tester) async {
    String? path;
    final api = ApiClient(
      client: MockClient((req) async {
        path = req.url.path;
        if (path == '/api/v1/request-board') {
          return _json({'id': 13}, 201);
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: CreateRequestScreen(api: api)));
    await tester.tap(find.text('Need a service'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Title'), 'Deep clean apartment');
    await tester.tap(find.text('Service category'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cleaning').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Describe what you need'),
        '3-bedroom deep clean before move-in.');
    // drag the list to reveal the submit button (ListView builds lazily)
    await tester.dragUntilVisible(
        find.text('Post request'), find.byType(ListView).first, const Offset(0, -200));
    await tester.pump();
    await tester.tap(find.text('Post request'), warnIfMissed: false);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    // REQUES-14: the web UI always posts to /request-board — GOODS and SERVICE
    // alike; the legacy /request-board/service endpoint is never called.
    expect(path, '/api/v1/request-board');
    AuthStore.instance = null;
  });
}
