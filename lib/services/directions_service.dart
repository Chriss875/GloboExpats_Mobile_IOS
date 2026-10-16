import 'dart:convert';
import 'dart:math' as math;

import 'package:http/http.dart' as http;

import '../config.dart';
import 'geocoding_service.dart' show Coordinates;
import 'google_maps_web_service.dart';

/// Driving route between two pins, for the checkout "Delivery route" map —
/// mobile's stand-in for the web's `google.maps.DirectionsService`
/// (`lib/delivery-fare.ts` `getDirectionsRoute`).
///
/// `google_maps_flutter` renders polylines but cannot compute them, so the
/// route comes from Routes API and is drawn as a `Polyline`.
/// Like the web, a failed leg is not an error: the map still shows both pins,
/// it simply shows no line between them.
class DirectionsService {
  DirectionsService._();

  /// Web-service key kept separate from the native map-rendering key.
  static String get _key => AppConfig.googlePlacesApiKey.isNotEmpty
      ? AppConfig.googlePlacesApiKey
      : AppConfig.googleMapsApiKey;

  static bool get isConfigured => _key.isNotEmpty;

  static const _timeout = Duration(seconds: 8);

  /// Cached per origin→destination for the life of the process, because the
  /// review step rebuilds on every price tick and quote refresh.
  static final Map<String, List<Coordinates>> _cache = {};

  static String _pin(Coordinates c) =>
      '${c.latitude.toStringAsFixed(5)},${c.longitude.toStringAsFixed(5)}';

  /// The driving route's overview polyline, or `null` when it cannot be
  /// traced. Never throws.
  static Future<List<Coordinates>?> route(
      Coordinates origin, Coordinates destination) async {
    if (!isConfigured) return null;
    final key = '${_pin(origin)}|${_pin(destination)}';
    final cached = _cache[key];
    if (cached != null) return cached;
    try {
      final resp = await http
          .post(
            Uri.parse(
                'https://routes.googleapis.com/directions/v2:computeRoutes'),
            headers: googleMapsWebServiceHeaders(
              apiKey: _key,
              json: true,
              fieldMask: 'routes.polyline.encodedPolyline',
            ),
            body: jsonEncode(routesRequestBody(origin, destination)),
          )
          .timeout(_timeout);
      if (resp.statusCode != 200) return null;
      final data = jsonDecode(resp.body) as Map<String, dynamic>;
      final encoded = encodedRouteFromResponse(data);
      if (encoded == null) return null;
      final points = decodePolyline(encoded);
      if (points.isEmpty) return null;
      _cache[key] = points;
      return points;
    } catch (_) {
      return null;
    }
  }

  /// Test seam: the cache outlives a widget, so a test that swaps coordinates
  /// has to be able to start clean.
  static void resetCache() => _cache.clear();
}

/// Request shape for Routes API v2. Kept pure so the migration from the
/// retired Directions endpoint is contract-tested without making a network
/// request.
Map<String, dynamic> routesRequestBody(
        Coordinates origin, Coordinates destination) =>
    {
      'origin': {
        'location': {
          'latLng': {
            'latitude': origin.latitude,
            'longitude': origin.longitude,
          }
        }
      },
      'destination': {
        'location': {
          'latLng': {
            'latitude': destination.latitude,
            'longitude': destination.longitude,
          }
        }
      },
      'travelMode': 'DRIVE',
      'polylineQuality': 'OVERVIEW',
      'polylineEncoding': 'ENCODED_POLYLINE',
    };

String? encodedRouteFromResponse(Map<String, dynamic> data) {
  final routes = data['routes'];
  if (routes is! List || routes.isEmpty || routes.first is! Map) return null;
  final encoded =
      ((routes.first as Map)['polyline'] as Map?)?['encodedPolyline'];
  return encoded is String && encoded.isNotEmpty ? encoded : null;
}

/// Google's encoded polyline algorithm (the `overview_polyline.points`
/// string): signed offsets, each value split into 5-bit chunks, ORed with
/// 0x20 while more chunks follow, then offset by 63 into printable ASCII.
List<Coordinates> decodePolyline(String encoded) {
  final points = <Coordinates>[];
  var index = 0, lat = 0, lng = 0;

  int nextValue() {
    var shift = 0, result = 0, byte = 0;
    do {
      if (index >= encoded.length) return 0;
      byte = encoded.codeUnitAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    // A trailing 1 bit marks a negative value; the rest is the magnitude.
    return (result & 1) != 0 ? ~(result >> 1) : result >> 1;
  }

  while (index < encoded.length) {
    lat += nextValue();
    lng += nextValue();
    points.add(Coordinates(lat / 1e5, lng / 1e5));
  }
  return points;
}

/// Bounding box over [points], padded slightly so the pins are not flush with
/// the map's edge. Null when there is nothing to frame.
({Coordinates southWest, Coordinates northEast})? boundsOf(
    Iterable<Coordinates> points) {
  final list = points.toList();
  if (list.isEmpty) return null;
  var south = list.first.latitude, north = list.first.latitude;
  var west = list.first.longitude, east = list.first.longitude;
  for (final p in list.skip(1)) {
    south = math.min(south, p.latitude);
    north = math.max(north, p.latitude);
    west = math.min(west, p.longitude);
    east = math.max(east, p.longitude);
  }
  // A single point (or two on the same street) would otherwise produce a
  // zero-area box, which the camera cannot fit.
  const pad = 0.004;
  return (
    southWest: Coordinates(south - pad, west - pad),
    northEast: Coordinates(north + pad, east + pad),
  );
}
