import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/services/matomo_tracker.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

/// Matomo app tracking: every screen the user reaches must land as a page
/// view (shell tabs, pushes, pops and pageless Navigator.push screens), hits
/// must carry the signed-in user id, and a rejected hit must not block the
/// queue. Mirrors components/matomo-tag-manager.tsx on the web.

final tracker = MatomoTracking.instance;

List<String> screenUrls() => [
      for (final h in tracker.debugHits)
        if (!h.containsKey('e_c') && !h.containsKey('idgoal') && !h.containsKey('search'))
          h['url']!.replaceFirst(RegExp(r'^https://app(-dev)?\.globoexpats\.com'), ''),
    ];

Widget _page(String label) => Scaffold(body: Text(label));

GoRouter _router() {
  final router = GoRouter(
    initialLocation: '/',
    observers: [MatomoRouteObserver()],
    routes: [
      ShellRoute(
        observers: [MatomoRouteObserver()],
        builder: (context, state, child) => child,
        routes: [
          GoRoute(path: '/', pageBuilder: (c, s) => NoTransitionPage(child: _page('home'))),
          GoRoute(path: '/browse', pageBuilder: (c, s) => NoTransitionPage(child: _page('browse'))),
          GoRoute(path: '/product/:id', builder: (c, s) => _page('product ${s.pathParameters['id']}')),
        ],
      ),
      GoRoute(path: '/cart', builder: (c, s) => _page('cart')),
    ],
  );
  tracker.attachRouter(router);
  return router;
}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await KvStore.instance.load();
    await tracker.init();
  });

  setUp(() => tracker.debugReset());

  testWidgets('shell tabs, push, pop and query strings are all page views', (tester) async {
    final router = _router();
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();

    router.go('/browse?search=sofa');
    await tester.pumpAndSettle();
    router.push('/product/42');
    await tester.pumpAndSettle();
    router.pop();
    await tester.pumpAndSettle();
    router.push('/cart');
    await tester.pumpAndSettle();

    expect(screenUrls(), [
      '/',
      '/browse?search=sofa',
      '/product/42',
      '/browse?search=sofa',
      '/cart',
    ]);
    tracker.debugReset(); // cancels the pending flush timer
  });

  testWidgets('a pageless Navigator.push screen inside the shell is tracked', (tester) async {
    final router = _router();
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    tracker.debugReset();

    final ctx = tester.element(find.text('home'));
    Navigator.of(ctx).push(MaterialPageRoute(
      settings: const RouteSettings(name: '/account/security'),
      builder: (_) => _page('security'),
    ));
    await tester.pumpAndSettle();
    tracker.trackEvent('Test', 'Tap');

    expect(screenUrls(), ['/account/security']);
    final event = tracker.debugHits.last;
    expect(event['url'], endsWith('/account/security'));
    expect(event['pv_id'], tracker.debugHits.first['pv_id']);
    tracker.debugReset(); // cancels the pending flush timer
  });

  test('hits carry the user id once set and drop it after logout', () {
    tracker.setUserId('buyer@example.com');
    tracker.trackScreen('/orders');
    tracker.setUserId(null);
    tracker.trackScreen('/');

    final hits = tracker.debugHits;
    expect(hits[0]['uid'], 'buyer@example.com');
    expect(hits[1].containsKey('uid'), isFalse);
    expect(hits[0]['_id'], hasLength(16));
    expect(hits[0]['ua'], contains('GloboExpatsApp'));
  });

  test('site search sends the keyword and result count', () {
    tracker.trackSearch('  bed frame ', resultCount: 0);
    final hit = tracker.debugHits.single;
    expect(hit['search'], 'bed frame');
    expect(hit['search_count'], '0');
  });

  test('ecommerce: product view, cart update and order', () {
    tracker.trackScreen('/product/7');
    tracker.trackProductView(productId: 7, productName: 'Sofa', categoryName: 'Furniture', price: 120);
    tracker.trackCartUpdate(
      items: const [MatomoEcommerceItem(sku: '7', name: 'Sofa', category: 'Furniture', price: 120, quantity: 2)],
      cartTotal: 240,
      added: const MatomoEcommerceItem(sku: '7', name: 'Sofa', price: 120, quantity: 2),
    );
    tracker.trackOrder(orderId: 'PF-1', grandTotal: 240);

    final hits = tracker.debugHits;
    final view = hits.firstWhere((h) => h.containsKey('_pks'));
    expect(view['_pkn'], 'Sofa');
    expect(view['_pkc'], 'Furniture');
    final cart = hits.firstWhere((h) => h['idgoal'] == '0' && !h.containsKey('ec_id'));
    expect(jsonDecode(cart['ec_items']!), [
      ['7', 'Sofa', 'Furniture', 120, 2]
    ]);
    expect(cart['revenue'], '240');
    final order = hits.firstWhere((h) => h['ec_id'] == 'PF-1');
    expect(order['revenue'], '240');
    expect(hits.where((h) => h['e_c'] == 'Product' && h['e_a'] == 'AddToCart'), hasLength(1));
    expect(hits.where((h) => h['e_c'] == 'Ecommerce' && h['e_a'] == 'Purchase'), hasLength(1));
  });

  test('a 4xx-rejected hit is dropped instead of blocking the queue', () async {
    final sent = <String>[];
    tracker.client = MockClient((req) async {
      final url = req.bodyFields['url']!;
      sent.add(url);
      return http.Response('', url.endsWith('/bad') ? 400 : 204);
    });
    tracker.trackScreen('/bad');
    tracker.trackScreen('/good');
    await tracker.flush();

    expect(sent.map((u) => u.split('.com').last), ['/bad', '/good']);
    expect(tracker.debugHits, isEmpty);
  });

  test('a 5xx keeps the hit for retry', () async {
    tracker.client = MockClient((req) async => http.Response('', 503));
    tracker.trackScreen('/later');
    await tracker.flush();
    expect(tracker.debugHits, hasLength(1));
  });
}
