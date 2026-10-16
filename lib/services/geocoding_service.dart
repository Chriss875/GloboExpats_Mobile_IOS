import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import 'google_maps_web_service.dart';

class Coordinates {
  final double latitude;
  final double longitude;
  const Coordinates(this.latitude, this.longitude);
}

/// Web parity `hooks/use-geocoding.ts` `ReverseGeocodedAddress`: `placeName`
/// only ever comes from a place search/details lookup, never from reverse
/// geocoding a raw map tap.
class ReverseGeocodedAddress {
  final String formattedAddress;
  final String? street;
  final String? city;
  final String? country;
  final String? placeName;
  const ReverseGeocodedAddress({
    required this.formattedAddress,
    this.street,
    this.city,
    this.country,
    this.placeName,
  });

  ReverseGeocodedAddress withPlaceName(String? name) => ReverseGeocodedAddress(
        formattedAddress: formattedAddress,
        street: street,
        city: city,
        country: country,
        placeName: name ?? placeName,
      );
}

class PlaceSuggestion {
  final String placeId;
  final String label;
  final String? secondary;
  const PlaceSuggestion(
      {required this.placeId, required this.label, this.secondary});
}

/// Web parity `components/location/map-pin-picker.tsx` +
/// `hooks/use-geocoding.ts`: search via the Places API (New) autocomplete,
/// resolve via Place Details, reverse-geocode a pin via the Geocoding API —
/// same address-component keys (`route`/`sublocality_level_1` for street,
/// `locality`/`administrative_area_level_1` for city), same Dar es Salaam
/// bias box as [AppConfig] world (see `lib/location-utils.ts`
/// `DAR_ES_SALAAM_BOUNDS`).
///
/// Uses [AppConfig.googlePlacesApiKey] (falling back to
/// [AppConfig.googleMapsApiKey]) rather than relying on any native Places
/// SDK: these are plain web-service REST calls, so an Android-app-restricted
/// key (the one used for map tiles) will not authenticate them — see the
/// config doc comment.
class GeocodingService {
  GeocodingService._();

  static const _south = -7.15, _west = 39.05, _north = -6.6, _east = 39.55;

  static String get _key => AppConfig.googlePlacesApiKey.isNotEmpty
      ? AppConfig.googlePlacesApiKey
      : AppConfig.googleMapsApiKey;

  static bool get isConfigured => _key.isNotEmpty;

  static const _timeout = Duration(seconds: 8);

  static Future<List<PlaceSuggestion>> autocomplete(String input) async {
    if (!isConfigured || input.trim().length < 2) return const [];
    try {
      final resp = await http
          .post(
            Uri.parse('https://places.googleapis.com/v1/places:autocomplete'),
            headers: googleMapsWebServiceHeaders(apiKey: _key, json: true),
            body: jsonEncode({
              'input': input.trim(),
              'includedRegionCodes': ['tz'],
              'locationRestriction': {
                'rectangle': {
                  'low': {'latitude': _south, 'longitude': _west},
                  'high': {'latitude': _north, 'longitude': _east},
                }
              },
            }),
          )
          .timeout(_timeout);
      if (resp.statusCode != 200) return const [];
      final data = jsonDecode(resp.body) as Map<String, dynamic>;
      final suggestions = (data['suggestions'] as List?) ?? const [];
      return suggestions
          .map((s) => (s as Map<String, dynamic>)['placePrediction']
              as Map<String, dynamic>?)
          .whereType<Map<String, dynamic>>()
          .map((p) => PlaceSuggestion(
                placeId: p['placeId'] as String,
                label: ((p['structuredFormat'] as Map?)?['mainText']
                        as Map?)?['text'] as String? ??
                    (p['text'] as Map?)?['text'] as String? ??
                    '',
                secondary: ((p['structuredFormat'] as Map?)?['secondaryText']
                    as Map?)?['text'] as String?,
              ))
          .where((s) => s.label.isNotEmpty)
          .take(6)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<
          ({Coordinates coords, String? placeName, String? formattedAddress})?>
      placeDetails(String placeId) async {
    if (!isConfigured) return null;
    try {
      final resp = await http
          .get(
            Uri.parse('https://places.googleapis.com/v1/places/$placeId'),
            headers: googleMapsWebServiceHeaders(
              apiKey: _key,
              fieldMask: 'location,formattedAddress,displayName',
            ),
          )
          .timeout(_timeout);
      if (resp.statusCode != 200) return null;
      final data = jsonDecode(resp.body) as Map<String, dynamic>;
      final loc = data['location'] as Map<String, dynamic>?;
      if (loc == null) return null;
      return (
        coords: Coordinates((loc['latitude'] as num).toDouble(),
            (loc['longitude'] as num).toDouble()),
        placeName:
            (data['displayName'] as Map<String, dynamic>?)?['text'] as String?,
        formattedAddress: data['formattedAddress'] as String?,
      );
    } catch (_) {
      return null;
    }
  }

  static Future<Coordinates?> forwardGeocode(String address) async {
    if (!isConfigured || address.trim().isEmpty) return null;
    try {
      final uri = Uri.parse('https://maps.googleapis.com/maps/api/geocode/json')
          .replace(queryParameters: {'address': address.trim(), 'key': _key});
      final resp = await http
          .get(uri, headers: googleMapsWebServiceHeaders(apiKey: _key))
          .timeout(_timeout);
      if (resp.statusCode != 200) return null;
      final data = jsonDecode(resp.body) as Map<String, dynamic>;
      final results = data['results'] as List?;
      if (results == null || results.isEmpty) return null;
      final loc = (results.first as Map<String, dynamic>)['geometry']
          ?['location'] as Map<String, dynamic>?;
      if (loc == null) return null;
      return Coordinates(
          (loc['lat'] as num).toDouble(), (loc['lng'] as num).toDouble());
    } catch (_) {
      return null;
    }
  }

  static Future<ReverseGeocodedAddress?> reverseGeocode(
      Coordinates coords) async {
    if (!isConfigured) return null;
    try {
      final uri = Uri.parse('https://maps.googleapis.com/maps/api/geocode/json')
          .replace(queryParameters: {
        'latlng': '${coords.latitude},${coords.longitude}',
        'key': _key
      });
      final resp = await http
          .get(uri, headers: googleMapsWebServiceHeaders(apiKey: _key))
          .timeout(_timeout);
      if (resp.statusCode != 200) return null;
      final data = jsonDecode(resp.body) as Map<String, dynamic>;
      final results = data['results'] as List?;
      if (results == null || results.isEmpty) return null;
      final result = results.first as Map<String, dynamic>;
      final components = (result['address_components'] as List?) ?? const [];
      String? findComponent(String type) {
        for (final c in components) {
          final types = ((c as Map)['types'] as List?) ?? const [];
          if (types.contains(type)) return c['long_name'] as String?;
        }
        return null;
      }

      final street = [
        findComponent('route'),
        findComponent('sublocality_level_1')
      ].whereType<String>().where((s) => s.isNotEmpty).join(', ');
      return ReverseGeocodedAddress(
        formattedAddress: (result['formatted_address'] as String?) ?? '',
        street: street.isEmpty ? null : street,
        city: findComponent('locality') ??
            findComponent('administrative_area_level_1'),
        country: findComponent('country'),
      );
    } catch (_) {
      return null;
    }
  }
}
