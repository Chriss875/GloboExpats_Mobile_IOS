import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../domain/rentals.dart';
import '../models/order.dart';
import '../theme.dart';

/// Rental and short-stay pieces of the order cards and order detail — web
/// 2026-10 (`RentalBookingSummary variant="order"`, the dashboard's
/// `RentalCounterparty`, `getRentalStageLabel`, `RentalHandoffCodeCard`).

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

String _day(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

/// Check-in / checkout (pickup / return for a vehicle) side by side, with
/// their times, under a "Your stay" / "Guest stay" heading.
class RentalStayDates extends StatelessWidget {
  const RentalStayDates({
    super.key,
    required this.rental,
    this.perspective = 'buyer',
  });

  final RentalPresentation rental;
  final String perspective;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final b = rental.booking;
    final start = parseRentalDate(b['startDate']);
    final end = parseRentalDate(b['endDate']);
    final units = (b['billableUnits'] as num?)?.toInt();
    final period = '${b['ratePeriod'] ?? ''}'.toLowerCase();
    final heading = rental.isShortStay
        ? (perspective == 'seller' ? 'Guest stay' : 'Your stay')
        : 'Rental booking';
    Widget side(String label, DateTime? date, dynamic time, IconData icon) =>
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: palette.background,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: palette.border),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(icon, size: 14, color: palette.textSecondary),
                const SizedBox(width: 4),
                Text(label,
                    style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: palette.textSecondary)),
              ]),
              const SizedBox(height: 4),
              Text(date == null ? '—' : _day(date),
                  style: const TextStyle(
                      fontSize: 13.5, fontWeight: FontWeight.w800)),
              if ('${time ?? ''}'.trim().isNotEmpty)
                Text('$time',
                    style: TextStyle(fontSize: 12, color: palette.textSecondary)),
            ]),
          ),
        );
    return Column(
      key: const ValueKey('rental-stay-dates'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(
            child: Text(heading,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: palette.textSecondary)),
          ),
          if (units != null && units > 0 && period.isNotEmpty)
            Text('$units $period${units == 1 ? '' : 's'}',
                style: TextStyle(fontSize: 12, color: palette.textSecondary)),
        ]),
        const SizedBox(height: 6),
        Row(children: [
          side(rental.startLabel, start, b['pickupTime'], Icons.login_rounded),
          const SizedBox(width: 8),
          side(rental.endLabel, end, b['returnTime'], Icons.logout_rounded),
        ]),
      ],
    );
  }
}

/// The booking's stage in one pill — "Awaiting host confirmation",
/// "Stay in progress"… (web `getRentalStageLabel`).
class RentalStageChip extends StatelessWidget {
  const RentalStageChip({super.key, required this.rental, required this.status});
  final RentalPresentation rental;
  final String? status;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Container(
      key: const ValueKey('rental-stage-chip'),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: palette.infoFill,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(rental.stageLabel(status),
          style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: palette.accentInk)),
    );
  }
}

/// The other side of a paid rental, with a tap-to-call phone: the host or
/// provider for the guest, the guest or renter for the host.
class RentalCounterparty extends StatelessWidget {
  const RentalCounterparty(
      {super.key, required this.label, this.name, this.phone});
  final String label;
  final String? name;
  final String? phone;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final shown = (name ?? '').trim().isEmpty ? label : name!.trim();
    return Row(
      key: const ValueKey('rental-counterparty'),
      children: [
        CircleAvatar(
          radius: 16,
          backgroundColor: palette.surfaceMuted,
          child: Icon(Icons.person_outline, size: 17, color: palette.textSecondary),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label,
                style: TextStyle(fontSize: 11.5, color: palette.textSecondary)),
            Text(shown,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700)),
          ]),
        ),
        if ((phone ?? '').trim().isNotEmpty)
          OutlinedButton.icon(
            onPressed: () => launchUrl(Uri.parse('tel:${phone!.trim()}')),
            style: OutlinedButton.styleFrom(
              visualDensity: VisualDensity.compact,
              foregroundColor: palette.accentInk,
              side: BorderSide(color: palette.border),
              shape: const StadiumBorder(),
            ),
            icon: const Icon(Icons.phone_outlined, size: 15),
            label: Text(phone!.trim(), style: const TextStyle(fontSize: 12)),
          ),
      ],
    );
  }
}

/// "View property location" / "View pickup location" — opens the pin.
class RentalLocationLink extends StatelessWidget {
  const RentalLocationLink(
      {super.key, required this.rental, required this.mapUrl});
  final RentalPresentation rental;
  final String mapUrl;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return OutlinedButton.icon(
      key: const ValueKey('rental-location-link'),
      onPressed: () => launchUrl(Uri.parse(mapUrl),
          mode: LaunchMode.externalApplication),
      style: OutlinedButton.styleFrom(
        visualDensity: VisualDensity.compact,
        foregroundColor: palette.textSecondary,
        side: BorderSide(color: palette.border),
        shape: const StadiumBorder(),
      ),
      icon: const Icon(Icons.place_outlined, size: 16),
      label: Text(
          'View ${rental.isVehicle ? 'pickup' : 'property'} location',
          style: const TextStyle(
              fontSize: 12, decoration: TextDecoration.underline)),
    );
  }
}

/// The guest's / renter's six-digit code (web `RentalHandoffCodeCard`,
/// buyer side). The backend issues it once the paid booking is waiting for
/// check-in; the host never sees it. "I've arrived" shows it large for the
/// host; a new one can be generated only after three failed checks, or
/// when none was issued yet.
class RentalCodeCard extends StatefulWidget {
  const RentalCodeCard({
    super.key,
    required this.rental,
    required this.code,
    required this.attemptsUsed,
    required this.onGenerate,
    this.compact = false,
  });

  final RentalPresentation rental;
  final String? code;
  final int attemptsUsed;

  /// POST regenerate-rental-handoff-code; null while one is in flight.
  final Future<void> Function()? onGenerate;
  final bool compact;

  @override
  State<RentalCodeCard> createState() => _RentalCodeCardState();
}

class _RentalCodeCardState extends State<RentalCodeCard> {
  bool _copied = false;

  bool get _property => !widget.rental.isVehicle;
  String get _noun => _property ? 'check-in' : 'pickup';
  String get _title => _property ? 'Check-in code' : 'Pickup code';
  bool get _hasCode => (widget.code ?? '').trim().isNotEmpty;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.code!.trim()));
    if (!mounted) return;
    setState(() => _copied = true);
    ScaffoldMessenger.maybeOf(context)
        ?.showSnackBar(SnackBar(content: Text('$_title copied')));
  }

  void _showArrived() {
    showDialog<void>(
      context: context,
      builder: (ctx) {
        final palette = AppPalette.of(ctx);
        return AlertDialog(
          title: const Text('Show your host this check-in code'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text(
                'Your host enters this code to confirm check-in and start your '
                'stay. Share it only once you have arrived and can access the '
                'property.'),
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 18),
              decoration: BoxDecoration(
                color: palette.successFill,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: palette.successBorder),
              ),
              child: Column(children: [
                Text('CHECK-IN CODE',
                    style: TextStyle(
                        fontSize: 11,
                        letterSpacing: 1,
                        fontWeight: FontWeight.w700,
                        color: palette.successText)),
                const SizedBox(height: 6),
                SelectableText(widget.code!.trim(),
                    key: const ValueKey('rental-code-large'),
                    style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 30,
                        letterSpacing: 8,
                        fontWeight: FontWeight.w900)),
              ]),
            ),
          ]),
          actions: [
            FilledButton(
              onPressed: () {
                _copy();
                Navigator.of(ctx).pop();
              },
              child: const Text('Copy check-in code'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final generate = widget.onGenerate;
    final busy = generate == null;
    final copyButton = IconButton(
      key: const ValueKey('rental-code-copy'),
      tooltip: 'Copy $_noun code',
      onPressed: _copy,
      icon: Icon(_copied ? Icons.check : Icons.copy_rounded, size: 18),
    );
    return Container(
      key: const ValueKey('rental-code-card'),
      padding: EdgeInsets.all(widget.compact ? 12 : 14),
      decoration: BoxDecoration(
        color: palette.successFill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.successBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.key_rounded, size: 18, color: palette.successText),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_title.toUpperCase(),
                  style: TextStyle(
                      fontSize: 11,
                      letterSpacing: 1,
                      fontWeight: FontWeight.w700,
                      color: palette.successText)),
              if (_hasCode)
                Text(widget.code!.trim(),
                    key: const ValueKey('rental-code-value'),
                    style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 22,
                        letterSpacing: 4,
                        fontWeight: FontWeight.w900)),
            ]),
          ),
          if (_hasCode) copyButton,
        ]),
        const SizedBox(height: 6),
        Text(
            _hasCode
                ? (_property
                    ? 'Share with your host only when you are at the property and ready to check in.'
                    : 'Share with the vehicle provider only when you are there to pick it up.')
                : 'Your booking is confirmed. Generate your code before you arrive.',
            style: TextStyle(
                fontSize: 12.5, height: 1.35, color: palette.successText)),
        const SizedBox(height: 10),
        if (_hasCode && _property)
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const ValueKey('rental-code-arrived'),
              onPressed: _showArrived,
              child: const Text('I’ve arrived'),
            ),
          )
        else if (!_hasCode)
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const ValueKey('rental-code-generate'),
              onPressed: busy ? null : generate,
              child: Text(busy ? 'Generating code...' : 'Generate $_noun code'),
            ),
          ),
        if (_hasCode && widget.attemptsUsed >= 3)
          TextButton.icon(
            key: const ValueKey('rental-code-regenerate'),
            onPressed: busy ? null : generate,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Generate a new code'),
          ),
      ]),
    );
  }
}
