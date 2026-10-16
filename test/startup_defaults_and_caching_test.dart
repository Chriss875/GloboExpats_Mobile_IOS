import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:globoexpats_mobile/theme_controller.dart';

/// "generaly myspace is slow when loading optimize even when someone has low
/// internent ... and default should be light mode for now".
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    ApiClient.invalidateReads();
  });

  group('the theme default', () {
    test('is light for an account that never chose', () {
      ThemeController.instance.restore();
      expect(ThemeController.instance.mode, ThemeMode.light,
          reason: 'dark mode is still being swept screen by screen');
    });

    test('still honours a choice already made, including System', () async {
      for (final mode in ThemeMode.values) {
        await KvStore.instance.setString('theme_mode', mode.name);
        ThemeController.instance.restore();
        expect(ThemeController.instance.mode, mode);
      }
    });

    test('falls back to light on an unreadable value', () async {
      await KvStore.instance.setString('theme_mode', 'chartreuse');
      ThemeController.instance.restore();
      expect(ThemeController.instance.mode, ThemeMode.light);
    });
  });

  group('the orders list', () {
    /// Counts what actually goes over the wire.
    ({ApiClient api, List<String> calls}) countingApi() {
      final calls = <String>[];
      final api = ApiClient(client: MockClient((req) async {
        calls.add(req.url.path);
        return http.Response(jsonEncode(const []), 200,
            headers: {'content-type': 'application/json'});
      }));
      return (api: api, calls: calls);
    }

    test('is fetched once when three screens ask at the same moment',
        () async {
      // Opening My Space asks from the shell's pending-work banner, the
      // Overview stats and the Orders tab — each was its own round trip.
      final server = countingApi();

      await Future.wait([
        server.api.fetchOrders('jwt'),
        server.api.fetchOrders('jwt'),
        server.api.fetchOrders('jwt'),
      ]);

      expect(server.calls.where((p) => p.endsWith('/orders')), hasLength(1));
    });

    test('is re-read after a write that moves an order', () async {
      final server = countingApi();

      await server.api.fetchOrders('jwt');
      ApiClient.invalidateReads('orders');
      await server.api.fetchOrders('jwt');

      expect(server.calls.where((p) => p.endsWith('/orders')), hasLength(2),
          reason: 'a confirmed delivery must not leave the old list on screen');
    });

    test('never hands one session the other session\'s orders', () async {
      final server = countingApi();

      await server.api.fetchOrders('token-a');
      await server.api.fetchOrders('token-b');

      expect(server.calls.where((p) => p.endsWith('/orders')), hasLength(2));
    });
  });
}
