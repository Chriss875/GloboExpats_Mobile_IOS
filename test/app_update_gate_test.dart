import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/app_update_policy.dart';
import 'package:globoexpats_mobile/services/app_update_service.dart';
import 'package:globoexpats_mobile/widgets/app_update_gate.dart';

/// "when i push an update current users in the app should be given option to
/// update everytime they enter the app".
class _FakeSource implements AppUpdateSource {
  _FakeSource(this.offer);

  AppUpdateOffer? offer;
  Object? throwOnCheck;
  int checks = 0;
  final installs = <AppUpdateOffer>[];

  @override
  Future<AppUpdateOffer?> check() async {
    checks++;
    if (throwOnCheck != null) throw throwOnCheck!;
    return offer;
  }

  @override
  Future<void> install(AppUpdateOffer offer) async => installs.add(offer);
}

const _offer = AppUpdateOffer(
    immediateAllowed: true, flexibleAllowed: true, versionCode: 42);

void main() {
  group('when to ask', () {
    test('on every cold start', () {
      expect(shouldCheckForUpdate(), isTrue);
    });

    test('on coming back after being away', () {
      expect(shouldCheckForUpdate(backgroundFor: const Duration(minutes: 5)),
          isTrue);
      expect(shouldCheckForUpdate(backgroundFor: const Duration(hours: 3)),
          isTrue);
    });

    test('not on a round trip to the camera or the Selcom Wallet app', () {
      // A resume mid-task is not "entering the app": a prompt on top of
      // checkout, just back from approving a payment, would be wrong.
      expect(shouldCheckForUpdate(backgroundFor: const Duration(seconds: 20)),
          isFalse);
      expect(shouldCheckForUpdate(backgroundFor: const Duration(minutes: 4)),
          isFalse);
    });
  });

  group('the prompt', () {
    late DateTime now;
    final navigatorKey = GlobalKey<NavigatorState>();

    Future<_FakeSource> pumpApp(WidgetTester tester,
        {AppUpdateOffer? offer = _offer}) async {
      now = DateTime(2026, 9, 24, 9);
      final source = _FakeSource(offer);
      await tester.pumpWidget(MaterialApp(
        navigatorKey: navigatorKey,
        builder: (context, child) => AppUpdateGate(
          navigatorKey: navigatorKey,
          source: source,
          clock: () => now,
          child: child!,
        ),
        home: const Scaffold(body: Text('Home')),
      ));
      await tester.pumpAndSettle();
      return source;
    }

    /// Sends the app to the background for [away], then back.
    Future<void> leaveAndReturn(WidgetTester tester, Duration away) async {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      now = now.add(away);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
    }

    testWidgets('offers the update as soon as the app opens', (tester) async {
      await pumpApp(tester);

      expect(find.byKey(const ValueKey('app-update-dialog')), findsOneWidget);
      expect(find.text('Update available'), findsOneWidget);
      expect(find.text('Update now'), findsOneWidget);
      expect(find.text('Later'), findsOneWidget);
    });

    testWidgets('shows nothing when Play has nothing newer', (tester) async {
      await pumpApp(tester, offer: null);

      expect(find.byKey(const ValueKey('app-update-dialog')), findsNothing);
      expect(find.text('Home'), findsOneWidget);
    });

    testWidgets('Update now hands over to Play', (tester) async {
      final source = await pumpApp(tester);

      await tester.tap(find.byKey(const ValueKey('app-update-now')));
      await tester.pumpAndSettle();

      expect(source.installs, hasLength(1));
      expect(source.installs.single.versionCode, 42);
    });

    testWidgets('Later is not remembered — the next entry asks again',
        (tester) async {
      final source = await pumpApp(tester);

      await tester.tap(find.byKey(const ValueKey('app-update-later')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('app-update-dialog')), findsNothing);
      expect(source.installs, isEmpty);

      await leaveAndReturn(tester, const Duration(minutes: 30));

      expect(find.byKey(const ValueKey('app-update-dialog')), findsOneWidget,
          reason: 'every time they enter the app');
    });

    testWidgets('a quick round trip mid-task does not interrupt',
        (tester) async {
      final source = await pumpApp(tester);
      await tester.tap(find.byKey(const ValueKey('app-update-later')));
      await tester.pumpAndSettle();
      final checksBefore = source.checks;

      // Back from the photo picker / the Selcom Wallet app.
      await leaveAndReturn(tester, const Duration(seconds: 40));

      expect(find.byKey(const ValueKey('app-update-dialog')), findsNothing);
      expect(source.checks, checksBefore, reason: 'Play was not even asked');
    });

    testWidgets('an update already agreed to resumes without asking again',
        (tester) async {
      final source = await pumpApp(tester,
          offer: const AppUpdateOffer(
              immediateAllowed: true,
              flexibleAllowed: false,
              alreadyStarted: true));

      expect(find.byKey(const ValueKey('app-update-dialog')), findsNothing);
      expect(source.installs, hasLength(1));
    });

    testWidgets('a failed check never reaches the user', (tester) async {
      now = DateTime(2026, 9, 24, 9);
      final source = _FakeSource(_offer)
        ..throwOnCheck = Exception('not installed from Play');
      await tester.pumpWidget(MaterialApp(
        navigatorKey: navigatorKey,
        builder: (context, child) => AppUpdateGate(
          navigatorKey: navigatorKey,
          source: source,
          clock: () => now,
          child: child!,
        ),
        home: const Scaffold(body: Text('Home')),
      ));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byKey(const ValueKey('app-update-dialog')), findsNothing);
      expect(find.text('Home'), findsOneWidget);
    });
  });
}
