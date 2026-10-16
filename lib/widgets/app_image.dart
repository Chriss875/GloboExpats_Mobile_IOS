import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_cache_manager/flutter_cache_manager.dart';

import '../api/api_client.dart';
import '../theme.dart';

/// Image that renders bundled/API image bytes reliably on Flutter web.
///
/// Fixes the sandbox defect where uploads are served with a malformed
/// `Content-Type: image/webp;charset=UTF-8` (a MIME the browser rejects for
/// canvas decode). We fetch the raw bytes ourselves and decode with
/// `Image.memory` (byte-magic based), so the image paints regardless of the
/// header — `Image.memory` on web decodes the bytes, not the HTTP MIME.
///
/// Bundled static art (Rule 13: home/quick-subcategory/transport WebP) is
/// loaded from the asset bundle via [rootBundle] — never over the network,
/// where the backend answers those paths with an OAuth redirect.
class AppImage extends StatelessWidget {
  final String url;
  final BoxFit fit;
  final double? width;
  final double? height;
  const AppImage(this.url, {super.key, this.fit = BoxFit.cover, this.width, this.height});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      // Decode at the on-screen pixel size instead of the source's full
      // resolution — without this, Image.memory decoded a huge photo and let
      // the compositor's cheap downscale blur it into every small thumbnail.
      //
      // Only cacheWidth is set, so Flutter derives the height and the source
      // aspect ratio survives untouched. It is sized off the LONGER edge of
      // the box, because BoxFit.cover has to fill both axes: a portrait photo
      // in a landscape box needs far more than the box's width in pixels, and
      // decoding to the width alone left exactly those images soft.
      final dpr = MediaQuery.of(context).devicePixelRatio;
      double? bounded(double? explicit, double constraint) {
        if (explicit != null && explicit.isFinite && explicit > 0) {
          return explicit;
        }
        return constraint.isFinite && constraint > 0 ? constraint : null;
      }

      final boxW = bounded(width, constraints.maxWidth);
      final boxH = bounded(height, constraints.maxHeight);
      final longestEdge = [boxW, boxH].nonNulls.fold<double>(0, (a, b) => a > b ? a : b);
      // Capped so a full-screen viewer on a 3x display cannot ask for an
      // absurd decode; everything on this app's surfaces sits well under it.
      final cacheWidth = longestEdge > 0
          ? (longestEdge * dpr).round().clamp(1, 2560)
          : null;
      return FutureBuilder<Uint8List>(
        future: _bytes(url),
        builder: (context, snap) {
          if (snap.hasData) {
            return Image.memory(
              snap.data!,
              fit: fit,
              width: width,
              height: height,
              cacheWidth: cacheWidth,
              filterQuality: FilterQuality.high,
              errorBuilder: (_, __, ___) => _ph(context),
            );
          }
          if (snap.hasError) return _ph(context);
          // Loading shimmer: the recessed surface, so it reads as a
          // placeholder in both themes instead of a light patch.
          return Container(color: AppPalette.of(context).surfaceMuted);
        },
      );
    });
  }

  Widget _ph(BuildContext context) => Container(
        color: AppPalette.of(context).surfaceMuted,
        child: Center(
            child: Icon(Icons.broken_image_outlined,
                size: 40, color: AppPalette.of(context).textSecondary)),
      );
}

/// In-memory hand-back for images already decoded this session, capped so a
/// long browse cannot grow it without bound: these are full-resolution
/// encoded bytes, and the map used to keep every image the app had ever
/// shown for as long as the process lived.
const int _memoryCacheLimit = 60;
final Map<String, Future<Uint8List>> _cache = {};

/// Bytes on DISK, so an image is downloaded once and survives a restart.
///
/// The app used to hold images in memory only: every cold start re-fetched
/// every thumbnail on the home page, the browse grid and My Space. On a slow
/// connection that is the bulk of the waiting, and it is repeated daily. The
/// fetch still goes through [ApiClient.getBytes] rather than a plain image
/// widget, because uploads are served with a malformed
/// `Content-Type: image/webp;charset=UTF-8` that the web build's canvas
/// decoder rejects — this caches the bytes that workaround produces.
final _imageFiles = CacheManager(Config(
  'globo_images',
  stalePeriod: const Duration(days: 14),
  maxNrOfCacheObjects: 400,
));

/// The same cached bytes [AppImage] shows — for callers that need the whole
/// image rather than a widget (the Share Kit paints photos into posters).
Future<Uint8List> loadAppImageBytes(String url) => _bytes(url);

Future<Uint8List> _bytes(String url) {
  final hit = _cache[url];
  if (hit != null) return hit;
  final future = _read(url);
  if (_cache.length >= _memoryCacheLimit) {
    _cache.remove(_cache.keys.first);
  }
  _cache[url] = future;
  // A failed fetch must not be remembered, or one blip leaves a permanent
  // broken-image placeholder for that URL.
  future.then<void>((_) {}, onError: (Object _) => _cache.remove(url));
  return future;
}

Future<Uint8List> _read(String url) async {
  if (url.startsWith('assets/')) {
    return rootBundle.load(url).then((d) => d.buffer.asUint8List());
  }
  try {
    final cached = await _imageFiles.getFileFromCache(url);
    if (cached != null) return cached.file.readAsBytes();
  } catch (_) {
    // An unreadable cache is not a reason to fail: fall through to the network.
  }
  final bytes = await ApiClient().getBytes(url);
  try {
    await _imageFiles.putFile(url, bytes);
  } catch (_) {
    // Storing is best effort — a full or read-only disk still shows the image.
  }
  return bytes;
}
