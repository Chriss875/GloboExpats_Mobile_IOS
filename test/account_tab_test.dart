import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/shell.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// The Account tab used to carry eleven rows plus Log out — most with no
/// equivalent in the web's own mobile menu, which offers exactly "Account
/// Settings" and "Verification" to an ordinary user. This pins the trim:
/// Profile information, Verification, Security (moved off Profile
/// Information's own tab bar so that screen is only profile information),
/// Admin only for an actual admin (previously shown to every signed-in user
/// regardless of role), then Help & about and Log out - neither of which has
/// a home inside Profile Information (that page is Profile/Payout/Addresses
/// only, per settings_tabs_test.dart).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  http.Response userDetailsResponse(List<String> roleNames) => http.Response(
      jsonEncode({
        'userId': 7,
        'roles': [for (final r in roleNames) {'roleName': r}],
      }),
      200,
      headers: {'content-type': 'application/json'});

  Future<void> pump(WidgetTester tester, List<String> roles) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/user-details')) return userDetailsResponse(roles);
        // Seller-only on the backend: nobody here is a seller.
        if (req.url.path.endsWith('/working-schedule')) {
          return http.Response('{}', 403, headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 200, headers: {'content-type': 'application/json'});
      }),
    );
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: AccountScreen(store: auth))));
    await tester.pumpAndSettle();
  }

  testWidgets('an ordinary user sees Profile information, Verification and Security',
      (tester) async {
    await pump(tester, ['BUYER']);

    expect(find.text('Profile information'), findsOneWidget);
    expect(find.text('Verification'), findsOneWidget);
    expect(find.text('Security'), findsOneWidget);
    expect(find.text('Admin'), findsNothing);
    // Help & about and Log out live here, not inside Profile Information.
    // The replayable welcome guide sits with them under Support.
    await tester.scrollUntilVisible(find.text('Log out'), 200,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('App guide'), findsOneWidget);
    expect(find.text('Help & about'), findsOneWidget);
    expect(find.text('Log out'), findsOneWidget);

    // Security sits below Verification, not above it.
    final verificationY = tester.getCenter(find.text('Verification')).dy;
    final securityY = tester.getCenter(find.text('Security')).dy;
    expect(securityY, greaterThan(verificationY));

    // None of the other old rows remain — they either duplicate a
    // bottom-bar/top-bar destination (orders, saved items, notifications) or
    // have no confirmed home at all (payments, payment methods).
    for (final gone in [
      'My orders',
      'My payments',
      'Saved items',
      'Addresses',
      'Settings',
      'Notifications',
      'Payment methods',
      'Account verification',
      'Insights',
    ]) {
      expect(find.text(gone), findsNothing, reason: '"$gone" should no longer be on Account');
    }
  });

  testWidgets('an admin sees exactly what everyone else does', (tester) async {
    // Platform management is a web-only surface: the app offers no entry
    // point to it for anyone, so the role is not even read any more.
    await pump(tester, ['BUYER', 'ADMIN']);

    expect(find.text('Profile information'), findsOneWidget);
    expect(find.text('Verification'), findsOneWidget);
    expect(find.text('Admin'), findsNothing);
  });

  testWidgets('a failed profile lookup still renders the tab', (tester) async {
    final api = ApiClient(client: MockClient((_) async => http.Response('', 500)));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: AccountScreen(store: auth))));
    await tester.pumpAndSettle();

    expect(find.text('Profile information'), findsOneWidget);
    expect(find.text('Admin'), findsNothing);
  });
}
