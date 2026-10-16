import 'package:flutter/material.dart';

import '../theme.dart';
import 'product_card.dart';

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.width,
    required this.height,
    this.radius = 8,
    this.margin,
  });

  final double? width;
  final double height;
  final double radius;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      margin: margin,
      decoration: BoxDecoration(
        color: AppPalette.of(context).surfaceMuted,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class SkeletonText extends StatelessWidget {
  const SkeletonText({
    super.key,
    this.width,
    this.height = 12,
    this.margin,
  });

  final double? width;
  final double height;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    return SkeletonBox(
      width: width,
      height: height,
      radius: height / 2,
      margin: margin,
    );
  }
}

class ProductGridSkeleton extends StatelessWidget {
  const ProductGridSkeleton({super.key, this.itemCount = 6});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    // Same cell geometry as ProductGrid, so the page does not jump when the
    // real cards replace these.
    return LayoutBuilder(builder: (context, constraints) {
      final cardWidth = (constraints.maxWidth - 24 - 10) / 2;
      return GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio:
              cardWidth / productCardHeight(context, width: cardWidth),
          crossAxisSpacing: 10,
          mainAxisSpacing: 12,
        ),
        itemCount: itemCount,
        itemBuilder: (_, __) => const ProductCardSkeleton(),
      );
    });
  }
}

class ProductCardSkeleton extends StatelessWidget {
  const ProductCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      clipBehavior: Clip.antiAlias,
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(flex: 5, child: SkeletonBox(width: double.infinity, height: double.infinity, radius: 0)),
          Expanded(
            flex: 4,
            child: Padding(
              padding: EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonText(width: double.infinity),
                  SizedBox(height: 7),
                  SkeletonText(width: 110),
                  Spacer(),
                  SkeletonText(width: 74, height: 10),
                  SizedBox(height: 6),
                  SkeletonText(width: 96, height: 10),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ListRowsSkeleton extends StatelessWidget {
  const ListRowsSkeleton({super.key, this.itemCount = 6});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < itemCount; i++)
          const Padding(
            padding: EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: ListRowSkeleton(),
          ),
      ],
    );
  }
}

class ListRowSkeleton extends StatelessWidget {
  const ListRowSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 118,
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      clipBehavior: Clip.antiAlias,
      child: const Row(
        children: [
          SkeletonBox(width: 108, height: double.infinity, radius: 0),
          Expanded(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SkeletonText(width: double.infinity),
                  SizedBox(height: 8),
                  SkeletonText(width: 130),
                  SizedBox(height: 12),
                  SkeletonText(width: 88, height: 10),
                  SizedBox(height: 6),
                  SkeletonText(width: 116, height: 10),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class SectionSkeleton extends StatelessWidget {
  const SectionSkeleton({super.key, this.horizontal = false});

  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    if (horizontal) {
      return SizedBox(
        height: 240,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: 4,
          separatorBuilder: (_, __) => const SizedBox(width: 10),
          itemBuilder: (_, __) => const SizedBox(width: 150, child: ProductCardSkeleton()),
        ),
      );
    }
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 8),
      child: ProductGridSkeleton(),
    );
  }
}

class FeedSkeleton extends StatelessWidget {
  const FeedSkeleton({super.key, this.itemCount = 6});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      itemCount: itemCount,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, __) => const ListRowSkeleton(),
    );
  }
}

class SkeletonPage extends StatelessWidget {
  const SkeletonPage({super.key, this.itemCount = 6});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: ProductGridSkeleton(itemCount: itemCount),
    );
  }
}
