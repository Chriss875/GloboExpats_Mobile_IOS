import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  test('AU-065: adminUpdateUserStatus PATCHes {status}', () async {
    http.Request? captured;
    final api = ApiClient(
      client: MockClient((req) async {
        captured = req;
        if (req.url.path == '/api/v1/admin/users/7/status') return _json({'userId': '7'});
        return _json({}, 404);
      }),
    );
    await api.adminUpdateUserStatus('jwt', 7, 'VERIFIED');
    expect(captured!.method, 'PATCH');
    expect(jsonDecode(captured!.body)['status'], 'VERIFIED');
  });

  test('AU-065: adminUpdateUserRoles PATCHes {roles:[...]}', () async {
    http.Request? captured;
    final api = ApiClient(
      client: MockClient((req) async {
        captured = req;
        if (req.url.path == '/api/v1/admin/users/7/roles') return _json({'ok': true});
        return _json({}, 404);
      }),
    );
    await api.adminUpdateUserRoles('jwt', 7, ['BUYER', 'SELLER']);
    expect(captured!.method, 'PATCH');
    expect(jsonDecode(captured!.body)['roles'], ['BUYER', 'SELLER']);
  });
}
