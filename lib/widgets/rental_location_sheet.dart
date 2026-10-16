import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme.dart';

/// "See on map" for a rental — web parity with
/// `components/location/rental-location-dialog.tsx`: where the property or
/// the vehicle pickup is, before the buyer books.
Future<void> showRentalLocationSheet(
  BuildContext context, {
  required String productName,
  required double latitude,
  required double longitude,
}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppPalette.of(context).surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (context) => _RentalLocationSheet(
        productName: productName,
        latitude: latitude,
        longitude: longitude,
      ),
    );

class _RentalLocationSheet extends StatelessWidget {
  const _RentalLocationSheet({
    required this.productName,
    required this.latitude,
    required this.longitude,
  });

  final String productName;
  final double latitude;
  final double longitude;

  Future<void> _openDirections() => launchUrl(
        Uri.parse('https://www.google.com/maps/search/?api=1'
            '&query=$latitude,$longitude'),
        mode: LaunchMode.externalApplication,
      );

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final target = LatLng(latitude, longitude);
    final inTest = WidgetsBinding.instance.runtimeType
        .toString()
        .contains('TestWidgetsFlutterBinding');
    return SizedBox(
      height: MediaQuery.of(context).size.height * .72,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 8, 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Rental location',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text('See where to go for $productName before you book.',
                        style: TextStyle(
                            fontSize: 13, color: palette.textSecondary)),
                  ]),
            ),
            IconButton(
              tooltip: 'Close',
              icon: const Icon(Icons.close_rounded, size: 20),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ]),
        ),
        Divider(height: 1, color: palette.border),
        Expanded(
          // The platform map cannot render under the test binding.
          child: inTest
              ? ColoredBox(color: palette.surfaceMuted)
              : GoogleMap(
                  initialCameraPosition:
                      CameraPosition(target: target, zoom: 16),
                  markers: {
                    Marker(
                        markerId: const MarkerId('rental-location'),
                        position: target,
                        infoWindow: InfoWindow(title: productName)),
                  },
                  mapToolbarEnabled: false,
                  myLocationButtonEnabled: false,
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: OutlinedButton.icon(
              onPressed: _openDirections,
              icon: const Icon(Icons.directions_outlined, size: 18),
              label: const Text('Open in Google Maps'),
            ),
          ),
        ),
      ]),
    );
  }
}
