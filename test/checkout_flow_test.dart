import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/domain/checkout_proforma.dart';
import 'package:globoexpats_mobile/domain/delivery_windows.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

/// AUs 022–028: the rebuilt 4-step checkout machine (BUYER_FLOW_SPEC §4–§7).
///
/// Covers: T9 payload shape (lat/lng + windows + deliveryFee, no CARD/SALE),
/// the grand-total price guard with cancel + resync, delivery-window payload
/// via the EAT resolver, the Address→Review→Payment→Completion step machine
/// with items locked from step ≥ 3, the terms gate, and quote-failure UX.

final _nowUtc =
    DateTime.utc(2026, 8, 25, 6, 0); // 09:00 EAT — all 6 windows open

Map<String, dynamic> _proforma({
  String status = 'PENDING_PAYMENT',
  double? grandTotal,
  List<dynamic>? groups,
}) =>
    {
      'proformaId': 'pf-flow',
      'proformaNumber': 'PF-2026-000777',
      'status': status,
      'itemsTotal': 100000.0,
      'deliveryTotal': 4000.0,
      'grandTotal': grandTotal ?? 104000.0,
      'currency': 'TZS',
      'expiresAt': '2026-08-25T07:00:00Z', // createdAt + 60 min
      'sellerGroups': groups ??
          [
            {
              'sellerId': 128,
              'sellerName': 'Kevin Shellukindo',
              'orderId': status == 'PAYMENT_SUBMITTED' ? 'ORD-FLOW' : null,
              'items': [
                {
                  'productId': 615,
                  'title': 'Chair',
                  'quantity': 1,
                  'unitPrice': 100000.0,
                },
              ],
            },
          ],
    };

Future<http.Response> Function(http.Request) _mock({
  void Function(String path, http.Request req)? onRequest,
  Map<String, dynamic> Function()? proforma,
  Object? Function(String path)? respond,
}) =>
    (req) async {
      onRequest?.call(req.url.path, req);
      final custom = respond?.call(req.url.path);
      if (custom != null) return custom as http.Response;
      if (req.url.path == '/api/v1/proformas/pf-flow/cancel') {
        return http.Response(jsonEncode(_proforma(status: 'CANCELLED')), 200,
            headers: {'content-type': 'application/json'});
      }
      if (req.url.path == '/api/v1/checkout/delivery-quote') {
        return http.Response(
            jsonEncode({
              'deliveryTotal': 4000.0,
              'currency': 'TZS',
              'sellerGroups': [
                {
                  'sellerId': 128,
                  'sellerName': 'Kevin Shellukindo',
                  'consolidatedDeliveryFee': 4000.0,
                }
              ],
            }),
            200,
            headers: {'content-type': 'application/json'});
      }
      if (req.url.path == '/api/v1/checkout/proforma') {
        return http.Response(jsonEncode(proforma?.call() ?? _proforma()), 201,
            headers: {'content-type': 'application/json'});
      }
      if (req.url.path.endsWith('/user-details')) {
        return http.Response(
            jsonEncode({
              'firstName': 'Amina',
              'lastName': 'Juma',
              'loggingEmail': 'amina@example.com',
              'whatsAppPhoneNumber': '+255700111222',
            }),
            200,
            headers: {'content-type': 'application/json'});
      }
      if (req.url.path.endsWith('/get-addresses')) {
        return http.Response(
            jsonEncode([
              {
                'addressId': 9,
                'label': 'Home',
                'street': 'Coco Beach Road',
                'region': 'Dar es Salaam',
                'country': 'Tanzania',
                'latitude': -6.77,
                'longitude': 39.27,
                'isDefault': true,
              },
              {
                'addressId': 10,
                'label': 'Work',
                'street': 'Mlimani Tower',
                'region': 'Dar es Salaam',
                'country': 'Tanzania',
                'latitude': -6.78,
                'longitude': 39.28,
                'isDefault': false,
              }
            ]),
            200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 404);
    };

/// Scrolls the review step forward until [key] is built AND fully on screen,
/// then taps it.
///
/// Both halves are needed. `scrollUntilVisible` stops the moment the widget
/// exists, which can still be off the bottom edge; `ensureVisible` alone cannot
/// reach a widget that has never been built, because the review step builds it
/// lazily. Tapping a hand-clamped centre offset — what this used to do —
/// additionally made every caller depend on how tall the review step happened
/// to be, so any layout change broke them somewhere unrelated to the behaviour
/// under test.
Future<void> revealAndTap(WidgetTester tester, Key key) async {
  await tester.scrollUntilVisible(find.byKey(key), 200,
      scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.byKey(key));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(key));
  await tester.pumpAndSettle();
}

/// Drives Address → Review → windows + terms → Confirm, landing on the
/// PAYMENT step (or staying on review when the guard trips).
Future<void> driveToReviewConfirm(WidgetTester tester) async {
  // Step 1 -> 2. The WhatsApp field is web-parity readOnly and prefilled from
  // the profile mock (+255700111222) — nothing to type.
  await tester.scrollUntilVisible(find.text('Continue to review'), 300,
      scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Continue to review'));
  await tester.pumpAndSettle();

  // Step 2: tick a window + terms, then confirm — in document order.
  await revealAndTap(tester, const Key('window-TODAY_MORNING'));
  await revealAndTap(tester, const Key('terms-checkbox'));
  await revealAndTap(tester, const Key('confirm-review'));
  if (find.text('Generate invoice').evaluate().isNotEmpty) {
    await tester.tap(find.text('Generate invoice'));
    await tester.pumpAndSettle();
  }
}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  tearDown(() async {
    AuthStore.instance = null;
    // ignore: discarded_futures
    CartStore.instance.reset();
    // ignore: discarded_futures
    KvStore.instance.remove(KvStore.kProformaCartSnapshot);
    // ignore: discarded_futures
    KvStore.instance.remove(KvStore.kLastOrderId);
  });

  group('T9: proforma buyDetails payload shape (§5.1)', () {
    test('carries latitude/longitude, windows, deliveryFee; never CARD/SALE',
        () {
      final details = buildBuyDetails(
        address: CheckoutAddressInput(
          firstName: 'Amina',
          lastName: 'Juma',
          emailAddress: 'amina@example.com',
          phoneNumber: '+255700111222',
          address: 'Coco Beach Road',
          city: 'Dar es Salaam',
          country: 'Tanzania',
          latitude: -6.77,
          longitude: 39.27,
        ),
        fulfillmentType: 'SELLER_DELIVERY',
        paymentMethodType: 'MOBILE_MONEY',
        deliveryFee: 4000,
        subtotal: 100000,
        selectedWindowValues: const ['TOMORROW_AFTERNOON'],
        nowUtc: _nowUtc,
      );

      // Full key set per §5.1.
      expect(
          details.keys,
          containsAll([
            'firstName',
            'lastName',
            'emailAddress',
            'phoneNumber',
            'address',
            'deliveryLabel',
            'deliveryPlaceName',
            'deliveryNeighbourhood',
            'city',
            'state',
            'country',
            'zipCode',
            'deliveryInstructions',
            'fulfillmentType',
            'paymentMethodType',
            'deliveryFee',
            'agreeToTerms',
            'totalAmount',
            'currency',
            'latitude',
            'longitude',
            'preferredDeliveryDate',
            'preferredDeliverySlot',
            'preferredDeliveryWindows',
          ]));

      expect(details['latitude'], -6.77);
      expect(details['longitude'], 39.27);
      // state is its own field — NEVER a copy of the city text.
      expect(details['state'], isNot('Dar es Salaam'));
      expect(details['fulfillmentType'], 'SELLER_DELIVERY');
      expect(details['paymentMethodType'], 'MOBILE_MONEY');
      expect(details['deliveryFee'], 4000);
      expect(details['totalAmount'], 104000); // round2(subtotal + fee)
      expect(details['preferredDeliveryWindows'], [
        {'date': '2026-08-26', 'slot': 'AFTERNOON'},
      ]);
      // First window mirrored to the legacy fields.
      expect(details['preferredDeliveryDate'], '2026-08-26');
      expect(details['preferredDeliverySlot'], 'AFTERNOON');

      // No legacy CARD/SALE anywhere in the serialized payload (T26).
      final json = jsonEncode(details);
      expect(json.contains('"CARD"'), isFalse, reason: json);
      expect(json.contains('"SALE"'), isFalse, reason: json);
      expect(json.contains("'CARD'"), isFalse, reason: json);
      expect(json.contains("'SALE'"), isFalse, reason: json);
    });

    test('pickup sends fee 0 and no windows; lat/lng keys still present', () {
      final details = buildBuyDetails(
        address: CheckoutAddressInput(
          firstName: 'A',
          lastName: 'B',
          emailAddress: 'a@b.c',
          phoneNumber: '+2557',
          address: 'x',
          city: 'Dar es Salaam',
          country: 'Tanzania',
        ),
        fulfillmentType: 'BUYER_PICKUP',
        paymentMethodType: 'BANK_TRANSFER',
        deliveryFee: 9999, // must be ignored for pickup
        subtotal: 50000,
        selectedWindowValues: const ['TOMORROW_MORNING'],
        nowUtc: _nowUtc,
      );
      expect(details['deliveryFee'], 0);
      expect(details['totalAmount'], 50000);
      expect((details['preferredDeliveryWindows'] as List), isEmpty);
      expect(details.keys, containsAll(['latitude', 'longitude']));
    });

    test('delivery without any window is rejected (backend contract)', () {
      expect(
        () => buildBuyDetails(
          address: CheckoutAddressInput(
            firstName: 'A',
            lastName: 'B',
            emailAddress: 'a@b.c',
            phoneNumber: '+2557',
            address: 'x',
            city: 'Dar',
            country: 'Tanzania',
          ),
          fulfillmentType: 'SELLER_DELIVERY',
          paymentMethodType: 'MOBILE_MONEY',
          deliveryFee: 0,
          subtotal: 1,
          selectedWindowValues: const [],
          nowUtc: _nowUtc,
        ),
        throwsStateError,
      );
    });

    test('seller working-hour windows are submitted without date rewriting',
        () {
      final details = buildBuyDetails(
        address: CheckoutAddressInput(
          firstName: 'Amina',
          lastName: 'Juma',
          emailAddress: 'amina@example.com',
          phoneNumber: '+255700111222',
          address: 'Coco Beach Road',
          city: 'Dar es Salaam',
          country: 'Tanzania',
          latitude: -6.77,
          longitude: 39.27,
        ),
        fulfillmentType: 'SELLER_DELIVERY',
        paymentMethodType: 'MOBILE_MONEY',
        deliveryFee: 4000,
        subtotal: 100000,
        selectedWindowValues: const [],
        resolvedDeliveryWindows: const [
          {'date': '2026-09-18', 'slot': 'SELLER_HOURS'},
          {'date': '2026-09-19', 'slot': 'AFTERNOON'},
        ],
        nowUtc: _nowUtc,
      );

      expect(details['preferredDeliveryWindows'], const [
        {'date': '2026-09-18', 'slot': 'SELLER_HOURS'},
        {'date': '2026-09-19', 'slot': 'AFTERNOON'},
      ]);
      expect(details['preferredDeliveryDate'], '2026-09-18');
      expect(details['preferredDeliverySlot'], 'SELLER_HOURS');
    });
  });

  group('Price guard (§5.3)', () {
    testWidgets('grandTotal mismatch cancels the proforma + resyncs prices',
        (tester) async {
      var cancelCalls = 0;
      var createdWith = <String, dynamic>{};
      final api = ApiClient(
        client: MockClient(_mock(
          proforma: () => _proforma(grandTotal: 204000.0), // ≠ reviewed 104000
          onRequest: (path, req) {
            if (path == '/api/v1/proformas/pf-flow/cancel') cancelCalls++;
            if (path == '/api/v1/checkout/proforma') {
              createdWith = jsonDecode(req.body) as Map<String, dynamic>;
            }
          },
          // The authoritative unit price differs from the stale cart price.
          respond: (path) {
            if (path == '/api/v1/proformas/pf-flow/cancel') {
              return http.Response(
                  jsonEncode(_proforma(status: 'CANCELLED')), 200,
                  headers: {'content-type': 'application/json'});
            }
            return null;
          },
        )),
      );
      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
      CartStore.instance.addDetail(
          productId: 615,
          sellerId: '128',
          sellerName: 'Kevin Shellukindo',
          title: 'Chair',
          price: 100000);

      await tester.pumpWidget(MaterialApp(home: CheckoutFlowHarness(api: api)));
      await tester.pumpAndSettle();
      await driveToReviewConfirm(tester);

      expect(cancelCalls, 1,
          reason: 'mismatched grandTotal must trigger POST /cancel');
      // Prices resynced from sellerGroups[].items[].unitPrice.
      expect(createdWith['buyDetails'], isNotNull);
      // Still on review — never advanced to payment.
      expect(find.byKey(const ValueKey('confirm-review')), findsOneWidget);
      expect(
          find.textContaining('authoritative price changed'), findsOneWidget);
    });

    testWidgets('matching grandTotal advances to payment', (tester) async {
      var cancelCalls = 0;
      final api = ApiClient(
        client: MockClient(_mock(onRequest: (path, _) {
          if (path == '/api/v1/proformas/pf-flow/cancel') cancelCalls++;
        })),
      );
      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
      CartStore.instance.addDetail(
          productId: 615,
          sellerId: '128',
          sellerName: 'Kevin Shellukindo',
          title: 'Chair',
          price: 100000);

      await tester.pumpWidget(MaterialApp(home: CheckoutFlowHarness(api: api)));
      await tester.pumpAndSettle();
      await driveToReviewConfirm(tester);

      expect(cancelCalls, 0, reason: 'no cancel when totals match');
      await tester.scrollUntilVisible(find.text('Invoice PF-2026-000777'), 200,
          scrollable: find.byType(Scrollable).first);
      expect(find.text('Invoice PF-2026-000777'), findsOneWidget);
      expect(find.text('Payment'), findsOneWidget);
    });
  });

  group('Delivery windows payload (§5.1 / AU-026)', () {
    test('selection → [{date,slot}] through the existing resolver', () {
      final payload =
          preferredDeliveryWindowsPayload(['TOMORROW_AFTERNOON'], _nowUtc);
      expect(payload, [
        {'date': '2026-08-26', 'slot': 'AFTERNOON'}
      ]);

      // Multi-select keeps visual order regardless of tap order.
      final multi = preferredDeliveryWindowsPayload(
          ['TOMORROW_EVENING', 'TODAY_MORNING'], _nowUtc);
      expect(multi.map((w) => w['slot']).toList(), ['MORNING', 'EVENING']);

      // Past windows are dropped silently at resolve time.
      final lateNow = DateTime.utc(2026, 8, 25, 14, 0); // 17:00 EAT
      final past = preferredDeliveryWindowsPayload(
          ['TODAY_MORNING', 'TOMORROW_MORNING'], lateNow);
      expect(past.map((w) => w['date']).toList(), ['2026-08-26']);
    });

    test('exactly 6 composites before filtering; past dropped by resolver', () {
      expect(kDeliveryWindowOptions, hasLength(6));
      final allOpen = resolveDeliveryWindows(_nowUtc);
      expect(allOpen, hasLength(6));
      // 17:30 EAT: TODAY_MORNING + TODAY_AFTERNOON + TODAY_EVENING (ends
      // 20:00? no — end-hour 20 > 17.5) — actually only MORNING(12) and
      // AFTERNOON(16) are past → EVENING + tomorrow's three = 4... verified:
      // resolver drops windows whose EAT END-HOUR <= now-EAT hour.
      final lateAfternoon =
          resolveDeliveryWindows(DateTime.utc(2026, 8, 25, 14, 0)); // 17:00 EAT
      // Morning ends 12:00, afternoon ends 16:00 → both past; evening (20:00)
      // + tomorrow's three remain = 4.
      expect(lateAfternoon, hasLength(4));
      expect(lateAfternoon.first.slot, DeliverySlot.EVENING);
      final night =
          resolveDeliveryWindows(DateTime.utc(2026, 8, 25, 18, 0)); // 21:00 EAT
      // Evening ends 20:00 → past; only tomorrow's three remain.
      expect(night, hasLength(3));
      expect(night.map((w) => w.dateYmd).toSet(), {'2026-08-26'});
    });
  });

  group('Step machine (AU-022..031)', () {
    testWidgets('Address → Review → Payment steps advance with indicator',
        (tester) async {
      final api = ApiClient(client: MockClient(_mock()));
      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
      CartStore.instance.addDetail(
          productId: 615,
          sellerId: '128',
          sellerName: 'Kevin Shellukindo',
          title: 'Chair',
          price: 100000);

      await tester.pumpWidget(MaterialApp(home: CheckoutFlowHarness(api: api)));
      await tester.pumpAndSettle();
      expect(find.text('Shipping'), findsOneWidget);

      await driveToReviewConfirm(tester);

      expect(find.text('Payment'), findsOneWidget);
      // Web: Step 03 opens with every method collapsed — the buyer chooses
      // what to open. MOBILE_MONEY is still the default, so there is no
      // manual Submit button either; it belongs to Bank Account only.
      expect(find.byKey(const ValueKey('wallet-send')), findsNothing);
      expect(find.text('Submit Payment for Verification'), findsNothing);

      final mobileWallet =
          find.byKey(const ValueKey('payment-method-mobile_money'));
      await tester.scrollUntilVisible(mobileWallet, 200,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      await tester.tap(mobileWallet);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
          find.byKey(const ValueKey('wallet-send')), 200,
          scrollable: find.byType(Scrollable).first);
      expect(find.text('Send payment request'), findsOneWidget);
      expect(find.text('Submit Payment for Verification'), findsNothing);

      await tester.scrollUntilVisible(find.text('Bank Account'), -200,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Bank Account'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
          find.text('Submit Payment for Verification'), 200,
          scrollable: find.byType(Scrollable).first);
      expect(find.text('Submit Payment for Verification'), findsOneWidget);
    });

    testWidgets('terms gate blocks Review → Payment without agree',
        (tester) async {
      var createCalls = 0;
      final api = ApiClient(
        client: MockClient(_mock(onRequest: (path, _) {
          if (path == '/api/v1/checkout/proforma') createCalls++;
        })),
      );
      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
      CartStore.instance.addDetail(
          productId: 615,
          sellerId: '128',
          sellerName: 'Kevin Shellukindo',
          title: 'Chair',
          price: 100000);

      await tester.pumpWidget(MaterialApp(home: CheckoutFlowHarness(api: api)));
      await tester.pumpAndSettle();

      // Continue to review — the WhatsApp field is readOnly and already
      // prefilled from the profile mock.
      await tester.scrollUntilVisible(find.text('Continue to review'), 300,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text('Continue to review'));
      await tester.pumpAndSettle();

      // Tick a window but NOT terms, then confirm.
      await revealAndTap(tester, const Key('window-TODAY_MORNING'));
      await revealAndTap(tester, const Key('confirm-review'));

      expect(createCalls, 0, reason: 'terms gate must block proforma creation');
      expect(find.textContaining('Please agree to the Terms'), findsOneWidget);
      expect(find.text('Review'), findsOneWidget);
    });
  });

  group('Quote failure UX (AU-025)', () {
    testWidgets('quote error renders failure label + Retry control',
        (tester) async {
      final api = ApiClient(
        client: MockClient(_mock(respond: (path) {
          if (path == '/api/v1/checkout/delivery-quote') {
            return http.Response('{"message":"ROUTE_UNAVAILABLE"}', 500);
          }
          return null;
        })),
      );
      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
      CartStore.instance.addDetail(
          productId: 615,
          sellerId: '128',
          sellerName: 'Kevin Shellukindo',
          title: 'Chair',
          price: 100000);

      await tester.pumpWidget(MaterialApp(home: CheckoutFlowHarness(api: api)));
      await tester.pumpAndSettle();

      // The WhatsApp field is readOnly + prefilled from the profile mock.
      await tester.scrollUntilVisible(find.text('Continue to review'), 300,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text('Continue to review'));
      await tester.pumpAndSettle();

      // Failure surfaces: short label on the group card + Retry in the box
      // (the box sits below the windows — scroll down to it).
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Retry check'), 200,
          scrollable: find.byType(Scrollable).first);
      expect(find.text('Retry check'), findsOneWidget);
      expect(find.textContaining('Delivery fee unavailable'), findsOneWidget);
      // The seller-group card with the failed fee is ABOVE the box — scroll
      // back up to assert its short label.
      await tester.scrollUntilVisible(find.text('No route found'), -200,
          scrollable: find.byType(Scrollable).first);
      expect(find.text('No route found'), findsOneWidget);
    });
  });

  group('WhatsApp phone autofill (web parity normalizeUserDetails)', () {
    testWidgets(
        'prefills from the profile even when the backend has no whatsAppPhoneNumber key',
        (tester) async {
      final api = ApiClient(
        client: MockClient(_mock(respond: (path) {
          if (path.endsWith('/user-details')) {
            // Only the last link of web's fallback chain is present -
            // proves ApiClient.getUserDetails carries the same chain, not
            // just this screen's own `?? profile['phoneNumber']`.
            return http.Response(
                jsonEncode({
                  'firstName': 'Amina',
                  'lastName': 'Juma',
                  'loggingEmail': 'amina@example.com',
                  'phoneNumber': '+255766554433',
                }),
                200,
                headers: {'content-type': 'application/json'});
          }
          return null;
        })),
      );
      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
      CartStore.instance.addDetail(
          productId: 615,
          sellerId: '128',
          sellerName: 'Kevin Shellukindo',
          title: 'Chair',
          price: 100000);

      await tester.pumpWidget(MaterialApp(home: CheckoutFlowHarness(api: api)));
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('WhatsApp phone number'), 200,
          scrollable: find.byType(Scrollable).first);
      final field = tester.widget<TextFormField>(
          find.widgetWithText(TextFormField, 'WhatsApp phone number'));
      expect(field.controller?.text, '+255766554433');
    });
  });
}
