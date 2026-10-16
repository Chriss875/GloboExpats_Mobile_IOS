import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/account_misc_screens.dart';
import 'package:globoexpats_mobile/screens/orders_screen.dart';
import 'package:globoexpats_mobile/screens/delivery_dashboard_screens.dart';
import 'package:globoexpats_mobile/theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// The ratchet in dark_mode_coverage_test counts light literals in the SOURCE.
/// This checks the other end: render real screens under the dark theme and
/// walk what actually got painted, so a surface that still comes out white is
/// caught here rather than by the user opening the app at night.
/// Packed ARGB without the deprecated `Color.value`.
int _argb(Color c) =>
    ((c.a * 255).round() << 24) |
    ((c.r * 255).round() << 16) |
    ((c.g * 255).round() << 8) |
    (c.b * 255).round();

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  http.Response jsonOk(Object body) => http.Response(jsonEncode(body), 200,
      headers: {'content-type': 'application/json'});

  Map<String, dynamic> order(String status, {required bool selling}) => {
        'orderId': 'o-1',
        'orderNumber': 'ORD-9001',
        'status': status,
        'paymentStatus': 'PAID',
        'totalAmount': 100000,
        'currency': 'TZS',
        'orderType': selling ? 'selling' : 'buying',
        'fulfillmentType': 'SELLER_DELIVERY',
        if (selling) 'buyerName': 'A Buyer' else 'sellerName': 'A Seller',
        'createdAt': '2026-08-20T10:00:00',
      };

  /// Light-mode fills that must never survive into a dark render.
  const forbidden = <int>{
    0xFFFFFFFF, // white
    0xFFF8FAFC, // slate-50
    0xFFF1F5F9, // slate-100
    0xFFE2E8F0, // slate-200
    0xFFEFF6FF, // blue-50
    0xFFFFFBEB, // amber-50
    0xFFFEF2F2, // red-50
    0xFFECFDF5, // emerald-50
  };

  /// Colours that are allowed to be light even in dark mode, because they are
  /// brand chrome or ink sitting ON brand chrome rather than page surfaces.
  bool isBrandSurface(Color c) {
    final v = _argb(c);
    return v == 0xFF1E40AF || // brand blue
        v == 0xFF1E3A8A ||
        v == 0xFF16A34A || // Sell green
        v == 0xFF10B981 ||
        v == 0xFFDC2626; // action red
  }

  List<String> lightSurfacesIn(WidgetTester tester) {
    final offenders = <String>[];
    void visit(RenderObject node) {
      Color? fill;
      if (node is RenderDecoratedBox) {
        final d = node.decoration;
        if (d is BoxDecoration) fill = d.color;
      } else if (node is RenderPhysicalShape) {
        fill = node.color;
      } else if (node is RenderPhysicalModel) {
        fill = node.color;
      }
      if (fill != null &&
          _argb(fill) >> 24 == 0xFF &&
          forbidden.contains(_argb(fill)) &&
          !isBrandSurface(fill)) {
        offenders.add('0x${_argb(fill).toRadixString(16).toUpperCase()}');
      }
      node.visitChildren(visit);
    }

    visit(tester.binding.rootElement!.renderObject!);
    return offenders;
  }

  Future<void> pumpDark(WidgetTester tester, Widget child) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      darkTheme: buildAppDarkTheme(),
      themeMode: ThemeMode.dark,
      home: child,
    ));
    await tester.pumpAndSettle();
  }

  tearDown(() => AuthStore.instance = null);

  testWidgets('the orders list paints no light surfaces in dark mode',
      (tester) async {
    final api = ApiClient(client: MockClient((req) async {
      if (req.url.path == '/api/v1/orders') {
        return jsonOk([order('PAID', selling: true)]);
      }
      return jsonOk({});
    }));
    final auth =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    AuthStore.instance = auth;

    await pumpDark(
        tester, OrdersScreen(auth: auth, api: api, initialTab: 'selling'));

    expect(find.text('ORD-9001'), findsOneWidget,
        reason: 'the screen must actually have rendered');
    expect(lightSurfacesIn(tester), isEmpty);
  });

  testWidgets('the MySpace loading skeleton is dark too', (tester) async {
    // The skeleton only exists while the request is in flight, which is
    // exactly why a light literal survived there unnoticed: it never shows in
    // a settled screenshot. Hold the response open and check that frame.
    // A gate rather than a delay: a pending Timer would outlive the widget
    // tree and fail the test for the wrong reason.
    final gate = Completer<void>();
    final api = ApiClient(client: MockClient((req) async {
      await gate.future;
      return jsonOk({});
    }));
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      darkTheme: buildAppDarkTheme(),
      themeMode: ThemeMode.dark,
      home: ExpatDashboardScreen(api: api),
    ));
    await tester.pump(const Duration(milliseconds: 100));

    expect(lightSurfacesIn(tester), isEmpty);
    gate.complete();
    await tester.pumpAndSettle();
  });

  testWidgets('the notifications feed is dark, read rows included',
      (tester) async {
    // A READ notification card was `Colors.white` while only the UNREAD tint
    // followed the accent — so the feed went white the moment anything was
    // opened, which is the state most people see it in.
    final api = ApiClient(client: MockClient((req) async {
      if (req.url.path.contains('/notifications')) {
        return jsonOk([
          {
            'notificationId': 1,
            'title': 'Order confirmed',
            'message': 'Your order is on its way',
            'notificationType': 'ORDER',
            'isRead': true,
            'createdAt': '2026-08-20T10:00:00',
          },
          {
            'notificationId': 2,
            'title': 'New message',
            'message': 'A buyer asked about your listing',
            'notificationType': 'GENERAL',
            'isRead': false,
            'createdAt': '2026-08-20T11:00:00',
          },
        ]);
      }
      return jsonOk({});
    }));
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await pumpDark(tester, NotificationsScreen(api: api));

    expect(find.text('Order confirmed'), findsOneWidget,
        reason: 'the read row must actually have rendered');
    expect(lightSurfacesIn(tester), isEmpty);
  });

  testWidgets('MySpace paints no light surfaces in dark mode', (tester) async {
    final api = ApiClient(client: MockClient((req) async {
      if (req.url.path.endsWith('/user-details')) {
        return jsonOk({
          'userId': 7,
          'firstName': 'Globo',
          'lastName': 'Expat',
          'isVerified': true,
          'roles': [
            {'roleName': 'SELLER'}
          ],
          'products': const [],
        });
      }
      return jsonOk({});
    }));
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await pumpDark(tester, ExpatDashboardScreen(api: api));

    expect(find.textContaining('Welcome back'), findsOneWidget);
    expect(lightSurfacesIn(tester), isEmpty);
  });
}
