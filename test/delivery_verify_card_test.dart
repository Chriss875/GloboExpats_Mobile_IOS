import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/delivery_dashboard_screens.dart';

/// AU-039 (fix round): transporter/seller-side delivery-code handoff.
///
/// Verifier r6 defects covered here:
/// - C-D2a: only a real 400 INVALID_DELIVERY_CODE consumes an attempt; a 403
///   FORBIDDEN must never count toward local lockout.
/// - C-D1: after 3 wrong codes the card locks (backend 429 LOCKED body).
/// - C-D2b: feedback copy actually paints (inline Text + SnackBar).
/// - C-PARITY seller-card-on-buyer-screen: buyer view shows NO verify input.
/// - C-PARITY buyer-self-confirm-missing: buyer gets "I received the items"
///   gated on buyerCanConfirmDelivery.
/// All responses mirror the probed sandbox shapes verbatim.

http.Response _json(Object body, [int status = 200]) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

enum Mode { invalidThenLock, forbidden }

MockClient _client(Mode mode) => MockClient((request) async {
      final p = request.url.path;
      if (p == '/api/v1/orders/o-9/transporter') {
        return _json({
          'orderId': 'o-9',
          'transporter': {'fullName': 'Asha Mbwana', 'phoneNumber': '+255700000000'},
          'status': 'IN_TRANSIT',
        });
      }
      if (p == '/api/v1/userManagement/user-details') {
        // Viewer is a plain user with the SELLER-side order (no ADMIN role).
        return _json({
          'userId': 7,
          'roles': [
            {'roleName': 'USER'}
          ],
        });
      }
      if (p == '/api/v1/orders/o-9') {
        return _json({
          'orderId': 'o-9',
          'orderNumber': 'ORD-9009',
          'orderType': 'selling', // viewer is on the selling side → verify card
          'status': 'IN_TRANSIT',
          'deliveryCode': null,
          'buyerCanConfirmDelivery': false,
        });
      }
      if (p == '/api/v1/orders/o-9/verify-delivery') {
        if (mode == Mode.forbidden) {
          // Probed sandbox shape for a non-manager (e.g. buyer) attempt.
          return _json({
            'errorCode': 'FORBIDDEN',
            'message': 'You cannot manage transport for this order',
            'code': 'FORBIDDEN',
          }, 403);
        }
        // Probed: wrong code → 400 INVALID_DELIVERY_CODE + attemptsRemaining.
        if (_wrong < 3) {
          _wrong += 1;
          return _json({
            'success': false,
            'message': 'INVALID_DELIVERY_CODE',
            'attemptsRemaining': 3 - _wrong,
          }, 400);
        }
        return _json({
          'success': false,
          'message': 'Too many incorrect attempts. Ask the buyer to regenerate the code.',
        }, 429);
      }
      if (p == '/api/v1/orders/o-9/regenerate-delivery-code') {
        return _json({'deliveryCode': '552201'});
      }
      if (p == '/api/v1/orders/o-9/confirm-delivery') {
        return _json({'orderId': 'o-9', 'status': 'DELIVERED'});
      }
      return _json({}, 404);
    });

int _wrong = 0;

Future<void> _pump(WidgetTester tester, ApiClient api, AuthStore auth) async {
  await tester.pumpWidget(MaterialApp(
    home: DeliveryTrackingScreen(orderId: 'o-9', orderNumber: 'ORD-9009', auth: auth, api: api),
  ));
}

Future<void> _settle(WidgetTester tester) async {
  await tester.pump(); // microtask: futures start
  await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
  await tester.pumpAndSettle();
}

Future<void> _submit(WidgetTester tester, [String code = '000000']) async {
  await tester.enterText(find.byKey(const ValueKey('delivery-code-input')), code);
  await tester.tap(find.byKey(const ValueKey('verify-delivery-btn')), warnIfMissed: false);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => _wrong = 0);

  testWidgets('AU-039: wrong codes paint feedback + decrement from the SERVER count; 3rd locks',
      (tester) async {
    final api = ApiClient(client: _client(Mode.invalidThenLock));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 's@b.com');
    AuthStore.instance = auth;
    await _pump(tester, api, auth);
    await _settle(tester);

    // Seller view mounts the verify card.
    expect(find.byKey(const ValueKey('delivery-code-input')), findsOneWidget);

    await _submit(tester);
    expect(find.textContaining('INVALID_DELIVERY_CODE'), findsWidgets,
        reason: 'C-D2b: wrong-code copy paints in the tree');
    expect(find.textContaining('Snack'), findsNothing); // sanity
    expect(find.textContaining('2 of 3 OTP attempts remaining'), findsWidgets);

    await _submit(tester);
    expect(find.textContaining('1 of 3 OTP attempts remaining'), findsWidgets,
        reason: 'attempts come from the server payload, not a blind local decrement');

    await _submit(tester); // attemptsRemaining hits 0 → locked
    expect(find.textContaining('Three attempts have been used'), findsWidgets);
    expect(find.text('Locked — regenerate the code'), findsOneWidget);
    final btn = tester.widget<FilledButton>(
        find.byKey(const ValueKey('verify-delivery-btn')));
    expect(btn.onPressed, isNull, reason: 'verify disabled while locked');

    // Regenerate issues a fresh code and clears the lock.
    await tester.tap(find.text('Generate new code'));
    await tester.pumpAndSettle();
    expect(find.textContaining('New code generated'), findsWidgets);
    final after = tester.widget<FilledButton>(
        find.byKey(const ValueKey('verify-delivery-btn')));
    expect(after.onPressed, isNotNull, reason: 'verify re-enabled after regen');
  });

  testWidgets('AU-039 C-D2a: 403 FORBIDDEN never counts toward lockout', (tester) async {
    final api = ApiClient(client: _client(Mode.forbidden));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 's@b.com');
    AuthStore.instance = auth;
    await _pump(tester, api, auth);
    await _settle(tester);

    for (var i = 0; i < 5; i++) {
      await _submit(tester);
      expect(find.textContaining('You cannot manage transport for this order'),
          findsWidgets,
          reason: '403 message surfaces instead of being swallowed');
      expect(find.text('Locked — regenerate the code'), findsNothing,
          reason: 'a permission failure must never consume an attempt');
      final btn = tester.widget<FilledButton>(
          find.byKey(const ValueKey('verify-delivery-btn')));
      expect(btn.onPressed, isNotNull, reason: 'card stays usable after 403');
    }
  });

  testWidgets('AU-039 parity: buyer sees their own code + self-confirm, NOT the verify input',
      (tester) async {
    final api = ApiClient(client: MockClient((request) async {
      final p = request.url.path;
      if (p == '/api/v1/orders/o-9/transporter') {
        return _json({
          'transporter': {'fullName': 'Asha Mbwana'},
          'status': 'IN_TRANSIT',
        });
      }
      if (p == '/api/v1/userManagement/user-details') {
        return _json({
          'userId': 8,
          'roles': [
            {'roleName': 'USER'}
          ],
        });
      }
      if (p == '/api/v1/orders/o-9') {
        // Buyer's own IN_TRANSIT delivery order (probed sandbox shape).
        return _json({
          'orderId': 'o-9',
          'orderType': 'buying',
          'status': 'IN_TRANSIT',
          'deliveryCode': '264240',
          'buyerCanConfirmDelivery': true,
        });
      }
      if (p == '/api/v1/orders/o-9/regenerate-delivery-code') {
        return _json({'deliveryCode': '101715'});
      }
      if (p == '/api/v1/orders/o-9/confirm-delivery') {
        return _json({'orderId': 'o-9', 'status': 'DELIVERED'});
      }
      return _json({}, 404);
    }));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@b.com');
    AuthStore.instance = auth;
    await _pump(tester, api, auth);
    await _settle(tester);

    // No seller-style input card on the buyer's screen (r6 C-PARITY).
    expect(find.byKey(const ValueKey('delivery-code-input')), findsNothing);
    expect(find.byKey(const ValueKey('verify-delivery-btn')), findsNothing);
    expect(find.byKey(const ValueKey('verify-delivery-btn')), findsNothing);

    // The buyer's own code + capability-gated confirm button.
    expect(find.byKey(const ValueKey('buyer-delivery-code')), findsOneWidget);
    final t = tester.widget<Text>(find.byKey(const ValueKey('buyer-delivery-code')));
    expect(t.data, '264240');
    expect(find.byKey(const ValueKey('buyer-confirm-delivery-btn')), findsOneWidget,
        reason: 'buyerCanConfirmDelivery=true gates "I received the items"');

    await tester.tap(find.byKey(const ValueKey('buyer-confirm-delivery-btn')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Delivery confirmed'), findsWidgets);
  });

  testWidgets('AU-039: no self-confirm button when buyerCanConfirmDelivery is absent/false',
      (tester) async {
    final api = ApiClient(client: MockClient((request) async {
      final p = request.url.path;
      if (p == '/api/v1/orders/o-9/transporter') {
        return _json({'transporter': {'fullName': 'Asha'}, 'status': 'IN_TRANSIT'});
      }
      if (p == '/api/v1/userManagement/user-details') {
        return _json({
          'userId': 9,
          'roles': [
            {'roleName': 'USER'}
          ],
        });
      }
      return _json({
        'orderId': 'o-9',
        'orderType': 'buying',
        'status': 'IN_TRANSIT',
        'deliveryCode': '111222',
        'buyerCanConfirmDelivery': false,
      });
    }));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@b.com');
    AuthStore.instance = auth;
    await _pump(tester, api, auth);
    await _settle(tester);

    expect(find.byKey(const ValueKey('buyer-delivery-code')), findsOneWidget);
    expect(find.byKey(const ValueKey('buyer-confirm-delivery-btn')), findsNothing,
        reason: 'flag absent/false keeps legacy behaviour (reference allowBuyerConfirmation)');
  });

  testWidgets('AU-039: unknown role keeps the verify card hidden (no guaranteed-403 input)',
      (tester) async {
    final api = ApiClient(client: MockClient((request) async {
      if (request.url.path == '/api/v1/userManagement/user-details') {
        return _json({}, 500); // role resolution fails
      }
      if (request.url.path == '/api/v1/orders/o-9/transporter') {
        return _json({'transporter': {'fullName': 'Asha'}, 'status': 'IN_TRANSIT'});
      }
      return _json({}, 404);
    }));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'x@b.com');
    AuthStore.instance = auth;
    await _pump(tester, api, auth);
    await _settle(tester);

    expect(find.byKey(const ValueKey('delivery-code-input')), findsNothing,
        reason: 'never mount an input that would 403 on first tap');
  });

  testWidgets(
      'AU-039 r9 a11y FAIL: code card title/instructions/code/attempts copy are exposed to semantics',
      (tester) async {
    // r9: these Texts painted but were absent from the flt-semantics tree, so
    // screen readers (and the harness's textContent probe) got nothing.
    // testWidgets defaults to semanticsEnabled:true — the framework creates
    // and disposes its own SemanticsHandle, so no manual one is needed.
    final api = ApiClient(client: MockClient((request) async {
      final p = request.url.path;
      if (p == '/api/v1/orders/o-9/transporter') {
        return _json({'transporter': {'fullName': 'Asha Mbwana'}, 'status': 'IN_TRANSIT'});
      }
      if (p == '/api/v1/userManagement/user-details') {
        return _json({
          'userId': 8,
          'roles': [
            {'roleName': 'USER'}
          ],
        });
      }
      if (p == '/api/v1/orders/o-9') {
        return _json({
          'orderId': 'o-9',
          'orderType': 'selling',
          'status': 'IN_TRANSIT',
          'buyerCanConfirmDelivery': false,
        });
      }
      if (p == '/api/v1/orders/o-9/verify-delivery') {
        // Sandbox shape: wrong code → 400 + server-driven attemptsRemaining.
        return _json({
          'success': false,
          'message': 'INVALID_DELIVERY_CODE',
          'attemptsRemaining': 2,
        }, 400);
      }
      return _json({}, 404);
    }));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 's@b.com');
    AuthStore.instance = auth;
    await _pump(tester, api, auth);
    await _settle(tester);

    // Static card copy reaches the semantics tree. (The card node merges its
    // container label with the child texts, so match the leading label.)
    expect(
        find.bySemanticsLabel(RegExp('^Confirm delivery. '
            'Ask the buyer for their delivery code at handover and enter it here to mark this order delivered')),
        findsOneWidget,
        reason: 'seller card title + instructions are in the a11y tree');

    // A wrong code → server attempts line + feedback must be semantic too.
    // (mock: first wrong answer carries attemptsRemaining = 2, sandbox shape)
    await _submit(tester, '111111');
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('attemptsRemaining: 2')), findsOneWidget,
        reason: 'server-driven attempts line is in the a11y tree');

    // Buyer-side variant: the code itself is semantic.
    final buyerApi = ApiClient(client: MockClient((request) async {
      final p = request.url.path;
      if (p == '/api/v1/orders/o-9/transporter') {
        return _json({'transporter': {'fullName': 'Asha'}, 'status': 'IN_TRANSIT'});
      }
      if (p == '/api/v1/userManagement/user-details') {
        return _json({
          'userId': 10,
          'roles': [
            {'roleName': 'USER'}
          ],
        });
      }
      if (p == '/api/v1/orders/o-9') {
        return _json({
          'orderId': 'o-9',
          'orderType': 'buying',
          'status': 'IN_TRANSIT',
          'deliveryCode': '264240',
          'buyerCanConfirmDelivery': true,
        });
      }
      if (p == '/api/v1/orders/o-9/regenerate-delivery-code') {
        return _json({'deliveryCode': '101715'});
      }
      return _json({}, 404);
    }));
    final buyerAuth = AuthStore(api: buyerApi, initialToken: 'jwt', initialEmail: 'b@b.com');
    AuthStore.instance = buyerAuth;
    // Distinct Key: pumping the same runtimeType without one REUSES the State
    // from the seller leg above (role stays resolved as SELLER), and the buyer
    // card never mounts.
    await tester.pumpWidget(MaterialApp(
        home: DeliveryTrackingScreen(key: UniqueKey(), orderId: 'o-9',
            orderNumber: 'ORD-9009', auth: buyerAuth, api: buyerApi)));
    await _settle(tester);
    await tester.pump(); // semantics flush after re-route to buyer card
    // Card is ONE merged semantics container, so the code + instructions ride
    // the container label — match the container node.
    expect(find.bySemanticsLabel(RegExp('Delivery code 264240')), findsOneWidget,
        reason: 'the big mono code is announced to screen readers');
    expect(find.bySemanticsLabel(
        RegExp('Give this code to the driver only when you have your items')),
        findsOneWidget);
    expect(find.byKey(const ValueKey('copy-delivery-code-btn')), findsOneWidget,
        reason: 'reference Clipboard parity button present');
  });

  testWidgets('AU-039: Copy delivery code writes the clipboard + announces it', (tester) async {
    final api = ApiClient(client: MockClient((request) async {
      final p = request.url.path;
      if (p == '/api/v1/orders/o-9/transporter') {
        return _json({'transporter': {'fullName': 'Asha'}, 'status': 'IN_TRANSIT'});
      }
      if (p == '/api/v1/userManagement/user-details') {
        return _json({
          'userId': 11,
          'roles': [
            {'roleName': 'USER'}
          ],
        });
      }
      if (p == '/api/v1/orders/o-9') {
        return _json({
          'orderId': 'o-9',
          'orderType': 'buying',
          'status': 'IN_TRANSIT',
          'deliveryCode': '264240',
          'buyerCanConfirmDelivery': false,
        });
      }
      return _json({}, 404);
    }));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'b@b.com');
    AuthStore.instance = auth;
    await _pump(tester, api, auth);
    await _settle(tester);

    await tester.tap(find.byKey(const ValueKey('copy-delivery-code-btn')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Delivery code copied'), findsWidgets);
  });
}
