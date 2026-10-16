import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../domain/product_choices.dart';
import '../../models/sell_form_state.dart';
import '../../theme.dart';
import '../../widgets/color_picker_sheet.dart';
import '../../domain/stay_listing.dart';
import '../../config.dart';

/// Seller-authoring UI for the Step 2 "Product attributes and buyer choices"
/// system — web parity `components/product-choices/product-choice-editor.tsx`
/// + `product-choice-definition-editor.tsx` + `choice-value-row.tsx`, folded
/// into one file for the mobile port. Fetches the subcategory's recommended
/// [AttributeDefinition]s, lets the seller toggle/add values under each, and
/// optionally turn on per-value pricing and per-value listing-photo images.
class ProductChoiceEditor extends StatefulWidget {
  final SellFormState state;
  final VoidCallback onChanged;
  final ApiClient api;
  const ProductChoiceEditor(
      {super.key, required this.state, required this.onChanged, required this.api});

  @override
  State<ProductChoiceEditor> createState() => _ProductChoiceEditorState();
}

class _ProductChoiceEditorState extends State<ProductChoiceEditor> {
  List<AttributeDefinition> _definitions = const [];
  bool _loading = false;
  String? _error;
  int? _loadedFor;

  @override
  void initState() {
    super.initState();
    _maybeFetch();
  }

  @override
  void didUpdateWidget(covariant ProductChoiceEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    _maybeFetch();
  }

  void _maybeFetch() {
    final id = widget.state.subcategoryId;
    if (id == null) {
      _loadedFor = null;
      if (_definitions.isNotEmpty) _definitions = const [];
      return;
    }
    if (_loadedFor == id) return;
    _loadedFor = id;
    setState(() {
      _loading = true;
      _error = null;
    });
    widget.api.getRecommendedProductAttributes(id).then((defs) {
      if (!mounted || widget.state.subcategoryId != id) return;
      // Web parity (product-choice-editor.tsx:84-92): when a subcategory HAS
      // recommended attributes and the configuration is still empty, choices
      // come on by default — otherwise every mobile listing would start with
      // attributes OFF and silently omit the recommended fixed details.
      final config = widget.state.choiceConfiguration;
      if (defs.isNotEmpty &&
          !config.hasChoices &&
          config.attributes.isEmpty) {
        widget.state.setChoiceConfiguration(
            const ProductChoiceConfiguration(hasChoices: true, attributes: []));
        widget.onChanged();
      }
      setState(() {
        _definitions = defs;
        _loading = false;
      });
    }).catchError((_) {
      if (!mounted || widget.state.subcategoryId != id) return;
      setState(() {
        _loading = false;
        _error = 'Could not load recommended attributes.';
      });
    });
  }

  void _apply(ProductChoiceConfiguration next) {
    widget.state.setChoiceConfiguration(next);
    widget.onChanged();
  }

  /// Web parity `updateAttribute`: applies [updater] to the attribute for
  /// [definition] (synthesizing one if the seller hasn't touched it yet),
  /// recomputes `allowDifferentPrices`/`defaultValueId`, merges it back into
  /// the configuration, then re-pins the default priced value to the
  /// listing's base seller payout.
  void _updateAttribute(
      AttributeDefinition definition, ProductChoiceAttribute Function(ProductChoiceAttribute) updater) {
    final config = widget.state.choiceConfiguration;
    final index = config.attributes.indexWhere((a) => a.definitionId == definition.attributeDefinitionId);
    final current = index >= 0 ? config.attributes[index] : ProductChoiceAttribute.fromDefinition(definition);
    var updated = updater(current);

    final allowDifferentPrices =
        updated.allowDifferentPrices || updated.values.any((v) => v.sellerPayoutAdjustment != 0);
    final activeValues = getActiveProductChoiceValues(updated);
    String? defaultValueId;
    if (allowDifferentPrices) {
      defaultValueId = activeValues.any((v) => v.id == updated.defaultValueId)
          ? updated.defaultValueId
          : (activeValues.isNotEmpty ? activeValues.first.id : null);
    }
    updated = updated.copyWith(allowDifferentPrices: allowDifferentPrices, defaultValueId: defaultValueId);

    final attributes = [...config.attributes];
    if (index >= 0) {
      attributes[index] = updated;
    } else {
      attributes.add(updated);
    }
    final next = config.copyWith(attributes: attributes);
    final normalized = normalizeChoicePriceDefault(config, next, widget.state.sellerPayout);
    if (normalized.baseSellerPayout != widget.state.sellerPayout) {
      widget.state.setPricingAmount(normalized.baseSellerPayout, forward: true);
    }
    _apply(normalized.configuration);
  }

  void _onChoiceSellerPayoutChange(int definitionId, String valueId, double payout) {
    final update = setChoiceSellerPayout(
        widget.state.choiceConfiguration, widget.state.sellerPayout, definitionId, valueId, payout);
    if (update.baseSellerPayout != widget.state.sellerPayout) {
      widget.state.setPricingAmount(update.baseSellerPayout, forward: true);
    }
    _apply(update.configuration);
  }

  void _removeArchived(int definitionId) {
    final config = widget.state.choiceConfiguration;
    _apply(config.copyWith(
        attributes: config.attributes.where((a) => a.definitionId != definitionId).toList()));
  }

  /// Web 2026-10: a property rental lists its key facts first, one value
  /// each — the six a short stay must state, or type / bedrooms / bathrooms
  /// / floor area for a longer let.
  List<String> get _propertyDetailNames {
    final state = widget.state;
    if (!state.isPropertyRental) return const [];
    return state.rentalConfiguration.isShortStay
        ? stayDetailsForSubcategory(state.subcategorySlug)
        : const ['Property Type', 'Bedrooms', 'Bathrooms', 'Floor Area'];
  }

  /// Guest count and check-in / checkout times only make sense on a stay.
  bool _hidden(AttributeDefinition d) =>
      AppConfig.propertyRentals &&
      widget.state.categorySlug == 'real-estate' &&
      !widget.state.rentalConfiguration.isShortStay &&
      kStayOnlyDetails.any((n) => n.toLowerCase() == d.name.toLowerCase());

  bool _isPropertyDetail(AttributeDefinition d) => _propertyDetailNames
      .any((n) => n.toLowerCase() == d.name.toLowerCase());

  /// Saves one fixed value for a property detail (or clears it).
  void _pickSingle(AttributeDefinition definition, String? label) {
    final config = widget.state.choiceConfiguration;
    if (!config.hasChoices) {
      widget.state.setChoiceConfiguration(config.copyWith(hasChoices: true));
    }
    _updateAttribute(definition, (a) {
      if (label == null || label.trim().isEmpty) return a.copyWith(values: []);
      String id = createChoiceValueId(label);
      for (final pv in definition.predefinedValues) {
        if (pv.label == label) id = pv.value;
      }
      return a.copyWith(values: [ProductChoiceValue(id: id, label: label)]);
    });
  }

  Widget _propertyDetails(ProductChoiceConfiguration config) {
    final names = _propertyDetailNames;
    final stay = AppConfig.propertyRentals &&
        widget.state.rentalConfiguration.isShortStay;
    final defs = [
      for (final n in names)
        ..._definitions.where((d) => d.name.toLowerCase() == n.toLowerCase()),
    ];
    if (defs.isEmpty) return const SizedBox.shrink();
    return Column(
      key: const ValueKey('property-details'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Property details',
            style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 14,
                color: AppPalette.of(context).accentInk)),
        const SizedBox(height: 8),
        for (final def in defs)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _PropertyDetailPicker(
              definition: def,
              attribute: config.attributes
                  .cast<ProductChoiceAttribute?>()
                  .firstWhere((a) => a?.definitionId == def.attributeDefinitionId,
                      orElse: () => null),
              required: stay,
              onPick: (label) => _pickSingle(def, label),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final config = state.choiceConfiguration;

    if (state.subcategoryId == null) {
      return _dashedPlaceholder(state.categorySlug == 'real-estate'
          ? 'Choose a property type first to see its recommended details and amenities.'
          : 'Choose a subcategory first to see its recommended product choices.');
    }

    final definedIds = _definitions.map((d) => d.attributeDefinitionId).toSet();
    final archived = config.attributes.where((a) => !definedIds.contains(a.definitionId)).toList();
    final otherDefinitions = [
      for (final d in _definitions)
        if (!_hidden(d) && !_isPropertyDetail(d)) d,
    ];
    final propertyRental = state.isPropertyRental;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppPalette.of(context).background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Product attributes and buyer choices',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              const SizedBox(height: 3),
              Text(
                  'Select one value to save it as a fixed product detail. Select two or more '
                  'values when buyers should choose an option while purchasing.',
                  style: TextStyle(fontSize: 11.5, color: AppPalette.of(context).textSecondary, height: 1.3)),
            ]),
          ),
          Switch(
            value: config.hasChoices,
            onChanged: (v) => _apply(v ? config.copyWith(hasChoices: true) : ProductChoiceConfiguration.empty),
          ),
        ]),
        if (_loading) ...[
          const SizedBox(height: 10),
          Row(children: [
            SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 8),
            Expanded(
              child: Text('Loading recommended choices...',
                  style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
            ),
          ]),
        ],
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!, style: const TextStyle(fontSize: 12, color: Colors.red)),
        ],
        if (config.hasChoices && !_loading && _error == null && _definitions.isEmpty) ...[
          const SizedBox(height: 10),
          Text('No recommended attributes are assigned to this subcategory yet.',
              style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
        ],
        if (propertyRental && !_loading) ...[
          const SizedBox(height: 12),
          _propertyDetails(config),
          if (config.hasChoices && otherDefinitions.isNotEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text('More details',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            ),
        ],
        if (config.hasChoices)
          for (final def in otherDefinitions)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: _AttributeEditorCard(
                definition: def,
                attribute: config.attributes
                    .cast<ProductChoiceAttribute?>()
                    .firstWhere((a) => a?.definitionId == def.attributeDefinitionId, orElse: () => null),
                images: state.images,
                baseSellerPayout: state.sellerPayout,
                onChange: (updater) => _updateAttribute(def, updater),
                onChoiceSellerPayoutChange: (valueId, payout) =>
                    _onChoiceSellerPayoutChange(def.attributeDefinitionId, valueId, payout),
              ),
            ),
        if (config.hasChoices)
          for (final attribute in archived)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppPalette.of(context).warningFill,
                  border: Border.all(color: AppPalette.of(context).warningBorder),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(attribute.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                      const SizedBox(height: 2),
                      Text('This attribute is no longer recommended. Its values remain unless you remove it.',
                          style: TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary)),
                    ]),
                  ),
                  TextButton(
                    onPressed: () => _removeArchived(attribute.definitionId),
                    child: const Text('Remove'),
                  ),
                ]),
              ),
            ),
        if (config.hasChoices && config.attributes.any((a) => a.values.isNotEmpty))
          Padding(padding: const EdgeInsets.only(top: 10), child: _BuyerPreview(config: config)),
      ]),
    );
  }

  Widget _dashedPlaceholder(String text) => Container(
        padding: const EdgeInsets.all(16),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          border: Border.all(color: AppPalette.of(context).border, style: BorderStyle.solid),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(text,
            textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
      );
}

class _BuyerPreview extends StatelessWidget {
  final ProductChoiceConfiguration config;
  const _BuyerPreview({required this.config});

  @override
  Widget build(BuildContext context) {
    final withValues = config.attributes.where((a) => a.values.isNotEmpty).toList();
    if (withValues.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Buyer preview', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
        const SizedBox(height: 8),
        for (final a in withValues)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(a.required ? '${a.name} *' : a.name,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final v in getActiveProductChoiceValues(a))
                    Chip(
                      visualDensity: VisualDensity.compact,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      label: Text(
                        a.allowDifferentPrices
                            ? '${v.label} (TSh ${getChoiceSellerPayout(0, v).toStringAsFixed(0)})'
                            : v.label,
                        style: const TextStyle(fontSize: 11),
                      ),
                    ),
                ],
              ),
            ]),
          ),
      ]),
    );
  }
}

/// Per-attribute card — predefined value chips, an optional custom-value add
/// row, optional per-value pricing, and the selected-values list.
class _AttributeEditorCard extends StatefulWidget {
  final AttributeDefinition definition;
  final ProductChoiceAttribute? attribute;
  final List<PendingImage> images;
  final double baseSellerPayout;
  final void Function(ProductChoiceAttribute Function(ProductChoiceAttribute)) onChange;
  final void Function(String valueId, double payout) onChoiceSellerPayoutChange;
  const _AttributeEditorCard({
    required this.definition,
    required this.attribute,
    required this.images,
    required this.baseSellerPayout,
    required this.onChange,
    required this.onChoiceSellerPayoutChange,
  });

  @override
  State<_AttributeEditorCard> createState() => _AttributeEditorCardState();
}

const _ageUnits = ['Days', 'Weeks', 'Months', 'Years'];
class _AttributeEditorCardState extends State<_AttributeEditorCard> {
  final _customCtrl = TextEditingController();
  final _unitCtrl = TextEditingController();
  final _lengthCtrl = TextEditingController();
  final _widthCtrl = TextEditingController();
  final _heightCtrl = TextEditingController();
  String? _pickedColorHex;
  String _ageUnit = _ageUnits[0];

  @override
  void dispose() {
    _customCtrl.dispose();
    _unitCtrl.dispose();
    _lengthCtrl.dispose();
    _widthCtrl.dispose();
    _heightCtrl.dispose();
    super.dispose();
  }

  ProductChoiceAttribute get _attr =>
      widget.attribute ?? ProductChoiceAttribute.fromDefinition(widget.definition);

  String get _slug => widget.definition.slug;

  String get _helperText {
    switch (_slug) {
      case 'dimensions':
        return 'Enter any measurements you know. You can fill in just one, two, or all three, or leave this blank.';
      case 'choice-condition':
        return 'Choose the condition that describes this listing. Select more than one only when buyers can '
            'choose items in different conditions.';
      case 'warranty':
        return 'Choose No warranty or Warranty available. To show the exact coverage instead, add it below as a custom value.';
      case 'age':
        return 'Add a value with a unit (e.g. 2 Years) to describe the item\'s age.';
      default:
        return widget.definition.allowCustomValues
            ? 'Pick a predefined value or add your own below.'
            : 'Pick one or more values below.';
    }
  }

  void _togglePredefined(AttributeValueDefinition pv) {
    widget.onChange((a) {
      final existing = a.values.indexWhere((v) => v.id == pv.value);
      final values = [...a.values];
      if (existing >= 0) {
        values.removeAt(existing);
      } else {
        values.add(ProductChoiceValue(id: pv.value, label: pv.label, colorHex: pv.colorHex, unit: pv.unit));
      }
      return a.copyWith(values: values);
    });
  }

  void _addCustom({String? labelOverride, String? unit, String? colorHex}) {
    final label = (labelOverride ?? _customCtrl.text).trim();
    if (label.isEmpty) return;
    widget.onChange((a) => a.copyWith(values: [
          ...a.values,
          ProductChoiceValue(id: createChoiceValueId(label), label: label, unit: unit, colorHex: colorHex),
        ]));
    _customCtrl.clear();
    _unitCtrl.clear();
    setState(() => _pickedColorHex = null);
  }

  void _addDimensions() {
    final parts = <String>[
      if (_lengthCtrl.text.trim().isNotEmpty) 'L ${_lengthCtrl.text.trim()}cm',
      if (_widthCtrl.text.trim().isNotEmpty) 'W ${_widthCtrl.text.trim()}cm',
      if (_heightCtrl.text.trim().isNotEmpty) 'H ${_heightCtrl.text.trim()}cm',
    ];
    if (parts.isEmpty) return;
    _addCustom(labelOverride: parts.join(' x '));
    _lengthCtrl.clear();
    _widthCtrl.clear();
    _heightCtrl.clear();
  }

  void _removeValue(String id) {
    widget.onChange((a) => a.copyWith(values: a.values.where((v) => v.id != id).toList()));
  }

  void _toggleActive(String id) {
    widget.onChange((a) =>
        a.copyWith(values: a.values.map((v) => v.id == id ? v.copyWith(active: !v.active) : v).toList()));
  }

  void _makeDefault(String id) {
    widget.onChange((a) => a.copyWith(defaultValueId: id));
  }

  void _pickImageForValue(String id, int imageIndex) {
    widget.onChange((a) => a.copyWith(
        values: a.values
            .map((v) => v.id == id ? v.copyWith(imageIndex: imageIndex, imageUrl: null) : v)
            .toList()));
  }

  void _clearImageForValue(String id) {
    widget.onChange((a) =>
        a.copyWith(values: a.values.map((v) => v.id == id ? v.copyWith(imageIndex: null, imageUrl: null) : v).toList()));
  }

  void _toggleDifferentPrices(bool on) {
    widget.onChange((a) {
      if (!on) return disableChoiceAttributePricing(a);
      final active = getActiveProductChoiceValues(a);
      final defaultId = active.isNotEmpty ? active.first.id : null;
      final values = a.values.map((v) {
        if (v.id == defaultId) return v.copyWith(sellerPayoutAdjustment: 0, priceOverridden: false);
        return v.copyWith(sellerPayoutAdjustment: -widget.baseSellerPayout, priceOverridden: true);
      }).toList();
      return a.copyWith(allowDifferentPrices: true, defaultValueId: defaultId, values: values);
    });
  }

  @override
  Widget build(BuildContext context) {
    final attribute = _attr;
    final def = widget.definition;
    final activeCount = getActiveProductChoiceValues(attribute).length;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
              child:
                  Text(def.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13))),
          if (activeCount > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: activeCount > 1 ? AppPalette.of(context).infoFill : AppPalette.of(context).surfaceMuted,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(activeCount > 1 ? 'Buyer choice' : 'Fixed detail',
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: activeCount > 1 ? AppPalette.of(context).infoText : AppPalette.of(context).textSecondary)),
            ),
        ]),
        const SizedBox(height: 4),
        Text(_helperText, style: TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary, height: 1.3)),
        if (def.allowDifferentPrices) ...[
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
                child: Text(
                    attribute.allowDifferentPrices
                        ? 'Enter the full amount you want to receive for every option. One option sets the main listing price.'
                        : 'Optional. Keep this off to use the main listing price for every option.',
                    style: TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary))),
            Switch(value: attribute.allowDifferentPrices, onChanged: _toggleDifferentPrices),
          ]),
        ],
        if (def.predefinedValues.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final pv in def.predefinedValues)
                _chip(
                  label: pv.label,
                  selected: attribute.values.any((v) => v.id == pv.value),
                  colorHex: pv.colorHex,
                  onTap: () => _togglePredefined(pv),
                ),
            ],
          ),
        ],
        if (def.allowCustomValues) ...[
          const SizedBox(height: 10),
          _customAddRow(def),
        ],
        if (attribute.values.isNotEmpty) ...[
          const SizedBox(height: 10),
          for (final v in attribute.values)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: _ValueRow(
                value: v,
                isDefault: attribute.defaultValueId == v.id,
                allowDifferentPrices: attribute.allowDifferentPrices,
                visual: def.visual,
                images: widget.images,
                baseSellerPayout: widget.baseSellerPayout,
                onRemove: () => _removeValue(v.id),
                onToggleActive: () => _toggleActive(v.id),
                onMakeDefault: () => _makeDefault(v.id),
                onPickImage: (idx) => _pickImageForValue(v.id, idx),
                onClearImage: () => _clearImageForValue(v.id),
                onPayoutChange: (payout) => widget.onChoiceSellerPayoutChange(v.id, payout),
              ),
            ),
        ],
      ]),
    );
  }

  Widget _customAddRow(AttributeDefinition def) {
    if (_slug == 'dimensions') {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: _numField(_lengthCtrl, 'Length')),
          const SizedBox(width: 6),
          Expanded(child: _numField(_widthCtrl, 'Width')),
          const SizedBox(width: 6),
          Expanded(child: _numField(_heightCtrl, 'Height')),
        ]),
        const SizedBox(height: 6),
        Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton(onPressed: _addDimensions, child: const Text('Add'))),
      ]);
    }
    if (def.inputType == AttributeInputType.color) {
      // Web parity (product-choice-definition-editor.tsx:264-296): the row of
      // NAMED chips above is the subcategory's predefined values, and this is
      // the custom row — an `<input type="color">`, a name field and Add.
      // Mobile also carried a strip of unlabelled swatches here, which had no
      // web counterpart and only existed because there was no picker: a bare
      // circle says neither what the colour is called nor what tapping it
      // does, and every one of them is now reachable from the picker.
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          _CustomColorButton(
            hex: _pickedColorHex,
            onPicked: (hex) => setState(() => _pickedColorHex = hex),
          ),
          const SizedBox(width: 8),
          Expanded(
              child: TextField(
            controller: _customCtrl,
            decoration: const InputDecoration(
                isDense: true,
                labelText: 'Value name',
                hintText: 'Name this colour',
                border: OutlineInputBorder()),
          )),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: () => _addCustom(colorHex: _pickedColorHex),
            child: const Text('Add'),
          ),
        ]),
      ]);
    }
    if (def.inputType == AttributeInputType.numberUnit) {
      final isAge = _slug == 'age';
      return Row(children: [
        Expanded(
            flex: 2,
            child: TextField(
              controller: _customCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(isDense: true, labelText: 'Amount', border: OutlineInputBorder()),
            )),
        const SizedBox(width: 6),
        Expanded(
          flex: 2,
          child: isAge
              ? DropdownButtonFormField<String>(
                  value: _ageUnit,
                  isExpanded: true,
                  decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()),
                  items: [for (final u in _ageUnits) DropdownMenuItem(value: u, child: Text(u))],
                  onChanged: (v) => setState(() => _ageUnit = v ?? _ageUnits[0]),
                )
              : TextField(
                  controller: _unitCtrl,
                  decoration:
                      const InputDecoration(isDense: true, labelText: 'Unit', border: OutlineInputBorder()),
                ),
        ),
        const SizedBox(width: 8),
        OutlinedButton(
          onPressed: () {
            final amount = _customCtrl.text.trim();
            if (amount.isEmpty) return;
            final unit = isAge ? _ageUnit : _unitCtrl.text.trim();
            _addCustom(labelOverride: unit.isEmpty ? amount : '$amount $unit', unit: unit.isEmpty ? null : unit);
          },
          child: const Text('Add'),
        ),
      ]);
    }
    return Row(children: [
      Expanded(
          child: TextField(
        controller: _customCtrl,
        decoration: const InputDecoration(isDense: true, labelText: 'Add a value', border: OutlineInputBorder()),
        onSubmitted: (_) => _addCustom(),
      )),
      const SizedBox(width: 8),
      OutlinedButton(onPressed: () => _addCustom(), child: const Text('Add')),
    ]);
  }

  Widget _numField(TextEditingController c, String label) => TextField(
        controller: c,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(isDense: true, labelText: label, border: const OutlineInputBorder()),
      );

  Widget _chip({required String label, required bool selected, String? colorHex, required VoidCallback onTap}) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brandBlue.withValues(alpha: 0.08)
                : AppPalette.of(context).surface,
            border: Border.all(color: selected ? AppColors.brandBlue : AppPalette.of(context).border, width: selected ? 1.6 : 1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (colorHex != null) ...[
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(color: _parseHex(colorHex), shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
            ],
            if (selected) ...[
              Icon(Icons.check, size: 13, color: AppPalette.of(context).accentInk),
              const SizedBox(width: 4),
            ],
            Text(label,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    color: selected
                        ? AppPalette.of(context).accentInk
                        : AppPalette.of(context).textPrimary)),
          ]),
        ),
      );
}

Color _parseHex(String hex) {
  var h = hex.replaceAll('#', '');
  if (h.length == 6) h = 'FF$h';
  return Color(int.tryParse(h, radix: 16) ?? 0xFFCCCCCC);
}

class _ValueRow extends StatelessWidget {
  final ProductChoiceValue value;
  final bool isDefault;
  final bool allowDifferentPrices;
  final bool visual;
  final List<PendingImage> images;
  final double baseSellerPayout;
  final VoidCallback onRemove;
  final VoidCallback onToggleActive;
  final VoidCallback onMakeDefault;
  final ValueChanged<int> onPickImage;
  final VoidCallback onClearImage;
  final ValueChanged<double> onPayoutChange;
  const _ValueRow({
    required this.value,
    required this.isDefault,
    required this.allowDifferentPrices,
    required this.visual,
    required this.images,
    required this.baseSellerPayout,
    required this.onRemove,
    required this.onToggleActive,
    required this.onMakeDefault,
    required this.onPickImage,
    required this.onClearImage,
    required this.onPayoutChange,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppPalette.of(context).background,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (value.colorHex != null) ...[
            Container(
                width: 14, height: 14, decoration: BoxDecoration(color: _parseHex(value.colorHex!), shape: BoxShape.circle)),
            const SizedBox(width: 6),
          ],
          Expanded(
              child: Text(
            value.unit != null && !value.label.contains(value.unit!) ? '${value.label} ${value.unit}' : value.label,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5),
          )),
          if (isDefault && allowDifferentPrices)
            Container(
              margin: const EdgeInsets.only(right: 6),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: AppPalette.of(context).successFill, borderRadius: BorderRadius.circular(20)),
              child: Text('Default price', style: TextStyle(fontSize: 9, color: AppPalette.of(context).successText, fontWeight: FontWeight.w700)),
            ),
          if (allowDifferentPrices && !isDefault)
            TextButton(
              style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 24)),
              onPressed: value.active ? onMakeDefault : null,
              child: const Text('Make default', style: TextStyle(fontSize: 11)),
            ),
          Switch(value: value.active, onChanged: (_) => onToggleActive()),
          IconButton(
              icon: const Icon(Icons.close, size: 16),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              onPressed: onRemove),
        ]),
        if (visual && images.isNotEmpty) ...[
          const SizedBox(height: 6),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (var i = 0; i < images.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: InkWell(
                      key: ValueKey('choice-value-${value.id}-image-$i'),
                      onTap: () => value.imageIndex == i ? onClearImage() : onPickImage(i),
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                              color: value.imageIndex == i ? AppColors.brandBlue : AppPalette.of(context).border,
                              width: value.imageIndex == i ? 2 : 1),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(5),
                          child: Image.memory(images[i].bytes, fit: BoxFit.cover),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
        if (allowDifferentPrices) ...[
          const SizedBox(height: 6),
          _PayoutField(
            initial: getChoiceSellerPayout(baseSellerPayout, value),
            onChanged: onPayoutChange,
          ),
        ],
      ]),
    );
  }
}

class _PayoutField extends StatefulWidget {
  final double initial;
  final ValueChanged<double> onChanged;
  const _PayoutField({required this.initial, required this.onChanged});

  @override
  State<_PayoutField> createState() => _PayoutFieldState();
}

class _PayoutFieldState extends State<_PayoutField> {
  late final TextEditingController _ctrl =
      TextEditingController(text: widget.initial > 0 ? widget.initial.toStringAsFixed(0) : '');
  final _focus = FocusNode();

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_focus.hasFocus) {
      final text = widget.initial > 0 ? widget.initial.toStringAsFixed(0) : '';
      if (_ctrl.text != text) _ctrl.text = text;
    }
    return TextField(
      controller: _ctrl,
      focusNode: _focus,
      keyboardType: TextInputType.number,
      decoration: const InputDecoration(
          isDense: true, labelText: 'You receive for this option (TZS)', border: OutlineInputBorder()),
      onChanged: (v) {
        final d = double.tryParse(v.replaceAll(',', ''));
        if (d != null) widget.onChanged(d);
      },
    );
  }
}

/// The web's `<input type="color">`: a swatch that opens a full picker.
///
/// Shows the colour currently chosen — a preset tapped above, or whatever
/// came back from the picker — and a colour-wheel hint while nothing is
/// chosen, so it reads as a control rather than as another preset.
class _CustomColorButton extends StatelessWidget {
  const _CustomColorButton({required this.hex, required this.onPicked});

  final String? hex;
  final ValueChanged<String> onPicked;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final chosen = hex == null ? null : _parseHex(hex!);
    return InkWell(
      key: const ValueKey('choice-custom-colour'),
      borderRadius: BorderRadius.circular(8),
      onTap: () async {
        final picked = await showColorPickerSheet(context,
            initial: chosen ?? palette.textSecondary,
            title: 'Pick a colour');
        if (picked != null) onPicked(colorToHex(picked));
      },
      child: Container(
        width: 52,
        height: 44,
        decoration: BoxDecoration(
          color: chosen ?? palette.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: palette.borderStrong),
        ),
        child: chosen == null
            ? Icon(Icons.colorize_outlined,
                size: 18, color: palette.textSecondary)
            : null,
      ),
    );
  }
}


/// One property fact as a single value (web product-choice-definition-editor
/// `singleValue`): counts 1-9 then 10+, times from a clock, anything else
/// from the definition's list.
class _PropertyDetailPicker extends StatelessWidget {
  const _PropertyDetailPicker({
    required this.definition,
    required this.attribute,
    required this.required,
    required this.onPick,
  });

  final AttributeDefinition definition;
  final ProductChoiceAttribute? attribute;
  final bool required;
  final ValueChanged<String?> onPick;

  String get _current {
    final active = attribute?.values.where((v) => v.active).toList() ?? const [];
    return active.length == 1 ? active.first.label : '';
  }

  static String _clock(TimeOfDay t) =>
      '${t.hourOfPeriod == 0 ? 12 : t.hourOfPeriod}:${t.minute.toString().padLeft(2, '0')} '
      '${t.period == DayPeriod.am ? 'AM' : 'PM'}';

  static TimeOfDay? _parse(String label) {
    final m = RegExp(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', caseSensitive: false)
        .firstMatch(label.trim());
    if (m == null) return null;
    final h = int.parse(m.group(1)!) % 12 +
        (m.group(3)!.toUpperCase() == 'PM' ? 12 : 0);
    return TimeOfDay(hour: h, minute: int.parse(m.group(2)!));
  }

  @override
  Widget build(BuildContext context) {
    final name = definition.name;
    final label = '${stayDetailLabel(name)}${required ? ' *' : ''}';
    final current = _current;
    final key = ValueKey('property-detail-${definition.attributeDefinitionId}');
    if (isStayTimeDetail(name)) {
      return OutlinedButton.icon(
        key: key,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          alignment: Alignment.centerLeft,
          foregroundColor: AppPalette.of(context).textPrimary,
        ),
        onPressed: () async {
          final picked = await showTimePicker(
            context: context,
            initialTime: _parse(current) ??
                TimeOfDay(hour: name.toLowerCase().startsWith('check-in') ? 14 : 10, minute: 0),
          );
          if (picked != null) onPick(_clock(picked));
        },
        icon: const Icon(Icons.schedule, size: 18),
        label: Text(current.isEmpty ? label : '$label: $current'),
      );
    }
    final options = <String>[
      if (isStayCountDetail(name)) ...[
        ...definition.predefinedValues
            .map((v) => v.label)
            .where((l) => !RegExp(r'^\d+\+?(?: Guests?)?$', caseSensitive: false)
                .hasMatch(l)),
        ...stayCountOptions(name),
      ] else
        ...definition.predefinedValues.map((v) => v.label),
    ];
    if (current.isNotEmpty && !options.contains(current)) options.add(current);
    return DropdownButtonFormField<String>(
      key: key,
      value: current.isEmpty ? null : current,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        filled: true,
        fillColor: AppPalette.of(context).surface,
      ),
      items: [
        for (final o in options)
          DropdownMenuItem(
              value: o,
              child: Text(o, overflow: TextOverflow.ellipsis)),
      ],
      onChanged: onPick,
    );
  }
}
