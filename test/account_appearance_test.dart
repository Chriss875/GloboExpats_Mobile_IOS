import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/shell.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:globoexpats_mobile/theme.dart';
import 'package:globoexpats_mobile/theme_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _json(Object body) => http.Response(jsonEncode(body), 200,
    headers: {'content-type': 'application/json'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  ApiClient buildApi({bool admin = false, bool verified = true}) => ApiClient(
        client: MockClient((req) async {
          if (req.url.path.endsWith('/user-details')) {
            return _json({
              'userId': 7,
              'firstName': 'Globo',
              'lastName': 'Expat',
              'isVerified': verified,
              'roles': [
                {'roleName': admin ? 'ADMIN' : 'USER'}
              ],
            });
          }
          return _json({});
        }),
      );

  Future<void> pumpAccount(WidgetTester tester, {ApiClient? api}) async {
    // Tall enough for the whole tab: the Shop profile card sits above the
    // groups, and the list only builds what is on screen.
    tester.view.physicalSize = const Size(800, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final client = api ?? buildApi();
    final store =
        AuthStore(api: client, initialToken: 'jwt', initialEmail: 'a@b.com');
    AuthStore.instance = store;
    await tester.pumpWidget(ListenableBuilder(
      listenable: ThemeController.instance,
      builder: (context, _) => MaterialApp(
        theme: buildAppTheme(),
        darkTheme: buildAppDarkTheme(),
        themeMode: ThemeController.instance.mode,
        home: Scaffold(body: AccountScreen(store: store)),
      ),
    ));
    await tester.pumpAndSettle();
  }

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await KvStore.instance.load();
    await ThemeController.instance.setMode(ThemeMode.system);
  });

  tearDown(() => AuthStore.instance = null);

  testWidgets('the account tab groups its rows and names the signed-in user',
      (tester) async {
    await pumpAccount(tester);

    // The shop card leads the tab under the public (masked) name.
    expect(find.text('Globo E.'), findsOneWidget);
    expect(find.text('SHOP PROFILE'), findsOneWidget);
    expect(find.text('Verified'), findsOneWidget);
    for (final heading in const ['ACCOUNT', 'PREFERENCES', 'SUPPORT']) {
      expect(find.text(heading), findsOneWidget);
    }
    for (final row in const [
      'Profile information',
      'Verification',
      'Security',
      'Appearance',
      'Help & about',
    ]) {
      expect(find.text(row), findsOneWidget);
    }
    // Admin stays hidden for a non-admin, as before the redesign.
    expect(find.text('Admin'), findsNothing);
  });

  testWidgets('an unverified account is told so, rather than shown a pill',
      (tester) async {
    await pumpAccount(tester, api: buildApi(verified: false));

    expect(find.text('Verified'), findsNothing);
    expect(find.text('Not yet verified'), findsOneWidget);
    expect(find.text('Action needed'), findsOneWidget);
  });

  testWidgets('even an admin gets no Admin row — that surface is web-only',
      (tester) async {
    await pumpAccount(tester, api: buildApi(admin: true));
    expect(find.text('Admin'), findsNothing);
    expect(find.text('Platform management'), findsNothing);
  });

  testWidgets('Appearance shows the current mode and switches the app to dark',
      (tester) async {
    await pumpAccount(tester);

    // Defaults to following the phone.
    expect(find.text('System'), findsOneWidget);
    expect(ThemeController.instance.mode, ThemeMode.system);

    await tester.tap(find.text('Appearance'));
    await tester.pumpAndSettle();

    // The sheet offers all three, then the choice takes effect immediately.
    expect(find.text('Light'), findsOneWidget);
    expect(find.text('Dark'), findsOneWidget);
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();

    expect(ThemeController.instance.mode, ThemeMode.dark);
    // The row now reads back the new value…
    expect(find.text('Dark'), findsOneWidget);
    // …and the app is actually painting the dark palette, not just storing it.
    final context = tester.element(find.byType(AccountScreen));
    expect(Theme.of(context).brightness, Brightness.dark);
    expect(AppPalette.of(context).surface, AppPalette.dark.surface);
  });

  testWidgets('choosing a mode writes it to storage', (tester) async {
    await pumpAccount(tester);
    await tester.tap(find.text('Appearance'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Light'));
    await tester.pumpAndSettle();

    expect(ThemeController.instance.mode, ThemeMode.light);
    expect(KvStore.instance.getString('theme_mode'), 'light',
        reason: 'the preference must outlive the process');
  });

  test('a cold start reads the mode back out of storage', () async {
    // The other half of the round-trip: main() calls restore() before the
    // first frame, so a stored choice is already in effect when the app paints.
    await KvStore.instance.setString('theme_mode', 'dark');
    ThemeController.instance.restore();
    expect(ThemeController.instance.mode, ThemeMode.dark);

    // "System" is a choice like any other and is restored as itself.
    await KvStore.instance.setString('theme_mode', 'system');
    ThemeController.instance.restore();
    expect(ThemeController.instance.mode, ThemeMode.system);

    // An absent or unrecognised value falls back to LIGHT rather than
    // throwing. It used to follow the system, which opened the app in dark
    // mode on a dark phone — the least-finished surface — for an account
    // that had never expressed a preference at all.
    await KvStore.instance.setString('theme_mode', 'sepia');
    ThemeController.instance.restore();
    expect(ThemeController.instance.mode, ThemeMode.light);
  });

  test('both themes expose their palette, and dark really is darker', () {
    final light = buildAppTheme();
    final dark = buildAppDarkTheme();

    expect(light.extension<AppPalette>(), AppPalette.light);
    expect(dark.extension<AppPalette>(), AppPalette.dark);
    expect(dark.brightness, Brightness.dark);
    expect(AppPalette.dark.background.computeLuminance(),
        lessThan(AppPalette.light.background.computeLuminance()));
    // Text must invert with the surface or the dark theme is unreadable.
    expect(AppPalette.dark.textPrimary.computeLuminance(),
        greaterThan(AppPalette.dark.surface.computeLuminance()));
  });
}
