import '../models/category.dart';

/// Web parity `selectAvailableMarketplaceCategories`
/// (lib/mobile-marketplace-navigation.ts:26): the browse taxonomy rails list
/// only what a shopper can actually land results in.
///
/// The taxonomy endpoint returns the admin's complete tree, so without this
/// the rails advertise every subcategory an admin has ever created — tapping
/// one of the empty ones lands on "No products found", which reads as a
/// broken filter rather than an empty shelf.
///
/// [availableCategoryIds] / [availableSubcategoryIds] come from the two
/// `displayItem/*-availability` endpoints. A category survives when it is
/// ACTIVE and has listings; its subcategories are filtered the same way, so a
/// stocked category can still lose an empty subcategory.
List<Category> selectAvailableCategories(
  List<Category> categories,
  List<int> availableCategoryIds,
  List<int> availableSubcategoryIds,
) {
  final categoryIds = availableCategoryIds.toSet();
  final subcategoryIds = availableSubcategoryIds.toSet();

  return [
    for (final category in categories)
      if (category.status == 'ACTIVE' && categoryIds.contains(category.categoryId))
        category.withSubcategories([
          for (final sub in category.subcategories)
            if (sub.status == 'ACTIVE' && subcategoryIds.contains(sub.subcategoryId))
              sub,
        ]),
  ];
}
