import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';

void main() {
  test('AU-045: newest and top-picks endpoints resolve real content', () async {
    final seen = <String>[];
    final client = MockClient((req) async {
      seen.add(req.url.path);
      return http.Response(
        jsonEncode({
          'content': [
            {'productId': 615, 'productName': 'X', 'productPrice': 626000}
          ],
          'totalElements': 1,
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(client: client);
    expect((await api.fetchDisplay('newest')).length, 1);
    expect((await api.fetchDisplay('top-picks')).length, 1);
    expect(seen, ['/api/v1/displayItem/newest', '/api/v1/displayItem/top-picks']);
  });

  test('AU-045: shuffle seed goes through filter with SHUFFLE + maxPrice', () async {
    Map<String, String>? query;
    final client = MockClient((req) async {
      query = req.url.queryParameters;
      return http.Response(
        jsonEncode({'content': [], 'totalElements': 0}),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(client: client);
    final rows = await api.fetchDisplayShuffle('42424');
    expect(rows, isEmpty);
    expect(query!['priceSort'], 'SHUFFLE');
    expect(query!['seed'], '42424');
    expect(query!.containsKey('maxPrice'), isTrue);
  });
}
