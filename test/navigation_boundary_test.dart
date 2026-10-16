import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:globoexpats_mobile/widgets/navigation_boundary.dart';

void main() {
  testWidgets('cold detail link goes to its safe parent on system back',
      (tester) async {
    final router = GoRouter(
      initialLocation: '/product/7',
      routes: [
        GoRoute(
          path: '/browse',
          builder: (_, __) => const Scaffold(body: Text('Marketplace')),
        ),
        GoRoute(
          path: '/product/:id',
          builder: (_, __) => const NavigationBoundary(
            fallbackLocation: '/browse',
            child: Scaffold(body: Text('Product detail')),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    expect(find.text('Product detail'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('Marketplace'), findsOneWidget);
  });

  testWidgets('pushed detail pops to the actual originating page',
      (tester) async {
    final router = GoRouter(
      initialLocation: '/origin',
      routes: [
        GoRoute(
          path: '/origin',
          builder: (context, _) => Scaffold(
            body: TextButton(
              onPressed: () => context.push('/product/7'),
              child: const Text('Open'),
            ),
          ),
        ),
        GoRoute(
          path: '/product/:id',
          builder: (_, __) => const NavigationBoundary(
            fallbackLocation: '/browse',
            child: Scaffold(body: Text('Product detail')),
          ),
        ),
        GoRoute(
          path: '/browse',
          builder: (_, __) => const Scaffold(body: Text('Marketplace')),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('Open'), findsOneWidget);
    expect(find.text('Marketplace'), findsNothing);
  });
}
