import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('AU-064: adminTopBuyers queries the analytics service (not zero-results)',
      () async {
    final paths = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        paths.add(req.url.toString());
        if (req.url.path == '/analytics/orders/top-buyers') {
          return http.Response(
              jsonEncode([
                {'buyerId': 3, 'buyerName': 'Derick R.', 'totalClicks': 41},
                {'buyerId': 9, 'buyerName': 'Neema O.', 'totalClicks': 17},
              ]),
              200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 404);
      }),
    );
    final rows = await api.adminTopBuyers('jwt');
    expect(rows.length, 2);
    expect(paths.any((p) => p.contains('/analytics/orders/top-buyers')), isTrue,
        reason: 'queries the analytics service');
    expect(paths.any((p) => p.contains('zero-results')), isFalse,
        reason: 'never reads the wrong endpoint');
  });

  test('AU-064: analytics failure -> empty list (card renders blank)', () async {
    final api = ApiClient(
      client: MockClient((req) async => http.Response('{}', 401)),
    );
    expect(await api.adminTopBuyers('jwt'), isEmpty);
  });
}
