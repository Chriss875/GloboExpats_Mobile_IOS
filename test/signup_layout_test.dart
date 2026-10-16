import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/auth_screens.dart';
import 'package:globoexpats_mobile/screens/register_screen.dart';
import 'package:globoexpats_mobile/widgets/auth_card.dart';

/// "Signup page needs to be relooked at. Apply similar UI as in the mobile
/// Web App" — reported from the phone.
///
/// Signup was a bare white page under a titled app bar with the name/email
/// form always open, while login one tap away was the web's blue-gradient
/// card with the two entry points. These pin the shared shell and the web's
/// step-1 structure (app/register/page.tsx: Google, then "Sign up with
/// Email", which reveals the form).
void main() {
  Widget signup() => MaterialApp(home: RegisterScreen(store: AuthStore()));

  testWidgets('signup uses the same card shell as login', (tester) async {
    await tester.pumpWidget(signup());
    await tester.pumpAndSettle();

    expect(find.byType(AuthCardScaffold), findsOneWidget);
    expect(find.text('Create Your Account'), findsOneWidget);
    // The wordmark the web card carries on a phone (`lg:hidden`).
    expect(find.textContaining('Globo'), findsWidgets);
  });

  testWidgets('login and signup share one shell', (tester) async {
    await tester.pumpWidget(MaterialApp(home: LoginScreen(store: AuthStore())));
    await tester.pumpAndSettle();
    expect(find.byType(AuthCardScaffold), findsOneWidget,
        reason: 'the two auth screens drifted apart once already — they are '
            'built from the same shell so they cannot again');
  });

  testWidgets('the name/email form waits behind "Sign up with Email"',
      (tester) async {
    await tester.pumpWidget(signup());
    await tester.pumpAndSettle();

    expect(find.byType(TextFormField), findsNothing,
        reason: 'web parity: step 1 offers the two ways in, not a form');
    expect(find.text('Sign up with Email'), findsOneWidget);

    await tester.tap(find.text('Sign up with Email'));
    await tester.pumpAndSettle();

    expect(find.byType(TextFormField), findsNWidgets(3));
    expect(find.text('Hide Email Signup'), findsOneWidget);
  });

  testWidgets('the card keeps its content height instead of filling the page',
      (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(signup());
    await tester.pumpAndSettle();

    final card =
        find.ancestor(of: find.byType(Form), matching: find.byType(Container)).first;
    final rect = tester.getRect(card);
    final scroll = tester.getRect(find.byType(SingleChildScrollView).first);

    expect(rect.height, lessThan(scroll.height - 40),
        reason: 'the card is absorbing the reserved column');
    final above = rect.top - (scroll.top + 20);
    final below = (scroll.bottom - 20) - rect.bottom;
    expect((above - below).abs(), lessThan(2),
        reason: 'card is off-centre: $above above vs $below below');
  });

  testWidgets('signup still offers the way back to sign in', (tester) async {
    await tester.pumpWidget(signup());
    await tester.pumpAndSettle();

    expect(find.text('Already have an account?'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
  });
}
