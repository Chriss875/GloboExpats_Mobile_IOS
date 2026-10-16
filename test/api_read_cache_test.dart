import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// The app issues the same two reads over and over: the taxonomy from eight
/// screens, and the signed-in profile from ten — twice on every tab change,
/// once by the top bar and once by the pending-actions banner. Each of those
/// was a round trip the user waited through, and each landed at a different
/// moment, which is what made details appear late and move the layout.
void main() {
  setUp(ApiClient.invalidateReads);
  tearDown(ApiClient.invalidateReads);

  http.Response jsonOk(Object body) => http.Response(jsonEncode(body), 200,
      headers: {'content-type': 'application/json'});

  test('the taxonomy is fetched once however many screens ask for it',
      () async {
    var hits = 0;
    final api = ApiClient(client: MockClient((_) async {
      hits += 1;
      return jsonOk([
        {
          'categoryId': 1,
          'categoryName': 'Electronics',
          'slug': 'electronics',
          'subcategories': const [],
        }
      ]);
    }));

    final all = await Future.wait([
      api.fetchCategories(),
      api.fetchCategories(),
      api.fetchCategories(),
    ]);

    expect(hits, 1, reason: 'concurrent duplicates must share one request');
    for (final result in all) {
      expect(result.single.categoryName, 'Electronics');
    }

    // And a later caller inside the window reuses it rather than re-asking.
    await api.fetchCategories();
    expect(hits, 1);
  });

  test('the profile is fetched once across the widgets that need it',
      () async {
    var hits = 0;
    final api = ApiClient(client: MockClient((_) async {
      hits += 1;
      return jsonOk({'userId': 7, 'firstName': 'Globo', 'lastName': 'Expat'});
    }));

    await Future.wait([
      api.getUserDetails('jwt'),
      api.getUserDetails('jwt'),
    ]);
    await api.getUserDetails('jwt');

    expect(hits, 1);
  });

  test('editing the profile makes the next read hit the network', () async {
    var hits = 0;
    final api = ApiClient(client: MockClient((_) async {
      hits += 1;
      return jsonOk({'userId': 7, 'firstName': 'Globo'});
    }));

    await api.getUserDetails('jwt');
    expect(hits, 1);

    // A stale profile after a save is worse than an extra request.
    ApiClient.invalidateReads('user-details');
    await api.getUserDetails('jwt');
    expect(hits, 2);
  });

  test('a failed read is not cached, so a retry really retries', () async {
    var hits = 0;
    final api = ApiClient(client: MockClient((_) async {
      hits += 1;
      if (hits == 1) return http.Response('boom', 500);
      return jsonOk([]);
    }));

    await expectLater(api.fetchCategories(), throwsA(isA<ApiException>()));
    // Caching the failure would strand the screen on an error for the whole
    // TTL even after the backend recovered.
    expect(await api.fetchCategories(), isEmpty);
    expect(hits, 2);
  });

  test('two clients do not share a cache entry', () async {
    var a = 0;
    var b = 0;
    final first = ApiClient(client: MockClient((_) async {
      a += 1;
      return jsonOk([]);
    }));
    final second = ApiClient(client: MockClient((_) async {
      b += 1;
      return jsonOk([]);
    }));

    await first.fetchCategories();
    await second.fetchCategories();

    // Otherwise one test's fixtures would answer another test's request.
    expect(a, 1);
    expect(b, 1);
  });
}
