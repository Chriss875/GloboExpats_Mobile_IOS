import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/apple_sign_in_service.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  http.Response json(Object body, [int status = 200]) => http.Response(
        jsonEncode(body),
        status,
        headers: {'content-type': 'application/json'},
      );

  test('posts every Apple credential required for backend verification',
      () async {
    Map<String, dynamic>? sent;
    final api = ApiClient(client: MockClient((request) async {
      expect(request.url.path, '/api/v1/oauth2/apple/mobile');
      sent = jsonDecode(request.body) as Map<String, dynamic>;
      return json({'token': 'platform-jwt', 'email': 'buyer@example.com'});
    }));

    final result = await api.signInWithApple(
      identityToken: 'signed-apple-jwt',
      authorizationCode: 'single-use-code',
      rawNonce: 'unhashed-nonce',
      email: 'buyer@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    );

    expect(result.token, 'platform-jwt');
    expect(sent, {
      'identityToken': 'signed-apple-jwt',
      'authorizationCode': 'single-use-code',
      'rawNonce': 'unhashed-nonce',
      'email': 'buyer@example.com',
      'firstName': 'Ada',
      'lastName': 'Lovelace',
    });
  });

  test('a verified Apple login stores the normal GloboExpats session',
      () async {
    final api = ApiClient(
        client: MockClient((_) async =>
            json({'token': 'platform-jwt', 'email': 'buyer@example.com'})));
    final auth = AuthStore(
      api: api,
      appleAuthenticator: const _AppleCredential(),
    );

    expect(await auth.signInWithApple(), isTrue);
    expect(auth.token, 'platform-jwt');
    expect(auth.email, 'buyer@example.com');
  });

  test('closing the Apple authorization sheet is not reported as an error',
      () async {
    final auth = AuthStore(
      api: ApiClient(client: MockClient((_) async => json({}))),
      appleAuthenticator: const _CancelledAppleCredential(),
    );

    expect(await auth.signInWithApple(), isFalse);
    expect(auth.error, isNull);
  });

  test('backend verification errors remain readable', () async {
    final auth = AuthStore(
      api: ApiClient(
          client: MockClient(
        (_) async => json({'message': 'Apple token nonce is invalid.'}, 401),
      )),
      appleAuthenticator: const _AppleCredential(),
    );

    expect(await auth.signInWithApple(), isFalse);
    expect(auth.error, contains('nonce'));
  });
}

class _AppleCredential implements AppleAuthenticator {
  const _AppleCredential();

  @override
  Future<AppleSignInPayload?> signIn() async => const AppleSignInPayload(
        identityToken: 'signed-apple-jwt',
        authorizationCode: 'single-use-code',
        rawNonce: 'unhashed-nonce',
        email: 'buyer@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
      );
}

class _CancelledAppleCredential implements AppleAuthenticator {
  const _CancelledAppleCredential();

  @override
  Future<AppleSignInPayload?> signIn() async => null;
}
