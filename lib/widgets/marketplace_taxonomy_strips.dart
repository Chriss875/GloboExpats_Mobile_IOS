import 'package:flutter/material.dart';

import '../models/category.dart';
import '../theme.dart';

/// Web parity `components/browse/marketplace-taxonomy-strips.tsx`: the two
/// 36px-tall taxonomy rails that sit under the browse control row.
///
/// Row one is the category rail — a pinned "All categories" dropdown followed
/// by horizontally scrollable tabs, the selected one marked by a 2px underline
/// rather than a fill. Row two only exists once a category is chosen, and
/// renders its subcategories as rounded pills separated by hairline dividers.
class MarketplaceTaxonomyStrips extends StatefulWidget {
  const MarketplaceTaxonomyStrips({
    super.key,
    required this.categories,
    required this.selectedCategoryId,
    required this.selectedSubcategoryIds,
    required this.onSelectCategory,
    required this.onSelectSubcategory,
  });

  final List<Category> categories;
  final int? selectedCategoryId;

  /// Usually one; a "Shop by Preference" tile arrives with several, and every
  /// one of them is highlighted (web `selectedSubcategoryIds`).
  final List<int> selectedSubcategoryIds;
  final ValueChanged<int?> onSelectCategory;
  final ValueChanged<int?> onSelectSubcategory;

  static const _rail = 36.0;

  // The strip's palette, resolved per theme. These were static consts, which
  // is exactly why the browse top bar stayed white in dark mode.
  static Color _line(BuildContext c) => AppPalette.of(c).border;
  static Color _label(BuildContext c) => AppPalette.of(c).textPrimary;
  static Color _muted(BuildContext c) => AppPalette.of(c).textSecondary;
  static Color _accent(BuildContext c) => AppPalette.of(c).infoText;
  static Color _accentFill(BuildContext c) => AppPalette.of(c).infoFill;
  static Color _accentEdge(BuildContext c) => AppPalette.of(c).infoBorder;
  static Color _indicator(BuildContext c) =>
      Theme.of(c).colorScheme.primary;

  @override
  State<MarketplaceTaxonomyStrips> createState() =>
      _MarketplaceTaxonomyStripsState();
}

class _MarketplaceTaxonomyStripsState extends State<MarketplaceTaxonomyStrips> {
  final _selectedCategoryKey = GlobalKey();
  final _selectedSubcategoryKey = GlobalKey();

  int? get _firstSelectedSub => widget.selectedSubcategoryIds.isEmpty
      ? null
      : widget.selectedSubcategoryIds.first;

  List<Subcategory> get _subcategories {
    if (widget.selectedCategoryId == null) return const [];
    for (final c in widget.categories) {
      if (c.categoryId == widget.selectedCategoryId) return c.subcategories;
    }
    return const [];
  }

  @override
  void initState() {
    super.initState();
    _revealSelection();
  }

  @override
  void didUpdateWidget(covariant MarketplaceTaxonomyStrips old) {
    super.didUpdateWidget(old);
    final oldFirst = old.selectedSubcategoryIds.isEmpty
        ? null
        : old.selectedSubcategoryIds.first;
    if (old.selectedCategoryId != widget.selectedCategoryId ||
        oldFirst != _firstSelectedSub ||
        old.categories.length != widget.categories.length) {
      _revealSelection();
    }
  }

  /// Web `centerRailItem`: a selection made elsewhere (a Home tile, the
  /// filter sheet) is scrolled to the middle of its rail instead of sitting
  /// off-screen where nothing shows it is on.
  void _revealSelection() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      for (final key in [_selectedCategoryKey, _selectedSubcategoryKey]) {
        final ctx = key.currentContext;
        if (ctx == null) continue;
        Scrollable.ensureVisible(ctx,
            alignment: 0.5,
            duration: const Duration(milliseconds: 280),
            curve: Curves.easeOutCubic);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final categories = widget.categories;
    final selectedCategoryId = widget.selectedCategoryId;
    final selectedSubcategoryIds = widget.selectedSubcategoryIds;
    if (categories.isEmpty) return const SizedBox.shrink();
    final subs = _subcategories;
    final line = MarketplaceTaxonomyStrips._line(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        border: Border(
          top: BorderSide(color: line),
          bottom: BorderSide(color: line),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: MarketplaceTaxonomyStrips._rail,
            child: Row(children: [
              _TaxonomyMenuButton(
                label: 'All categories',
                highlighted: selectedCategoryId == null,
                entries: [
                  for (final c in categories)
                    (id: c.categoryId, name: c.categoryName)
                ],
                selectedIds: [
                  if (selectedCategoryId != null) selectedCategoryId
                ],
                showAllLabel: 'Show all categories',
                onSelected: widget.onSelectCategory,
              ),
              Expanded(
                // Built all at once (a few dozen tabs at most) so the
                // selected one always exists to be scrolled to.
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    for (final c in categories)
                      _CategoryTab(
                        key: c.categoryId == selectedCategoryId
                            ? _selectedCategoryKey
                            : null,
                        label: c.categoryName,
                        selected: c.categoryId == selectedCategoryId,
                        onTap: () => widget.onSelectCategory(c.categoryId),
                      ),
                  ]),
                ),
              ),
            ]),
          ),
          if (subs.isNotEmpty)
            DecoratedBox(
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: line)),
              ),
              child: SizedBox(
                height: MarketplaceTaxonomyStrips._rail,
                child: Row(children: [
                  _TaxonomyMenuButton(
                    label: 'All items',
                    highlighted: selectedSubcategoryIds.isEmpty,
                    entries: [
                      for (final s in subs)
                        (id: s.subcategoryId, name: s.subcategoryName)
                    ],
                    selectedIds: selectedSubcategoryIds,
                    showAllLabel: 'Show all items',
                    onSelected: widget.onSelectSubcategory,
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(children: [
                        for (final (i, s) in subs.indexed) ...[
                          if (i > 0)
                            Container(width: 1, height: 16, color: line),
                          _SubcategoryPill(
                            key: s.subcategoryId == _firstSelectedSub
                                ? _selectedSubcategoryKey
                                : null,
                            label: s.subcategoryName,
                            selected:
                                selectedSubcategoryIds.contains(s.subcategoryId),
                            // Web: tapping narrows to that one; tapping the
                            // only selected one clears it.
                            onTap: () {
                              final selected = selectedSubcategoryIds
                                  .contains(s.subcategoryId);
                              widget.onSelectSubcategory(
                                  selected && selectedSubcategoryIds.length == 1
                                      ? null
                                      : s.subcategoryId);
                            },
                          ),
                        ],
                      ]),
                    ),
                  ),
                ]),
              ),
            ),
        ],
      ),
    );
  }
}

/// The pinned "All …" dropdown at the head of a rail. Styled as the selected
/// tab (blue text + underline) while nothing in its rail is selected.
class _TaxonomyMenuButton extends StatelessWidget {
  const _TaxonomyMenuButton({
    required this.label,
    required this.highlighted,
    required this.entries,
    required this.selectedIds,
    required this.showAllLabel,
    required this.onSelected,
  });

  final String label;
  final bool highlighted;
  final List<({int id, String name})> entries;
  final List<int> selectedIds;
  final String showAllLabel;
  final ValueChanged<int?> onSelected;

  Future<void> _open(BuildContext context) async {
    final box = context.findRenderObject() as RenderBox?;
    if (box == null) return;
    final overlay =
        Overlay.of(context).context.findRenderObject() as RenderBox?;
    if (overlay == null) return;
    final origin = box.localToGlobal(Offset(0, box.size.height),
        ancestor: overlay);
    // A dismissed menu also resolves to null, so "show all" travels as a
    // sentinel rather than a null value — otherwise clearing the filter is
    // indistinguishable from tapping outside the menu.
    const showAll = -1;
    final picked = await showMenu<int>(
      context: context,
      position: RelativeRect.fromLTRB(
        origin.dx,
        origin.dy + 5,
        overlay.size.width - origin.dx,
        0,
      ),
      constraints: const BoxConstraints(minWidth: 220, maxWidth: 288),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: MarketplaceTaxonomyStrips._line(context)),
      ),
      items: [
        PopupMenuItem<int>(
          value: showAll,
          height: 40,
          child: Text(showAllLabel,
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: MarketplaceTaxonomyStrips._accent(context))),
        ),
        for (final e in entries)
          PopupMenuItem<int>(
            value: e.id,
            height: 40,
            child: Text(e.name,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: selectedIds.contains(e.id)
                      ? MarketplaceTaxonomyStrips._accent(context)
                      : MarketplaceTaxonomyStrips._label(context),
                )),
          ),
      ],
    );
    if (picked == null) return;
    onSelected(picked == showAll ? null : picked);
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => _open(context),
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: highlighted
            ? BoxDecoration(
                border: Border(
                    bottom: BorderSide(
                        color: MarketplaceTaxonomyStrips._indicator(context), width: 2)))
            : null,
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 144),
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: highlighted
                      ? MarketplaceTaxonomyStrips._accent(context)
                      : MarketplaceTaxonomyStrips._label(context),
                )),
          ),
          const SizedBox(width: 4),
          Icon(Icons.keyboard_arrow_down_rounded,
              size: 14,
              color: highlighted
                  ? MarketplaceTaxonomyStrips._accent(context)
                  : MarketplaceTaxonomyStrips._label(context)),
        ]),
      ),
    );
  }
}

class _CategoryTab extends StatelessWidget {
  const _CategoryTab(
      {super.key,
      required this.label,
      required this.selected,
      required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 36,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: selected
            ? BoxDecoration(
                border: Border(
                    bottom: BorderSide(
                        color: MarketplaceTaxonomyStrips._indicator(context), width: 2)))
            : null,
        child: Text(label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: selected
                  ? MarketplaceTaxonomyStrips._accent(context)
                  : MarketplaceTaxonomyStrips._label(context),
            )),
      ),
    );
  }
}

class _SubcategoryPill extends StatelessWidget {
  const _SubcategoryPill(
      {super.key,
      required this.label,
      required this.selected,
      required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Material(
        color: selected ? MarketplaceTaxonomyStrips._accentFill(context) : Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
          side: selected
              ? BorderSide(color: MarketplaceTaxonomyStrips._accentEdge(context))
              : BorderSide.none,
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Container(
            height: 32,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Text(label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: selected
                      ? MarketplaceTaxonomyStrips._accent(context)
                      : MarketplaceTaxonomyStrips._muted(context),
                )),
          ),
        ),
      ),
    );
  }
}
