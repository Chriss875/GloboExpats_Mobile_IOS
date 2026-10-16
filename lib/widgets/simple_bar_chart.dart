import 'package:flutter/material.dart';

import '../theme.dart';

/// Minimal horizontal bar chart (no external dep) used for the analytics
/// trend cards. `entries` = label -> value; renders a bar per entry.
class SimpleBarChart extends StatelessWidget {
  final List<MapEntry<String, double>> entries;
  final double maxValue;
  const SimpleBarChart(this.entries, {super.key, double? maxValue})
      : maxValue = maxValue ?? 0;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(20),
        child: Center(child: Text('No data', style: TextStyle(color: Colors.grey))),
      );
    }
    final max = maxValue > 0 ? maxValue : entries.map((e) => e.value).fold(0.0, (a, b) => a > b ? a : b);
    return Column(
      children: [
        for (final e in entries)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                SizedBox(width: 84, child: Text(e.key, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: AppPalette.of(context).textSecondary))),
                Expanded(
                  child: Container(
                    height: 12,
                    alignment: Alignment.centerLeft,
                    decoration: BoxDecoration(color: AppPalette.of(context).background, borderRadius: BorderRadius.circular(6)),
                    child: FractionallySizedBox(
                      widthFactor: max == 0 ? 0 : (e.value / max).clamp(0.0, 1.0),
                      child: Container(
                        decoration: BoxDecoration(color: AppColors.brandBlue, borderRadius: BorderRadius.circular(6)),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(width: 40, child: Text(e.value.round().toString(), textAlign: TextAlign.right, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700))),
              ],
            ),
          ),
      ],
    );
  }
}
