import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/domain/selcom_payment.dart';
import 'package:globoexpats_mobile/screens/checkout_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "in paying we have integrated with selcom so also update mobile to match
/// new changes" — web `hooks/use-selcom-wallet-payment.ts` +
/// `components/checkout/mobile-wallet-payment.tsx`.
///
/// Mobile only had the manual path for every method: pay somewhere else,
/// screenshot it, wait for an admin. Mobile Wallet is now completed in the
/// app — Selcom pushes a PIN prompt and the order confirms itself.
void main() {
  group('reading Selcom back', () {
    test('a terminal state is recognised however Selcom spells it', () {
      expect(outcomeFromState('COMPLETED'), SelcomOutcome.success);
      expect(outcomeFromState('success'), SelcomOutcome.success);
      // Their docs use both spellings across endpoints.
      expect(outcomeFromState('USERCANCELLED'), SelcomOutcome.declined);
      expect(outcomeFromState('USER_CANCELED'), SelcomOutcome.declined);
      expect(outcomeFromState('REJECTED'), SelcomOutcome.declined);
      // Gateway-side, not the buyer.
      expect(outcomeFromState('CANCELLED'), SelcomOutcome.failed);
    });

    test('pending states keep the wait going', () {
      expect(outcomeFromState('PENDING'), isNull);
      expect(outcomeFromState('INPROGRESS'), isNull);
      expect(outcomeFromState(null), isNull);
      expect(outcomeFromState(''), isNull);
    });

    test('a timed-out poll reads as a neutral failure, never a decline', () {
      expect(resolvedOutcome(SelcomOutcome.timeout), SelcomOutcome.failed,
          reason: 'a wallet pull can sit at PENDING; do not accuse the buyer '
              'of declining something Selcom never reported');
      expect(resolvedOutcome(SelcomOutcome.declined), SelcomOutcome.declined);
      expect(resolvedOutcome(null), isNull);
    });
  });

  group('the wallet number', () {
    test('accepts Tanzanian mobiles in every stored spelling', () {
      expect(isValidTzMobile('0712345678'), isTrue);
      expect(isValidTzMobile('255712345678'), isTrue);
      expect(isValidTzMobile('+255 712 345 678'), isTrue);
      expect(isValidTzMobile('0612345678'), isTrue);
    });

    test('rejects anything that cannot receive a push', () {
      expect(isValidTzMobile('0812345678'), isFalse, reason: 'not 6 or 7');
      expect(isValidTzMobile('071234567'), isFalse, reason: 'too short');
      expect(isValidTzMobile(''), isFalse);
      expect(isValidTzMobile(null), isFalse);
    });

    test('displays as 07XX XXX XXX whatever went in', () {
      expect(displayWalletPhone('255712345678'), '0712 345 678');
      expect(displayWalletPhone('+255712345678'), '0712 345 678');
      expect(displayWalletPhone('0712345678'), '0712 345 678');
    });
  });

  group('which methods are automated', () {
    test('both Selcom channels skip proof and verification', () {
      // Web AUTOMATED_METHODS = {MOBILE_MONEY, SELCOM_PESA}.
      expect(isAutomatedPaymentMethod('MOBILE_MONEY'), isTrue);
      expect(isAutomatedPaymentMethod('SELCOM_PESA'), isTrue);
      expect(isAutomatedPaymentMethod('BANK_TRANSFER'), isFalse);
      expect(isAutomatedPaymentMethod(null), isFalse);
    });

    test('each method sends on its own channel', () {
      expect(channelForMethod('MOBILE_MONEY'), SelcomPushChannel.mobileWallet);
      expect(channelForMethod('SELCOM_PESA'), SelcomPushChannel.selcomPesa);
      expect(channelForMethod('BANK_TRANSFER'), isNull);
    });
  });

  group('the Step 04 result', () {
    test('a timeout is a failure, never a decline', () {
      expect(resultKindFor(SelcomOutcome.timeout), PaymentResultKind.failed);
      expect(resultKindFor(SelcomOutcome.declined), PaymentResultKind.declined);
      expect(resultKindFor(SelcomOutcome.success), PaymentResultKind.success);
      expect(resultKindFor(null), isNull);
    });

    test('uses the web copy word for word', () {
      expect(paymentResultCopy(PaymentResultKind.success).cta,
          'Continue shopping');
      expect(paymentResultCopy(PaymentResultKind.failed).title,
          "We couldn't confirm your payment");
      expect(paymentResultCopy(PaymentResultKind.declined).title,
          'Your mobile money payment was declined');
    });
  });

  group('the payment step', () {
    final nowUtc = DateTime.utc(2026, 8, 25, 6, 0);

    Map<String, dynamic> proforma({String status = 'PENDING_PAYMENT'}) => {
          'proformaId': 'pf-1',
          'proformaNumber': 'PF-2026-000777',
          'status': status,
          'itemsTotal': 100000.0,
          'deliveryTotal': 4000.0,
          'grandTotal': 104000.0,
          'currency': 'TZS',
          'expiresAt': '2026-08-25T07:00:00Z',
          'sellerGroups': [
            {
              'sellerId': 128,
              'sellerName': 'Globo Expats',
              'orderId': status == 'PAID' ? 'ORD-1' : null,
              'items': [
                {
                  'productId': 615,
                  'title': 'Chair',
                  'quantity': 1,
                  'unitPrice': 100000.0
                }
              ],
            }
          ],
        };

    /// Drives checkout to the payment step, then returns the calls made.
    Future<List<String>> pumpToPayment(
      WidgetTester tester, {
      required List<String> statuses,
      bool failPush = false,
      String method = 'MOBILE_MONEY',
    }) async {
      tester.view.physicalSize = const Size(420, 950);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      final calls = <String>[];
      var statusIndex = 0;
      final api = ApiClient(client: MockClient((req) async {
        final path = req.url.path;
        http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
            headers: {'content-type': 'application/json'});
        if (path.contains('/pay/selcom')) {
          calls.add(path);
        }
        if (path.endsWith('/pay/selcom')) {
          return ok({'proformaId': 'pf-1', 'orderId': 'pf-1-1'});
        }
        if (path.endsWith('/wallet-push') ||
            path.endsWith('/selcom-pesa-push')) {
          if (failPush) return http.Response('{"message":"no route"}', 502);
          return ok({'proformaId': 'pf-1', 'result': 'PENDING'});
        }
        if (path.endsWith('/pay/selcom/status')) {
          final state = statuses[statusIndex < statuses.length
              ? statusIndex++
              : statuses.length - 1];
          return ok({'proformaId': 'pf-1', 'paymentStatus': state});
        }
        if (path.endsWith('/pay/selcom/cancel')) {
          return ok({'proformaId': 'pf-1', 'cancelled': 1});
        }
        if (path == '/api/v1/proformas/pf-1') {
          return ok(proforma(status: 'PAID'));
        }
        if (path == '/api/v1/checkout/proforma') return ok(proforma());
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
        return http.Response('{}', 404);
      }));

      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@x.com');
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

      await tester.pumpWidget(
          MaterialApp(home: CheckoutScreen(api: api, nowUtc: nowUtc)));
      await tester.pumpAndSettle();

      // Shipping -> Review
      await tester.scrollUntilVisible(find.text('Continue to review'), 300,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text('Continue to review'));
      await tester.pumpAndSettle();

      // Review -> Payment. `scrollUntilVisible` stops as soon as the widget
      // exists, which can still be off the bottom edge, so each target is
      // also ensured visible before the tap.
      Future<void> revealAndTap(Finder finder) async {
        await tester.scrollUntilVisible(finder, 200,
            scrollable: find.byType(Scrollable).first);
        await tester.pumpAndSettle();
        await tester.ensureVisible(finder);
        await tester.pumpAndSettle();
        await tester.tap(finder);
        await tester.pumpAndSettle();
      }

      await revealAndTap(find.byKey(const ValueKey('availability-w1')));
      // The tile's label carries tappable Terms / Privacy links, so aim at
      // the checkbox itself rather than the row's centre.
      await tester.scrollUntilVisible(
          find.byKey(const ValueKey('terms-checkbox')), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      await revealAndTap(find.descendant(
          of: find.byKey(const ValueKey('terms-checkbox')),
          matching: find.byType(Checkbox)));
      await revealAndTap(find.byKey(const ValueKey('confirm-review')));
      if (find.text('Generate invoice').evaluate().isNotEmpty) {
        await tester.tap(find.text('Generate invoice'));
        await tester.pumpAndSettle();
      }
      // Web: Step 03 opens with every method collapsed, so the buyer opens
      // one first. Then bring its card into view so the controls are built.
      final row =
          find.byKey(ValueKey('payment-method-${method.toLowerCase()}'));
      await revealAndTap(row);
      if (method == 'BANK_TRANSFER') return calls;
      await tester.scrollUntilVisible(
          find.byKey(ValueKey(
              method == 'SELCOM_PESA' ? 'selcom-wallet-send' : 'wallet-send')),
          200,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      return calls;
    }

    /// Advances past the first poll (2s) and a second (3s) and lets the
    /// outcome settle.
    Future<void> runPolls(WidgetTester tester) async {
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(seconds: 4));
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

    testWidgets(
        'a bank transfer proof sits right under the bank details, and '
        'only there', (tester) async {
      await pumpToPayment(tester,
          statuses: ['PENDING'], method: 'BANK_TRANSFER');

      final proof = find.byKey(const ValueKey('bank-transfer-proof'));
      final submit = find.byKey(const ValueKey('submit-payment'));
      final upload = find.byKey(const ValueKey('add-receipt'));
      expect(proof, findsOneWidget);
      expect(upload, findsOneWidget);
      expect(submit, findsOneWidget);

      // Account number -> upload -> submit -> the next method, down the page.
      final account = tester.getRect(find.text('5527108094688'));
      final mobileMoney = tester
          .getRect(find.byKey(const ValueKey('payment-method-mobile_money')));
      expect(tester.getRect(upload).top, greaterThan(account.bottom));
      expect(tester.getRect(submit).bottom, lessThan(mobileMoney.top),
          reason: 'the whole bank flow is done before the next method starts');

      // Closing the bank row takes its upload and submit with it.
      await tester.ensureVisible(
          find.byKey(const ValueKey('payment-method-bank_transfer')));
      await tester.pumpAndSettle();
      await tester
          .tap(find.byKey(const ValueKey('payment-method-bank_transfer')));
      await tester.pumpAndSettle();
      expect(proof, findsNothing);
      expect(submit, findsNothing);
    });

    testWidgets('the mobile wallet asks for a push, not a screenshot',
        (tester) async {
      final calls = await pumpToPayment(tester, statuses: ['PENDING']);

      // MOBILE_MONEY is the default method, so the wallet card is what shows.
      expect(find.text('Pay with Mobile Money'), findsOneWidget);
      expect(find.text('Send payment request'), findsOneWidget);
      expect(find.text('PROOF OF PAYMENT'), findsNothing,
          reason: 'an automated method has nothing to prove');
      expect(find.text('Submit Payment for Verification'), findsNothing);
      // The number captured at checkout is prefilled.
      expect(find.text('0712 345 678'), findsOneWidget);
      expect(calls, isEmpty, reason: 'nothing is sent until the buyer asks');
    });

    testWidgets('sending registers the order then pushes the prompt',
        (tester) async {
      final calls = await pumpToPayment(tester, statuses: ['PENDING']);

      await tester.tap(find.byKey(const ValueKey('wallet-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(calls.where((c) => c.endsWith('/pay/selcom')), hasLength(1),
          reason: 'one Selcom order per attempt');
      expect(calls.where((c) => c.endsWith('/wallet-push')), hasLength(1));
      expect(find.text('Check your phone'), findsOneWidget);
      expect(find.textContaining('has been sent to'), findsOneWidget);

      // Leave nothing polling behind.
      await tester.tap(find.text('Cancel and choose another method'));
      await tester.pumpAndSettle();
    });

    testWidgets('a rejected wallet lands on the declined result at Step 04',
        (tester) async {
      await pumpToPayment(tester, statuses: ['PENDING', 'REJECTED']);

      await tester.tap(find.byKey(const ValueKey('wallet-send')));
      await runPolls(tester);

      // Web handleSelcomOutcome: every final outcome leaves the card for the
      // result screen, rather than a panel inside the Payment step.
      expect(find.byKey(const ValueKey('payment-result-declined')),
          findsOneWidget);
      expect(
          find.text('Your mobile money payment was declined'), findsOneWidget);
      // The declined copy names the invoice and the number it went to.
      expect(find.textContaining('PF-2026-000777'), findsOneWidget);
      expect(find.textContaining('Number '), findsWidgets);
      expect(find.text('Try again'), findsOneWidget);
      expect(find.byKey(const ValueKey('wallet-send')), findsNothing,
          reason: 'the Payment step is behind us now');
    });

    testWidgets('Try again goes back to Step 03 on a fresh Selcom order',
        (tester) async {
      final calls = await pumpToPayment(tester, statuses: ['REJECTED']);

      await tester.tap(find.byKey(const ValueKey('wallet-send')));
      await runPolls(tester);
      expect(find.byKey(const ValueKey('payment-result-declined')),
          findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('payment-result-primary')));
      await tester.pumpAndSettle();

      // Back on the Payment step, with every method collapsed again — web
      // remounts the step, so nothing carries over.
      expect(
          find.byKey(const ValueKey('payment-result-declined')), findsNothing);
      // `_goTo` brings the step back to its top, so the row is below.
      final row = find.byKey(const ValueKey('payment-method-mobile_money'));
      await tester.scrollUntilVisible(row, 200,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(row);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
          find.byKey(const ValueKey('wallet-send')), 200,
          scrollable: find.byType(Scrollable).first);
      // scrollUntilVisible stops once the button exists, which can still be
      // just past the bottom edge.
      await tester.ensureVisible(find.byKey(const ValueKey('wallet-send')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('wallet-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      // A declined Selcom order is terminal: the retry must register a new
      // one, or the backend refuses to push on it again.
      expect(calls.where((c) => c.endsWith('/pay/selcom')), hasLength(2));

      await tester.tap(find.text('Cancel and choose another method'));
      await tester.pumpAndSettle();
    });

    testWidgets('a wait that runs out reads as failed, never declined',
        (tester) async {
      await pumpToPayment(tester, statuses: ['PENDING']);

      await tester.tap(find.byKey(const ValueKey('wallet-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      // Past the 3-minute bounded poll.
      for (var i = 0; i < 64; i++) {
        await tester.pump(const Duration(seconds: 3));
      }
      await tester.pumpAndSettle();

      expect(
          find.byKey(const ValueKey('payment-result-failed')), findsOneWidget);
      expect(find.text("We couldn't confirm your payment"), findsOneWidget);
      expect(find.text('Your mobile money payment was declined'), findsNothing,
          reason: 'Selcom never said the buyer declined anything');
    });

    // The reported bug: a buyer approved in the Selcom App (outside our app)
    // and the payment succeeded, but the app never said so.
    testWidgets('coming back from the Selcom App checks at once',
        (tester) async {
      final statuses = ['PENDING'];
      await pumpToPayment(tester, statuses: statuses);
      await tester.tap(find.byKey(const ValueKey('wallet-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 2100)); // first poll
      statuses.add('COMPLETED'); // approved while away

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pumpAndSettle();

      expect(
          find.byKey(const ValueKey('payment-result-success')), findsOneWidget);
    });

    testWidgets('an approval that lands after the wait gave up still succeeds',
        (tester) async {
      final statuses = ['PENDING'];
      await pumpToPayment(tester, statuses: statuses);
      await tester.tap(find.byKey(const ValueKey('wallet-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      for (var i = 0; i < 64; i++) {
        await tester.pump(const Duration(seconds: 3));
      }
      await tester.pumpAndSettle();
      expect(
          find.byKey(const ValueKey('payment-result-failed')), findsOneWidget);

      statuses.add('COMPLETED');
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pumpAndSettle();

      expect(
          find.byKey(const ValueKey('payment-result-success')), findsOneWidget);
    });

    testWidgets(
        'Try again never asks to pay twice for a payment that went through',
        (tester) async {
      final statuses = ['PENDING'];
      final calls = await pumpToPayment(tester, statuses: statuses);
      await tester.tap(find.byKey(const ValueKey('wallet-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      for (var i = 0; i < 64; i++) {
        await tester.pump(const Duration(seconds: 3));
      }
      await tester.pumpAndSettle();

      statuses.add('COMPLETED');
      await tester.tap(find.byKey(const ValueKey('payment-result-primary')));
      await tester.pumpAndSettle();

      expect(
          find.byKey(const ValueKey('payment-result-success')), findsOneWidget);
      expect(calls.where((c) => c.endsWith('/pay/selcom')), hasLength(1),
          reason: 'no second Selcom order for money already received');
    });

    testWidgets('a completed payment lands on the success result',
        (tester) async {
      await pumpToPayment(tester, statuses: ['COMPLETED']);

      await tester.tap(find.byKey(const ValueKey('wallet-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();

      // No proof, no admin: Step 04 is reached on Selcom's word.
      expect(
          find.byKey(const ValueKey('payment-result-success')), findsOneWidget);
      expect(find.text('Payment successful'), findsOneWidget);
      // Web amount label: currency code + rounded grand total.
      expect(find.text('TZS 104,000'), findsOneWidget);
      expect(find.text('Continue shopping'), findsOneWidget);
      expect(find.text('Submit Payment for Verification'), findsNothing);
      // The buyer can go straight to the order they just paid for.
      expect(find.byKey(const ValueKey('payment-result-view-order')),
          findsOneWidget);
    });

    testWidgets('Selcom Wallet is its own method with its own request',
        (tester) async {
      final calls = await pumpToPayment(tester,
          statuses: ['PENDING'], method: 'SELCOM_PESA');

      expect(find.byKey(const ValueKey('selcom-wallet-mark')), findsOneWidget);
      expect(find.text('Pay via Selcom App'), findsOneWidget);
      expect(find.text('Send payment request'), findsOneWidget);
      // Selcom Wallet is one app, not the mobile-money networks.
      expect(find.text('M-Pesa'), findsNothing);
      expect(find.text('PROOF OF PAYMENT'), findsNothing,
          reason: 'Selcom Wallet is automated like the mobile wallet');

      await tester.tap(find.byKey(const ValueKey('selcom-wallet-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(calls.where((c) => c.endsWith('/selcom-pesa-push')), hasLength(1));
      expect(calls.where((c) => c.endsWith('/wallet-push')), isEmpty,
          reason: 'the in-app request, not a USSD prompt');
      expect(find.textContaining('Open the Selcom App and approve'),
          findsOneWidget);

      await tester.tap(find.text('Cancel and choose another method'));
      await tester.pumpAndSettle();
    });

    testWidgets('a refused push keeps the buyer on the number step',
        (tester) async {
      await pumpToPayment(tester, statuses: ['PENDING'], failPush: true);

      await tester.tap(find.byKey(const ValueKey('wallet-send')));
      await tester.pumpAndSettle();

      expect(find.text('Check your phone'), findsNothing);
      expect(find.text('Send payment request'), findsOneWidget,
          reason: 'the card stays on the phone-number step so they can retry');
    });
  });
}
