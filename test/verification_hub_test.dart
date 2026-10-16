import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/verification_hub_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('AU-061: hub shows the vendor flow when unverified and submits it',
      (tester) async {
    http.Request? captured;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/seller-verification/current') {
          return _json({'application': null});
        }
        if (req.url.path == '/api/v1/seller-verification' && req.method == 'POST') {
          captured = req;
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          expect(body['referralSource'], 'SOCIAL_MEDIA');
          expect(body['sellerType'], 'BUSINESS');
          expect(body['businessName'], 'Neema Crafts Ltd');
          expect(body['productTypes'], 'Handmade jewellery');
          return _json({'requestId': 3, 'reviewStatus': 'PENDING'}, 201);
        }
        // after submit the hub reloads -> pending application
        if (req.url.path == '/api/v1/seller-verification/current') {
          return _json({
            'application': {'requestId': 3, 'reviewStatus': 'PENDING', 'productTypes': 'Handmade jewellery'}
          });
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: VerificationHubScreen(api: api)));
    await tester.pumpAndSettle();

    // Web parity: a short conversation, one question per screen.
    Future<void> choose(String key) async {
      await tester.ensureVisible(find.byKey(ValueKey(key)));
      await tester.tap(find.byKey(ValueKey(key)));
      await tester.pumpAndSettle();
    }

    expect(find.textContaining('expatriate organization'), findsOneWidget);
    await choose('verify-org-no');
    await choose('verify-role-seller');
    await choose('verify-referral-SOCIAL_MEDIA');
    await choose('verify-type-business');
    expect(find.text('Tell us about your business'), findsOneWidget);
    await tester.enterText(
        find.byKey(const ValueKey('verify-seller-name')), 'Neema Crafts Ltd');
    await tester.enterText(
        find.byKey(const ValueKey('verify-products')), 'Handmade jewellery');
    await tester.ensureVisible(find.byKey(const ValueKey('verify-submit')));
    await tester.tap(find.byKey(const ValueKey('verify-submit')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));

    expect(captured, isNotNull, reason: 'POST /seller-verification fired');
    AuthStore.instance = null;
  });

  testWidgets('AU-061: pending application renders the pending state',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/seller-verification/current') {
          return _json({
            'application': {'requestId': 3, 'reviewStatus': 'PENDING'}
          });
        }
        return _json({});
      }),
    );
    AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');

    await tester.pumpWidget(MaterialApp(home: VerificationHubScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.textContaining('pending'), findsOneWidget);
    expect(find.text('Verify to start selling'), findsNothing);
    AuthStore.instance = null;
  });

  testWidgets('a personal inbox is steered to the seller review, not an OTP',
      (tester) async {
    var otpRequested = false;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/seller-verification/current') {
          return _json({'application': null});
        }
        if (req.url.path.contains('organization') ||
            req.url.path.contains('otp')) {
          otpRequested = true;
        }
        return _json({});
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: VerificationHubScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('verify-org-yes')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('verify-work-email-yes')));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('org-email-field')), 'amina@gmail.com');
    await tester.ensureVisible(find.byKey(const ValueKey('org-send-otp-btn')));
    await tester.tap(find.byKey(const ValueKey('org-send-otp-btn')));
    await tester.pumpAndSettle();

    expect(otpRequested, isFalse);
    expect(find.byKey(const ValueKey('verify-role-seller')), findsOneWidget,
        reason: 'on to the buyer / seller question instead');
    AuthStore.instance = null;
  });

  testWidgets('an account verified without an application shows as verified',
      (tester) async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/api/v1/seller-verification/current') {
          return _json({'application': null});
        }
        if (req.url.path == '/api/v1/userManagement/user-details') {
          return _json({'userId': 7, 'verificationStatus': 'VERIFIED'});
        }
        return _json({});
      }),
    );
    AuthStore.instance =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: VerificationHubScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Your account is verified'), findsOneWidget);
    AuthStore.instance = null;
  });
}
