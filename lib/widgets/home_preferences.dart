import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../domain/home_curation.dart';
import '../models/category.dart';
import '../theme.dart';
import 'curated_tile_mosaic.dart';
import 'skeleton_loader.dart';

/// Uses the same curated groups and active subcategories as the web homepage.
class HomePreferences extends StatelessWidget {
  final Future<List<Map<String, dynamic>>> collections;
  final Future<List<Category>> categories;
  const HomePreferences(
      {super.key, required this.collections, required this.categories});

  @override
  Widget build(BuildContext context) => FutureBuilder(
        future: Future.wait<Object>([collections, categories]),
        builder: (context, snapshot) {
          if (snapshot.hasError) return const SizedBox.shrink();
          if (!snapshot.hasData) return const SectionSkeleton(horizontal: true);
          final groups = [...snapshot.data![0] as List<Map<String, dynamic>>]
            ..sort((a, b) => ((a['displayOrder'] as num?) ?? 0)
                .compareTo((b['displayOrder'] as num?) ?? 0));
          final taxonomy = {
            for (final entry
                in flattenSubcategories(snapshot.data![1] as List<Category>))
              entry.subcategoryId: entry
          };
          final cards = <Widget>[];
          for (final group in groups.take(8)) {
            final tiles = <CuratedTile>[];
            for (final tile
                in (group['tiles'] as List? ?? const []).whereType<Map>()) {
              final ids = (tile['subcategoryIds'] as List? ?? const [])
                  .whereType<num>()
                  .map((n) => n.toInt())
                  .where(taxonomy.containsKey)
                  .toList();
              if (ids.isEmpty) continue;
              final ownImage = (tile['imageUrl'] as String?)?.trim();
              final image = resolveTileImage(
                  ownImage != null && ownImage.isNotEmpty
                      ? ownImage
                      : taxonomy[ids.first]!.imageUrl);
              if (image == null) continue;
              final label = (tile['label'] as String?)?.trim();
              final caption = label != null && label.isNotEmpty
                  ? label
                  : taxonomy[ids.first]!.name;
              tiles.add(CuratedTile(
                imageUrl: image,
                label: caption,
                onTap: () =>
                    context.push('/browse?subcategory=${ids.join(',')}'),
              ));
            }
            if (tiles.isEmpty) continue;
            cards.add(Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: AppPalette.of(context).surface,
                    border: Border.all(color: AppPalette.of(context).border)),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(group['title'] as String? ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 14)),
                      const SizedBox(height: 10),
                      CuratedTileMosaic(tiles: tiles),
                    ])));
          }
          if (cards.isEmpty) return const SizedBox.shrink();
          return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                    padding: EdgeInsets.fromLTRB(12, 16, 12, 12),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Shop by Preference',
                              style: TextStyle(
                                  fontSize: 20,
                                  height: 1.2,
                                  letterSpacing: -.25,
                                  color: AppPalette.of(context).textPrimary,
                                  fontWeight: FontWeight.w700)),
                          SizedBox(height: 10),
                          _PreferenceUnderline(),
                          SizedBox(height: 8),
                          Text('Curated picks, hand-selected by our team.',
                              style: TextStyle(
                                  color: AppPalette.of(context).textSecondary,
                                  fontSize: 14,
                                  height: 1.45)),
                        ])),
                // Web parity home-preference-grid.tsx: the cards are a
                // `flex flex-wrap` of 260px-basis panels, so at phone widths
                // exactly one card fills each row (min 18rem tall), rather
                // than the two-up grid this used to draw.
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Column(
                    children: [
                      // Content-height now the mosaic sizes its own tiles;
                      // 288 is web's `min-h-[18rem]` floor, not a fixed height.
                      for (final card in cards.take(6))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(minHeight: 288),
                            child: card,
                          ),
                        ),
                    ],
                  ),
                ),
              ]);
        },
      );
}

class _PreferenceUnderline extends StatelessWidget {
  const _PreferenceUnderline();

  @override
  Widget build(BuildContext context) => Row(children: [
        Container(
            width: 48,
            height: 3,
            decoration: BoxDecoration(
                color: AppColors.brandBlue,
                borderRadius: BorderRadius.circular(99))),
        const SizedBox(width: 8),
        Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
                color: AppColors.brandAmber, shape: BoxShape.circle)),
        const SizedBox(width: 8),
        Container(
            width: 28,
            height: 3,
            decoration: BoxDecoration(
                color: AppColors.brandAmber,
                borderRadius: BorderRadius.circular(99))),
      ]);
}
