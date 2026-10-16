import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../domain/driver_app.dart';
import '../domain/time_utils.dart' show TimeUtils;
import '../theme.dart';

/// "Uses the app" / "Invited" / "No app". Draws nothing when the backend does
/// not send an app status (driver app off).
class RiderAppBadge extends StatelessWidget {
  const RiderAppBadge({super.key, required this.transporter});

  final Map<String, dynamic> transporter;

  @override
  Widget build(BuildContext context) {
    final status = riderAppStatus(transporter);
    final label = riderAppStatusLabel(status);
    if (label == null) return const SizedBox.shrink();
    final color = switch (status!) {
      RiderAppStatus.active => AppColors.accentGreen,
      RiderAppStatus.invited => Colors.amber.shade800,
      RiderAppStatus.manual => AppPalette.of(context).textSecondary,
    };
    return Container(
      key: const ValueKey('rider-app-badge'),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: color.withValues(alpha: 0.5)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.smartphone_rounded, size: 12, color: color),
        const SizedBox(width: 4),
        Text(label,
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w600, color: color)),
      ]),
    );
  }
}

/// Invite a rider to the app, or end their access. The caller refreshes the
/// list when [onChanged] fires.
class RiderAppActions extends StatefulWidget {
  const RiderAppActions({
    super.key,
    required this.api,
    required this.token,
    required this.transporter,
    required this.onChanged,
  });

  final ApiClient api;
  final String token;
  final Map<String, dynamic> transporter;
  final VoidCallback onChanged;

  @override
  State<RiderAppActions> createState() => _RiderAppActionsState();
}

class _RiderAppActionsState extends State<RiderAppActions> {
  bool _busy = false;

  int get _id => (widget.transporter['transporterId'] as num).toInt();
  String get _name =>
      (widget.transporter['fullName'] ?? 'your rider').toString();

  Future<void> _invite() async {
    setState(() => _busy = true);
    try {
      final invite = await widget.api.createDriverInvite(widget.token, _id);
      if (!mounted) return;
      // The spinner is for creating the code; the sheet stays open until dismissed.
      setState(() => _busy = false);
      widget.onChanged();
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => DriverInviteSheet(
          riderName: _name,
          riderPhone: (widget.transporter['whatsAppPhoneNumber'] ??
                  widget.transporter['phoneNumber'] ??
                  '')
              .toString(),
          invite: invite,
        ),
      );
    } on ApiException catch (e) {
      _toast('Could not create the invite: ${e.message}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Remove app access?'),
        content: Text(
            '$_name will no longer see your orders in the app. Past deliveries stay.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: const Text('Keep')),
          FilledButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: const Text('Remove')),
        ],
      ),
    );
    if (sure != true) return;
    setState(() => _busy = true);
    try {
      await widget.api.removeDriverAppAccess(widget.token, _id);
      if (!mounted) return;
      widget.onChanged();
      _toast('App access removed');
    } on ApiException catch (e) {
      _toast('Could not remove access: ${e.message}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String message) => ScaffoldMessenger.maybeOf(context)
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));

  @override
  Widget build(BuildContext context) {
    if (!canInviteRider(widget.transporter)) return const SizedBox.shrink();
    final active = riderAppStatus(widget.transporter) == RiderAppStatus.active;
    final invited =
        riderAppStatus(widget.transporter) == RiderAppStatus.invited;
    return TextButton.icon(
      key: ValueKey(active ? 'rider-remove-access' : 'rider-invite'),
      onPressed: _busy ? null : (active ? _remove : _invite),
      icon: _busy
          ? const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2))
          : Icon(
              active ? Icons.phonelink_erase_rounded : Icons.smartphone_rounded,
              size: 16),
      label: Text(active
          ? 'Remove app access'
          : (invited ? 'New invite code' : 'Invite to app')),
    );
  }
}

/// The code to send, with Copy and Send on WhatsApp.
class DriverInviteSheet extends StatelessWidget {
  const DriverInviteSheet({
    super.key,
    required this.riderName,
    required this.riderPhone,
    required this.invite,
  });

  final String riderName;
  final String riderPhone;
  final Map<String, dynamic> invite;

  String get _code => (invite['code'] ?? '').toString();
  String get _text =>
      (invite['shareText'] ?? 'Your GloboExpats Delivery code: $_code')
          .toString();

  Uri? get _whatsapp {
    final digits = riderPhone.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length < 9) return null;
    final full = digits.startsWith('0') ? '255${digits.substring(1)}' : digits;
    return Uri.https('wa.me', '/$full', {'text': _text});
  }

  @override
  Widget build(BuildContext context) {
    final expires = TimeUtils.tryParseBackendTimestamp(invite['expiresAt']);
    final wa = _whatsapp;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Invite $riderName',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 6),
              Text(
                'Send this code. They install GloboExpats Delivery, sign in with Google and enter it. '
                'It works once${expires == null ? ' for 7 days' : ' until ${expires.toLocal().day}/${expires.toLocal().month}'}.',
                style: TextStyle(color: AppPalette.of(context).textSecondary),
              ),
              const SizedBox(height: 16),
              Container(
                key: const ValueKey('invite-code'),
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 18),
                decoration: BoxDecoration(
                  border: Border.all(
                      color: AppPalette.of(context)
                          .textSecondary
                          .withValues(alpha: 0.4)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(_code,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 6)),
              ),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    key: const ValueKey('invite-copy'),
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: _text));
                      if (context.mounted) {
                        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
                            const SnackBar(
                                content:
                                    Text('Copied. Paste it into a message.')));
                      }
                    },
                    icon: const Icon(Icons.copy_rounded, size: 18),
                    label: const Text('Copy message'),
                  ),
                ),
                if (wa != null) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      key: const ValueKey('invite-whatsapp'),
                      style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF25D366)),
                      onPressed: () =>
                          launchUrl(wa, mode: LaunchMode.externalApplication),
                      icon: const Icon(Icons.chat_rounded, size: 18),
                      label: const Text('WhatsApp'),
                    ),
                  ),
                ],
              ]),
            ]),
      ),
    );
  }
}

/// What the rider reported for an order. Draws nothing while there is nothing
/// to show (no rider, driver app off, or the request failed).
class DriverProgressCard extends StatefulWidget {
  const DriverProgressCard(
      {super.key,
      required this.api,
      required this.token,
      required this.orderId});

  final ApiClient api;
  final String token;
  final String orderId;

  @override
  State<DriverProgressCard> createState() => _DriverProgressCardState();
}

class _DriverProgressCardState extends State<DriverProgressCard> {
  late Future<List<Map<String, dynamic>>> _events = _load();

  Future<List<Map<String, dynamic>>> _load() => widget.api
      .fetchOrderTripEvents(widget.token, widget.orderId)
      .catchError((Object _) => <Map<String, dynamic>>[]);

  @override
  void didUpdateWidget(DriverProgressCard old) {
    super.didUpdateWidget(old);
    if (old.orderId != widget.orderId) _events = _load();
  }

  @override
  Widget build(BuildContext context) =>
      FutureBuilder<List<Map<String, dynamic>>>(
        future: _events,
        builder: (context, snap) {
          final events = snap.data ?? const <Map<String, dynamic>>[];
          if (events.isEmpty) return const SizedBox.shrink();
          return Card(
            key: const ValueKey('driver-progress'),
            margin: const EdgeInsets.only(top: 12),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Delivery progress',
                        style: TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 8),
                    for (final e in events)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Padding(
                                padding:
                                    const EdgeInsets.only(top: 6, right: 10),
                                child: Icon(
                                  Icons.circle,
                                  size: 8,
                                  color: AppPalette.of(context).accentInk,
                                ),
                              ),
                              Expanded(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(describeTripEvent(e),
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600)),
                                      if (_time(e) != null)
                                        Text(_time(e)!,
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: AppPalette.of(context)
                                                    .textSecondary)),
                                    ]),
                              ),
                            ]),
                      ),
                  ]),
            ),
          );
        },
      );

  String? _time(Map<String, dynamic> e) {
    final at = TimeUtils.tryParseBackendTimestamp(e['occurredAt']);
    if (at == null) return null;
    final eat = TimeUtils.toEat(at);
    return '${eat.hour.toString().padLeft(2, '0')}:${eat.minute.toString().padLeft(2, '0')}';
  }
}
