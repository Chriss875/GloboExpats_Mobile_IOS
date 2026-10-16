import 'package:flutter/material.dart';

import '../currency_controller.dart';
import '../domain/currency.dart';
import '../theme.dart';

/// The header's currency switcher — web parity
/// `components/currency-toggle.tsx`, which the desktop header carries in its
/// utility row and in its compact phone header.
///
/// The app bar used to hold a Tanzanian flag with a tooltip and no behaviour,
/// because mobile had no currency state to switch. It now opens the same list
/// the web does: flag, code, name and the indicative rate, with the shopper's
/// pick remembered across restarts.
class CurrencyToggle extends StatelessWidget {
  const CurrencyToggle({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: CurrencyController.instance,
      builder: (context, _) {
        final currency = CurrencyController.instance.currency;
        return Tooltip(
          message: 'Change currency · ${currency.name}',
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => showCurrencyPicker(context),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(currency.flag, style: const TextStyle(fontSize: 16)),
                const SizedBox(width: 5),
                Text(currency.code,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w700)),
                const Icon(Icons.keyboard_arrow_down_rounded,
                    size: 16, color: Colors.white70),
              ]),
            ),
          ),
        );
      },
    );
  }
}

Future<void> showCurrencyPicker(BuildContext context) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppPalette.of(context).surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => const _CurrencySheet(),
    );

class _CurrencySheet extends StatefulWidget {
  const _CurrencySheet();

  @override
  State<_CurrencySheet> createState() => _CurrencySheetState();
}

class _CurrencySheetState extends State<_CurrencySheet> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Currency> get _matches {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return kCurrencies;
    return kCurrencies
        .where((c) =>
            c.code.toLowerCase().contains(q) ||
            c.name.toLowerCase().contains(q))
        .toList();
  }

  /// What one unit of [c] is worth in TZS — the direction the web's rate line
  /// reads, and the way a shopper thinks about it.
  String _rateLine(Currency c) {
    if (c.code == baseCurrencyCode) return 'Base currency';
    return '1 ${c.code} = ${formatMoney(toTzs(1, c.code), baseCurrencyCode)}';
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final selected = CurrencyController.instance.code;

    return SafeArea(
      child: Padding(
        padding:
            EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * .7,
          child: Column(children: [
            const SizedBox(height: 10),
            Container(
              width: 38,
              height: 4,
              decoration: BoxDecoration(
                  color: palette.border,
                  borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              child: Row(children: [
                const Expanded(
                  child: Text('Select currency',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, size: 20),
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _search,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'Search currency...',
                  isDense: true,
                  prefixIcon:
                      Icon(Icons.search, size: 18, color: palette.textMuted),
                  filled: true,
                  fillColor: palette.surfaceMuted,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: palette.border)),
                  enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: palette.border)),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Expanded(
              child: ListView.builder(
                itemCount: _matches.length,
                itemBuilder: (context, i) {
                  final c = _matches[i];
                  final isSelected = c.code == selected;
                  return ListTile(
                    onTap: () async {
                      await CurrencyController.instance.select(c.code);
                      if (context.mounted) Navigator.of(context).pop();
                    },
                    selected: isSelected,
                    selectedTileColor: palette.infoFill,
                    leading: Text(c.flag, style: const TextStyle(fontSize: 22)),
                    title: Text(c.code,
                        style: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w700)),
                    subtitle: Text('${c.name}\n${_rateLine(c)}',
                        style: TextStyle(
                            fontSize: 11.5, color: palette.textSecondary)),
                    isThreeLine: true,
                    trailing: isSelected
                        ? Icon(Icons.check_rounded,
                            size: 20, color: palette.successText)
                        : null,
                  );
                },
              ),
            ),
            // The rates are indicative and static (the same table the web
            // ships), and Selcom only ever collects TZS. Saying so is the
            // difference between a helpful guide and a price the buyer
            // believes they can pay in.
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
              decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: palette.border))),
              child: Text(
                'Converted prices are a guide only. Orders are charged in '
                'Tanzanian Shillings.',
                style: TextStyle(fontSize: 11, color: palette.textSecondary),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
