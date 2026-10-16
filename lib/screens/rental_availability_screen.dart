import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../domain/rentals.dart';
import '../auth/auth_store.dart';
import '../theme.dart';
import '../widgets/skeleton_loader.dart';

/// Phase 1, unit 3/4: the owner's availability editor for a rental listing.
///
/// Two kinds of unavailable dates share one calendar and are deliberately kept
/// visually distinct: nights a guest has already booked (read-only — the owner
/// cannot un-book a guest from here) and ranges the owner has closed off, which
/// are theirs to add and remove.
///
/// LISTIN-29 parity (web `seller-rental-calendar-dialog.tsx` +
/// `rental-date-range-calendar.tsx`): a month-grid calendar with a
/// 'Booked from' / 'Available again' pair, the seller-only explainer copy, the
/// `bookedToday`/`availableFrom` status line, and labelled closed-range cards.
class RentalAvailabilityScreen extends StatefulWidget {
  const RentalAvailabilityScreen({
    super.key,
    required this.productId,
    this.title,
    this.api,
  });

  final int productId;

  /// The listing's own title, so the screen names what it is editing.
  final String? title;
  final ApiClient? api;

  @override
  State<RentalAvailabilityScreen> createState() =>
      _RentalAvailabilityScreenState();
}

class _RentalAvailabilityScreenState extends State<RentalAvailabilityScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();

  List<RentalCalendarBlock> _blocks = const [];
  RentalAvailability? _availability;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  // Grid selection: the web calendar walks a 'check-in' then 'checkout' step.
  // For an owner block the start is the first closed night and the end is the
  // 'Available again' day (the stored exclusive end).
  DateTime? _selStart;
  DateTime? _selEnd;
  late DateTime _visibleMonth;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _visibleMonth = DateTime(now.year, now.month, 1);
    _load();
  }

  Future<void> _load() async {
    final token = AuthStore.instance?.token;
    if (token == null) {
      setState(() {
        _loading = false;
        _error = 'Sign in to manage this listing.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Booked nights are advisory context; a failure there must not stop the
      // owner editing their own blocks, so it is fetched separately.
      final blocks = await _api.listRentalBlocks(widget.productId, token);
      final availability = await _api.fetchRentalAvailability(widget.productId);
      if (!mounted) return;
      setState(() {
        _blocks = blocks;
        _availability = availability;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  bool _isBooked(DateTime day) {
    final booked = _availability?.bookedRanges ?? const <RentalDateRange>[];
    return booked.any((r) => r.covers(day));
  }

  DateTime _today() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  /// Web `chooseDate` (rental-date-range-calendar.tsx:107-141) adapted for
  /// owner-closed ranges: pick a start night, then an 'Available again' day.
  void _chooseDate(DateTime day) {
    final today = _today();
    if (day.isBefore(today)) return;
    if (_isBooked(day)) return;
    if (_selStart == null || _selEnd != null) {
      setState(() {
        _selStart = day;
        _selEnd = null;
      });
      return;
    }
    final start = _selStart!;
    if (!day.isAfter(start)) {
      // Re-picking on/before the start restarts the selection (web parity).
      setState(() {
        _selStart = day;
        _selEnd = null;
      });
      return;
    }
    // Refuse a range that swallows an existing booking or an already-closed
    // block (mirrors the web's rangeContainsBookedDate guard).
    final occupied = [
      ...(_availability?.bookedRanges ?? const <RentalDateRange>[]),
      ..._blocks.map((b) => b.range),
    ];
    if (rentalRangeOverlaps(start, day, occupied)) {
      _say('That range includes a booked or already-closed date, so it cannot '
          'be reserved.');
      return;
    }
    setState(() => _selEnd = day);
  }

  Future<void> _submitReserve() async {
    final token = AuthStore.instance?.token;
    final start = _selStart;
    final end = _selEnd;
    if (token == null || start == null || end == null) return;

    final booked = _availability?.bookedRanges ?? const <RentalDateRange>[];
    if (rentalRangeOverlaps(start, end, booked)) {
      _say('Those dates include a booking, so they cannot be closed.');
      return;
    }
    setState(() => _busy = true);
    try {
      final block = await _api.createRentalBlock(
        widget.productId,
        token,
        startDate: start,
        endDate: end,
      );
      if (!mounted) return;
      setState(() {
        _blocks = [..._blocks, block]
          ..sort((a, b) => a.startDate.compareTo(b.startDate));
        _selStart = null;
        _selEnd = null;
        _busy = false;
      });
      _say('Dates reserved. Buyers can no longer select that date range.');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _say(e.message);
    }
  }

  Future<void> _removeBlock(RentalCalendarBlock block) async {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    setState(() => _busy = true);
    try {
      await _api.deleteRentalBlock(
          widget.productId, block.rentalCalendarBlockId, token);
      if (!mounted) return;
      setState(() {
        _blocks = _blocks
            .where((b) => b.rentalCalendarBlockId != block.rentalCalendarBlockId)
            .toList();
        _busy = false;
      });
      _say('Dates available again');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _say(e.message);
    }
  }

  void _say(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  /// `05/01/2026 - 08/01/2026 · 3 nights`, with the stored exclusive end shown
  /// as the checkout day it is.
  String _rangeLabel(DateTime start, DateTime end) {
    final nights = rentalCalendarDayCount(
      startDate: start,
      endDate: end,
      ratePeriod: RentalRatePeriod.night,
    );
    final unit = nights == 1 ? 'night' : 'nights';
    return '${formatRentalDate(start)} - ${formatRentalDate(end)}  ·  $nights $unit';
  }

  void _shiftMonth(int delta) {
    setState(() {
      _visibleMonth = DateTime(
          _visibleMonth.year, _visibleMonth.month + delta, 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    final booked = _availability?.bookedRanges ?? const <RentalDateRange>[];
    final availability = _availability;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Availability'),
        bottom: _busy
            ? const PreferredSize(
                preferredSize: Size.fromHeight(2),
                child: LinearProgressIndicator(minHeight: 2),
              )
            : null,
      ),
      body: _loading
          ? const FeedSkeleton(itemCount: 4)
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  if (widget.title != null) ...[
                    Text(
                      widget.title!,
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                  ],
                  _SellerOnlyExplainer(productName: widget.title),
                  const SizedBox(height: 16),
                  _statusRow(availability),
                  const SizedBox(height: 12),
                  _CalendarGrid(
                    visibleMonth: _visibleMonth,
                    today: _today(),
                    blocks: _blocks,
                    bookedRanges: booked,
                    selStart: _selStart,
                    selEnd: _selEnd,
                    onPick: _chooseDate,
                    onShift: _shiftMonth,
                  ),
                  const SizedBox(height: 12),
                  if (_selStart != null || _selEnd != null)
                    _SelectionSummary(
                      start: _selStart,
                      end: _selEnd,
                      onClear: () => setState(() {
                        _selStart = null;
                        _selEnd = null;
                      }),
                    ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: (_busy || _selStart == null || _selEnd == null)
                        ? null
                        : _submitReserve,
                    icon: const Icon(Icons.event_busy_outlined),
                    label: Text(_busy ? 'Reserving…' : 'Reserve dates'),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    _Banner(text: _error!, onRetry: _load),
                  ],
                  if (_blocks.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    const _SectionLabel('Dates you reserved'),
                    for (final block in _blocks)
                      Card(
                        margin: const EdgeInsets.only(top: 8),
                        child: ListTile(
                          leading: const Icon(Icons.event_busy_outlined),
                          title: Text(_rangeLabel(block.startDate, block.endDate)),
                          subtitle: Text(
                              'Booked from ${formatRentalDate(block.startDate)} · '
                              'Available again ${formatRentalDate(block.endDate)}'),
                          trailing: IconButton(
                            tooltip: 'Remove reserved dates from '
                                '${formatRentalDate(block.startDate)}',
                            icon: const Icon(Icons.close),
                            onPressed:
                                _busy ? null : () => _removeBlock(block),
                          ),
                        ),
                      ),
                  ],
                  if (booked.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    const _SectionLabel('Booked by guests'),
                    for (final range in booked)
                      Card(
                        margin: const EdgeInsets.only(top: 8),
                        child: ListTile(
                          leading: Icon(Icons.event_available_outlined,
                              color: AppPalette.of(context).accentInk),
                          title:
                              Text(_rangeLabel(range.startDate, range.endDate)),
                          subtitle: const Text('Cannot be reopened from here'),
                        ),
                      ),
                  ],
                ],
              ),
            ),
    );
  }

  /// `bookedToday`/`availableFrom` status line
  /// (web rental-date-range-calendar.tsx:213).
  Widget _statusRow(RentalAvailability? availability) {
    final String? status;
    if (availability == null) {
      status = 'Choose dates';
    } else if (availability.bookedToday) {
      status = 'Booked today; later dates may be open';
    } else if (availability.availableFrom != null) {
      status =
          'Available again from ${formatRentalDate(availability.availableFrom!)}';
    } else {
      status = 'Choose dates';
    }
    return Row(
      children: [
        Icon(Icons.calendar_month_outlined,
            size: 16, color: AppPalette.of(context).textSecondary),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            status,
            style: TextStyle(
                fontSize: 13, color: AppPalette.of(context).textSecondary),
          ),
        ),
      ],
    );
  }
}

class _SellerOnlyExplainer extends StatelessWidget {
  const _SellerOnlyExplainer({this.productName});
  final String? productName;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).infoFill,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFC7DFFB)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.visibility_off_outlined,
              size: 18, color: AppPalette.of(context).accentInk),
          const SizedBox(width: 10),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: TextStyle(
                    fontSize: 13, height: 1.35, color: AppPalette.of(context).textPrimary),
                children: [
                  const TextSpan(
                    text: 'Seller-only shortcut. ',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(
                    text: 'Only you can see this control. Block dates booked '
                        'outside GloboExpats for ${productName ?? 'this rental'}; '
                        'buyers will see them crossed out.',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A compact single-month calendar where the owner taps a 'Booked from' night
/// then an 'Available again' day (web `CalendarMonth`). Booked (guest) nights
/// are struck through in red; owner-closed nights are tinted amber.
class _CalendarGrid extends StatelessWidget {
  const _CalendarGrid({
    required this.visibleMonth,
    required this.today,
    required this.blocks,
    required this.bookedRanges,
    required this.selStart,
    required this.selEnd,
    required this.onPick,
    required this.onShift,
  });

  final DateTime visibleMonth;
  final DateTime today;
  final List<RentalCalendarBlock> blocks;
  final List<RentalDateRange> bookedRanges;
  final DateTime? selStart;
  final DateTime? selEnd;
  final ValueChanged<DateTime> onPick;
  final ValueChanged<int> onShift;

  static const _weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  bool _isBooked(DateTime d) => bookedRanges.any((r) => r.covers(d));
  bool _isClosed(DateTime d) => blocks.any((b) => b.range.covers(d));

  @override
  Widget build(BuildContext context) {
    final year = visibleMonth.year;
    final month = visibleMonth.month;
    final firstWeekday = DateTime(year, month, 1).weekday; // Mon=1..Sun=7
    final daysInMonth = DateTime(year, month + 1, 0).day;

    final cells = <DateTime?>[
      for (var i = 1; i < firstWeekday; i++) null,
      for (var d = 1; d <= daysInMonth; d++) DateTime(year, month, d),
    ];
    while (cells.length % 7 != 0) {
      cells.add(null);
    }

    final monthName = _monthLabel(visibleMonth);
    final canGoBack =
        visibleMonth.year > today.year || visibleMonth.month > today.month;

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppPalette.of(context).border),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Choose dates',
              style:
                  TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(
            'Booked nights are highlighted in red. The “Available again” day '
            'is the first night buyers can book again.',
            style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                tooltip: 'Previous month',
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.chevron_left),
                onPressed: canGoBack ? () => onShift(-1) : null,
              ),
              Text(monthName,
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w700)),
              IconButton(
                tooltip: 'Next month',
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.chevron_right),
                onPressed: () => onShift(1),
              ),
            ],
          ),
          Row(
            children: [
              for (final w in _weekdays)
                Expanded(
                  child: Center(
                    child: Text(w,
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: AppPalette.of(context).textSecondary)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          for (var r = 0; r < cells.length; r += 7) ...[
            Row(
              children: [
                for (var c = 0; c < 7; c++)
                  Expanded(child: _dayCell(context, cells[r + c])),
              ],
            ),
            const SizedBox(height: 2),
          ],
        ],
      ),
    );
  }

  Widget _dayCell(BuildContext context, DateTime? day) {
    if (day == null) return const SizedBox(height: 38);
    final booked = _isBooked(day);
    final closed = _isClosed(day);
    final past = day.isBefore(today);
    final isStart = selStart != null &&
        selStart!.year == day.year &&
        selStart!.month == day.month &&
        selStart!.day == day.day;
    final isEnd = selEnd != null &&
        selEnd!.year == day.year &&
        selEnd!.month == day.month &&
        selEnd!.day == day.day;
    final inRange = (selStart != null &&
        selEnd != null &&
        day.isAfter(selStart!) &&
        day.isBefore(selEnd!));
    final unavailable = past || booked;

    Color? bg;
    Color? fg;
    var strike = false;
    if (isStart || isEnd) {
      bg = AppColors.brandBlue;
      fg = Colors.white;
    } else if (booked) {
      bg = AppPalette.of(context).dangerFill;
      fg = const Color(0xFFB91C1C);
      strike = true;
    } else if (closed) {
      bg = const Color(0xFFFEF3C7);
      fg = const Color(0xFF92400E);
    } else if (inRange) {
      bg = AppPalette.of(context).infoFill;
      fg = AppColors.brandBlue;
    } else if (past) {
      fg = const Color(0xFF9CA3AF);
    } else {
      fg = AppColors.textPrimary;
    }

    return InkWell(
      onTap: unavailable ? null : () => onPick(day),
      borderRadius: BorderRadius.circular(20),
      child: SizedBox(
        height: 38,
        child: Center(
          child: Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: bg != null
                ? BoxDecoration(color: bg, shape: BoxShape.circle)
                : null,
            child: Text(
              '${day.day}',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                fontWeight:
                    (isStart || isEnd || booked) ? FontWeight.w700 : FontWeight.w400,
                color: fg,
                decoration: strike ? TextDecoration.lineThrough : null,
                decorationColor: const Color(0xFFB91C1C),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _monthLabel(DateTime m) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return '${months[m.month - 1]} ${m.year}';
  }
}

class _SelectionSummary extends StatelessWidget {
  const _SelectionSummary(
      {required this.start, required this.end, required this.onClear});
  final DateTime? start;
  final DateTime? end;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    String fmt(DateTime? d) =>
        d == null ? 'Add date' : formatRentalDate(d);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surfaceMuted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Row(
        children: [
          _chip('Booked from', fmt(start)),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 10),
            child: Icon(Icons.arrow_forward, size: 16, color: AppPalette.of(context).textSecondary),
          ),
          _chip('Available again', fmt(end)),
          const Spacer(),
          TextButton(onPressed: onClear, child: const Text('Clear')),
        ],
      ),
    );
  }

  Widget _chip(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
            style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                color: AppColors.textSecondary)),
        const SizedBox(height: 2),
        Text(value,
            style: const TextStyle(fontSize: 13, color: AppColors.textPrimary)),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: AppPalette.of(context).textSecondary,
        ),
      );
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text, required this.onRetry});
  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppPalette.of(context).dangerFill,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFF3C0C0)),
        ),
        child: Row(
          children: [
            Expanded(child: Text(text)),
            TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      );
}
