import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/driver_app.dart';
import '../theme.dart';
import '../widgets/error_text.dart';
import 'skeleton_loader.dart';

/// AU-057 assign-transporter modal (web parity assign-transporter-modal.tsx):
/// lists the seller/admin transporter registry (GET /transporters?active=true)
/// with vehicle + plate + trip count, supports inline creation
/// (POST /transporters), and assigns the picked transporter to the order
/// (POST /orders/{orderId}/transporter → order AWAITING_BUYER_CONFIRMATION).
class AssignTransporterModal extends StatefulWidget {
  const AssignTransporterModal({
    super.key,
    required this.token,
    required this.orderId,
    this.api,
    this.windowDate,
    this.windowSlot,
  });
  final String token;
  final String orderId;
  final ApiClient? api;

  /// The buyer's delivery window (yyyy-MM-dd and MORNING / AFTERNOON / EVENING /
  /// SELLER_HOURS). When given, each rider shows how many orders they already
  /// have in it.
  final String? windowDate;
  final String? windowSlot;
  @override
  State<AssignTransporterModal> createState() => _AssignTransporterModalState();
}

class _AssignTransporterModalState extends State<AssignTransporterModal> {
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<List<Map<String, dynamic>>> _registry = _loadRegistry();

  Future<List<Map<String, dynamic>>> _loadRegistry() =>
      _api.fetchTransporterRegistry(widget.token,
          activeOnly: true,
          windowDate: widget.windowDate,
          windowSlot: widget.windowSlot);
  bool _creating = false;
  bool _assigning = false;
  int? _pickedId;
  String? _error;

  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _plate = TextEditingController();
  String _vehicleType = 'MOTORBIKE';

  static const _vehicleTypes = [
    ('MOTORBIKE', 'Boda'),
    ('TRICYCLE', 'Bajaji'),
    ('CAR', 'Car'),
    ('MINI_TRUCK', 'Mini truck'),
    ('SEMI_TRUCK', 'Semi truck'),
  ];

  Future<void> _create() async {
    setState(() => _error = null);
    try {
      final created = await _api.createTransporter(widget.token, {
        'fullName': _name.text.trim(),
        'phoneNumber': _phone.text.trim(),
        'vehicleType': _vehicleType,
        if (_plate.text.trim().isNotEmpty) 'plateNumber': _plate.text.trim(),
        'active': true,
      });
      final id = (created['transporterId'] as num?)?.toInt();
      if (!mounted) return;
      setState(() {
        _creating = false;
        _pickedId = id ?? _pickedId;
        // Reload the registry so the created transporter appears selected.
        _registry = _loadRegistry();
      });
      await _registry.catchError((Object _) => <Map<String, dynamic>>[]);
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      setState(() => _error = e.message);
    } catch (e) {
      // Surface unexpected failures (not just ApiException) so silent no-ops
      // can never masquerade as success.
      setState(() => _error = 'Could not create the transporter: $e');
    }
  }

  Future<void> _assign() async {
    if (_pickedId == null) return;
    setState(() {
      _assigning = true;
      _error = null;
    });
    try {
      await _api.assignTransporter(widget.token, widget.orderId, _pickedId!);
      if (!mounted) return;
      // A rider who uses the app is assigned ahead of time and starts the
      // delivery from the app; say so instead of "delivery started".
      final messenger = ScaffoldMessenger.maybeOf(context);
      final rows = await _registry.catchError((Object _) => <Map<String, dynamic>>[]);
      final picked = rows.where((t) => (t['transporterId'] as num?)?.toInt() == _pickedId);
      if (picked.isNotEmpty && riderAppStatus(picked.first) == RiderAppStatus.active) {
        messenger?.showSnackBar(SnackBar(
            content: Text('${picked.first['fullName']} has it on their schedule '
                'and starts it from the app. The buyer gets their code when they set off.')));
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      setState(() {
        _assigning = false;
        _error = e.message;
      });
    } catch (_) {
      setState(() {
        _assigning = false;
        _error = 'Could not assign the transporter. Try again.';
      });
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _plate.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Assign a transporter'),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: FutureBuilder<List<Map<String, dynamic>>>(
                future: _registry,
                builder: (context, snap) {
                  if (snap.connectionState == ConnectionState.waiting) {
                    return const Padding(
                        padding: EdgeInsets.all(20),
                        child: ListRowsSkeleton(itemCount: 1));
                  }
                  if (snap.hasError) {
                    return ErrorText(error: snap.error, context: 'Could not load transporters.');
                  }
                  final rows = snap.data ?? const [];
                  if (rows.isEmpty) {
                    return Padding(
                      padding: EdgeInsets.all(12),
                      child: Text('No active transporters yet — add one below.',
                          style: TextStyle(color: AppPalette.of(context).textSecondary)),
                    );
                  }
                  return ListView.builder(
                    shrinkWrap: true,
                    itemCount: rows.length,
                    itemBuilder: (context, i) {
                      final t = rows[i];
                      final id = (t['transporterId'] as num).toInt();
                      return RadioListTile<int>(
                        value: id,
                        groupValue: _pickedId,
                        onChanged: (v) => setState(() => _pickedId = v),
                        title: Text((t['fullName'] ?? '').toString(),
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                '${(t['vehicleType'] ?? '').toString().replaceAll('_', ' ')}'
                                '${t['plateNumber'] != null && t['plateNumber'].toString().isNotEmpty ? ' · ${t['plateNumber']}' : ''}'
                                ' · ${(t['tripCount'] as num?)?.toInt() ?? 0} trips',
                                style: const TextStyle(fontSize: 12)),
                            if (riderLoadLabel(t) != null)
                              Text(riderLoadLabel(t)!,
                                  key: ValueKey('rider-load-$id'),
                                  style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.accentGreen)),
                          ],
                        ),
                      );
                    },
                  );
                },
              ),
            ),
            if (_creating) ...[
              TextField(
                  controller: _name,
                  decoration: const InputDecoration(labelText: 'Full name')),
              TextField(
                  controller: _phone,
                  decoration: const InputDecoration(labelText: 'Phone number')),
              TextField(
                  controller: _plate,
                  decoration: const InputDecoration(labelText: 'Plate number')),
              DropdownButtonFormField<String>(
                value: _vehicleType,
                items: [
                  for (final vt in _vehicleTypes)
                    DropdownMenuItem(value: vt.$1, child: Text(vt.$2)),
                ],
                onChanged: (v) => setState(() => _vehicleType = v ?? 'MOTORBIKE'),
              ),
              TextButton(
                  onPressed: _create, child: const Text('Save transporter')),
            ] else
              TextButton.icon(
                onPressed: () => setState(() => _creating = true),
                icon: const Icon(Icons.person_add_alt_outlined, size: 16),
                label: const Text('Add a new transporter'),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: ErrorText(error: _error),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel')),
        FilledButton(
          onPressed: _pickedId != null && !_assigning ? _assign : null,
          style: FilledButton.styleFrom(backgroundColor: AppColors.brandBlue),
          child: _assigning
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Assign'),
        ),
      ],
    );
  }
}
