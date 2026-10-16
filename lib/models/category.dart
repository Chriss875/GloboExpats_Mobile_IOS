/// A product category, optionally with subcategories, as returned by
/// `/api/v1/products/categories`.
class Category {
  final int categoryId;
  final String categoryName;
  final String slug;
  final String? imageUrl;
  final String? iconUrl;
  final bool featured;
  final int? displayOrder;
  final String status;
  final double? commissionRate;
  final List<Subcategory> subcategories;

  const Category({
    required this.categoryId,
    required this.categoryName,
    this.slug = '',
    this.imageUrl,
    this.iconUrl,
    this.featured = false,
    this.displayOrder,
    this.status = 'ACTIVE',
    this.commissionRate,
    this.subcategories = const [],
  });

  /// The same category carrying a different subcategory list — used by the
  /// availability filter, which narrows the tree without rebuilding it.
  Category withSubcategories(List<Subcategory> subs) => Category(
        categoryId: categoryId,
        categoryName: categoryName,
        slug: slug,
        imageUrl: imageUrl,
        iconUrl: iconUrl,
        featured: featured,
        displayOrder: displayOrder,
        status: status,
        commissionRate: commissionRate,
        subcategories: subs,
      );

  factory Category.fromJson(Map<String, dynamic> json) {
    final subs = json['subcategories'];
    return Category(
      categoryId: (json['categoryId'] as num?)?.toInt() ?? 0,
      categoryName: json['categoryName'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      imageUrl: json['imageUrl'] as String?,
      iconUrl: json['iconUrl'] as String?,
      featured: json['featured'] as bool? ?? false,
      displayOrder: (json['displayOrder'] as num?)?.toInt(),
      status: json['status'] as String? ?? 'ACTIVE',
      commissionRate: (json['commissionRate'] as num?)?.toDouble(),
      subcategories: subs is List
          ? subs
              .whereType<Map<String, dynamic>>()
              .map((e) => Subcategory.fromJson(e))
              .toList()
          : const [],
    );
  }
}

class Subcategory {
  final int subcategoryId;
  final String subcategoryName;
  /// Taxonomy slug. Rental detection keys off this - `short-stays-holiday-rentals`
  /// is what makes a listing a nightly short stay (see domain/rentals.dart).
  final String slug;
  final String? imageUrl;
  final bool featured;
  final int? displayOrder;
  /// Explicit slot in the home "Most Popular Categories" rail; null = not pinned.
  final int? homePosition;
  final String status;

  const Subcategory({
    required this.subcategoryId,
    required this.subcategoryName,
    this.slug = '',
    this.imageUrl,
    this.featured = false,
    this.displayOrder,
    this.homePosition,
    this.status = 'ACTIVE',
  });

  factory Subcategory.fromJson(Map<String, dynamic> json) => Subcategory(
        subcategoryId: (json['subcategoryId'] as num?)?.toInt() ?? 0,
        subcategoryName: json['subcategoryName'] as String? ?? '',
        slug: json['slug'] as String? ?? '',
        imageUrl: json['imageUrl'] as String?,
        featured: json['featured'] as bool? ?? false,
        displayOrder: (json['displayOrder'] as num?)?.toInt(),
        homePosition: (json['homePosition'] as num?)?.toInt(),
        status: json['status'] as String? ?? 'ACTIVE',
      );
}
