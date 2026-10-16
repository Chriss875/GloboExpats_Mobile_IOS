import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/account_misc_screens.dart';

/// Profile Information is now only profile information, switching between
/// Profile / Payout / Addresses with a top pill-button bar (web parity:
/// `ProfileSectionShortcuts`) — one section visible at a time, not an
/// accordion. Security moved to its own screen, reached from the Account tab
/// below Verification (see account_tab_test.dart and
/// security_screen_test.dart). Neither "My payments" nor "Payment methods"
/// belong on this page — the real web page doesn't have them here either.
http.Response _userDetails({bool seller = false}) => http.Response(
    jsonEncode({
      'userId': 7,
      'roles': [if (seller) {'roleName': 'SELLER'}],
    }),
    200,
    headers: {'content-type': 'application/json'});

Widget _settings({bool seller = false}) {
  // SettingsScreen reads its own injected `api`, but the token it checks
  // before prefilling comes from the AuthStore singleton - without one here,
  // `_prefill()` returns before ever calling `getUserDetails`, so `_isSeller`
  // could never become true no matter what the mock returns.
  AuthStore.instance = AuthStore(initialToken: 'jwt', initialEmail: 'a@b.com');
  return MaterialApp(
    home: SettingsScreen(
      api: ApiClient(
        client: MockClient((req) async {
          if (req.url.path.endsWith('/user-details')) {
            return _userDetails(seller: seller);
          }
          return http.Response('{}', 200,
              headers: {'content-type': 'application/json'});
        }),
      ),
    ),
  );
}

void main() {
  setUp(() => AuthStore.instance = null);

  testWidgets('opens on the Profile section', (tester) async {
    await tester.pumpWidget(_settings());
    await tester.pumpAndSettle();

    // A top pill-tab bar, not a tab bar or an accordion header.
    expect(find.byKey(const ValueKey('profile-tabs')), findsOneWidget);
    expect(find.text('Security'), findsNothing);

    // Profile keeps every field the web profile form has, in the web's order:
    // First/Last Name, Email (read-only + Verified), WhatsApp, About Me, then
    // a bordered Organization Details block - About Me BEFORE Organization,
    // which used to be reversed. All visible immediately, no expanding.
    for (final label in [
      'First Name',
      'Last Name',
      'Email Address',
      'WhatsApp Number',
      'About Me / Bio (Optional)',
      'Organization Details',
      'Organization',
      'Position (Optional)',
    ]) {
      expect(find.text(label), findsOneWidget, reason: 'missing $label');
    }
    // No photo yet, so the button offers to add one.
    expect(find.text('Add photo'), findsOneWidget);
    expect(find.text('Verified'), findsOneWidget);
  });

  testWidgets('tapping Addresses switches to the Addresses section, replacing Profile',
      (tester) async {
    await tester.pumpWidget(_settings());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Addresses'));
    await tester.pumpAndSettle();

    expect(find.text('Shipping Addresses'), findsOneWidget);
    expect(find.text('Add New'), findsOneWidget);
    // Only one section shows at a time.
    expect(find.text('First Name'), findsNothing);
  });

  testWidgets('Payout is not offered as a section for a non-seller', (tester) async {
    await tester.pumpWidget(_settings());
    await tester.pumpAndSettle();

    expect(find.text('Payout'), findsNothing);
  });

  testWidgets('Payout appears and switches for a seller', (tester) async {
    await tester.pumpWidget(_settings(seller: true));
    await tester.pumpAndSettle();

    expect(find.text('Payout'), findsOneWidget);
    expect(find.text('Payout details'), findsNothing);

    await tester.tap(find.text('Payout'));
    await tester.pumpAndSettle();

    // Web copy: the card heading is 'Payout details' (seller-payout-details.tsx).
    expect(find.text('Payout details'), findsOneWidget);
    expect(find.text('First Name'), findsNothing);
  });

  testWidgets('My payments and Payment methods are not on this page', (tester) async {
    await tester.pumpWidget(_settings(seller: true));
    await tester.pumpAndSettle();

    for (final tab in ['Profile', 'Payout', 'Addresses']) {
      await tester.tap(find.text(tab));
      await tester.pumpAndSettle();
      expect(find.text('My payments'), findsNothing);
      expect(find.text('Payment methods'), findsNothing);
      expect(find.text('Help & about'), findsNothing);
      expect(find.text('Log out'), findsNothing);
    }
  });

  testWidgets('the sign-in email is shown but not editable', (tester) async {
    await tester.pumpWidget(_settings());
    await tester.pumpAndSettle();

    final email = tester.widget<TextFormField>(
      find.byKey(const Key('settings-email')),
    );
    expect(email.enabled, isFalse);
  });
}
