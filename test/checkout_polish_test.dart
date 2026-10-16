import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:globoexpats_mobile/theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Three reports against checkout:
///
///   * "why are there padlocks icons in input and editing should lead them to
///     profile to edit personal details just like how web does it";
///   * "in review the buyer delivery details use the pin icon just like web";
///   * "in dark mode in review section stuff dont show well".
void main() {
  final nowUtc = DateTime.utc(2026, 8, 25, 6, 0);

  http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
      headers: {'content-type': 'application/json'});

  ApiClient api() => ApiClient(client: MockClient((req) async {
        final path = req.url.path;
        if (path.endsWith('/user-details')) {
          return ok({
            'firstName': 'Derick',
            'lastName': 'Ruganuza',
            'loggingEmail': 'd@example.com',
            'whatsAppPhoneNumber': '+255712345678',
          });
        }
        if (path.endsWith('/get-addresses')) {
          return ok([
            {
              'addressId': 9,
              'label': 'Home',
              'street': 'Coco Beach Road',
              'region': 'Dar es Salaam',
              'country': 'Tanzania',
              'latitude': -6.77,
              'longitude': 39.27,
              'default': true,
            }
          ]);
        }
        if (path == '/api/v1/checkout/delivery-quote') {
          return ok({
            'deliveryTotal': 4000.0,
            'currency': 'TZS',
            'sellerGroups': [
              {
                'sellerId': 128,
                'sellerName': 'Globo Expats',
                'consolidatedDeliveryFee': 4000.0,
              }
            ],
          });
        }
        if (path.contains('availability-windows/summary')) {
          return ok({
            'windows': [
              {
                'key': 'w1',
                'date': '2026-08-25',
                'slot': 'AFTERNOON',
                'startsAt': '2026-08-25T09:00:00Z',
                'endsAt': '2026-08-25T13:00:00Z',
              }
            ],
            'sellerNotices': const [],
          });
        }
        return http.Response('{}', 404);
      }));

  Future<void> pumpCheckout(WidgetTester tester, {bool dark = false}) async {
    tester.view.physicalSize = const Size(420, 950);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final client = api();
    AuthStore.instance =
        AuthStore(api: client, initialToken: 'jwt', initialEmail: 'b@x.com');
    addTearDown(() => AuthStore.instance = null);
    CartStore.instance.addDetail(
      productId: 615,
      sellerId: '128',
      sellerName: 'Globo Expats',
      title: 'Chair',
      price: 100000,
      transportRequirement: 'REQUIRED',
      deliveryTransportMode: 'BODA',
    );
    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      darkTheme: buildAppDarkTheme(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      home: CheckoutScreen(api: client, nowUtc: nowUtc),
    ));
    await tester.pumpAndSettle();
  }

  Future<void> goToReview(WidgetTester tester) async {
    await tester.scrollUntilVisible(find.text('Continue to review'), 300,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue to review'));
    await tester.pumpAndSettle();
  }

  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  tearDown(() async {
    AuthStore.instance = null;
    // ignore: discarded_futures
    CartStore.instance.reset();
  });

  group('the locked contact fields', () {
    testWidgets('carry no padlock', (tester) async {
      await pumpCheckout(tester);

      expect(find.byIcon(Icons.lock_outline_rounded), findsNothing,
          reason: 'the web marks these read-only without stamping a padlock '
              'on every one of them');
      // They are still shown, and still not typeable.
      expect(find.text('First name'), findsOneWidget);
      final field = tester.widget<TextFormField>(
          find.widgetWithText(TextFormField, 'First name'));
      expect(field.enabled, isNot(false));
    });

    testWidgets('tapping one offers the way to change it', (tester) async {
      await pumpCheckout(tester);

      await tester.tap(find.widgetWithText(TextFormField, 'Email'));
      await tester.pumpAndSettle();

      expect(find.textContaining('update it in your Profile Settings'),
          findsOneWidget);
      expect(find.text('Go to Settings'), findsOneWidget,
          reason: "web's toast carries the same action");
    });
  });

  group('the review destination', () {
    testWidgets('is marked with the web pin glyph', (tester) async {
      await pumpCheckout(tester);
      await goToReview(tester);

      expect(find.text('Delivery Destination'), findsOneWidget);
      expect(find.text('📍'), findsOneWidget,
          reason: 'web LocationPinGlyph is the pin emoji, not a Material '
              'outline icon');
      expect(find.byIcon(Icons.place_outlined), findsNothing);
    });
  });

  group('dark mode', () {
    /// Packed ARGB without the deprecated `Color.value`.
    int argb(Color c) =>
        ((c.a * 255).round() << 24) |
        ((c.r * 255).round() << 16) |
        ((c.g * 255).round() << 8) |
        (c.b * 255).round();

    /// Light fills that must not survive a dark render. Brand chrome is
    /// allowed to stay light — it is the same blue at night.
    const forbidden = <int>{
      0xFFFFFFFF, // white
      0xFFF8FAFC, // slate-50
      0xFFF1F5F9, // slate-100
      0xFFE2E8F0, // slate-200
      0xFFEFF6FF, // blue-50
      0xFFE3F2FD, // Colors.blue.shade50
      0xFFBBDEFB, // Colors.blue.shade100
      0xFFE8F5E9, // Colors.green.shade50
      0xFFFFEBEE, // Colors.red.shade50
    };

    List<String> lightSurfaces(WidgetTester tester) {
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
            argb(fill) >> 24 == 0xFF &&
            forbidden.contains(argb(fill))) {
          offenders.add('0x${argb(fill).toRadixString(16).toUpperCase()}');
        }
        node.visitChildren(visit);
      }

      visit(tester.binding.rootElement!.renderObject!);
      return offenders;
    }

    /// Ink too dark to read on a dark surface. The fills were themed first
    /// and the TEXT was missed — the seller working-hours notice kept its
    /// navy copy on a navy card, which is what "some words dont show well"
    /// was pointing at.
    List<String> darkInk(WidgetTester tester) {
      final offenders = <String>[];
      void visit(RenderObject node) {
        if (node is RenderParagraph) {
          final color = node.text.style?.color;
          // A rich span whose children are WidgetSpans has no visible text of
          // its own — `￼` is the placeholder Flutter substitutes for
          // each one, and the real words carry their children's styles.
          final text = node.text.toPlainText().trim();
          // Only real copy counts. A rich span whose children are WidgetSpans
          // carries no words of its own (Flutter substitutes a placeholder
          // glyph), and an icon-font glyph is not text anyone reads.
          final hasWords = RegExp(r'[A-Za-z0-9]').hasMatch(text);
          if (color != null &&
              color.a > 0.5 &&
              color.computeLuminance() < 0.12 &&
              hasWords) {
            offenders.add(
                '"${text.length > 40 ? '${text.substring(0, 40)}…' : text}" '
                '0x${argb(color).toRadixString(16).toUpperCase()}');
          }
        }
        node.visitChildren(visit);
      }

      visit(tester.binding.rootElement!.renderObject!);
      return offenders;
    }

    testWidgets('no navy copy on a navy card', (tester) async {
      await pumpCheckout(tester, dark: true);
      await goToReview(tester);

      expect(find.text('Delivery Destination'), findsOneWidget);
      expect(darkInk(tester), isEmpty);

      await tester.scrollUntilVisible(find.text('When should we deliver?'), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      expect(darkInk(tester), isEmpty);
    });

    testWidgets('the review step paints no light surfaces', (tester) async {
      await pumpCheckout(tester, dark: true);
      await goToReview(tester);

      expect(find.text('Delivery Destination'), findsOneWidget,
          reason: 'the step must actually have rendered');
      expect(lightSurfaces(tester), isEmpty);
    });

    testWidgets('scrolled down to the windows and totals, still dark',
        (tester) async {
      await pumpCheckout(tester, dark: true);
      await goToReview(tester);

      await tester.scrollUntilVisible(find.text('Order totals'), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      expect(lightSurfaces(tester), isEmpty);

      await tester.scrollUntilVisible(
          find.byKey(const ValueKey('terms-checkbox')), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      expect(lightSurfaces(tester), isEmpty);
    });
  });
}
