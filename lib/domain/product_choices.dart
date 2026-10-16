import 'dart:math';

/// Seller-authoring "product choices" domain model — port of web
/// `lib/product-choices.ts`. This is the attribute/variant system behind the
/// Step 2 "Product attributes and buyer choices" editor (SELL_FLOW_SPEC):
/// admin-defined [AttributeDefinition]s per subcategory (Color, Size,
/// Condition, Warranty, Dimensions, Age, ...), from which the seller builds a
/// listing-scoped [ProductChoiceConfiguration] of selected/custom values,
/// each optionally carrying its own image and its own seller-payout delta.
///
/// Scope note: only the seller-authoring (sell-wizard) surface of the web
/// module is ported here. Buyer-side cart/checkout selection helpers
/// (`areRequiredChoicesSelected`, `buildSelectedChoiceSnapshot`,
/// `choiceSelectionSignature`, etc.) are out of scope — mobile's buyer-facing
/// choice model already exists separately in `models/product_detail.dart`
/// (`ChoiceAttribute`/`ChoiceValue`/`SelectedChoice`) and is unrelated to the
/// classes below.
enum AttributeInputType { select, buttons, color, numberUnit, image }

extension AttributeInputTypeApi on AttributeInputType {
  String get apiName {
    switch (this) {
      case AttributeInputType.select:
        return 'SELECT';
      case AttributeInputType.buttons:
        return 'BUTTONS';
      case AttributeInputType.color:
        return 'COLOR';
      case AttributeInputType.numberUnit:
        return 'NUMBER_UNIT';
      case AttributeInputType.image:
        return 'IMAGE';
    }
  }
}

AttributeInputType attributeInputTypeFromApi(String? name) {
  switch ((name ?? '').trim().toUpperCase()) {
    case 'BUTTONS':
      return AttributeInputType.buttons;
    case 'COLOR':
      return AttributeInputType.color;
    case 'NUMBER_UNIT':
      return AttributeInputType.numberUnit;
    case 'IMAGE':
      return AttributeInputType.image;
    case 'SELECT':
    default:
      return AttributeInputType.select;
  }
}

enum AttributeStatus { active, archived }

AttributeStatus attributeStatusFromApi(String? name) =>
    (name ?? '').trim().toUpperCase() == 'ARCHIVED' ? AttributeStatus.archived : AttributeStatus.active;

/// One admin-configured predefined value option for an [AttributeDefinition]
/// (e.g. the "Red" option under a Color attribute).
class AttributeValueDefinition {
  final String value;
  final String label;
  final String? colorHex;
  final String? unit;
  const AttributeValueDefinition({
    required this.value,
    required this.label,
    this.colorHex,
    this.unit,
  });

  factory AttributeValueDefinition.fromJson(Map<String, dynamic> j) => AttributeValueDefinition(
        value: (j['value'] ?? '').toString(),
        label: (j['label'] ?? '').toString(),
        colorHex: j['colorHex'] as String?,
        unit: j['unit'] as String?,
      );
}

/// Catalog-level attribute definition for a subcategory (Color, Size,
/// Condition, ...) — admin-managed; the seller can only pick/add values
/// within it, never invent a new attribute type.
class AttributeDefinition {
  final int attributeDefinitionId;
  final String name;
  final String slug;
  final AttributeInputType inputType;
  final bool required;
  final bool allowCustomValues;
  final bool visual;
  final bool allowDifferentPrices;
  final AttributeStatus status;
  final List<AttributeValueDefinition> predefinedValues;
  final List<int> subcategoryIds;
  const AttributeDefinition({
    required this.attributeDefinitionId,
    required this.name,
    required this.slug,
    required this.inputType,
    required this.required,
    required this.allowCustomValues,
    required this.visual,
    this.allowDifferentPrices = false,
    this.status = AttributeStatus.active,
    this.predefinedValues = const [],
    this.subcategoryIds = const [],
  });

  factory AttributeDefinition.fromJson(Map<String, dynamic> j) => AttributeDefinition(
        attributeDefinitionId: (j['attributeDefinitionId'] as num?)?.toInt() ?? 0,
        name: (j['name'] ?? '').toString(),
        slug: (j['slug'] ?? '').toString(),
        inputType: attributeInputTypeFromApi(j['inputType'] as String?),
        required: j['required'] as bool? ?? false,
        allowCustomValues: j['allowCustomValues'] as bool? ?? false,
        visual: j['visual'] as bool? ?? false,
        allowDifferentPrices: j['allowDifferentPrices'] as bool? ?? false,
        status: attributeStatusFromApi(j['status'] as String?),
        predefinedValues: (j['predefinedValues'] as List?)
                ?.whereType<Map>()
                .map((v) => AttributeValueDefinition.fromJson(v.cast<String, dynamic>()))
                .toList() ??
            const [],
        subcategoryIds: (j['subcategoryIds'] as List?)?.map((e) => (e as num).toInt()).toList() ?? const [],
      );
}

/// One value the seller has selected/added under a [ProductChoiceAttribute].
class ProductChoiceValue {
  final String id;
  final String label;
  final String? colorHex;
  final String? unit;
  final String? imageUrl;
  final int? imageIndex;
  final bool priceOverridden;
  final double sellerPayoutAdjustment;
  final bool active;
  const ProductChoiceValue({
    required this.id,
    required this.label,
    this.colorHex,
    this.unit,
    this.imageUrl,
    this.imageIndex,
    this.priceOverridden = false,
    this.sellerPayoutAdjustment = 0,
    this.active = true,
  });

  ProductChoiceValue copyWith({
    String? label,
    String? colorHex,
    String? unit,
    Object? imageUrl = _unset,
    Object? imageIndex = _unset,
    bool? priceOverridden,
    double? sellerPayoutAdjustment,
    bool? active,
  }) =>
      ProductChoiceValue(
        id: id,
        label: label ?? this.label,
        colorHex: colorHex ?? this.colorHex,
        unit: unit ?? this.unit,
        imageUrl: identical(imageUrl, _unset) ? this.imageUrl : imageUrl as String?,
        imageIndex: identical(imageIndex, _unset) ? this.imageIndex : imageIndex as int?,
        priceOverridden: priceOverridden ?? this.priceOverridden,
        sellerPayoutAdjustment: sellerPayoutAdjustment ?? this.sellerPayoutAdjustment,
        active: active ?? this.active,
      );

  factory ProductChoiceValue.fromJson(Map<String, dynamic> j) => ProductChoiceValue(
        id: (j['id'] ?? '').toString(),
        label: (j['label'] ?? '').toString(),
        colorHex: j['colorHex'] as String?,
        unit: j['unit'] as String?,
        imageUrl: j['imageUrl'] as String?,
        imageIndex: (j['imageIndex'] as num?)?.toInt(),
        priceOverridden: j['priceOverridden'] as bool? ?? false,
        sellerPayoutAdjustment: (j['sellerPayoutAdjustment'] as num?)?.toDouble() ?? 0,
        active: j['active'] as bool? ?? true,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        if (colorHex != null) 'colorHex': colorHex,
        if (unit != null) 'unit': unit,
        'imageUrl': imageUrl,
        'imageIndex': imageIndex,
        'priceOverridden': priceOverridden,
        'sellerPayoutAdjustment': sellerPayoutAdjustment,
        'active': active,
      };
}

const _unset = Object();

/// The seller's listing-level instantiation of a subset of an
/// [AttributeDefinition]'s values.
class ProductChoiceAttribute {
  final int definitionId;
  final String name;
  final AttributeInputType inputType;
  final bool required;
  final bool visual;
  final bool allowDifferentPrices;
  final String? defaultValueId;
  final List<ProductChoiceValue> values;
  const ProductChoiceAttribute({
    required this.definitionId,
    required this.name,
    required this.inputType,
    required this.required,
    required this.visual,
    this.allowDifferentPrices = false,
    this.defaultValueId,
    this.values = const [],
  });

  factory ProductChoiceAttribute.fromDefinition(AttributeDefinition d) => ProductChoiceAttribute(
        definitionId: d.attributeDefinitionId,
        name: d.name,
        inputType: d.inputType,
        required: d.required,
        visual: d.visual,
        values: const [],
      );

  ProductChoiceAttribute copyWith({
    bool? allowDifferentPrices,
    Object? defaultValueId = _unset,
    List<ProductChoiceValue>? values,
  }) =>
      ProductChoiceAttribute(
        definitionId: definitionId,
        name: name,
        inputType: inputType,
        required: required,
        visual: visual,
        allowDifferentPrices: allowDifferentPrices ?? this.allowDifferentPrices,
        defaultValueId: identical(defaultValueId, _unset) ? this.defaultValueId : defaultValueId as String?,
        values: values ?? this.values,
      );

  factory ProductChoiceAttribute.fromJson(Map<String, dynamic> j) => ProductChoiceAttribute(
        definitionId: (j['definitionId'] as num?)?.toInt() ?? 0,
        name: (j['name'] ?? '').toString(),
        inputType: attributeInputTypeFromApi(j['inputType'] as String?),
        required: j['required'] as bool? ?? false,
        visual: j['visual'] as bool? ?? false,
        allowDifferentPrices: j['allowDifferentPrices'] as bool? ?? false,
        defaultValueId: j['defaultValueId'] as String?,
        values: (j['values'] as List?)
                ?.whereType<Map>()
                .map((v) => ProductChoiceValue.fromJson(v.cast<String, dynamic>()))
                .toList() ??
            const [],
      );

  Map<String, dynamic> toJson() => {
        'definitionId': definitionId,
        'name': name,
        'inputType': inputType.apiName,
        'required': required,
        'visual': visual,
        'allowDifferentPrices': allowDifferentPrices,
        'defaultValueId': defaultValueId,
        'values': values.map((v) => v.toJson()).toList(),
      };
}

/// The full choices state carried on a listing/draft.
class ProductChoiceConfiguration {
  final bool hasChoices;
  final List<ProductChoiceAttribute> attributes;
  const ProductChoiceConfiguration({required this.hasChoices, required this.attributes});

  static const empty = ProductChoiceConfiguration(hasChoices: false, attributes: []);

  ProductChoiceConfiguration copyWith({bool? hasChoices, List<ProductChoiceAttribute>? attributes}) =>
      ProductChoiceConfiguration(
        hasChoices: hasChoices ?? this.hasChoices,
        attributes: attributes ?? this.attributes,
      );

  factory ProductChoiceConfiguration.fromJson(Map<String, dynamic>? j) {
    if (j == null) return empty;
    return ProductChoiceConfiguration(
      hasChoices: j['hasChoices'] as bool? ?? false,
      attributes: (j['attributes'] as List?)
              ?.whereType<Map>()
              .map((a) => ProductChoiceAttribute.fromJson(a.cast<String, dynamic>()))
              .toList() ??
          const [],
    );
  }

  Map<String, dynamic> toJson() => {
        'hasChoices': hasChoices,
        'attributes': attributes.map((a) => a.toJson()).toList(),
      };
}

class DefaultChoicePrice {
  final int definitionId;
  final String attributeName;
  final String valueId;
  final String valueLabel;
  const DefaultChoicePrice({
    required this.definitionId,
    required this.attributeName,
    required this.valueId,
    required this.valueLabel,
  });
}

class ChoicePricingUpdate {
  final ProductChoiceConfiguration configuration;
  final double baseSellerPayout;
  const ChoicePricingUpdate({required this.configuration, required this.baseSellerPayout});
}

// ---- pure helpers (web parity, lib/product-choices.ts) ---------------------

List<ProductChoiceValue> getActiveProductChoiceValues(ProductChoiceAttribute attribute) =>
    attribute.values.where((v) => v.active).toList();

/// True if the attribute has a nonzero adjustment on any value, or has
/// opted into per-value pricing explicitly.
bool _isPricedChoiceAttribute(ProductChoiceAttribute attribute) =>
    attribute.allowDifferentPrices || attribute.values.any((v) => v.sellerPayoutAdjustment != 0);

bool hasPricedChoices(ProductChoiceConfiguration configuration) {
  if (!configuration.hasChoices) return false;
  return configuration.attributes.any(
    (a) => _isPricedChoiceAttribute(a) && getActiveProductChoiceValues(a).isNotEmpty,
  );
}

DefaultChoicePrice? getDefaultChoicePrice(ProductChoiceConfiguration configuration) {
  if (!configuration.hasChoices) return null;
  for (final attribute in configuration.attributes) {
    if (!_isPricedChoiceAttribute(attribute)) continue;
    final active = getActiveProductChoiceValues(attribute);
    if (active.isEmpty) continue;
    final chosen = active.firstWhere(
      (v) => v.id == attribute.defaultValueId,
      orElse: () => active.first,
    );
    return DefaultChoicePrice(
      definitionId: attribute.definitionId,
      attributeName: attribute.name,
      valueId: chosen.id,
      valueLabel: chosen.label,
    );
  }
  return null;
}

double getChoiceSellerPayout(double baseSellerPayout, ProductChoiceValue value) {
  final base = baseSellerPayout.isFinite ? baseSellerPayout : 0.0;
  final adj = value.sellerPayoutAdjustment.isFinite ? value.sellerPayoutAdjustment : 0.0;
  return base + adj;
}

/// Web parity `hasHalalChoice` (lib/product-badges.ts): a listing carries the
/// Halal trust badge when one of its configured attributes is "Halal"/"Halal
/// status" and an ACTIVE value labelled "Halal" is selected.
bool hasHalalChoice(ProductChoiceConfiguration? configuration) {
  if (configuration == null || !configuration.hasChoices) return false;
  String normalize(String v) => v.trim().toLowerCase().replaceAll(RegExp(r'[\s_-]+'), ' ');
  return configuration.attributes.any((attribute) {
    final name = normalize(attribute.name);
    if (name != 'halal' && name != 'halal status') return false;
    return attribute.values
        .any((v) => v.active && normalize(v.label) == 'halal');
  });
}

/// Copy of web's `getNonPositivePricedChoices`: lists "Attribute: Value" for
/// every priced choice whose resulting payout is &lt;= 0.
List<String> getNonPositivePricedChoices(ProductChoiceConfiguration configuration, double baseSellerPayout) {
  final bad = <String>[];
  if (!configuration.hasChoices) return bad;
  for (final attribute in configuration.attributes) {
    if (!attribute.allowDifferentPrices) continue;
    for (final value in getActiveProductChoiceValues(attribute)) {
      final payout = getChoiceSellerPayout(baseSellerPayout, value);
      if (payout <= 0) bad.add('${attribute.name}: ${value.label}');
    }
  }
  return bad;
}

bool hasChoicePriceOverride(ProductChoiceValue value) =>
    value.priceOverridden;

ProductChoiceAttribute disableChoiceAttributePricing(ProductChoiceAttribute attribute) => attribute.copyWith(
      allowDifferentPrices: false,
      defaultValueId: null,
      values: attribute.values
          .map((v) => v.copyWith(priceOverridden: false, sellerPayoutAdjustment: 0))
          .toList(),
    );

ProductChoiceConfiguration disableChoiceSpecificPricing(ProductChoiceConfiguration configuration) =>
    configuration.copyWith(
      attributes: configuration.attributes.map(disableChoiceAttributePricing).toList(),
    );

/// Core pricing-edit function (web parity `setChoiceSellerPayout`): if the
/// edited value is the attribute's current default, the listing's base
/// seller payout is rebased to the new amount and every other
/// non-overridden value's adjustment is recomputed relative to the new
/// base; otherwise only that one value's adjustment is set.
ChoicePricingUpdate setChoiceSellerPayout(
  ProductChoiceConfiguration configuration,
  double baseSellerPayout,
  int definitionId,
  String valueId,
  double nextSellerPayout,
) {
  double newBase = baseSellerPayout;
  final attributes = configuration.attributes.map((attribute) {
    if (attribute.definitionId != definitionId) return attribute;
    final isDefault = attribute.defaultValueId == valueId;
    if (isDefault) newBase = nextSellerPayout;
    final values = attribute.values.map((value) {
      if (value.id == valueId) {
        return value.copyWith(
          priceOverridden: !isDefault,
          sellerPayoutAdjustment: isDefault ? 0 : nextSellerPayout - baseSellerPayout,
        );
      }
      if (isDefault && !value.priceOverridden) {
        // Non-overridden siblings keep their absolute payout as the base moves.
        final absolute = getChoiceSellerPayout(baseSellerPayout, value);
        return value.copyWith(sellerPayoutAdjustment: absolute - newBase);
      }
      return value;
    }).toList();
    return attribute.copyWith(values: values);
  }).toList();
  return ChoicePricingUpdate(
    configuration: configuration.copyWith(attributes: attributes),
    baseSellerPayout: newBase,
  );
}

/// Keeps the "default priced value" pinned to the listing's base seller
/// payout when the seller's edit changed which value is the default.
ChoicePricingUpdate normalizeChoicePriceDefault(
  ProductChoiceConfiguration previous,
  ProductChoiceConfiguration next,
  double baseSellerPayout,
) {
  final defaultPrice = getDefaultChoicePrice(next);
  if (defaultPrice == null) {
    return ChoicePricingUpdate(configuration: next, baseSellerPayout: baseSellerPayout);
  }
  final attribute = next.attributes.firstWhere(
    (a) => a.definitionId == defaultPrice.definitionId,
    orElse: () => ProductChoiceAttribute(
        definitionId: -1, name: '', inputType: AttributeInputType.select, required: false, visual: false),
  );
  if (attribute.definitionId == -1) {
    return ChoicePricingUpdate(configuration: next, baseSellerPayout: baseSellerPayout);
  }
  final defaultValue = attribute.values.firstWhere((v) => v.id == defaultPrice.valueId,
      orElse: () => attribute.values.first);
  final currentPayout = getChoiceSellerPayout(baseSellerPayout, defaultValue);
  if (currentPayout == baseSellerPayout) {
    return ChoicePricingUpdate(configuration: next, baseSellerPayout: baseSellerPayout);
  }
  return setChoiceSellerPayout(
      next, baseSellerPayout, attribute.definitionId, defaultValue.id, currentPayout);
}

final _rand = Random();

/// Slugifies the label and appends a short random suffix — web parity
/// `createChoiceValueId` (a stable, unique id for a seller-added value).
String createChoiceValueId(String label) {
  final slug = label
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'(^-+)|(-+$)'), '');
  final suffix = _rand.nextInt(0x7fffffff).toRadixString(36);
  return '${slug.isEmpty ? 'value' : slug}-$suffix';
}

/// Strips every value's image reference — used before initial product
/// creation, since server image URLs don't exist yet at that point.
ProductChoiceConfiguration withoutChoiceImages(ProductChoiceConfiguration configuration) =>
    configuration.copyWith(
      attributes: configuration.attributes
          .map((a) => a.copyWith(
              values: a.values.map((v) => v.copyWith(imageUrl: null, imageIndex: null)).toList()))
          .toList(),
    );

bool hasVisualChoiceImages(ProductChoiceConfiguration configuration) => configuration.attributes
    .any((a) => a.visual && a.values.any((v) => v.imageUrl != null || v.imageIndex != null));

/// Maps each value's local/client image reference to its uploaded server
/// URL, using a client-URL -> server-URL lookup built after upload.
ProductChoiceConfiguration resolveChoiceImages(
  ProductChoiceConfiguration configuration,
  Map<String, String> clientToServerUrl,
) =>
    configuration.copyWith(
      attributes: configuration.attributes
          .map((a) => a.copyWith(
              values: a.values
                  .map((v) => v.imageUrl != null && clientToServerUrl.containsKey(v.imageUrl)
                      ? v.copyWith(imageUrl: clientToServerUrl[v.imageUrl])
                      : v)
                  .toList()))
          .toList(),
    );

/// Resolves each value's authoring-time `imageIndex` (a position into the
/// wizard's in-memory `state.images` list) to the real server URL at that
/// same position in the just-published listing's saved image order, and
/// clears the index — the mobile analogue of web's client-URL-keyed
/// `resolveChoiceImages` (mobile has no blob-URL concept; it addresses
/// pending images by list position instead).
ProductChoiceConfiguration resolveChoiceImageIndices(
  ProductChoiceConfiguration configuration,
  Map<int, String> originalIndexToServerUrl,
) =>
    configuration.copyWith(
      attributes: configuration.attributes
          .map((a) => a.copyWith(
              values: a.values
                  .map((v) => v.imageIndex != null && originalIndexToServerUrl.containsKey(v.imageIndex)
                      ? v.copyWith(imageUrl: originalIndexToServerUrl[v.imageIndex], imageIndex: null)
                      : v)
                  .toList()))
          .toList(),
    );

/// Currency-conversion pass over every value's price delta.
ProductChoiceConfiguration convertChoicePriceAdjustments(
    ProductChoiceConfiguration configuration, double divisor) {
  if (!divisor.isFinite || divisor <= 0 || divisor == 1) return configuration;
  return configuration.copyWith(
    attributes: configuration.attributes
        .map((a) => a.copyWith(
            values: a.values
                .map((v) => v.sellerPayoutAdjustment == 0
                    ? v
                    : v.copyWith(
                        sellerPayoutAdjustment: v.sellerPayoutAdjustment / divisor,
                        priceOverridden: hasChoicePriceOverride(v),
                      ))
                .toList()))
        .toList(),
  );
}

/// Normalizes a `detailKey` the same way web does (lowercase, no separators)
/// so a definition's name/slug can be matched against it.
String _normalizeDetailKey(String v) => v.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '');

ProductChoiceAttribute? getConfiguredChoiceAttribute(
    ProductChoiceConfiguration configuration, String detailKey) {
  final key = _normalizeDetailKey(detailKey);
  for (final a in configuration.attributes) {
    if (_normalizeDetailKey(a.name) == key) return a;
  }
  return null;
}

List<String> getActiveConfiguredChoiceLabels(ProductChoiceConfiguration configuration, String detailKey) {
  final attribute = getConfiguredChoiceAttribute(configuration, detailKey);
  if (attribute == null) return const [];
  return getActiveProductChoiceValues(attribute).map((v) => v.label).toList();
}

String? getFirstActiveConfiguredChoiceLabel(ProductChoiceConfiguration configuration, String detailKey) {
  final labels = getActiveConfiguredChoiceLabels(configuration, detailKey);
  return labels.isEmpty ? null : labels.first;
}
