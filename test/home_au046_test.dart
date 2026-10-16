import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('AU-046: category-availability parses id list', () async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/category-availability')) {
          return _json([14, 3, 11, 8]);
        }
        return _json({}, 404);
      }),
    );
    final ids = await api.fetchCategoryAvailability();
    expect(ids, [14, 3, 11, 8]);
  });

  test('AU-046: category-availability failure surfaces as ApiException', () async {
    final api = ApiClient(
      client: MockClient((req) async => _json({}, 500)),
    );
    expect(api.fetchCategoryAvailability(), throwsA(isA<ApiException>()));
  });
}
