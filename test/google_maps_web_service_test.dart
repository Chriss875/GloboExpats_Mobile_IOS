import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/services/google_maps_web_service.dart';

void main() {
  test('iOS web-service requests carry the registered bundle identifier', () {
    final headers = googleMapsWebServiceHeaders(
      apiKey: 'test-key',
      json: true,
      fieldMask: 'routes.polyline.encodedPolyline',
      platform: TargetPlatform.iOS,
    );

    expect(headers['X-Goog-Api-Key'], 'test-key');
    expect(headers['Content-Type'], 'application/json');
    expect(headers['X-Goog-FieldMask'], 'routes.polyline.encodedPolyline');
    expect(headers['X-Ios-Bundle-Identifier'], 'com.globoexpats.marketplace');
  });

  test('non-iOS requests do not claim an iOS application identity', () {
    final headers = googleMapsWebServiceHeaders(
      apiKey: 'test-key',
      platform: TargetPlatform.android,
    );
    expect(headers, isNot(contains('X-Ios-Bundle-Identifier')));
  });
}
