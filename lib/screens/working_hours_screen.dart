import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/account_setup.dart';
import '../domain/seller_schedule.dart';
import '../theme.dart';
import '../widgets/error_text.dart';
import '../widgets/skeleton_loader.dart';

/// Seller working hours — web `SellerScheduleForm` (the "When are you
/// open?" setup prompt and the Working hours section of the profile).
/// Buyers are only offered delivery windows inside these hours.
class WorkingHoursScreen extends StatelessWidget {
  const WorkingHoursScreen({super.key, this.api});
  final ApiClient? api;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Working hours')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          WorkingHoursSection(
            api: api,
            onSaved: () {
              if (Navigator.of(context).canPop()) Navigator.of(context).pop(true);
            },
          ),
        ],
      ),
    );
  }
}

/// The form itself, shared by [WorkingHoursScreen] and the Hours tab of
/// Profile information.
class WorkingHoursSection extends StatefulWidget {
  const WorkingHoursSection({super.key, this.api, this.onSaved});
  final ApiClient? api;
  final VoidCallback? onSaved;

  @override
  State<WorkingHoursSection> createState() => _WorkingHoursSectionState();
}

class _WorkingHoursSectionState extends State<WorkingHoursSection> {
  late final ApiClient _api =
      widget.api ?? AuthStore.instance?.api ?? ApiClient();

  SellerSchedule? _schedule;
  bool _configured = false;
  List<String> _zones = const [];
  Object? _loadError;
  String? _error;
  bool _saving = false;

  String? get _token => AuthStore.instance?.token;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = _token;
    if (token == null) {
      setState(() => _loadError = 'Please sign in to set your working hours.');
      return;
    }
    setState(() => _loadError = null);
    try {
      final status = await _api.getSellerSchedule(token);
      final raw = status['schedule'];
      if (!mounted) return;
      setState(() {
        _configured = status['configured'] == true;
        _schedule = raw is Map
            ? SellerSchedule.fromJson(raw.cast<String, dynamic>())
            : SellerSchedule.initial();
      });
    } catch (e) {
      if (mounted) setState(() => _loadError = e);
      return;
    }
    try {
      final zones = await _api.getSellerTimezones(token);
      if (mounted && zones.isNotEmpty) setState(() => _zones = zones);
    } catch (_) {
      // The current zone stays selectable on its own.
    }
  }

  void _set(SellerSchedule next) => setState(() {
        _schedule = next;
        _error = null;
      });

  Future<String?> _pickTime(String current, String help) async {
    final parts = current.split(':');
    final picked = await showTimePicker(
      context: context,
      helpText: help,
      initialTime: TimeOfDay(
          hour: int.tryParse(parts.first) ?? 9,
          minute: parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
        child: child!,
      ),
    );
    if (picked == null) return null;
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(picked.hour)}:${two(picked.minute)}';
  }

  Future<void> _pickZone() async {
    final s = _schedule!;
    final zones = _zones.isEmpty ? [s.timezone] : _zones;
    final picked = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _ZoneSheet(zones: zones, selected: s.timezone),
    );
    if (picked != null) _set(s.copyWith(timezone: picked));
  }

  Future<void> _addClosure() async {
    final s = _schedule!;
    final today = DateUtils.dateOnly(DateTime.now());
    final range = await showDateRangePicker(
      context: context,
      firstDate: today,
      lastDate: today.add(const Duration(days: 365)),
      helpText: 'Days you are closed',
      saveText: 'Add',
    );
    if (range == null) return;
    String key(DateTime d) =>
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final dates = {...s.closedDates};
    for (var d = range.start;
        !d.isAfter(range.end);
        d = DateTime(d.year, d.month, d.day + 1)) {
      dates.add(key(d));
    }
    _set(s.copyWith(closedDates: dates.toList()..sort()));
  }

  Future<void> _save() async {
    final s = _schedule;
    final token = _token;
    if (s == null || token == null || _saving) return;
    final problem = validateSchedule(s);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      await _api.saveSellerSchedule(token, s.toJson());
      AccountSetup.instance.markWorkingHours();
      if (!mounted) return;
      setState(() {
        _saving = false;
        _configured = true;
      });
      messenger?.showSnackBar(
          const SnackBar(content: Text('Working hours saved.')));
      widget.onSaved?.call();
    } on ApiException catch (e) {
      if (e.unauthorized) AuthStore.instance?.handleUnauthorized();
      if (mounted) {
        setState(() {
          _saving = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = 'Could not save your schedule. Please try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    if (_loadError != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Column(children: [
          Text(
              _loadError is String
                  ? _loadError as String
                  : 'Could not load your working hours: ${friendlyApiError(_loadError)}',
              textAlign: TextAlign.center,
              style: TextStyle(color: palette.textSecondary)),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _load, child: const Text('Try again')),
        ]),
      );
    }
    final s = _schedule;
    if (s == null) return const FeedSkeleton(itemCount: 3);

    return Column(
      key: const ValueKey('working-hours-form'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(children: [
          Icon(Icons.schedule_rounded, color: palette.accentInk),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
                _configured ? 'Your working hours' : 'When are you open?',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: palette.textPrimary)),
          ),
        ]),
        const SizedBox(height: 6),
        Text(
          'Buyers are only offered delivery times inside these hours, so '
          'every date they pick is one you can keep.',
          style: TextStyle(
              fontSize: 13.5, height: 1.4, color: palette.textSecondary),
        ),
        const SizedBox(height: 16),
        _Card(
          child: InkWell(
            key: const ValueKey('working-hours-timezone'),
            onTap: _saving ? null : _pickZone,
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(children: [
                Icon(Icons.public_rounded, color: palette.textSecondary),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Business timezone',
                          style: TextStyle(
                              fontSize: 12, color: palette.textSecondary)),
                      Text(s.timezone.replaceAll('_', ' '),
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: palette.textPrimary)),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: palette.textSecondary),
              ]),
            ),
          ),
        ),
        const SizedBox(height: 12),
        _Card(
          child: Column(children: [
            for (var i = 0; i < kWeekDays.length; i++) ...[
              if (i > 0) Divider(height: 1, color: palette.border),
              _DayRow(
                day: kWeekDays[i],
                hours: s.days[kWeekDays[i]],
                enabled: !_saving,
                onToggle: (open) => _set(s.withDay(kWeekDays[i],
                    open ? const WorkingHours('09:00', '17:00') : null)),
                onOpens: () async {
                  final h = s.days[kWeekDays[i]]!;
                  final t = await _pickTime(h.opens, 'Opens');
                  if (t != null) _set(s.withDay(kWeekDays[i], h.copyWith(opens: t)));
                },
                onCloses: () async {
                  final h = s.days[kWeekDays[i]]!;
                  final t = await _pickTime(h.closes, 'Closes');
                  if (t != null) {
                    _set(s.withDay(kWeekDays[i], h.copyWith(closes: t)));
                  }
                },
              ),
            ],
          ]),
        ),
        const SizedBox(height: 12),
        _Card(
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: Column(children: [
              SwitchListTile(
                key: const ValueKey('working-hours-holidays'),
                value: s.excludeTanzaniaPublicHolidays,
                onChanged: _saving
                    ? null
                    : (v) => _set(s.copyWith(excludeTanzaniaPublicHolidays: v)),
                title: const Text('Close on Tanzania public holidays',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                subtitle: const Text(
                    'Skip the 11 fixed-date holidays every year. Your weekly hours stay the same.'),
              ),
              ExpansionTile(
                title: Text('See included holidays',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: palette.accentInk)),
                childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                children: [
                  for (final (date, name) in kTanzaniaHolidays)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(children: [
                        Expanded(
                            child: Text(name,
                                style: TextStyle(
                                    fontSize: 12.5,
                                    color: palette.textSecondary))),
                        Text(date,
                            style: TextStyle(
                                fontSize: 12.5, color: palette.textSecondary)),
                      ]),
                    ),
                  const SizedBox(height: 6),
                  Text(
                      'Eid, Maulid and Easter are not included. Add them below as closed days.',
                      style:
                          TextStyle(fontSize: 12, color: palette.textSecondary)),
                ],
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        _Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Icon(Icons.event_busy_outlined,
                      size: 20, color: palette.textSecondary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text('Closed days',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 14.5,
                            color: palette.textPrimary)),
                  ),
                  TextButton.icon(
                    key: const ValueKey('working-hours-add-closure'),
                    onPressed: _saving ? null : _addClosure,
                    icon: const Icon(Icons.add_rounded, size: 18),
                    label: const Text('Add'),
                  ),
                ]),
                Text('Holidays, travel or stock-taking: no deliveries on these days.',
                    style:
                        TextStyle(fontSize: 12.5, color: palette.textSecondary)),
                if (s.closedDates.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Wrap(spacing: 6, runSpacing: 6, children: [
                    for (final d in s.closedDates)
                      InputChip(
                        label: Text(d),
                        onDeleted: _saving
                            ? null
                            : () => _set(s.copyWith(
                                closedDates: [...s.closedDates]..remove(d))),
                      ),
                  ]),
                ],
              ],
            ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: palette.dangerFill,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(_error!,
                style: TextStyle(
                    color: palette.dangerTextStrong,
                    fontWeight: FontWeight.w600)),
          ),
        ],
        const SizedBox(height: 12),
        Text(
          'New orders use your saved hours. Existing orders keep their agreed '
          'schedule. Production is completed before delivery begins.',
          style: TextStyle(fontSize: 12, color: palette.textSecondary),
        ),
        const SizedBox(height: 14),
        FilledButton(
          key: const ValueKey('working-hours-save'),
          onPressed: _saving ? null : _save,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brandBlue,
            minimumSize: const Size.fromHeight(50),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: _saving
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.4))
              : const Text('Save working hours',
                  style: TextStyle(fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

class _DayRow extends StatelessWidget {
  const _DayRow({
    required this.day,
    required this.hours,
    required this.enabled,
    required this.onToggle,
    required this.onOpens,
    required this.onCloses,
  });
  final String day;
  final WorkingHours? hours;
  final bool enabled;
  final ValueChanged<bool> onToggle;
  final VoidCallback onOpens;
  final VoidCallback onCloses;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final h = hours;
    Widget time(String label, String value, VoidCallback onTap, Key key) =>
        Expanded(
          child: OutlinedButton(
            key: key,
            onPressed: enabled ? onTap : null,
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
            child: Row(children: [
              Text(label,
                  style: TextStyle(fontSize: 12, color: palette.textSecondary)),
              const Spacer(),
              Text(value,
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: palette.textPrimary)),
            ]),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
      child: Column(children: [
        Row(children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(dayName(day),
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: palette.textPrimary)),
                Text(
                    h == null
                        ? 'Closed'
                        : h.overnight
                            ? 'Open, closes the next day'
                            : 'Accepting orders',
                    style: TextStyle(
                        fontSize: 12.5,
                        color: h == null
                            ? palette.textSecondary
                            : palette.successText)),
              ],
            ),
          ),
          Switch(
            key: ValueKey('working-hours-$day'),
            value: h != null,
            onChanged: enabled ? onToggle : null,
          ),
        ]),
        if (h != null)
          Padding(
            padding: const EdgeInsets.only(top: 6, right: 6, bottom: 4),
            child: Row(children: [
              time('Opens', h.opens, onOpens, ValueKey('working-hours-$day-opens')),
              const SizedBox(width: 8),
              time('Closes', h.closes, onCloses,
                  ValueKey('working-hours-$day-closes')),
            ]),
          ),
      ]),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Container(
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(type: MaterialType.transparency, child: child),
    );
  }
}

class _ZoneSheet extends StatefulWidget {
  const _ZoneSheet({required this.zones, required this.selected});
  final List<String> zones;
  final String selected;

  @override
  State<_ZoneSheet> createState() => _ZoneSheetState();
}

class _ZoneSheetState extends State<_ZoneSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final q = _query.trim().toLowerCase().replaceAll(' ', '_');
    final rows = widget.zones.where((z) => z.toLowerCase().contains(q)).toList();
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.8,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                hintText: 'Search city or region',
                isDense: true,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: EdgeInsets.only(
                  bottom: MediaQuery.of(context).viewInsets.bottom),
              itemCount: rows.length,
              itemBuilder: (context, i) {
                final z = rows[i];
                final on = z == widget.selected;
                return ListTile(
                  dense: true,
                  title: Text(z.replaceAll('_', ' '),
                      style: TextStyle(
                          fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                          color: palette.textPrimary)),
                  trailing: on
                      ? Icon(Icons.check_rounded, color: palette.accentInk)
                      : null,
                  onTap: () => Navigator.pop(context, z),
                );
              },
            ),
          ),
        ]),
      ),
    );
  }
}
