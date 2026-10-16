import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

/// Phase 8b parity patch on the buyer checkout (items A-9, A-10, A-11).
///
/// A-9: the confirmation tick resets on ANY receipt change — including the
/// removal of a NON-last receipt — not only when the last one is removed.
/// A-10: the payment upload/submit no longer sends the buyer's typed
/// transaction references; it sends `transactionReferences: []` like the web.
/// A-11: past delivery-window slots stay in the grid rendered DISABLED with a
/// "Time passed" caption instead of being filtered out.
Map<String, dynamic> _proforma({String status = 'PENDING_PAYMENT'}) => {
      'proformaId': 'pf-8b',
      'proformaNumber': 'PF-2026-0008B',
      'status': status,
      'itemsTotal': 626000.0,
      'deliveryTotal': 4000.0,
      'grandTotal': 630000.0,
      'currency': 'TZS',
      'expiresAt': '2026-08-30T10:00:00Z',
      'sellerGroups': [
        {
          'sellerId': 128,
          'sellerName': 'Kevin Shellukindo',
          'orderId': status == 'PAYMENT_SUBMITTED' ? 'ORD-P8B' : null,
          'items': [
            {
              'productId': 615,
              'title': 'Chair',
              'quantity': 1,
              'unitPrice': 626000.0,
            }
          ],
        }
      ],
    };

Future<http.Response> Function(http.Request) _happyMock({
  void Function(String path, http.Request req)? onRequest,
}) =>
    (req) async {
      onRequest?.call(req.url.path, req);
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
        return http.Response(jsonEncode(_proforma()), 201,
            headers: {'content-type': 'application/json'});
      }
      if (req.url.path == '/api/v1/proformas/pf-8b/receipts') {
        return http.Response('[]', 200,
            headers: {'content-type': 'application/json'});
      }
      if (req.url.path == '/api/v1/proformas/pf-8b/submit-payment') {
        return http.Response(
            jsonEncode(_proforma(status: 'PAYMENT_SUBMITTED')), 200,
            headers: {'content-type': 'application/json'});
      }
      if (req.url.path.endsWith('/user-details')) {
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

/// Scrolls [finder] so it sits mid-viewport — clear of the fixed step
/// indicator that covers the very top of the checkout body.
Future<void> _centerOn(WidgetTester tester, Finder finder) async {
  // Zero-duration jump (like WidgetController.ensureVisible) so it completes
  // inside the test's fake-async zone — a timed scroll animation would never
  // be pumped and would deadlock the await.
  await Scrollable.ensureVisible(tester.element(finder), alignment: 0.5);
  await tester.pumpAndSettle();
}

/// Reveals [finder] and taps it.
///
/// `scrollUntilVisible` alone is not enough: it stops the moment the target is
/// *built*, which the lazy list's cache extent can satisfy while the widget is
/// still off-screen. And a bare `ensureVisible` is worse than useless here —
/// its default `alignment: 0.0` parks the target flush against the top of the
/// body, underneath the fixed step indicator, so the tap lands on the
/// indicator and is silently swallowed. Centring is what makes the tap land.
///
/// [scrollBy] is the per-step delta: positive to walk forward (down the form),
/// negative to walk back up to something already passed.
Future<void> revealAndTap(WidgetTester tester, Finder finder,
    {double scrollBy = 200}) async {
  await tester.scrollUntilVisible(finder, scrollBy,
      scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  await _centerOn(tester, finder);
  await tester.tap(finder, warnIfMissed: true);
  await tester.pumpAndSettle();
}

/// [revealAndTap] without the tap — for entering text or asserting on a widget
/// that has to be on screen (and clear of the step indicator) first.
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
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  tearDown(() async {
    AuthStore.instance = null;
    CartStore.instance.reset();
    // ignore: discarded_futures
    KvStore.instance.remove(KvStore.kProformaCartSnapshot);
    // ignore: discarded_futures
    KvStore.instance.remove(KvStore.orderKey('ORD-P8B'));
    // ignore: discarded_futures
    KvStore.instance.remove(KvStore.kLastOrderId);
  });

  /// Pumps the machine to the PAYMENT step by driving Address → Review →
  /// Payment against the stubbed transport, mirroring the AU-032 harness
  /// (window key + terms tapAt + confirm). [nowUtc] defaults to 09:00 EAT,
  /// when TODAY_MORNING is still open.
  Future<void> pumpToPaymentStep(WidgetTester tester,
      {required ApiClient api,
      Future<XFile?> Function()? pickReceiptFile,
      DateTime? nowUtc}) async {
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
    CartStore.instance.addDetail(
        productId: 615,
        sellerId: '128',
        sellerName: 'Kevin Shellukindo',
        title: 'Chair',
        price: 626000);
    await tester.pumpWidget(MaterialApp(
        home: CheckoutScreen(
      api: api,
      nowUtc: nowUtc ?? DateTime.utc(2026, 8, 25, 6, 0),
      pickReceiptFile: pickReceiptFile,
    )));
    await tester.pumpAndSettle();

    // Step 1 -> 2.
    await tester.scrollUntilVisible(find.text('Continue to review'), 300,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue to review'));
    await tester.pumpAndSettle();

    // Step 2 -> 3: window + terms + confirm (exact AU-032 choreography).
    const windowTile = Key('window-TODAY_MORNING');
    const termsTile = Key('terms-checkbox');
    const confirmKey = Key('confirm-review');
    await revealAndTap(tester, find.byKey(windowTile));
    await revealAndTap(tester, find.byKey(termsTile));
    await revealAndTap(tester, find.byKey(confirmKey));
    expect(find.text('Generate invoice'), findsOneWidget);
    await tester.tap(find.text('Generate invoice'));
    await tester.pumpAndSettle();

    // Step 03 deliberately starts with every method collapsed. These tests
    // exercise the only manual proof flow, so open Bank Account explicitly.
    await revealAndTap(
        tester, find.byKey(const ValueKey('payment-method-bank_transfer')));
  }

  testWidgets('A-9: removing a NON-last receipt drops the confirmation tick',
      (tester) async {
    var pick = 0;
    final api = ApiClient(client: MockClient(_happyMock()));
    await pumpToPaymentStep(tester, api: api, pickReceiptFile: () async {
      pick++;
      return XFile.fromData(Uint8List.fromList([1, 2, 3, pick]),
          name: 'proof-$pick.png', mimeType: 'image/png');
    });

    final addReceipt = find.byKey(const ValueKey('add-receipt'));
    await revealAndTap(tester, addReceipt);
    expect(pick, 1, reason: 'first screenshot attached');

    // Attach the SECOND screenshot before confirming anything. Any proof-set
    // change re-arms the gate (the tick is false until we tick it once).
    await revealAndTap(tester, addReceipt);
    expect(pick, 2, reason: 'second screenshot attached');

    // Scroll DOWN to the confirmation tile and tick it with both proofs on.
    final tickFinder = find.byKey(const ValueKey('payment-confirmed'));
    await revealAndTap(tester, tickFinder);
    expect(tester.widget<CheckboxListTile>(tickFinder).value, isTrue,
        reason: 'confirmation ticked with both screenshots attached');

    // Remove the FIRST (NON-last) receipt: the remaining proof differs from
    // what was confirmed, so the tick must drop again (A-9 core behaviour).
    // It sits ABOVE the current position, so walk back up to reach it.
    final removeFirst = find.byKey(const ValueKey('remove-receipt-0'));
    await revealAndTap(tester, removeFirst, scrollBy: -200);

    expect(find.text('proof-1.png'), findsNothing,
        reason: 'the first screenshot row is gone');
    expect(tester.widget<CheckboxListTile>(tickFinder).value, isFalse,
        reason: 'A-9: removing a non-last receipt must reset the tick');
  });

  testWidgets(
      'A-10: bank transfer requires a screenshot and offers no typed '
      'transaction reference', (tester) async {
    Map<String, dynamic>? submitBody;
    final api = ApiClient(
      client: MockClient(_happyMock(onRequest: (path, req) {
        if (path == '/api/v1/proformas/pf-8b/submit-payment') {
          submitBody = jsonDecode(req.body) as Map<String, dynamic>;
        }
      })),
    );
    await pumpToPaymentStep(tester, api: api);

    // The web and current app accept manual proof only as a screenshot. There
    // is no reference-only mode that could bypass the reviewable document.
    expect(find.byKey(const ValueKey('proof-mode-reference')), findsNothing);
    expect(find.widgetWithText(TextFormField, 'Transaction reference number'),
        findsNothing);
    final tickFinder = find.byKey(const ValueKey('payment-confirmed'));
    await reveal(tester, tickFinder);
    expect(tester.widget<CheckboxListTile>(tickFinder).onChanged, isNull,
        reason: 'confirmation remains locked until a screenshot is attached');
    expect(submitBody, isNull,
        reason: 'nothing reaches the backend before proof is attached');
  });

  testWidgets('A-10b: screenshot mode alone still sends no references',
      (tester) async {
    Map<String, dynamic>? submitBody;
    var pick = 0;
    final api = ApiClient(
      client: MockClient(_happyMock(onRequest: (path, req) {
        if (path == '/api/v1/proformas/pf-8b/submit-payment') {
          submitBody = jsonDecode(req.body) as Map<String, dynamic>;
        }
      })),
    );
    await pumpToPaymentStep(tester, api: api, pickReceiptFile: () async {
      pick++;
      return XFile.fromData(Uint8List.fromList([1, 2, 3, pick]),
          name: 'proof.png', mimeType: 'image/png');
    });

    final addReceipt = find.byKey(const ValueKey('add-receipt'));
    await revealAndTap(tester, addReceipt);
    expect(pick, 1);

    await revealAndTap(tester, find.byKey(const ValueKey('payment-confirmed')));
    await revealAndTap(tester, find.text('Submit Payment for Verification'));

    expect(submitBody, isNotNull, reason: 'submit-payment must be reached');
    expect(submitBody!['paymentMethodType'], 'BANK_TRANSFER');
    expect(submitBody!['transactionReferences'], isEmpty,
        reason: 'a screenshot-only payment carries no references');
  });

  testWidgets('A-11: past windows render DISABLED with a "Time passed" caption',
      (tester) async {
    Map<String, dynamic>? createdBody;
    final api = ApiClient(
      client: MockClient(_happyMock(onRequest: (path, req) {
        if (path == '/api/v1/checkout/proforma') {
          createdBody = jsonDecode(req.body) as Map<String, dynamic>;
        }
      })),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
    CartStore.instance.addDetail(
        productId: 615,
        sellerId: '128',
        sellerName: 'Kevin Shellukindo',
        title: 'Chair',
        price: 626000);

    // 10:00 UTC = 13:00 EAT: TODAY MORNING (ends 12:00 EAT) has passed;
    // AFTERNOON (12:00–16:00) is still open.
    final nowUtc = DateTime.utc(2026, 8, 25, 10, 0);
    await tester.pumpWidget(MaterialApp(
        home: CheckoutScreen(
      api: api,
      nowUtc: nowUtc,
    )));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Continue to review'), 300,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Continue to review'));
    await tester.pumpAndSettle();

    // The six composites stay in the grid; the passed TODAY_MORNING slot is
    // present but disabled with the web-parity "Time passed" caption.
    const morningKey = ValueKey('window-TODAY_MORNING');
    const afternoonKey = ValueKey('window-TODAY_AFTERNOON');
    await tester.scrollUntilVisible(find.byKey(morningKey), 100,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.byKey(morningKey), findsOneWidget,
        reason: 'A-11: a passed window must NOT be filtered out of the grid');
    // Assert the caption + disabled state while the past tile is still on the
    // stage — scrolling on would let the lazy ListView dispose it.
    expect(find.text('Time passed'), findsOneWidget,
        reason: 'A-11: the passed slot carries the web "Time passed" caption');
    final morning = tester.widget<CheckboxListTile>(find.byKey(morningKey));
    expect(morning.onChanged, isNull,
        reason: 'A-11: a passed window is disabled');
    expect(morning.value, isFalse);

    await tester.scrollUntilVisible(find.byKey(afternoonKey), 100,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.byKey(afternoonKey), findsOneWidget);
    final afternoon = tester.widget<CheckboxListTile>(find.byKey(afternoonKey));
    expect(afternoon.onChanged, isNotNull,
        reason: 'A-11: an open window stays selectable');

    // Select the open window + terms and confirm: the created proforma payload
    // must include AFTERNOON and never the passed MORNING.
    await _centerOn(tester, find.byKey(afternoonKey));
    await tester.tap(find.byKey(afternoonKey), warnIfMissed: true);
    await tester.pumpAndSettle();

    const termsTile = Key('terms-checkbox');
    await tester.scrollUntilVisible(find.byKey(termsTile), 100,
        scrollable: find.byType(Scrollable).first);
    await _centerOn(tester, find.byKey(termsTile));
    final termsCenter = tester.getCenter(find.byKey(termsTile));
    await tester
        .tapAt(Offset(termsCenter.dx, termsCenter.dy.clamp(80.0, 500.0)));
    await tester.pumpAndSettle();

    const confirmKey = Key('confirm-review');
    await tester.scrollUntilVisible(find.byKey(confirmKey), 100,
        scrollable: find.byType(Scrollable).first);
    await _centerOn(tester, find.byKey(confirmKey));
    await tester.tap(find.byKey(confirmKey), warnIfMissed: true);
    await tester.pumpAndSettle();
    expect(find.text('Generate invoice'), findsOneWidget);
    await tester.tap(find.text('Generate invoice'));
    await tester.pumpAndSettle();

    expect(createdBody, isNotNull, reason: 'proforma creation must run');
    final buyDetails = createdBody!['buyDetails'] as Map<String, dynamic>;
    expect(
        buyDetails['preferredDeliveryWindows'],
        [
          {'date': '2026-08-25', 'slot': 'AFTERNOON'}
        ],
        reason: 'A-11: passed MORNING never enters the delivery payload');
  });
}
