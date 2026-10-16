import 'package:flutter/foundation.dart';

/// Headers shared by direct Google Maps Platform web-service calls.
///
/// Google validates an iOS-restricted REST key against this bundle header.
/// Native Maps SDK requests add the application identity themselves, but
/// `package:http` requests do not.
Map<String, String> googleMapsWebServiceHeaders({
  required String apiKey,
  String? fieldMask,
  bool json = false,
  TargetPlatform? platform,
}) {
  final headers = <String, String>{
    'X-Goog-Api-Key': apiKey,
    if (json) 'Content-Type': 'application/json',
    if (fieldMask != null) 'X-Goog-FieldMask': fieldMask,
  };
  if (!kIsWeb && (platform ?? defaultTargetPlatform) == TargetPlatform.iOS) {
    headers['X-Ios-Bundle-Identifier'] = 'com.globoexpats.marketplace';
  }
  return headers;
}
