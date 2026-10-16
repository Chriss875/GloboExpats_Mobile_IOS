import 'package:flutter/material.dart';

import '../domain/rental_calendar.dart';
import '../domain/rentals.dart';
import '../theme.dart';

/// The buyer's rental date picker — web parity with
/// `components/product-choices/rental-date-range-calendar.tsx` (one month on a
/// phone, as the web shows below its `sm` breakpoint).
///
/// Stateless about dates: the owner keeps the [selection] and applies
/// [onChanged]. The rules live in `domain/rental_calendar.dart`.
class RentalDateRangeCalendar extends StatefulWidget {
  const RentalDateRangeCalendar({
    super.key,
    required this.selection,
    required this.onChanged,
    required this.period,
    required this.today,
    this.availability,
    this.loading = false,
    this.loadFailed = false,
    this.enabled = true,
  });

  final RentalDateSelection selection;
  final ValueChanged<RentalDateSelection> onChanged;
  final RentalRatePeriod period;
  final DateTime today;
  final RentalAvailability? availability;
  final bool loading;
  final bool loadFailed;
  final bool enabled;

  @override
  State<RentalDateRangeCalendar> createState() =>
      _RentalDateRangeCalendarState();
}

class _RentalDateRangeCalendarState extends State<RentalDateRangeCalendar> {
  late DateTime _month =
      DateTime(widget.today.year, widget.today.month, 1);

  static const _weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July', //
    'August', 'September', 'October', 'November', 'December',
  ];
  static const _short = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  List<RentalDateRange> get _ranges =>
      widget.availability?.bookedRanges ?? const [];
  bool get _allowSameDay => widget.period == RentalRatePeriod.hour;

  void _choose(DateTime day) {
    if (!widget.enabled) return;
    widget.onChanged(chooseRentalDate(widget.selection, day,
        today: widget.today,
        ranges: _ranges,
        period: widget.period,
        allowSameDay: _allowSameDay));
  }

  String _shortDate(DateTime d) => '${_short[d.month - 1]} ${d.day}, ${d.year}';

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final sel = widget.selection;
    final step = sel.effectiveStep;
    final adjustable = isAdjustablePeriod(widget.period);
    final count = countSelectedPeriods(sel.start, sel.end, widget.period);
    final unit = widget.period == RentalRatePeriod.week ? 'week' : 'month';
    final canGoBack = _month.year > widget.today.year ||
        (_month.year == widget.today.year &&
            _month.month > widget.today.month);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.surface,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Choose dates',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 3),
          Text(
            _allowSameDay
                ? 'Booked dates are highlighted in red. Pickup and return can be on the same day.'
                : 'Booked nights are highlighted in red. Checkout is not counted as a booked night.',
            style: TextStyle(fontSize: 12, color: palette.textSecondary),
          ),
          if (adjustable) ...[
            const SizedBox(height: 4),
            Text('Choose a start date, then add or remove ${unit}s.',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: palette.accentInk)),
          ],
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: palette.surfaceMuted,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: palette.border),
            ),
            child: Row(children: [
              Expanded(
                child: _DateSummary(
                  key: const ValueKey('rental-check-in'),
                  label: 'Check-in',
                  value: sel.start == null ? null : _shortDate(sel.start!),
                  active: step == RentalSelectionStep.checkIn,
                  onTap: widget.enabled
                      ? () => widget.onChanged(
                          sel.withStep(RentalSelectionStep.checkIn))
                      : null,
                ),
              ),
              Expanded(
                child: _DateSummary(
                  key: const ValueKey('rental-checkout'),
                  label: 'Checkout',
                  value: sel.end == null ? null : _shortDate(sel.end!),
                  active: step == RentalSelectionStep.checkout,
                  onTap: widget.enabled && sel.start != null
                      ? () => widget.onChanged(
                          sel.withStep(RentalSelectionStep.checkout))
                      : null,
                ),
              ),
            ]),
          ),
          if (adjustable && sel.start != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
              decoration: BoxDecoration(
                color: palette.surfaceMuted,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: palette.border),
              ),
              child: Row(children: [
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Rental length',
                            style: TextStyle(
                                fontSize: 12, fontWeight: FontWeight.w700)),
                        Text('Checkout updates automatically',
                            style: TextStyle(
                                fontSize: 11, color: palette.textSecondary)),
                      ]),
                ),
                IconButton(
                  tooltip: 'Remove one $unit',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.remove, size: 18),
                  onPressed: widget.enabled && count > 1
                      ? () => widget.onChanged(setRentalPeriodCount(
                          sel, count - 1,
                          period: widget.period, ranges: _ranges))
                      : null,
                ),
                Text('$count $unit${count == 1 ? '' : 's'}',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700)),
                IconButton(
                  tooltip: 'Add one $unit',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.add, size: 18),
                  onPressed: widget.enabled &&
                          canUsePeriodCount(
                              sel.start!, widget.period, count + 1, _ranges)
                      ? () => widget.onChanged(setRentalPeriodCount(
                          sel, count + 1,
                          period: widget.period, ranges: _ranges))
                      : null,
                ),
              ]),
            ),
          ],
          const SizedBox(height: 8),
          Row(children: [
            IconButton(
              tooltip: 'Previous month',
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.chevron_left),
              onPressed: canGoBack
                  ? () => setState(() =>
                      _month = DateTime(_month.year, _month.month - 1, 1))
                  : null,
            ),
            Expanded(
              child: Column(children: [
                Text('${_months[_month.month - 1]} ${_month.year}',
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  widget.loading
                      ? 'Loading availability'
                      : widget.availability?.bookedToday == true
                          ? 'Booked today; later dates may be open'
                          : 'Tap a date to choose',
                  style: TextStyle(fontSize: 11, color: palette.textSecondary),
                ),
              ]),
            ),
            IconButton(
              tooltip: 'Next month',
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.chevron_right),
              onPressed: () => setState(
                  () => _month = DateTime(_month.year, _month.month + 1, 1)),
            ),
          ]),
          Row(children: [
            for (final w in _weekdays)
              Expanded(
                child: Center(
                  child: Text(w,
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: palette.textSecondary)),
                ),
              ),
          ]),
          const SizedBox(height: 4),
          ..._grid(context),
          if (widget.loadFailed) ...[
            const SizedBox(height: 6),
            Text(
                'Live booked dates could not be loaded. Your dates will still be checked before checkout.',
                style: TextStyle(fontSize: 12, color: palette.warningText)),
          ],
          if (sel.start != null || sel.end != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: widget.enabled
                    ? () => widget.onChanged(RentalDateSelection.empty)
                    : null,
                child: const Text('Clear dates'),
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _grid(BuildContext context) {
    final first = _month;
    final daysInMonth = DateTime(first.year, first.month + 1, 0).day;
    // Sunday-first like the web grid (DateTime.weekday: Mon=1..Sun=7).
    final leading = first.weekday % 7;
    final cells = <DateTime?>[
      for (var i = 0; i < leading; i++) null,
      for (var d = 1; d <= daysInMonth; d++)
        DateTime(first.year, first.month, d),
    ];
    while (cells.length % 7 != 0) {
      cells.add(null);
    }
    return [
      for (var r = 0; r < cells.length; r += 7)
        Row(children: [
          for (var c = 0; c < 7; c++) Expanded(child: _cell(context, cells[r + c])),
        ]),
    ];
  }

  Widget _cell(BuildContext context, DateTime? day) {
    if (day == null) return const SizedBox(height: 40);
    final palette = AppPalette.of(context);
    final sel = widget.selection;
    final booked = isBookedDay(day, _ranges);
    final past = day.isBefore(DateTime(
        widget.today.year, widget.today.month, widget.today.day));
    final isStart = sel.start == day;
    final isEnd = sel.end == day;
    final inRange = sel.start != null &&
        sel.end != null &&
        day.isAfter(sel.start!) &&
        day.isBefore(sel.end!);
    final unavailable = isUnavailableDay(day,
        today: widget.today,
        selection: sel,
        ranges: _ranges,
        allowSameDay: _allowSameDay);

    Color? bg;
    Color fg;
    if (isStart || isEnd) {
      bg = AppColors.brandBlue;
      fg = Colors.white;
    } else if (booked) {
      bg = palette.dangerFill;
      fg = palette.dangerText;
    } else if (inRange) {
      fg = palette.accentInk;
    } else if (past) {
      fg = palette.textSecondary.withValues(alpha: 0.55);
    } else {
      fg = palette.textPrimary;
    }

    final label = '${rentalDateToJson(day)}'
        '${booked ? ', booked' : ''}'
        '${isStart ? ', check-in' : ''}'
        '${isEnd ? ', checkout' : ''}';
    return Semantics(
      label: label,
      button: true,
      enabled: !unavailable,
      excludeSemantics: true,
      child: SizedBox(
        height: 40,
        child: Stack(alignment: Alignment.center, children: [
          if (inRange)
            Positioned.fill(
                child: ColoredBox(color: palette.infoFill)),
          if (isStart && sel.end != null && sel.end != sel.start)
            Positioned(
                left: 0,
                right: 0,
                top: 3,
                bottom: 3,
                child: FractionallySizedBox(
                    alignment: Alignment.centerRight,
                    widthFactor: .5,
                    child: ColoredBox(color: palette.infoFill))),
          if (isEnd && sel.start != null && sel.end != sel.start)
            Positioned(
                left: 0,
                right: 0,
                top: 3,
                bottom: 3,
                child: FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: .5,
                    child: ColoredBox(color: palette.infoFill))),
          InkWell(
            key: ValueKey('rental-day-${rentalDateToJson(day)}'),
            onTap: unavailable || !widget.enabled ? null : () => _choose(day),
            customBorder: const CircleBorder(),
            child: Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: bg != null
                  ? BoxDecoration(color: bg, shape: BoxShape.circle)
                  : null,
              child: Text(
                '${day.day}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: (isStart || isEnd || booked)
                      ? FontWeight.w700
                      : FontWeight.w400,
                  color: fg,
                  decoration: booked && !isStart && !isEnd
                      ? TextDecoration.lineThrough
                      : null,
                  decorationColor: palette.dangerText,
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

class _DateSummary extends StatelessWidget {
  const _DateSummary({
    super.key,
    required this.label,
    required this.value,
    required this.active,
    required this.onTap,
  });

  final String label;
  final String? value;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Opacity(
      opacity: onTap == null && !active ? .55 : 1,
      child: Material(
        color: active ? palette.surface : Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: active
              ? BorderSide(color: palette.textPrimary)
              : BorderSide.none,
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label.toUpperCase(),
                      style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          letterSpacing: .5,
                          color: palette.textSecondary)),
                  const SizedBox(height: 2),
                  Text(value ?? 'Add date',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 12.5,
                          color: value == null
                              ? palette.textSecondary
                              : palette.textPrimary)),
                ]),
          ),
        ),
      ),
    );
  }
}
