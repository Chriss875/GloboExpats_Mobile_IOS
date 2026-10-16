import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/api/timeout_client.dart';
import 'package:globoexpats_mobile/cart/saved_products_store.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "when no internet connection or network low app fails to open".
///
/// Two separate faults, both at startup:
///
///   * `main()` awaited `SavedProductsStore.load`, which refreshes over the
///     network. The store caught `ApiException` only, so the
///     `SocketException` a phone with no signal throws escaped past it and
///     out of `main()` — before `runApp`. Offline, the app never opened.
///   * `package:http` applies no timeout, so on a weak signal the same call
///     hung instead of failing, which looks identical from the outside: a
///     blank screen that never becomes the app.
void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
  });

  SavedProductsStore storeThatFailsWith(Object error) => SavedProductsStore(
      api: ApiClient(client: MockClient((_) async => throw error)));

  group('a phone with no signal', () {
    test('loading saved items does not throw', () async {
      final store =
          storeThatFailsWith(const SocketException('Failed host lookup'));

      await expectLater(store.load('a@b.com', 'jwt'), completes);
    });

    test('a dropped connection does not throw either', () async {
      final store = storeThatFailsWith(
          http.ClientException('Connection closed', Uri.parse('https://x')));

      await expectLater(store.load('a@b.com', 'jwt'), completes);
    });

    test('the cached set survives the failed refresh', () async {
      await KvStore.instance.setJson('expatSavedProducts_a@b.com', {
        'productIds': [7, 9]
      });
      final store = storeThatFailsWith(const SocketException('offline'));

      await store.load('a@b.com', 'jwt');
      expect(store.isSaved(7), isTrue,
          reason: 'what was saved before going offline is still saved');
      expect(store.isSaved(9), isTrue);
    });
  });

  group('a weak signal', () {
    test('a request that never answers is cut off, not left hanging', () async {
      // A server that simply never responds — the shape of a phone holding
      // one bar.
      final hanging = MockClient((_) => Completer<http.Response>().future);
      final client =
          TimeoutClient(hanging, timeout: const Duration(milliseconds: 80));

      await expectLater(
        client.get(Uri.parse('https://api.example.com/whatever')),
        throwsA(isA<http.ClientException>()),
        reason: 'a timeout arrives as the same exception a dropped '
            'connection does, so every existing catch already handles it',
      );
    });

    test('a response inside the deadline is untouched', () async {
      final quick = MockClient((_) async => http.Response('{"ok":true}', 200));
      final client = TimeoutClient(quick, timeout: const Duration(seconds: 5));

      final resp = await client.get(Uri.parse('https://api.example.com/x'));
      expect(resp.statusCode, 200);
      expect(resp.body, '{"ok":true}');
    });
  });
}
