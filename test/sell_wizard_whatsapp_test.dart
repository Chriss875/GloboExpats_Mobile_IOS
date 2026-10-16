import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';
import 'package:globoexpats_mobile/screens/sell/sell_wizard_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

/// Web parity `app/sell/page.tsx`: `phoneToUse = user.whatsAppPhoneNumber ||
/// user.phoneNumber; if (phoneToUse && !formData.whatsappNumber) …` - the
/// listing's WhatsApp field is a read-only reflection of the seller's own
/// profile value. Mobile never fetched the profile at all here before, so
/// this field was always blank regardless of what was saved.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    KvStore.instance.remove('sell_form_draft');
  });

  testWidgets('the WhatsApp field autofills from the profile, not left blank',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json({'userId': 9, 'whatsAppPhoneNumber': '+255712345678'});
        }
        if (req.url.path == '/api/v1/products/categories') {
          return _json([]);
        }
        return _json({});
      }),
    );
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    AuthStore.instance = auth;

    await tester.pumpWidget(MaterialApp(home: SellWizardScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    // Web parity: the dial code sits in its own country box and the field
    // holds the national digits (a disabled `PhoneInput`). The field's key
    // still carries the whole stored value.
    expect(find.byKey(const ValueKey('sell-whatsapp-+255712345678')),
        findsOneWidget);
    final field = tester.widget<TextFormField>(
        find.byKey(const ValueKey('sell-whatsapp-+255712345678')));
    expect(field.initialValue, '712345678');
    expect(find.text('+255'), findsOneWidget);
    AuthStore.instance = null;
  });

  testWidgets('a value already typed (or restored from a draft) is never overwritten',
      (tester) async {
    // The profile fetch resolves after first paint; if it raced past the
    // isEmpty guard it would clobber whatever the seller already has here.
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json({'userId': 9, 'whatsAppPhoneNumber': '+255700000000'});
        }
        if (req.url.path == '/api/v1/products/categories') {
          return _json([]);
        }
        return _json({});
      }),
    );
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    AuthStore.instance = auth;
    // Simulate a restored draft that already carries a WhatsApp number.
    await KvStore.instance.setString(
        'sell_form_draft',
        jsonEncode({
          '_scope': SellFormState.draftScope,
          'title': 'Sofa',
          'whatsappNumber': '+255799999999'
        }));

    await tester.pumpWidget(MaterialApp(home: SellWizardScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    final field = tester.widget<TextFormField>(
        find.byKey(const ValueKey('sell-whatsapp-+255799999999')));
    expect(field.initialValue, '799999999',
        reason: 'the restored draft value survived the profile fetch');
    AuthStore.instance = null;
  });
}
