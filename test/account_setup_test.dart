// A new account is guided through what it still needs (WhatsApp number,
// pinned location, payout for sellers) wherever it meets the gap, instead of
// being sent to Settings and left there.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/domain/account_setup.dart';
import 'package:globoexpats_mobile/domain/countries.dart';
import 'package:globoexpats_mobile/domain/international_phone.dart';
import 'package:globoexpats_mobile/domain/seller_schedule.dart';
import 'package:globoexpats_mobile/screens/account_misc_screens.dart';
import 'package:globoexpats_mobile/screens/sell/sell_wizard_screen.dart';
import 'package:globoexpats_mobile/screens/working_hours_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:globoexpats_mobile/widgets/account_setup.dart';

http.Response _json(Object b, [int status = 200]) => http.Response(
    jsonEncode(b), status,
    headers: {'content-type': 'application/json'});

/// A backend for one account. [whatsapp] is what the profile holds;
/// saving through editProfile updates it, like the real one.
class _Backend {
  _Backend({
    this.whatsapp,
    this.addresses = const [],
    this.seller = false,
  });

  String? whatsapp;
  List<Map<String, dynamic>> addresses;
  bool seller;
  bool payoutConfigured = false;
  Map<String, dynamic>? schedule;
  final profileSaves = <Map<String, dynamic>>[];
  final scheduleSaves = <Map<String, dynamic>>[];

  late final api = ApiClient(client: MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/user-details')) {
      return _json({
        'userId': 7,
        'firstName': 'Amina',
        'lastName': 'Juma',
        if (whatsapp != null) 'whatsAppPhoneNumber': whatsapp,
        'roles': [
          if (seller) {'roleName': 'SELLER'}
        ],
      });
    }
    if (path.endsWith('/editProfile')) {
      final match =
          RegExp(r'\{"[^\r\n]*\}').firstMatch(req.body)!.group(0)!;
      final dto = (jsonDecode(match) as Map).cast<String, dynamic>();
      profileSaves.add(dto);
      if (dto['whatsAppPhoneNumber'] != null) {
        whatsapp = dto['whatsAppPhoneNumber'] as String;
      }
      return _json({'whatsAppPhoneNumber': whatsapp});
    }
    if (path.contains('get-addresses') || path.endsWith('/addresses')) {
      return _json(addresses);
    }
    if (path.endsWith('/prompt-status')) {
      return _json({
        'hasListings': seller,
        'configured': payoutConfigured,
        'shouldPrompt': seller && !payoutConfigured,
      });
    }
    if (path.endsWith('/working-schedule/timezones')) {
      return _json(['Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Europe/London']);
    }
    if (path.endsWith('/working-schedule')) {
      // Seller-only, like the backend's @PreAuthorize.
      if (!seller) return _json({'message': 'Forbidden'}, 403);
      if (req.method == 'PUT') {
        schedule = (jsonDecode(req.body) as Map).cast<String, dynamic>();
        scheduleSaves.add(schedule!);
      }
      return _json({
        'configured': schedule != null,
        'shouldPrompt': schedule == null,
        'schedule': schedule,
      });
    }
    if (path == '/api/v1/products/categories') return _json([]);
    return _json({});
  }));
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    ApiClient.invalidateReads();
    AccountSetup.instance.clear();
    AccountSetupNudge.debugReset();
  });
  tearDown(() {
    AuthStore.instance = null;
    AccountSetupNudge.debugEnabled = null;
  });

  group('WhatsApp numbers are built the way the backend stores them', () {
    test('no country is assumed for a bare national number', () {
      expect(normalizeInternationalPhone('0712 345 678'), '0712345678');
      expect(isValidInternationalPhone('0712345678'), isFalse,
          reason: 'the user has to say which country it belongs to');
    });

    test('the chosen country turns what was typed into the stored form', () {
      expect(formatInternationalPhone('+255', '0712345678'), '+255712345678');
      expect(formatInternationalPhone('+44', '07911 123456'), '+447911123456');
      expect(formatInternationalPhone('+39', '06 1234 5678'), '+390612345678',
          reason: 'Italian leading zeros are significant');
      expect(normalizeInternationalPhone('+255 0712 345 678'), '+255712345678');
      expect(isValidInternationalPhone('+447911123456'), isTrue);
    });

    test('a pasted +code picks its own country, longest code first', () {
      expect(formatInternationalPhone('+255', '+44 7911 123456'),
          '+447911123456');
      expect(countryForNumber('+255712345678')?.iso, 'TZ');
      expect(countryForNumber('+2507888')?.iso, 'RW');
      expect(countryForNumber('+14165550100', preferIso: 'CA')?.iso, 'CA',
          reason: 'a shared code keeps the country the user chose');
    });

    test('incomplete or malformed numbers are refused before saving', () {
      expect(isValidInternationalPhone(''), isFalse);
      expect(isValidInternationalPhone('+255 71'), isFalse);
      expect(isValidInternationalPhone('call me'), isFalse);
      expect(kCountries.length, greaterThan(180));
    });
  });

  group('the checklist', () {
    test('a brand new account needs WhatsApp and a location', () async {
      final b = _Backend();
      final s = await loadAccountSetup(b.api, 'jwt');
      expect(s.missing, [SetupStep.whatsapp, SetupStep.location]);
      expect(s.steps, isNot(contains(SetupStep.payout)),
          reason: 'payout only concerns sellers');
    });

    test('an address without a pin asks for the pin on that address', () async {
      final b = _Backend(whatsapp: '+255712345678', addresses: [
        {
          'addressId': 3,
          'street': 'Haile Selassie Rd',
          'region': 'Dar es Salaam',
          'country': 'Tanzania',
          'default': true,
        }
      ]);
      final s = await loadAccountSetup(b.api, 'jwt');
      expect(s.missing, [SetupStep.location]);
      expect(s.unpinnedAddress?['addressId'], 3);
    });

    test('a seller without a payout method is asked for one', () async {
      final b = _Backend(
          whatsapp: '+255712345678',
          seller: true,
          addresses: [
            {
              'addressId': 3,
              'street': 'Haile Selassie Rd',
              'region': 'Dar es Salaam',
              'country': 'Tanzania',
              'latitude': -6.77,
              'longitude': 39.27,
            }
          ]);
      final s = await loadAccountSetup(b.api, 'jwt');
      expect(s.missing, [SetupStep.workingHours, SetupStep.payout]);
      expect(s.doneCount, 2);
    });

    test('a buyer is never asked for working hours', () async {
      final s = await loadAccountSetup(_Backend().api, 'jwt');
      expect(s.steps, isNot(contains(SetupStep.workingHours)));
    });
  });

  testWidgets(
      'the Account card adds the WhatsApp number in place and ticks the step',
      (tester) async {
    final b = _Backend();
    AuthStore.instance =
        AuthStore(api: b.api, initialToken: 'jwt', initialEmail: 'a@b.com');
    tester.view.physicalSize = const Size(430, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ListView(
                children: [AccountSetupCard(api: b.api, token: 'jwt')]))));
    await tester.pumpAndSettle();

    expect(find.text('Finish setting up your account'), findsOneWidget);
    expect(find.text('0/2'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('account-setup-whatsapp')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('whatsapp-sheet')), findsOneWidget);

    expect(find.text('Code'), findsOneWidget,
        reason: 'no country is picked for the user');
    await tester.enterText(
        find.byKey(const ValueKey('phone-national')), '0712 345 678');
    await tester.tap(find.byKey(const ValueKey('whatsapp-sheet-save')));
    await tester.pumpAndSettle();
    expect(find.text('Choose your country code.'), findsOneWidget);
    expect(b.profileSaves, isEmpty);

    // The list most apps use: search, then pick.
    await tester.tap(find.byKey(const ValueKey('phone-country')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('country-search')), 'tanz');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('country-TZ')));
    await tester.pumpAndSettle();
    expect(find.text('+255'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('whatsapp-sheet-save')));
    await tester.pumpAndSettle();

    expect(b.profileSaves.single,
        {'whatsAppPhoneNumber': '+255712345678'},
        reason: 'only the number is sent, already in its stored form');
    expect(find.byKey(const ValueKey('whatsapp-sheet')), findsNothing);
    expect(find.text('1/2'), findsOneWidget);
    expect(find.text('Done'), findsOneWidget);
  });

  testWidgets('an incomplete number is caught in the sheet, not by the server',
      (tester) async {
    final b = _Backend();
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => TextButton(
          onPressed: () => showWhatsAppSheet(context, api: b.api, token: 'jwt'),
          child: const Text('open'),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('phone-national')), '+44 71');
    await tester.pumpAndSettle();
    expect(find.text('+44'), findsOneWidget, reason: 'the pasted code is picked');
    await tester.tap(find.byKey(const ValueKey('whatsapp-sheet-save')));
    await tester.pumpAndSettle();

    expect(find.textContaining('looks incomplete'), findsOneWidget);
    expect(b.profileSaves, isEmpty);
  });

  testWidgets('the account card is gone once everything is done',
      (tester) async {
    AccountSetup.instance.debugSet(
        const AccountSetupStatus(
            whatsapp: '+255712345678', hasPinnedAddress: true),
        token: 'jwt');
    final b = _Backend(whatsapp: '+255712345678', addresses: [
      {
        'addressId': 3,
        'street': 'Haile Selassie Rd',
        'region': 'Dar es Salaam',
        'country': 'Tanzania',
        'latitude': -6.77,
        'longitude': 39.27,
      }
    ]);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: AccountSetupCard(api: b.api, token: 'jwt'))));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('account-setup-card')), findsNothing);
  });

  group('selling without a WhatsApp number', () {
    Future<_Backend> openWizard(WidgetTester tester) async {
      final b = _Backend();
      final auth =
          AuthStore(api: b.api, initialToken: 'jwt', initialEmail: 'a@b.com');
      AuthStore.instance = auth;
      KvStore.instance.remove('sell_form_draft');
      tester.view.physicalSize = const Size(430, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
          MaterialApp(home: SellWizardScreen(auth: auth, api: b.api)));
      await tester.pumpAndSettle();
      return b;
    }

    testWidgets('says so plainly and adds it without leaving the listing',
        (tester) async {
      final b = await openWizard(tester);

      expect(find.byKey(const ValueKey('sell-whatsapp-missing')), findsOneWidget);
      expect(find.text('No WhatsApp number found. Please add one in your '
          'Profile Settings first.'), findsNothing);

      await tester.ensureVisible(find.byKey(const ValueKey('sell-add-whatsapp')));
      await tester.tap(find.byKey(const ValueKey('sell-add-whatsapp')));
      await tester.pumpAndSettle();
      // Pasted with its code, so the country picks itself.
      await tester.enterText(
          find.byKey(const ValueKey('phone-national')), '+255 712 345 678');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('whatsapp-sheet-save')));
      await tester.pumpAndSettle();

      expect(b.whatsapp, '+255712345678', reason: 'saved to the profile');
      expect(find.byKey(const ValueKey('sell-whatsapp-+255712345678')),
          findsOneWidget,
          reason: 'and the open listing now carries it');
      expect(find.byKey(const ValueKey('sell-whatsapp-missing')), findsNothing);
    });
  });

  testWidgets('Profile information only sends a WhatsApp number that changed',
      (tester) async {
    final b = _Backend(whatsapp: '+255712345678');
    AuthStore.instance =
        AuthStore(api: b.api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: SettingsScreen(api: b.api)));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.widgetWithText(TextFormField, 'First Name'), 'Zawadi');
    await tester.pump();
    await tester.tap(find.text('Save Changes'));
    await tester.pumpAndSettle();
    expect(b.profileSaves.last.containsKey('whatsAppPhoneNumber'), isFalse,
        reason: 're-sending the same number only re-runs the duplicate check');

    await tester.enterText(
        find.byKey(const ValueKey('phone-national')), '0754 000 111');
    await tester.pump();
    await tester.tap(find.text('Save Changes'));
    await tester.pumpAndSettle();
    expect(b.profileSaves.last['whatsAppPhoneNumber'], '+255754000111');
  });

  group('the welcome sheet after signing in', () {
    testWidgets('offers the checklist once, and "later" rests it',
        (tester) async {
      AccountSetupNudge.debugEnabled = true;
      final b = _Backend();
      late BuildContext ctx;
      await tester.pumpWidget(MaterialApp(
        home: Builder(builder: (context) {
          ctx = context;
          return const Scaffold();
        }),
      ));

      unawaitedShow() =>
          AccountSetupNudge.maybeShow(ctx, b.api, 'jwt', 'a@b.com');
      unawaitedShow();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('account-setup-welcome')), findsOneWidget);
      expect(find.text('WhatsApp number'), findsOneWidget);
      expect(find.text('Your location'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('account-setup-welcome-later')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('account-setup-welcome')), findsNothing);

      // A new session within the rest period stays quiet.
      AccountSetupNudge.debugReset();
      unawaitedShow();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('account-setup-welcome')), findsNothing);
    });

    testWidgets('signing in reminds again, whatever "later" said',
        (tester) async {
      AccountSetupNudge.debugEnabled = true;
      final b = _Backend();
      late BuildContext ctx;
      await tester.pumpWidget(MaterialApp(
        home: Builder(builder: (context) {
          ctx = context;
          return const Scaffold();
        }),
      ));
      AccountSetupNudge.maybeShow(ctx, b.api, 'jwt', 'again@b.com');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('account-setup-welcome-later')));
      await tester.pumpAndSettle();

      AccountSetupNudge.debugReset();
      AccountSetupNudge.maybeShow(ctx, b.api, 'jwt', 'again@b.com',
          freshSignIn: true);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('account-setup-welcome')), findsOneWidget);
    });

    testWidgets('a seller missing only payout is still reminded',
        (tester) async {
      AccountSetupNudge.debugEnabled = true;
      final b = _Backend(seller: true, whatsapp: '+255712345678', addresses: [
        {
          'addressId': 3,
          'street': 'Haile Selassie Rd',
          'region': 'Dar es Salaam',
          'country': 'Tanzania',
          'latitude': -6.77,
          'longitude': 39.27,
        }
      ])
        ..schedule = {'timezone': 'Africa/Dar_es_Salaam'};
      late BuildContext ctx;
      await tester.pumpWidget(MaterialApp(
        home: Builder(builder: (context) {
          ctx = context;
          return const Scaffold();
        }),
      ));
      AccountSetupNudge.maybeShow(ctx, b.api, 'jwt', 'seller@b.com');
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('account-setup-welcome')), findsOneWidget);
    });

    testWidgets('a freshly published listing asks for payout and hours',
        (tester) async {
      AccountSetupNudge.debugEnabled = true;
      final b = _Backend(seller: true, whatsapp: '+255712345678');
      final nav = GlobalKey<NavigatorState>();
      await tester.pumpWidget(MaterialApp(
          navigatorKey: nav, home: const Scaffold()));
      // Even inside the rest period: publishing is the moment it matters.
      await KvStore.instance.setString(
          'account_setup_snoozed_until:seller@b.com',
          '${DateTime.now().add(const Duration(days: 2)).millisecondsSinceEpoch}');
      AccountSetupNudge.afterListing(nav.currentState!, b.api, 'jwt');
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('account-setup-welcome')), findsOneWidget);
      expect(find.textContaining('Your listing is live'), findsOneWidget);
      expect(find.text('Working hours'), findsWidgets);
    });

    testWidgets('a finished account is never shown it', (tester) async {
      AccountSetupNudge.debugEnabled = true;
      final b = _Backend(whatsapp: '+255712345678', addresses: [
        {
          'addressId': 3,
          'street': 'Haile Selassie Rd',
          'region': 'Dar es Salaam',
          'country': 'Tanzania',
          'latitude': -6.77,
          'longitude': 39.27,
        }
      ]);
      late BuildContext ctx;
      await tester.pumpWidget(MaterialApp(
        home: Builder(builder: (context) {
          ctx = context;
          return const Scaffold();
        }),
      ));
      AccountSetupNudge.maybeShow(ctx, b.api, 'jwt', 'done@b.com');
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('account-setup-welcome')), findsNothing);
    });
  });

  group('working hours', () {
    testWidgets('a seller turns a day on, sets its hours and saves them',
        (tester) async {
      final b = _Backend(seller: true);
      AuthStore.instance =
          AuthStore(api: b.api, initialToken: 'jwt', initialEmail: 'a@b.com');
      tester.view.physicalSize = const Size(430, 2600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
          MaterialApp(home: WorkingHoursScreen(api: b.api)));
      await tester.pumpAndSettle();

      expect(find.text('When are you open?'), findsOneWidget);
      // Weekdays start open 09:00–17:00, the weekend closed.
      expect(find.byKey(const ValueKey('working-hours-MONDAY-opens')),
          findsOneWidget);
      expect(find.byKey(const ValueKey('working-hours-SATURDAY-opens')),
          findsNothing);

      await tester.tap(find.byKey(const ValueKey('working-hours-SATURDAY')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('working-hours-SATURDAY-opens')),
          findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('working-hours-save')));
      await tester.pumpAndSettle();

      final saved = b.scheduleSaves.single;
      expect(saved['timezone'], 'Africa/Dar_es_Salaam');
      expect((saved['days'] as Map).keys, containsAll(['MONDAY', 'SATURDAY']));
      expect((saved['days'] as Map)['SATURDAY'],
          {'opens': '09:00', 'closes': '17:00', 'overnight': false});
      expect(saved['excludeTanzaniaPublicHolidays'], isTrue);
    });

    test('schedule rules match the backend before saving', () {
      final base = SellerSchedule.initial();
      expect(validateSchedule(base), isNull);
      expect(validateSchedule(base.copyWith(days: {})),
          'Choose at least one working day.');
      final overnight = base
          .withDay('FRIDAY', const WorkingHours('18:00', '10:00'))
          .withDay('SATURDAY', const WorkingHours('09:00', '12:00'));
      expect(validateSchedule(overnight),
          "Friday overlaps the next day's opening time.");
      expect(const WorkingHours('18:00', '02:00').toJson()['overnight'], isTrue);
    });

    test("the backend's time and date shapes are read either way", () {
      final s = SellerSchedule.fromJson({
        'timezone': 'Africa/Nairobi',
        'days': {
          'MONDAY': {'opens': '08:30:00', 'closes': [17, 0], 'overnight': false}
        },
        'closedDates': [
          [2026, 12, 26],
          '2027-01-01'
        ],
      });
      expect(s.days['MONDAY']!.opens, '08:30');
      expect(s.days['MONDAY']!.closes, '17:00');
      expect(s.closedDates, ['2026-12-26', '2027-01-01']);
    });
  });
}
