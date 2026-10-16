import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/screens/account_misc_screens.dart';

/// Security used to be a tab on Profile Information; it is now its own
/// screen, reached from the Account tab below Verification. Same
/// change-password form and behaviour, just no longer sharing state with the
/// profile form.
void main() {
  Widget security() => MaterialApp(
        home: SecurityScreen(
          api: ApiClient(client: MockClient((_) async => http.Response('{}', 200))),
        ),
      );

  testWidgets('shows the change-password form directly - no tab to switch to',
      (tester) async {
    await tester.pumpWidget(security());
    await tester.pumpAndSettle();

    expect(find.text('Security'), findsOneWidget); // AppBar title
    expect(find.text('Current password'), findsOneWidget);
    expect(find.text('New password'), findsOneWidget);
    expect(find.text('Confirm new password'), findsOneWidget);
  });

  testWidgets('a mismatched confirmation blocks the change', (tester) async {
    await tester.pumpWidget(security());
    await tester.pumpAndSettle();

    await tester.enterText(
        find.widgetWithText(TextFormField, 'Current password'), 'oldpassword');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'New password'), 'newpassword1');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Confirm new password'), 'nope');
    await tester.tap(find.text('Change password').last);
    await tester.pumpAndSettle();

    expect(find.text('Passwords do not match'), findsOneWidget);
  });
}
