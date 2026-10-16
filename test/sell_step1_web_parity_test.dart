import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/domain/phone_display.dart';
import 'package:globoexpats_mobile/screens/sell/sell_wizard_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "this is how first page of sell should look like" — the desktop's
/// `app/sell/page.tsx` at phone width.
///
/// Mobile had written its own page: an app-bar title instead of the heading,
/// a row of four numbered dots instead of the step card, invented section
/// copy ("What are you selling?"), floating field labels with prefix icons,
/// a radio list of addresses, and no "Clear all" until the review step.
void main() {
  http.Response ok(Object body) =>
      http.Response(jsonEncode(body), 200, headers: {
        'content-type': 'application/json',
      });

  ApiClient api() => ApiClient(client: MockClient((req) async {
        final path = req.url.path;
        if (path == '/api/v1/userManagement/user-details') {
          return ok({'userId': 9, 'whatsAppPhoneNumber': '+255693749306'});
        }
        if (path == '/api/v1/products/categories') {
          return ok([
            {
              'categoryId': 1,
              'categoryName': 'Electronics',
              'subcategories': [
                {'subcategoryId': 11, 'subcategoryName': 'Phones'}
              ],
            }
          ]);
        }
        if (path.endsWith('/get-addresses')) {
          return ok([
            {
              'addressId': 7,
              'label': 'Work',
              'street': 'morroco road',
              'region': 'dar es salaam',
              'country': 'tanzania',
              'latitude': -6.78,
              'longitude': 39.26,
              'default': true,
            },
          ]);
        }
        return ok({});
      }));

  Future<void> pumpSell(WidgetTester tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final client = api();
    final auth =
        AuthStore(api: client, initialToken: 'jwt', initialEmail: 'a@b.com');
    AuthStore.instance = auth;
    addTearDown(() => AuthStore.instance = null);
    await tester.pumpWidget(
        MaterialApp(home: SellWizardScreen(auth: auth, api: client)));
    await tester.pumpAndSettle();
  }

  Future<void> reveal(WidgetTester tester, Finder finder) async {
    await tester.scrollUntilVisible(finder, 150,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
  }

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    KvStore.instance.remove('sell_form_draft');
  });

  group('the page chrome', () {
    testWidgets('leads with the heading and the step card', (tester) async {
      await pumpSell(tester);

      expect(find.text("List Your Item - it's free"), findsOneWidget);
      expect(find.text('STEP 1 OF 4'), findsOneWidget);
      expect(find.text('Basic Details'), findsOneWidget,
          reason: 'web STEP_TITLES[0]');
      expect(find.text('25%'), findsOneWidget);

      final bar = tester.widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator));
      expect(bar.value, closeTo(0.25, 0.001));
    });

    testWidgets('the card is numbered, named and clearable', (tester) async {
      await pumpSell(tester);

      expect(find.text('Basic Item Details'), findsOneWidget);
      expect(find.text('Clear all'), findsOneWidget,
          reason: 'the web offers it from step 1, not only on review');
      // The copy mobile had made up for this page.
      expect(find.text('What are you selling?'), findsNothing);
    });
  });

  group('the fields', () {
    testWidgets('carry the web labels, placeholders and helper lines',
        (tester) async {
      await pumpSell(tester);

      expect(find.text('Item Title *'), findsOneWidget);
      expect(find.text('e.g., MacBook Pro 14″ M2'), findsOneWidget);
      expect(find.text('Include model and key features'), findsOneWidget);
      expect(find.text('Category *'), findsOneWidget);
      expect(find.text('Select category'), findsOneWidget);
      expect(find.text('Subcategory *'), findsOneWidget);
      expect(find.text('Choose category first'), findsOneWidget);
    });

    testWidgets('the label sits above its input, not floating inside it',
        (tester) async {
      await pumpSell(tester);

      final label = tester.getRect(find.text('Item Title *'));
      final field = tester.getRect(find.byType(TextFormField).first);
      expect(label.bottom, lessThanOrEqualTo(field.top),
          reason: 'web renders a <Label> above the <Input>');
    });

    testWidgets('the saved-address picker is the web dropdown', (tester) async {
      await pumpSell(tester);
      await reveal(tester, find.text('Select From Saved Addresses'));

      expect(find.textContaining('Tip:'), findsOneWidget);
      expect(find.text('Select From Saved Addresses'), findsOneWidget);
      expect(find.byType(DropdownButtonFormField<int>), findsOneWidget);
      expect(find.byType(RadioListTile<int>), findsNothing,
          reason: 'the radio list was mobile-only');

      // The default address is preselected and reads as one line.
      expect(find.text('Work'), findsOneWidget);
    });

    testWidgets('WhatsApp shows a country box and the national digits',
        (tester) async {
      await pumpSell(tester);
      await reveal(tester, find.text('WhatsApp Number *'));

      expect(find.text('+255'), findsOneWidget,
          reason: 'web renders a disabled PhoneInput with the dial code in '
              'its own box');
      final field = tester.widget<TextFormField>(
          find.byKey(const ValueKey('sell-whatsapp-+255693749306')));
      expect(field.initialValue, '693749306');
      expect(find.textContaining('This number is pulled from your profile'),
          findsOneWidget);
    });
  });

  group('splitting a stored number', () {
    test('the longest dial code wins', () {
      final tz = splitPhoneForDisplay('+255693749306');
      expect(tz.dialCode, '+255');
      expect(tz.nationalNumber, '693749306');
      expect(tz.flag, '🇹🇿');

      final ke = splitPhoneForDisplay('+254712000000');
      expect(ke.dialCode, '+254');
      expect(ke.nationalNumber, '712000000');

      // +1 must not swallow a +254 number, and +27 must not swallow +2xx.
      expect(splitPhoneForDisplay('+27831234567').dialCode, '+27');
      expect(splitPhoneForDisplay('+12025550143').dialCode, '+1');
    });

    test('a bare national number keeps the default country', () {
      final local = splitPhoneForDisplay('0693749306');
      expect(local.dialCode, '+255');
      expect(local.nationalNumber, '0693749306',
          reason: "it is shown as the seller's profile stores it");
    });

    test('an empty or unlisted number still renders', () {
      expect(splitPhoneForDisplay(null).nationalNumber, '');
      expect(splitPhoneForDisplay('').dialCode, '+255');
      final unknown = splitPhoneForDisplay('+99912345');
      expect(unknown.flag, '🌐');
      expect(unknown.dialCode.startsWith('+'), isTrue);
    });
  });
}
