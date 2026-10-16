import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/cart/saved_products_store.dart';

void main() {
  test('AU-050 T6: toggle saves then unsaves via /api/saved-products (no /v1)',
      () async {
    final calls = <String>[];
    final client = MockClient((req) async {
      calls.add('${req.method} ${req.url.path}');
      if (req.method == 'POST') {
        return http.Response('{"productIds":[615]}', 200,
            headers: {'content-type': 'application/json'});
      }
      if (req.method == 'DELETE') {
        return http.Response('{"productIds":[]}', 200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{"productIds":[]}', 200,
          headers: {'content-type': 'application/json'});
    });

    final store = SavedProductsStore(api: ApiClient(client: client));
    expect(await store.toggle(615, 'tok'), isTrue);
    expect(store.isSaved(615), isTrue);
    expect(await store.toggle(615, 'tok'), isFalse);
    expect(store.isSaved(615), isFalse);

    // path contract: NO /v1 segment
    expect(calls, contains('POST /api/saved-products/615'));
    expect(calls, contains('DELETE /api/saved-products/615'));
    expect(calls.where((c) => c.contains('/api/v1/saved-products')), isEmpty);
  });

  test('AU-050: API failure leaves local state unchanged (atomic toggle)', () async {
    final client = MockClient((req) async =>
        http.Response('{"errorCode":"BAD_REQUEST"}', 500));
    final store = SavedProductsStore(api: ApiClient(client: client));
    await expectLater(store.toggle(615, 'tok'), throwsException);
    expect(store.isSaved(615), isFalse,
        reason: 'heart must not flip when the server rejects');
  });

  test('AU-050: refreshFromServer reconciles remote ids', () async {
    final client = MockClient((req) async => http.Response(
        jsonEncode([{'productId': 615}, {'productId': 623}]),
        200,
        headers: {'content-type': 'application/json'}));
    final store = SavedProductsStore(api: ApiClient(client: client));
    await store.refreshFromServer('tok');
    expect(store.ids, {615, 623});
  });
}
