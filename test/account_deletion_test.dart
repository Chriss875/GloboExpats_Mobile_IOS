import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('ApiClient deletes the authenticated account through user management', () async {
    String? authHeader;
    final api = ApiClient(
      client: MockClient((req) async {
        expect(req.method, 'DELETE');
        expect(req.url.path, '/api/v1/userManagement/account');
        authHeader = req.headers['Authorization'];
        return http.Response('{"message":"deleted"}', 200);
      }),
    );

    await api.deleteAccount('jwt-token');

    expect(authHeader, 'Bearer jwt-token');
  });

  test('AuthStore clears the local session after account deletion succeeds', () async {
    final api = ApiClient(
      client: MockClient((_) async => http.Response('{"message":"deleted"}', 200)),
    );
    final store = AuthStore(api: api, initialToken: 'jwt-token', initialEmail: 'me@example.com');

    expect(await store.deleteAccount(), isTrue);

    expect(store.token, isNull);
    expect(store.email, isNull);
    expect(store.isAuthenticated, isFalse);
    expect(store.busy, isFalse);
  });

  test('AuthStore keeps the session when account deletion fails', () async {
    final api = ApiClient(
      client: MockClient((_) async => http.Response('{"message":"try later"}', 500)),
    );
    final store = AuthStore(api: api, initialToken: 'jwt-token', initialEmail: 'me@example.com');

    expect(await store.deleteAccount(), isFalse);

    expect(store.token, 'jwt-token');
    expect(store.email, 'me@example.com');
    expect(store.error, contains('try later'));
  });
}
