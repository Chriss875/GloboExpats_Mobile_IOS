// The first-run guide: five slides, Skip, and a Next that becomes
// "Get started" — and it only ever shows itself to a new user, once.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/welcome_guide_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await KvStore.instance.remove(WelcomeGuideScreen.seenKey);
    AuthStore.instance = null;
  });

  Future<void> pumpGuide(WidgetTester tester,
      {ValueChanged<bool>? onDone}) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
        MaterialApp(home: WelcomeGuideScreen(onDone: onDone)));
    await tester.pumpAndSettle();
  }

  testWidgets('walks through five slides to Get started', (tester) async {
    final done = <bool>[];
    await pumpGuide(tester, onDone: done.add);

    expect(find.text('Buy. Sell. Connect.'), findsOneWidget);
    final next = find.byKey(const ValueKey('welcome-guide-next'));
    for (final title in [
      'Find it, choose it, check out once',
      'Pay your way, in TZS',
      'Book a stay. Track every handover.',
      'Sell, get paid, ask the community',
    ]) {
      await tester.tap(next);
      await tester.pumpAndSettle();
      expect(find.text(title), findsOneWidget);
    }
    // The last slide: no Skip, and Next has become Get started.
    expect(find.text('Get started'), findsOneWidget);
    expect(tester.widget<AnimatedOpacity>(find.ancestor(
            of: find.byKey(const ValueKey('welcome-guide-skip')),
            matching: find.byType(AnimatedOpacity))).opacity,
        0);

    await tester.tap(next);
    await tester.pumpAndSettle();
    expect(done, [true], reason: 'Get started leads on to the tour');
    expect(WelcomeGuideScreen.seen, isTrue);
  });

  testWidgets('the payments slide lists bank first, in checkout order',
      (tester) async {
    await pumpGuide(tester);
    await tester.tap(find.byKey(const ValueKey('welcome-guide-next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('welcome-guide-next')));
    await tester.pumpAndSettle();
    final bank = tester.getCenter(find.text('Bank Account'));
    final mobile = tester.getCenter(find.text('Mobile Money'));
    final selcom = tester.getCenter(find.text('Selcom App'));
    expect(bank.dy, lessThan(mobile.dy));
    expect(mobile.dy, lessThan(selcom.dy));
  });

  testWidgets('Skip finishes and remembers', (tester) async {
    final done = <bool>[];
    await pumpGuide(tester, onDone: done.add);
    await tester.tap(find.byKey(const ValueKey('welcome-guide-skip')));
    await tester.pumpAndSettle();
    expect(done, [false], reason: 'skipping does not start the tour');
    expect(WelcomeGuideScreen.seen, isTrue);
  });

  group('WelcomeGuideGate', () {
    Future<void> pumpGate(WidgetTester tester) async {
      final key = GlobalKey<NavigatorState>();
      await tester.pumpWidget(MaterialApp(
        navigatorKey: key,
        builder: (context, child) => WelcomeGuideGate(
            navigatorKey: key, enabled: true, child: child!),
        home: const Scaffold(body: Text('Home')),
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('greets a new user on a fresh install', (tester) async {
      await pumpGate(tester);
      expect(find.byKey(const ValueKey('welcome-guide')), findsOneWidget);
    });

    testWidgets('never shows again once seen', (tester) async {
      await WelcomeGuideScreen.markSeen();
      await pumpGate(tester);
      expect(find.byKey(const ValueKey('welcome-guide')), findsNothing);
      expect(find.text('Home'), findsOneWidget);
    });

    testWidgets('leaves a signed-in user alone', (tester) async {
      AuthStore.instance =
          AuthStore(initialToken: 'jwt', initialEmail: 'a@b.com');
      await pumpGate(tester);
      expect(find.byKey(const ValueKey('welcome-guide')), findsNothing);
      expect(WelcomeGuideScreen.seen, isTrue);
      AuthStore.instance = null;
    });
  });
}
