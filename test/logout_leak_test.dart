import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "when i logout the acc seem to remain that was previous there".
///
/// The profile read is cached for 45 seconds under a key built from the
/// endpoint and the base URL — with nothing in it about WHO asked. Sign out
/// and sign in as somebody else inside that window and every screen that
/// reads the profile (the top bar, the reminder strip, My Space, the
/// owner checks on a listing) answered with the account that had just left.
void main() {
  http.Response ok(Object body) => http.Response(jsonEncode(body), 200,
      headers: {'content-type': 'application/json'});

  /// A server that names whoever is holding the token.
  ({ApiClient api, List<String> tokens}) profileServer() {
    final tokens = <String>[];
    final api = ApiClient(client: MockClient((req) async {
      if (req.url.path.endsWith('/user-details')) {
        final token = (req.headers['Authorization'] ?? '').split(' ').last;
        tokens.add(token);
        return ok({'userId': token == 'token-a' ? 1 : 2, 'firstName': token});
      }
      return ok({});
    }));
    return (api: api, tokens: tokens);
  }

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    ApiClient.invalidateReads();
  });

  tearDown(() => AuthStore.instance = null);

  group('the profile cache', () {
    test('never answers one session with another session\'s profile', () async {
      final server = profileServer();

      final first = await server.api.getUserDetails('token-a');
      final second = await server.api.getUserDetails('token-b');

      expect(first['firstName'], 'token-a');
      expect(second['firstName'], 'token-b',
          reason: 'the second sign-in must not be shown the first account');
      expect(server.tokens, ['token-a', 'token-b'],
          reason: 'each session asks for its own profile');
    });

    test('still collapses repeat reads within one session', () async {
      final server = profileServer();

      await server.api.getUserDetails('token-a');
      await server.api.getUserDetails('token-a');
      await server.api.getUserDetails('token-a');

      expect(server.tokens, ['token-a'],
          reason: 'the whole point of the cache is one request per session');
    });
  });

  group('signing out', () {
    test('drops every cached read', () async {
      final server = profileServer();
      final store = AuthStore(api: server.api, initialToken: 'token-a');
      AuthStore.instance = store;

      await server.api.getUserDetails('token-a');
      expect(server.tokens, hasLength(1));

      await store.clearSession();

      // Even the same token re-reads: whatever was warmed for the session
      // that just ended is gone with it.
      await server.api.getUserDetails('token-a');
      expect(server.tokens, hasLength(2));
    });

    test('leaves no token or email behind', () async {
      final server = profileServer();
      final store = AuthStore(
          api: server.api, initialToken: 'token-a', initialEmail: 'a@b.com');

      await store.clearSession();

      expect(store.token, isNull);
      expect(store.email, isNull);
      expect(store.isAuthenticated, isFalse);
      expect(KvStore.instance.getString(KvStore.kAuthToken), isNull);
      expect(KvStore.instance.getString(KvStore.kAuthEmail), isNull);
    });
  });
}
