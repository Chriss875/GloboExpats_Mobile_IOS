import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/auth/google_sign_in_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Google sign-in against the backend contract the web already uses:
/// `/oauth2/login/google` hands back a consent URL, `/oauth2/exchange` swaps
/// the returned code for a platform session.
///
/// No Google credentials appear in this app — the backend holds the client id
/// and secret and builds the consent URL itself, so there is nothing to embed
/// or leak here.
void main() {
  http.Response json(Object body, [int status = 200]) =>
      http.Response(jsonEncode(body), status,
          headers: {'content-type': 'application/json'});

  ApiClient clientFor(Future<http.Response> Function(http.Request) handler) =>
      ApiClient(client: MockClient(handler));

  group('starting the flow', () {
    test('asks the backend for the consent URL and passes nextPath along',
        () async {
      Uri? seen;
      final api = clientFor((req) async {
        seen = req.url;
        return json(
            {'authUrl': 'https://accounts.google.com/o/oauth2/v2/auth?x=1'});
      });

      final url = await api.getGoogleAuthUrl(nextPath: '/orders');
      expect(url, startsWith('https://accounts.google.com/'));
      expect(seen!.path, '/api/v1/oauth2/login/google');
      expect(seen!.queryParameters['nextPath'], '/orders');
    });

    test('a backend without the route fails loudly rather than opening nothing',
        () async {
      final api = clientFor((_) async => json({'message': 'nope'}, 404));
      expect(() => api.getGoogleAuthUrl(), throwsA(isA<ApiException>()));
    });

    test('an empty authUrl is treated as unavailable', () async {
      final api = clientFor((_) async => json({'authUrl': ''}));
      expect(() => api.getGoogleAuthUrl(), throwsA(isA<ApiException>()));
    });
  });

  group('exchanging the code', () {
    test('returns the session and the profile Google supplied', () async {
      final api = clientFor((req) async {
        expect(req.url.path, '/api/v1/oauth2/exchange');
        expect(req.url.queryParameters['code'], 'abc123');
        return json({
          'token': 'jwt-token',
          'email': 'a@b.com',
          'firstName': 'Ada',
          'lastName': 'Lovelace',
          'profileImageUrl': 'https://cdn/x.png',
        });
      });

      final result = await api.exchangeOAuthCode('abc123');
      expect(result.token, 'jwt-token');
      expect(result.email, 'a@b.com');
      expect(result.firstName, 'Ada');
    });

    test('a blocked account surfaces the backend reason', () async {
      final api = clientFor((_) async => json({
            'errorCode': 'ACCOUNT_BLOCKED',
            'message': 'This account is blocked.'
          }, 403));
      await expectLater(
        api.exchangeOAuthCode('abc'),
        throwsA(isA<ApiException>()
            .having((e) => e.message, 'message', contains('blocked'))),
      );
    });

    test('a session without a token is refused rather than half-applied',
        () async {
      final api = clientFor((_) async => json({'email': 'a@b.com'}));
      expect(() => api.exchangeOAuthCode('abc'), throwsA(isA<ApiException>()));
    });
  });

  group('completing the sign-in', () {
    test('stores the session like an email login', () async {
      final api = clientFor((_) async => json({
            'token': 'jwt-token',
            'email': 'a@b.com',
          }));
      final auth = AuthStore(api: api);

      expect(await auth.completeGoogleSignIn('abc'), isTrue);
      expect(auth.token, 'jwt-token');
      expect(auth.email, 'a@b.com');
    });

    test('a failure leaves the user signed out with a readable reason',
        () async {
      final api =
          clientFor((_) async => json({'error': 'Google said no'}, 400));
      final auth = AuthStore(api: api);

      expect(await auth.completeGoogleSignIn('abc'), isFalse);
      expect(auth.token, isNull);
      expect(auth.error, contains('Google said no'));
    });
  });

  group('native sign-in', () {
    test('posts the ID token and stores the session', () async {
      String? sentToken;
      final api = clientFor((req) async {
        expect(req.url.path, '/api/v1/oauth2/google/mobile');
        sentToken = (jsonDecode(req.body) as Map)['idToken'] as String?;
        return json({'token': 'jwt-token', 'email': 'a@b.com'});
      });

      final result = await api.signInWithGoogleIdToken('id-token-123');
      expect(sentToken, 'id-token-123');
      expect(result.token, 'jwt-token');
    });

    test('a token the backend will not verify surfaces its reason', () async {
      final api = clientFor((_) async => json(
          {'error': 'That Google sign-in was not issued for GloboExpats.'},
          401));
      await expectLater(
        api.signInWithGoogleIdToken('someone-elses-token'),
        throwsA(isA<ApiException>()
            .having((e) => e.message, 'message', contains('not issued for'))),
      );
    });

    test('a blocked account is reported, not silently failed', () async {
      final api = clientFor((_) async => json({
            'errorCode': 'ACCOUNT_BLOCKED',
            'message': 'Your account has been blocked.'
          }, 403));
      await expectLater(
        api.signInWithGoogleIdToken('tok'),
        throwsA(isA<ApiException>()
            .having((e) => e.message, 'message', contains('blocked'))),
      );
    });

    test('an unconfigured build refuses rather than opening a broken picker',
        () async {
      // GOOGLE_SERVER_CLIENT_ID is not set in tests, so the guard should fire
      // before any platform channel is touched.
      final auth = AuthStore(api: clientFor((_) async => json({})));
      expect(await auth.signInWithGoogle(), isFalse);
      expect(auth.error, contains('not configured'));
    });
  });

  group('switching Google accounts', () {
    test('logging out forgets the Google account', () async {
      final google = _RecordingGoogle();
      final auth = AuthStore(
        api: clientFor((_) async => json({})),
        initialToken: 'jwt',
        initialEmail: 'first@gmail.com',
        googleAuthenticator: google,
      );

      await auth.logout();

      expect(google.signOutCalls, 1,
          reason: 'GoogleSignIn caches the last account and hands it straight '
              'back on the next signIn() without showing the picker, so a '
              'logout that clears only the platform session leaves the user '
              'unable to sign in as anyone else');
      expect(auth.isAuthenticated, isFalse);
    });

    test('a Google sign-out failure still completes the logout', () async {
      final google = _RecordingGoogle(failSignOut: true);
      final auth = AuthStore(
        api: clientFor((_) async => json({})),
        initialToken: 'jwt',
        initialEmail: 'first@gmail.com',
        googleAuthenticator: google,
      );

      await auth.logout();

      expect(auth.isAuthenticated, isFalse,
          reason: 'the local session must go even if Google is unreachable');
    });

    test('an expired session also clears the cached Google account', () async {
      final google = _RecordingGoogle();
      final auth = AuthStore(
        api: clientFor((_) async => json({})),
        initialToken: 'jwt',
        initialEmail: 'first@gmail.com',
        googleAuthenticator: google,
      );

      await auth.handleUnauthorized();

      expect(google.signOutCalls, 1);
    });
  });

  group('native failures stay readable', () {
    // A native setup problem arrives as a PlatformException whose numeric
    // code is the ONLY thing saying what is wrong. Collapsing it into a
    // generic "could not be completed" is what makes an unregistered signing
    // certificate look identical to a dead network, so each code that
    // actually tells the developer something must survive.
    test('DEVELOPER_ERROR names the unregistered-Android-client cause', () {
      const raw = 'PlatformException(sign_in_failed, '
          'com.google.android.gms.common.api.ApiException: 10: , null, null)';
      final message = googleFailureMessage(raw);
      expect(message, contains('DEVELOPER_ERROR'));
      expect(message, contains('signing certificate'));
      expect(message, isNot(contains('could not be completed')));
    });

    test('an iOS audience mismatch does not expose raw OAuth internals', () {
      const raw = 'PlatformException(sign_in_failed, '
          'org.openid.appauth.oauth_token, invalid_audience: The audience '
          'client and the client need to be in the same project., null)';
      final message = googleFailureMessage(raw);
      expect(message, contains('being configured'));
      expect(message, isNot(contains('invalid_audience')));
    });

    test('a cancelled picker is not dressed up as a failure', () {
      expect(
          googleFailureMessage('ApiException: 12501'), contains('cancelled'));
    });

    test('a network failure says so', () {
      expect(googleFailureMessage('ApiException: 7: NETWORK_ERROR'),
          contains('No connection to Google'));
    });

    test('an unrecognised failure still carries its original text', () {
      // The fallback must never drop the cause on the floor - an unmapped
      // code is exactly the case where the raw text is all we have to go on.
      expect(googleFailureMessage('SomethingNobodyMappedYet: 4242'),
          contains('SomethingNobodyMappedYet: 4242'));
    });
  });
}

/// A [GoogleAuthenticator] that records what the store asked it to do, so the
/// logout path can be checked without a platform channel.
class _RecordingGoogle implements GoogleAuthenticator {
  _RecordingGoogle({this.failSignOut = false});

  final bool failSignOut;
  int signOutCalls = 0;

  @override
  Future<String?> signInAndGetIdToken() async => 'id-token';

  @override
  Future<void> signOut() async {
    signOutCalls += 1;
    if (failSignOut) throw StateError('Google unreachable');
  }
}
