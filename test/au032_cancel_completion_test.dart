import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/screens/cart_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

/// AU-032: cancel-invoice + completion navigation + receiving details —
/// exercised through the rebuilt 4-step checkout machine (AUs 022–028).
///
/// Mirrors the web reference (app/checkout/checkout-content.tsx +
/// steps/payment-confirmation-step.tsx): "Cancel invoice" replaces Back once
/// the proforma exists, the confirm dialog warns about stock release, the
/// completion step links to /orders/{orderId}, and the payment step shows the
/// Selcom receiving details with the proforma number as reference.
Map<String, dynamic> _proforma({String status = 'PENDING_PAYMENT'}) => {
      'proformaId': 'pf-au032',
      'proformaNumber': 'PF-2026-000042',
      'status': status,
      'itemsTotal': 626000.0,
      'deliveryTotal': 0.0,
      'grandTotal': 630000.0,
      'currency': 'TZS',
      'expiresAt': '2026-08-30T10:00:00Z',
      'sellerGroups': [
        {
          'sellerId': 128,
          'sellerName': 'Kevin Shellukindo',
          'orderId': status == 'PAYMENT_SUBMITTED' ? 'ORD-AU032' : null,
          'items': [],
        }
      ],
    };

Future<http.Response> Function(http.Request) _happyMock({
  void Function(String path)? onRequest,
  Map<String, dynamic> Function()? proforma,
}) =>
    (req) async {
      onRequest?.call(req.url.path);
      if (req.url.path == '/api/v1/proformas/pf-au032/cancel') {
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
        // The checkout contact form is web-parity readOnly: the WhatsApp
        // number now comes from the profile, never typed on the step.
        return http.Response(
            jsonEncode(
                {'firstName': 'Buyer', 'whatsAppPhoneNumber': '+255700000000'}),
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
              }
            ]),
            200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 404);
    };

/// Scrolls [finder] mid-viewport, clear of the fixed step indicator that
/// covers the very top of the checkout body.
///
/// Zero-duration jump (like WidgetController.ensureVisible) so it completes
/// inside the test's fake-async zone — a timed scroll animation would never be
/// pumped and would deadlock the await.
Future<void> _centerOn(WidgetTester tester, Finder finder) async {
  await Scrollable.ensureVisible(tester.element(finder), alignment: 0.5);
  await tester.pumpAndSettle();
}

/// Reveals [finder] and taps it.
///
/// `scrollUntilVisible` alone stops the moment the target is *built*, which the
/// lazy list's cache extent can satisfy while the widget is still off-screen —
/// and `ensureVisible` then parks it flush against the top of the body, under
/// the step indicator. This choreography used to get away with that because the
/// review step was short enough for every target to land in view anyway; it is
/// now height-dependent, which is a fragile thing for a test to depend on.
Future<void> _revealAndTap(WidgetTester tester, Finder finder,
    {double scrollBy = 200}) async {
  await tester.scrollUntilVisible(finder, scrollBy,
      scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  await _centerOn(tester, finder);
  await tester.tap(finder, warnIfMissed: true);
  await tester.pumpAndSettle();
}

/// [_revealAndTap] without the tap — for reading a widget that has to be on
/// screen (and clear of the step indicator) first.
Future<void> reveal(WidgetTester tester, Finder finder,
    {double scrollBy = 200}) async {
  await tester.scrollUntilVisible(finder, scrollBy,
      scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  await _centerOn(tester, finder);
}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
  });

  tearDown(() async {
    AuthStore.instance = null;
    CartStore.instance.reset();
    // ignore: discarded_futures
    KvStore.instance.remove(KvStore.kProformaCartSnapshot);
    // ignore: discarded_futures
    KvStore.instance.remove(KvStore.orderKey('ORD-AU032'));
    // ignore: discarded_futures
    KvStore.instance.remove(KvStore.kLastOrderId);
  });

  test('AU-032: cancelProforma POSTs /proformas/{id}/cancel', () async {
    String? method;
    Uri? url;
    final api = ApiClient(
      client: MockClient((req) async {
        method = req.method;
        url = req.url;
        return http.Response(jsonEncode(_proforma(status: 'CANCELLED')), 200,
            headers: {'content-type': 'application/json'});
      }),
    );
    final result = await api.cancelProforma('jwt', 'pf-au032');
    expect(method, 'POST');
    expect(url!.path, '/api/v1/proformas/pf-au032/cancel');
    // Backend contract: cancel flips PENDING_PAYMENT -> CANCELLED.
    expect(result['status'], 'CANCELLED');
  });

  /// Pumps the machine to the PAYMENT step by driving Address → Review →
  /// Payment against the stubbed transport.
  Future<void> pumpToPaymentStep(WidgetTester tester,
      {required ApiClient api,
      Future<XFile?> Function()? pickReceiptFile,
      bool withCartRoute = false}) async {
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
    CartStore.instance.addDetail(
        productId: 615,
        sellerId: '128',
        sellerName: 'Kevin Shellukindo',
        title: 'Chair',
        price: 626000);
    final checkout = CheckoutScreen(
      api: api,
      nowUtc: DateTime.utc(2026, 8, 25, 6, 0),
      pickReceiptFile: pickReceiptFile,
    );
    if (withCartRoute) {
      final router = GoRouter(initialLocation: '/checkout', routes: [
        GoRoute(path: '/checkout', builder: (context, state) => checkout),
        GoRoute(
            path: '/cart',
            builder: (context, state) => CartScreen(cart: CartStore.instance)),
      ]);
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    } else {
      await tester.pumpWidget(MaterialApp(home: checkout));
    }
    await tester.pumpAndSettle();

    // Step 1 -> 2: the WhatsApp field is web-parity readOnly, so the number
    // comes from the profile mock (+255700000000) — nothing to type here.
    // The ListView builds lazily — scroll down so the continue button exists.
    await tester.scrollUntilVisible(find.text('Continue to review'), 300,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue to review'));
    await tester.pumpAndSettle();

    // Step 2 -> 3: windows + terms + confirm.
    const windowTile = Key('window-TODAY_MORNING');
    const termsTile = Key('terms-checkbox');
    const confirmKey = Key('confirm-review');
    await _revealAndTap(tester, find.byKey(windowTile));
    await _revealAndTap(tester, find.byKey(termsTile));
    await _revealAndTap(tester, find.byKey(confirmKey));
    await tester.tap(find.text('Generate invoice'));
    await tester.pumpAndSettle();
  }

  testWidgets(
      'AU-032: pending proforma shows Cancel invoice on the payment step; dialog cancels + releases stock',
      (tester) async {
    var cancelCalls = 0;
    final api = ApiClient(
      client: MockClient(_happyMock(
        onRequest: (p) {
          if (p == '/api/v1/proformas/pf-au032/cancel') cancelCalls++;
        },
      )),
    );

    await pumpToPaymentStep(tester, api: api, withCartRoute: true);
    expect(find.text('Invoice PF-2026-000042'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Cancel invoice'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(find.text('Cancel invoice'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel invoice'), warnIfMissed: false);
    await tester.pumpAndSettle();
    // Confirm dialog copy matches the web AlertDialog.
    expect(find.text('Cancel this invoice?'), findsOneWidget);
    expect(
        find.textContaining('reserved items will be released'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Cancel invoice').last);
    await tester.pumpAndSettle();

    expect(cancelCalls, 1, reason: 'exactly one POST /proformas/{id}/cancel');
    expect(find.text('Keep invoice'), findsNothing,
        reason: 'dialog closes after confirm');
    // The invoice released the stock and the buyer lands on the real empty
    // cart, never on Review with its now-missing order lines.
    expect(find.text('Your cart is empty'), findsOneWidget);
    expect(find.text('Confirm & proceed to payment'), findsNothing);
    expect(CartStore.instance.isEmpty, isTrue);
  });

  testWidgets('AU-032: Keep invoice dismisses the dialog without cancelling',
      (tester) async {
    var cancelCalls = 0;
    final api = ApiClient(
      client: MockClient(_happyMock(onRequest: (p) {
        if (p == '/api/v1/proformas/pf-au032/cancel') cancelCalls++;
      })),
    );

    await pumpToPaymentStep(tester, api: api);

    await tester.scrollUntilVisible(find.text('Cancel invoice'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(find.text('Cancel invoice'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel invoice'), warnIfMissed: false);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keep invoice'));
    await tester.pumpAndSettle();

    expect(cancelCalls, 0,
        reason: '"Keep invoice" must not hit the cancel endpoint');
    expect(find.text('Cancel invoice'), findsOneWidget,
        reason: 'buyer stays on the payment step');
  });

  testWidgets(
      'AU-032: submitted payment -> completion offers View Order Details + Continue Shopping + snapshot persisted',
      (tester) async {
    var submitCalls = 0;
    Future<http.Response> Function(http.Request) fallbackHandler() =>
        (req) async => _happyMock()(req);
    final fallback = fallbackHandler();
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/proformas/pf-au032/submit-payment') {
          submitCalls++;
          return http.Response(
              jsonEncode(_proforma(status: 'PAYMENT_SUBMITTED')), 200,
              headers: {'content-type': 'application/json'});
        }
        if (req.url.path == '/api/v1/proformas/pf-au032/receipts') {
          return http.Response('[]', 200,
              headers: {'content-type': 'application/json'});
        }
        return fallback(req);
      }),
    );

    var pickCalls = 0;
    await pumpToPaymentStep(tester, api: api, pickReceiptFile: () async {
      pickCalls++;
      return XFile.fromData(Uint8List.fromList(const [1, 2, 3]),
          name: 'proof.png', mimeType: 'image/png');
    });

    // Manual bank payment accepts screenshot proof; the default mobile-money
    // method now uses an automated wallet push instead.
    await _revealAndTap(tester, find.text('Bank Account'));

    // Screenshot proof path. The screen's default mode is `screenshot`; the
    // reference field lives behind the other tab of the toggle and is not on
    // this path at all (see checkout_phase8b_test.dart A-10, which covers
    // reference-only proof).
    final add = find.byKey(const ValueKey('add-receipt'));
    await _revealAndTap(tester, add);
    expect(pickCalls, 1, reason: 'pick seam injected the screenshot');

    // Helper copy flips once a screenshot is attached (_hasProof); the tick
    // then gates the submit.
    await reveal(tester, find.byKey(const ValueKey('payment-confirmed')));
    expect(find.text('Tick to enable "Submit Payment for Verification" below.'),
        findsOneWidget);
    await _revealAndTap(
        tester, find.byKey(const ValueKey('payment-confirmed')));

    await _revealAndTap(tester, find.text('Submit Payment for Verification'));

    expect(submitCalls, 1);
    // Success copy + the per-seller order id from sellerGroups.
    expect(find.text('Payment submitted'), findsOneWidget);
    expect(find.text('Your payment is now under review'), findsOneWidget);
    expect(find.text('ORD-AU032'), findsOneWidget);
    expect(find.text('View Order Details'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Continue Shopping'), 150,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Continue Shopping'), findsOneWidget);
    // Snapshot persisted like web localStorage order_{id} + lastOrderId.
    expect(KvStore.instance.getJson(KvStore.orderKey('ORD-AU032')), isNotNull);
    expect(KvStore.instance.getString(KvStore.kLastOrderId), 'ORD-AU032');
    // Unpaid-only actions disappear once submitted.
    expect(find.text('Submit Payment for Verification'), findsNothing);
    expect(find.text('Cancel invoice'), findsNothing);
  });

  testWidgets('AU-032: payment step surfaces Selcom receiving details',
      (tester) async {
    final api = ApiClient(client: MockClient(_happyMock()));
    await pumpToPaymentStep(tester, api: api);

    // Mobile money is automated. Bank Account is the manual proof flow and
    // shows the Selcom receiving details only when selected.
    expect(find.text('Mobile Money'), findsOneWidget);
    await _revealAndTap(tester, find.text('Bank Account'));
    expect(find.text('1. Pay via Bank Account'), findsOneWidget);
    expect(find.text('5527108094688'), findsOneWidget);
    expect(find.text('7003 9305'), findsNothing);
  });
}
