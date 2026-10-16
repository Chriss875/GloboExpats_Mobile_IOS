import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/account_misc_screens.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('AU-059: profile editor prefills from user-details and saves via editProfile',
      (tester) async {
    final calls = <String, String?>{};
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json({
            'userId': 7,
            'firstName': 'Amina',
            'lastName': 'Juma',
            'whatsAppPhoneNumber': '+255700000001',
            'aboutMe': 'Expat in Dar.',
          });
        }
        if (req.url.path == '/api/v1/userManagement/editProfile') {
          // Backend controller source: `@PatchMapping("/editProfile")` only -
          // confirmed by reading UserManagementController.java, not assumed.
          // A POST here gets a bare 405 from Spring; this pins the method so
          // it can never silently regress back to POST.
          calls['editProfile-method'] = req.method;
          // multipart: capture the JSON part
          final body = req.body;
          calls['editProfile'] = body.contains('firstName')
              ? 'has-profile-json'
              : 'unexpected';
          return _json({'success': true});
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: SettingsScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Amina'), findsOneWidget);
    expect(find.text('Juma'), findsOneWidget);

    // The Save bar is always on screen, so how to save is never a question.
    expect(
        tester
            .widget<ButtonStyleButton>(find.byKey(const ValueKey('profile-save')))
            .onPressed,
        isNull,
        reason: 'Save is always there, but only lights up once something changed');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'About Me / Bio (Optional)'),
        'Expat in Dar, loves the coast.');
    await tester.pump();
    expect(find.text('You have unsaved changes in your profile'), findsOneWidget);
    // The form grew (photo, organization, position, embedded addresses), so
    // Save sits below the fold of the 800x600 test viewport. ensureVisible,
    // not scrollUntilVisible: the button is already built inside the
    // ListView's cache extent, so scrollUntilVisible finds it and returns
    // without scrolling.
    await tester.ensureVisible(find.text('Save Changes'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save Changes'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(calls['editProfile'], 'has-profile-json',
        reason: 'save posts the profileInformationDTO part');
    expect(calls['editProfile-method'], 'PATCH');
    AuthStore.instance = null;
  });

  testWidgets(
      'a WhatsApp-already-used conflict from the backend reaches the user '
      'verbatim, not a generic "Something went wrong"',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json({'userId': 7, 'firstName': 'Amina', 'lastName': 'Juma'});
        }
        if (req.url.path == '/api/v1/userManagement/editProfile') {
          // Real backend shape: GlobalExceptionHandler.handleUsernameExistsException
          // -> 409 {errorCode, code, message}.
          return _json({
            'errorCode': 'WHATSAPP_PHONE_ALREADY_EXISTS',
            'code': 'WHATSAPP_PHONE_ALREADY_EXISTS',
            'message':
                'This WhatsApp number is already linked to another account. Please use a different number.',
          }, 409);
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: SettingsScreen(api: api)));
    await tester.pumpAndSettle();

    // Pasted with its code, so the country box picks Tanzania itself.
    await tester.enterText(
        find.byKey(const ValueKey('phone-national')), '+255712345678');
    await tester.pump();
    await tester.ensureVisible(find.text('Save Changes'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save Changes'), warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(
        find.text(
            'This WhatsApp number is already linked to another account. Please use a different number.'),
        findsOneWidget);
    expect(find.text('Something went wrong. Please try again.'), findsNothing);
    AuthStore.instance = null;
  });

  testWidgets(
      'WhatsApp number prefills even when the backend answers under a '
      'different key (web parity normalizeUserDetails)',
      (tester) async {
    // The real backend has been inconsistent across code paths about which
    // exact key/casing carries this field; web never trusts
    // `whatsAppPhoneNumber` alone (lib/api.ts `normalizeUserDetails` falls
    // through whatsAppPhoneNumber -> whatsappPhoneNumber -> whatsapp ->
    // phoneNumber). Here the backend answers only `phoneNumber` - the last
    // link in that chain - to prove ApiClient.getUserDetails carries the
    // same fallback, not just the exact-key case already covered above.
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json({
            'userId': 8,
            'firstName': 'Baraka',
            'lastName': 'Mushi',
            'phoneNumber': '+255700000099',
          });
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: SettingsScreen(api: api)));
    await tester.pumpAndSettle();

    // Split for display: the dial code in its box, the digits in the field.
    final whatsapp =
        tester.widget<TextField>(find.byKey(const ValueKey('phone-national')));
    expect(whatsapp.controller?.text, '700000099');
    expect(find.text('+255'), findsOneWidget);
    AuthStore.instance = null;
  });

  testWidgets(
      'Discard reverts an edited field and makes the Save bar disappear '
      '(web parity discardChanges)',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json({'userId': 7, 'firstName': 'Amina', 'lastName': 'Juma'});
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: SettingsScreen(api: api)));
    await tester.pumpAndSettle();

    expect(
        tester
            .widget<ButtonStyleButton>(find.byKey(const ValueKey('profile-save')))
            .onPressed,
        isNull,
        reason: 'Save is always there, but only lights up once something changed');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'First Name'), 'Zawadi');
    await tester.pump();
    expect(find.text('You have unsaved changes in your profile'), findsOneWidget);

    await tester.ensureVisible(find.text('Discard'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Discard'), warnIfMissed: false);
    await tester.pumpAndSettle();

    // Reverted to the last-loaded snapshot, and the bar is gone again.
    expect(find.text('Amina'), findsOneWidget);
    expect(find.text('Zawadi'), findsNothing);
    expect(
        tester
            .widget<ButtonStyleButton>(find.byKey(const ValueKey('profile-save')))
            .onPressed,
        isNull,
        reason: 'Save is always there, but only lights up once something changed');
    expect(find.text('You have unsaved changes in your profile'), findsNothing);
    AuthStore.instance = null;
  });
}
