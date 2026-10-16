import 'package:flutter/material.dart';

import '../theme.dart';
import 'app_image.dart';

/// One picture + caption in a [CuratedTileMosaic].
class CuratedTile {
  final String? imageUrl;
  final String label;
  final VoidCallback onTap;
  const CuratedTile(
      {required this.imageUrl, required this.label, required this.onTap});
}

/// Web parity `components/sections/home-category-grid.tsx`
/// (`resolveCardLayout` / `tileGridClass` / `tileAspectClass`): the four tile
/// arrangements shared by "Shop by Preference" and "Shop by Category".
///
/// | tiles | shape                                                   |
/// |-------|---------------------------------------------------------|
/// | 1     | hero — one 16:9 tile                                     |
/// | 2     | pair — two 16:9 tiles stacked                             |
/// | 3     | lead — ONE 16:9 across the top, then two squares below    |
/// | 4     | quad — an even 2x2 of squares                             |
///
/// Tiles are sized by aspect ratio and the mosaic is content-height, matching
/// the web. It must not be wrapped in an [Expanded]: stretching the tiles to
/// fill a fixed card height is what squashed these pictures out of shape.
class CuratedTileMosaic extends StatelessWidget {
  final List<CuratedTile> tiles;
  final double gap;

  const CuratedTileMosaic({
    super.key,
    required this.tiles,
    this.gap = 8,
  });

  static const double _wide = 16 / 9;
  static const double _square = 1;

  @override
  Widget build(BuildContext context) {
    final items = tiles.take(4).toList();
    if (items.isEmpty) return const SizedBox.shrink();

    if (items.length == 1) {
      return _CuratedTileView(tile: items.first, aspectRatio: _wide);
    }
    if (items.length == 2) {
      return Column(mainAxisSize: MainAxisSize.min, children: [
        _CuratedTileView(tile: items[0], aspectRatio: _wide),
        SizedBox(height: gap),
        _CuratedTileView(tile: items[1], aspectRatio: _wide),
      ]);
    }
    if (items.length == 3) {
      return Column(mainAxisSize: MainAxisSize.min, children: [
        _CuratedTileView(tile: items[0], aspectRatio: _wide),
        SizedBox(height: gap),
        _squareRow(items[1], items[2]),
      ]);
    }
    return Column(mainAxisSize: MainAxisSize.min, children: [
      _squareRow(items[0], items[1]),
      SizedBox(height: gap),
      _squareRow(items[2], items[3]),
    ]);
  }

  Widget _squareRow(CuratedTile a, CuratedTile b) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: _CuratedTileView(tile: a, aspectRatio: _square)),
          SizedBox(width: gap),
          Expanded(child: _CuratedTileView(tile: b, aspectRatio: _square)),
        ],
      );
}

/// Picture in its aspect box, caption underneath on a fixed two-line slot so
/// neighbouring tiles stay aligned (web's `h-7` label).
class _CuratedTileView extends StatelessWidget {
  const _CuratedTileView({required this.tile, required this.aspectRatio});
  final CuratedTile tile;
  final double aspectRatio;

  @override
  Widget build(BuildContext context) {
    // Own Material so a tile works wherever it is dropped, rather than
    // depending on an ancestor screen to supply one for the ink.
    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: tile.onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: aspectRatio,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppPalette.of(context).surfaceMuted,
                  border: Border.fromBorderSide(
                      BorderSide(color: AppPalette.of(context).border)),
                ),
                child: ClipRect(
                  child: tile.imageUrl != null
                      ? AppImage(tile.imageUrl!, fit: BoxFit.cover)
                      : Icon(Icons.image_not_supported_outlined,
                          size: 28, color: AppPalette.of(context).textSecondary),
                ),
              ),
            ),
            const SizedBox(height: 4),
            SizedBox(
              height: 28,
              child: Text(tile.label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 11,
                      height: 1.2,
                      color: AppPalette.of(context).textPrimary)),
            ),
          ],
        ),
      ),
    );
  }
}
