import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/shell.dart';

/// Detail routes are children of the permanent application shell. This pins
/// both requested behaviors: the top/bottom chrome remains visible and a tab
/// tap can replace the detail route instead of leaving an inert bar onscreen.
void main() {
  GoRouter routerWith(String detailPath) => GoRouter(
        initialLocation: '/',
        routes: [
          ShellRoute(
            builder: (context, state, child) =>
                AppShellWithRouter(child: child),
            routes: [
              GoRoute(
                path: '/',
                builder: (context, state) =>
                    const Scaffold(body: Text('home-body')),
              ),
              GoRoute(
                path: '/browse',
                builder: (context, state) =>
                    const Scaffold(body: Text('browse-body')),
              ),
              GoRoute(
                path: '/expat/dashboard',
                builder: (context, state) =>
                    const Scaffold(body: Text('myspace-body')),
              ),
              GoRoute(
                path: '/requests',
                builder: (context, state) =>
                    const Scaffold(body: Text('requests-body')),
              ),
              GoRoute(
                path: '/account',
                builder: (context, state) =>
                    const Scaffold(body: Text('account-body')),
              ),
              GoRoute(
                path: detailPath,
                builder: (context, state) =>
                    Scaffold(body: Text('detail:${state.uri.path}')),
              ),
            ],
          ),
        ],
      );

  Future<void> expectWorkingChrome(
    WidgetTester tester,
    String path, {
    required String detailPath,
  }) async {
    AuthStore.instance = AuthStore();
    addTearDown(() => AuthStore.instance = null);
    final router = routerWith(detailPath);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    router.push(path);
    await tester.pumpAndSettle();

    expect(find.text('detail:$path'), findsOneWidget);
    expect(find.byType(AppBar), findsWidgets);
    expect(find.text('Community'), findsOneWidget);
    expect(find.text('Sell'), findsOneWidget);
    expect(find.text('MySpace'), findsOneWidget);

    await tester.tap(find.text('Home').last);
    await tester.pumpAndSettle();
    expect(find.text('home-body'), findsOneWidget,
        reason: 'the bottom navigation must remain functional on details');
  }

  testWidgets('product detail keeps working app chrome', (tester) async {
    await expectWorkingChrome(tester, '/product/42',
        detailPath: '/product/:id');
  });

  testWidgets('request detail keeps working app chrome', (tester) async {
    await expectWorkingChrome(tester, '/request/42',
        detailPath: '/request/:id');
  });

  testWidgets('order detail keeps working app chrome', (tester) async {
    await expectWorkingChrome(tester, '/orders/o-1', detailPath: '/orders/:id');
  });
}
