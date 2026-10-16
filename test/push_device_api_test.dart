import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('registers and unregisters the FCM token for the authenticated user',
      () async {
    final requests = <http.Request>[];
    final api = ApiClient(
      client: MockClient((request) async {
        requests.add(request);
        return http.Response('', 204);
      }),
    );

    await api.registerPushDevice(
      'jwt',
      'fcm-token',
      platform: 'ANDROID',
      deviceName: 'Pixel 6',
    );
    await api.unregisterPushDevice('jwt', 'fcm-token');

    expect(requests.map((request) => request.method), ['PUT', 'DELETE']);
    expect(
        requests.every((request) => request.url.path == '/api/v1/push/devices'),
        isTrue);
    expect(
        requests.every(
            (request) => request.headers['Authorization'] == 'Bearer jwt'),
        isTrue);
    expect(jsonDecode(requests.first.body), {
      'token': 'fcm-token',
      'platform': 'ANDROID',
      'deviceName': 'Pixel 6',
    });
    expect(jsonDecode(requests.last.body), {'token': 'fcm-token'});
  });
}
