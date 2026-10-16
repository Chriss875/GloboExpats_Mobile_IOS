import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../config.dart';
import '../services/geocoding_service.dart';
import '../theme.dart';

/// Bolt-style location picker — web parity
/// `components/location/map-pin-picker.tsx`: search a place (own suggestion
/// list), tap the map, or use current location to drop a pin immediately;
/// drag it afterwards to refine to the exact gate/entrance. Reverse-geocodes
/// on every placement so the caller's street/region/place-name fields can
/// autofill — still editable after, never silently overwritten again once the
/// caller edits them.
///
/// Degrades gracefully with no API key configured: renders a muted notice and
/// never blocks the surrounding form, matching the web's own fallback.
class MapLocationPicker extends StatefulWidget {
  const MapLocationPicker({
    super.key,
    required this.coordinates,
    required this.onChanged,
    this.savedLocationLabel,
    this.height = 220,
  });

  /// Current pinned coordinates, or null when nothing is pinned yet.
  final Coordinates? coordinates;

  /// Fired when the user drops/drags the pin or a search/geocode resolves.
  /// [address] carries the reverse-geocoded street/city/place-name — null
  /// only when reverse geocoding itself failed (the pin still moves).
  final void Function(Coordinates coords, ReverseGeocodedAddress? address)
      onChanged;

  /// The saved location's current name — prefills the search box so it stays
  /// visible while editing, mirroring the web prop of the same name.
  final String? savedLocationLabel;

  final double height;

  @override
  State<MapLocationPicker> createState() => _MapLocationPickerState();
}

class _MapLocationPickerState extends State<MapLocationPicker> {
  static const _defaultCenter = LatLng(-6.7924, 39.2083);
  static final _bounds = LatLngBounds(
    southwest: const LatLng(-7.15, 39.05),
    northeast: const LatLng(-6.6, 39.55),
  );

  GoogleMapController? _map;
  late final TextEditingController _search =
      TextEditingController(text: widget.savedLocationLabel?.trim() ?? '');
  Timer? _debounce;
  List<PlaceSuggestion> _suggestions = const [];
  bool _searching = false;
  bool _locating = false;
  String? _pinnedLabel;

  @override
  void didUpdateWidget(covariant MapLocationPicker old) {
    super.didUpdateWidget(old);
    if (old.savedLocationLabel != widget.savedLocationLabel) {
      _search.text = widget.savedLocationLabel?.trim() ?? '';
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _map?.dispose();
    super.dispose();
  }

  bool get _hasPin => widget.coordinates != null;

  Future<void> _placePin(Coordinates coords,
      {String? placeName, String? knownAddress}) async {
    unawaited(_map?.animateCamera(CameraUpdate.newLatLngZoom(
        LatLng(coords.latitude, coords.longitude), 16)));
    final reverse = await GeocodingService.reverseGeocode(coords);
    final merged = (reverse ??
            ReverseGeocodedAddress(formattedAddress: knownAddress ?? ''))
        .withPlaceName(placeName);
    widget.onChanged(coords, merged);
  }

  void _onSearchChanged(String v) {
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() => _suggestions = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 220), () async {
      setState(() => _searching = true);
      final results = await GeocodingService.autocomplete(v);
      if (!mounted) return;
      setState(() {
        _suggestions = results;
        _searching = false;
      });
    });
  }

  Future<void> _runSearch() async {
    setState(() => _searching = true);
    final results = await GeocodingService.autocomplete(_search.text);
    if (!mounted) return;
    setState(() {
      _suggestions = results;
      _searching = false;
    });
    if (results.isEmpty) await _searchFallback();
  }

  /// Places lookup can fail silently (quota/key issues); a search selection
  /// should still reliably drop a pin, so fall back to forward-geocoding the
  /// typed text directly.
  Future<void> _searchFallback() async {
    final text = _search.text.trim();
    if (text.isEmpty) return;
    final coords = await GeocodingService.forwardGeocode(text);
    if (!mounted) return;
    if (coords == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'Could not locate that place. Tap the map to drop a pin instead.'),
      ));
      return;
    }
    setState(() => _pinnedLabel = null);
    await _placePin(coords, knownAddress: text);
  }

  Future<void> _selectSuggestion(PlaceSuggestion s) async {
    setState(() {
      _suggestions = [];
      _search.text =
          s.secondary != null ? '${s.label}, ${s.secondary}' : s.label;
      _pinnedLabel = s.label;
    });
    final details = await GeocodingService.placeDetails(s.placeId);
    if (details != null) {
      await _placePin(details.coords,
          placeName: details.placeName ?? s.label,
          knownAddress: details.formattedAddress);
      return;
    }
    await _searchFallback();
  }

  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                'Location permission denied. You can still search or tap the map.'),
          ));
        }
        return;
      }
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                'Turn on location services, or search/tap the map instead.'),
          ));
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              timeLimit: Duration(seconds: 12)));
      if (!mounted) return;
      setState(() => _pinnedLabel = null);
      await _placePin(Coordinates(pos.latitude, pos.longitude));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not determine your location.'),
        ));
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!AppConfig.mapsConfigured) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          border: Border.all(color: AppPalette.of(context).border),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(children: [
          Icon(Icons.map_outlined, color: AppPalette.of(context).textSecondary),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Map location picker is unavailable right now. You can still save this address without a pin.',
              style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 12.5),
            ),
          ),
        ]),
      );
    }

    final initial = _hasPin
        ? LatLng(widget.coordinates!.latitude, widget.coordinates!.longitude)
        : _defaultCenter;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(
        'Use your current location, pick a search result, or tap the map. Drag the pin to refine.',
        style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary),
      ),
      const SizedBox(height: 8),
      SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          onPressed: _locating ? null : _useCurrentLocation,
          icon: _locating
              ? const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.my_location, size: 17),
          label: const Text('Use current location'),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppPalette.of(context).accentInk,
            backgroundColor: AppColors.brandBlue.withValues(alpha: 0.06),
            side: BorderSide(color: AppColors.brandBlue.withValues(alpha: 0.3)),
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
        ),
      ),
      const SizedBox(height: 8),
      TextField(
        controller: _search,
        onChanged: _onSearchChanged,
        onSubmitted: (_) => _suggestions.isNotEmpty
            ? _selectSuggestion(_suggestions.first)
            : _runSearch(),
        decoration: InputDecoration(
          isDense: true,
          prefixIcon: const Icon(Icons.search, size: 19),
          suffixIcon: _searching
              ? const Padding(
                  padding: EdgeInsets.all(14),
                  child: SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2)),
                )
              : null,
          hintText: 'Search landmark, street, ward or area',
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          contentPadding:
              const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
        ),
      ),
      // Results sit INLINE, pushing the map down, rather than floating over
      // it: GoogleMap is an Android platform view, and a native view composites
      // above Flutter's own layers regardless of paint order - an overlaid
      // dropdown renders behind the map and looks like "search is broken".
      if (_suggestions.isNotEmpty)
        Container(
          margin: const EdgeInsets.only(top: 6),
          decoration: BoxDecoration(
            color: AppPalette.of(context).surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppPalette.of(context).border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final s in _suggestions)
                ListTile(
                  dense: true,
                  leading: Icon(Icons.place_outlined,
                      color: AppPalette.of(context).accentInk, size: 20),
                  title: Text(s.label,
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: s.secondary != null
                      ? Text(s.secondary!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11.5))
                      : null,
                  onTap: () => _selectSuggestion(s),
                ),
            ],
          ),
        ),
      const SizedBox(height: 10),
      ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          height: widget.height,
          child: GoogleMap(
            initialCameraPosition:
                CameraPosition(target: initial, zoom: _hasPin ? 16 : 12),
            onMapCreated: (c) => _map = c,
            // This picker is embedded in scrollable forms and bottom sheets.
            // Claim pointer sequences eagerly so the surrounding scroll view
            // does not swallow map pans, pin drags, pinches, or taps.
            gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
              Factory<OneSequenceGestureRecognizer>(
                  () => EagerGestureRecognizer()),
            },
            scrollGesturesEnabled: true,
            zoomGesturesEnabled: true,
            rotateGesturesEnabled: true,
            tiltGesturesEnabled: true,
            onTap: (pos) {
              setState(() => _pinnedLabel = null);
              unawaited(_placePin(Coordinates(pos.latitude, pos.longitude)));
            },
            cameraTargetBounds: CameraTargetBounds(_bounds),
            minMaxZoomPreference: const MinMaxZoomPreference(10, 19),
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            markers: _hasPin
                ? {
                    Marker(
                      markerId: const MarkerId('pin'),
                      position: LatLng(widget.coordinates!.latitude,
                          widget.coordinates!.longitude),
                      draggable: true,
                      onDragEnd: (pos) {
                        setState(() => _pinnedLabel = null);
                        unawaited(_placePin(
                            Coordinates(pos.latitude, pos.longitude)));
                      },
                    ),
                  }
                : const {},
          ),
        ),
      ),
      if (_hasPin) ...[
        const SizedBox(height: 6),
        Text(
          _pinnedLabel != null
              ? 'Pinned: $_pinnedLabel. Drag the pin if needed.'
              : 'Pin set. Drag it to the gate, entrance, or pickup point if needed.',
          style:
              TextStyle(fontSize: 11.5, color: AppPalette.of(context).textSecondary),
        ),
      ],
    ]);
  }
}
