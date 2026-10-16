// The step-by-step tour: spotlight, explain, move between screens.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/app_tour.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:globoexpats_mobile/widgets/tour_anchor.dart';

void main() {
  final rootKey = GlobalKey<NavigatorState>();

  GoRouter router() => GoRouter(
        navigatorKey: rootKey,
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => const Scaffold(
              body: Column(children: [
                SizedBox(height: 80),
                TourAnchor(id: 'search', child: SizedBox(width: 200, height: 40)),
                Spacer(),
                TourAnchor(id: 'nav', child: SizedBox(width: 60, height: 60)),
              ]),
            ),
          ),
          GoRoute(
            path: '/space',
            builder: (_, __) => const Scaffold(
              body: Center(
                child: TourAnchor(
                    id: 'tabs', child: SizedBox(width: 300, height: 48)),
              ),
            ),
          ),
        ],
      );

  const steps = [
    TourStep(anchor: 'search', route: '/', title: 'Search', body: 'Find it.'),
    TourStep(anchor: 'nowhere', title: 'Ghost', body: 'Not on screen.'),
    TourStep(anchor: 'nav', title: 'Nav', body: 'Go places.'),
    TourStep(
        anchor: 'tabs', route: '/space', title: 'Tabs', body: 'Your space.'),
  ];

  Future<GoRouter> pump(WidgetTester tester) async {
    final r = router();
    addTearDown(r.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: r));
    await tester.pumpAndSettle();
    AppTour.start(rootKey.currentState!, only: steps);
    await tester.pumpAndSettle();
    return r;
  }

  setUp(() => AuthStore.instance = null);

  testWidgets('lights each feature and walks to another screen',
      (tester) async {
    final r = await pump(tester);
    expect(find.text('Search'), findsOneWidget);
    expect(find.text('1 of 4'), findsOneWidget);

    // A feature that is not on screen is skipped, not shown empty.
    await tester.tap(find.byKey(const ValueKey('app-tour-next')));
    await tester.pumpAndSettle();
    expect(find.text('Nav'), findsOneWidget);
    expect(find.text('Ghost'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('app-tour-next')));
    await tester.pumpAndSettle();
    expect(find.text('Tabs'), findsOneWidget);
    expect(r.routerDelegate.currentConfiguration.uri.path, '/space',
        reason: 'the tour took the user to the screen the feature is on');

    // Finish: the tour closes and leaves the user back home.
    await tester.tap(find.text('Finish'));
    await tester.pumpAndSettle();
    expect(AppTour.running, isFalse);
    expect(find.byKey(const ValueKey('app-tour-card')), findsNothing);
    expect(r.routerDelegate.currentConfiguration.uri.path, '/');
  });

  testWidgets('Back returns to the previous stop', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const ValueKey('app-tour-next')));
    await tester.pumpAndSettle();
    expect(find.text('Nav'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('app-tour-back')));
    await tester.pumpAndSettle();
    expect(find.text('Search'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('app-tour-skip')));
    await tester.pumpAndSettle();
    expect(AppTour.running, isFalse);
  });

  testWidgets('signed-out users skip the signed-in-only stops',
      (tester) async {
    final r = router();
    addTearDown(r.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: r));
    await tester.pumpAndSettle();
    AppTour.start(rootKey.currentState!, only: const [
      TourStep(anchor: 'tabs', route: '/space', needsSignIn: true,
          title: 'Tabs', body: '.'),
      TourStep(anchor: 'search', title: 'Search', body: '.'),
      TourStep(anchor: 'nav', signedOutOnly: true, title: 'Join', body: '.'),
    ]);
    await tester.pumpAndSettle();
    expect(find.text('Tabs'), findsNothing);
    expect(find.text('Search'), findsOneWidget);
    expect(find.text('1 of 2'), findsOneWidget,
        reason: 'the signed-out-only stop is counted, the signed-in one not');
    await tester.tap(find.byKey(const ValueKey('app-tour-next')));
    await tester.pumpAndSettle();
    expect(find.text('Join'), findsOneWidget);
    await tester.tap(find.text('Finish'));
    await tester.pumpAndSettle();
  });

  testWidgets('My Space explains its sections once, on the first signed-in visit',
      (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    AppTour.debugMySpaceEnabled = true;
    addTearDown(() => AppTour.debugMySpaceEnabled = null);
    AuthStore.instance =
        AuthStore(initialToken: 'jwt', initialEmail: 'first@visit.com');
    final nav = GlobalKey<NavigatorState>();
    late BuildContext space;
    Widget mySpace() => MaterialApp(
          navigatorKey: nav,
          home: Scaffold(
            body: Builder(builder: (context) {
              space = context;
              return Row(children: [
                for (final t in ['overview', 'selling', 'buying', 'saved', 'requests'])
                  Expanded(
                    child: TourAnchor(
                        id: 'myspace-tab-$t',
                        child: const SizedBox(height: 48)),
                  ),
              ]);
            }),
          ),
        );
    await tester.pumpWidget(mySpace());
    AppTour.maybeStartMySpace(space);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(AppTour.running, isTrue);
    expect(find.text('Overview'), findsOneWidget);
    expect(find.text('1 of 5'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('app-tour-skip')));
    await tester.pumpAndSettle();
    expect(AppTour.running, isFalse);

    // The next visit stays quiet.
    AppTour.maybeStartMySpace(space);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(AppTour.running, isFalse);
  });
}
