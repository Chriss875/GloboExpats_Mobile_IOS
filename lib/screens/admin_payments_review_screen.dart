import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../theme.dart';
import '../widgets/skeleton_loader.dart';

/// AU-042 — admin payments/proforma review tab (web admin-payments-tab.tsx):
///
/// Status-filtered queue → per-row receipt previews (authed proxy) →
/// VERIFY each SUBMITTED receipt → CONFIRM payment (or BULK approve) /
/// REJECT with a reasonCode the buyer sees / cancel-after-rejection inside
/// the 48h window. Every action reports the backend's REAL response.
class AdminPaymentsReviewScreen extends StatefulWidget {
  const AdminPaymentsReviewScreen({super.key, this.auth, this.api});
  final AuthStore? auth;
  final ApiClient? api;

  @override
  State<AdminPaymentsReviewScreen> createState() =>
      _AdminPaymentsReviewScreenState();
}

class _AdminPaymentsReviewScreenState extends State<AdminPaymentsReviewScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  String _status = 'PAYMENT_SUBMITTED';
  static const _statuses = [
    'PAYMENT_SUBMITTED',
    'PENDING_PAYMENT',
    'CONFIRMED',
    'EXPIRED',
    'CANCELLED',
  ];
  List<Map<String, dynamic>> _rows = [];
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String? _error;
  final Set<String> _selected = {}; // bulk approve multi-select
  String? _actionMsg;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final token = AuthStore.instance!.token!;
      final rows = await _api.adminPaymentsQueue(token, status: _status);
      final stats = await _api.adminProformaStats(token).catchError((_) => <String, dynamic>{});
      if (!mounted) return;
      setState(() { _rows = rows; _stats = stats; _loading = false; _selected.clear(); });
    } on ApiException catch (e) {
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      setState(() { _error = e.message; _loading = false; });
    } catch (e) {
      setState(() { _error = 'Could not load the payments queue.'; _loading = false; });
    }
  }

  Future<void> _confirm(String proformaId) => _run(() => _api.adminConfirmPayment(AuthStore.instance!.token!, proformaId),
      'Payment confirmed');
  Future<void> _cancelAfterRejection(String proformaId) =>
      _run(() => _api.adminCancelAfterRejection(AuthStore.instance!.token!, proformaId), 'Invoice cancelled');
  Future<void> _bulkApprove() {
    final ids = _selected.toList();
    return _run(() => _api.adminBulkApprove(AuthStore.instance!.token!, ids),
        '${ids.length} approved');
  }
  Future<void> _verifyReceipt(String receiptId) =>
      _run(() => _api.adminVerifyReceipt(AuthStore.instance!.token!, receiptId), 'Receipt verified');
  Future<void> _rejectReceipt(String receiptId) async {
    final reason = await showDialog<String>(
      context: context,
      builder: (d) => SimpleDialog(
        title: const Text('Reject reason'),
        children: [
          for (final r in const [
            'UNREADABLE_OR_INCOMPLETE',
            'AMOUNT_MISMATCH',
            'PAYMENT_DETAILS_MISMATCH',
            'DUPLICATE_OR_PREVIOUSLY_USED',
            'PAYMENT_NOT_FOUND',
            'OTHER',
          ])
            SimpleDialogOption(
              onPressed: () => Navigator.pop(d, r),
              child: Text(r.replaceAll('_', ' ').toLowerCase(),
                  style: const TextStyle(fontSize: 14)),
            ),
        ],
      ),
    );
    if (reason == null) return;
    if (!mounted) return;
    await _run(
        () => _api.adminRejectReceipt(AuthStore.instance!.token!, receiptId, reason, ''),
        'Receipt rejected ($reason)');
  }

  Future<void> _run(Future<dynamic> Function() fn, String okMsg) async {
    setState(() { _actionMsg = null; });
    try {
      await fn();
      if (!mounted) return;
      setState(() => _actionMsg = okMsg);
      await _load();
    } on ApiException catch (e) {
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      setState(() => _actionMsg = 'Failed: ${e.message}');
    } catch (_) {
      setState(() => _actionMsg = 'Failed: unexpected error.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment review')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(12), children: [
          if (_stats != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Wrap(spacing: 8, runSpacing: 6, children: [
                for (final e in _stats!.entries)
                  if (e.value is num)
                    Chip(label: Text('${e.key}: ${e.value}', style: const TextStyle(fontSize: 11))),
              ]),
            ),
          SizedBox(
            width: double.infinity,
            child: Wrap(alignment: WrapAlignment.start, spacing: 6, children: [
              for (final s in _statuses)
                ChoiceChip(
                  label: Text(s, style: const TextStyle(fontSize: 11)),
                  selected: s == _status,
                  onSelected: (_) { _status = s; _load(); },
                ),
            ]),
          ),
          if (_actionMsg != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(_actionMsg!,
                  style: TextStyle(
                      color: _actionMsg!.startsWith('Failed') ? Colors.red : AppColors.accentGreen)),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(20),
              child: Center(child: Text('Could not load queue: $_error', textAlign: TextAlign.center)),
            )
          else if (_loading)
            const FeedSkeleton()
          else if (_rows.isEmpty)
            Padding(
              padding: EdgeInsets.all(40),
              child: Center(child: Text('Nothing in this queue.', style: TextStyle(color: AppPalette.of(context).textSecondary))),
            )
          else ...[
            if (_selected.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: FilledButton(
                  onPressed: _bulkApprove,
                  child: Text('Bulk approve (${_selected.length})'),
                ),
              ),
            for (final row in _rows)
              _ProformaCard(
                row: row,
                api: _api,
                selected: _selected.contains(row['proformaId']),
                onSelect: (v) => setState(() {
                  v ? _selected.add(row['proformaId'] as String) : _selected.remove(row['proformaId']);
                }),
                onConfirm: () => _confirm(row['proformaId'] as String),
                onCancelAfterRejection: () => _cancelAfterRejection(row['proformaId'] as String),
                onVerifyReceipt: _verifyReceipt,
                onRejectReceipt: _rejectReceipt,
              ),
          ],
        ]),
      ),
    );
  }
}

String _fmtNum(dynamic v) =>
    v is num ? (v.roundToDouble() == v ? v.toInt().toString() : v.toString()) : '$v';

class _ProformaCard extends StatelessWidget {
  final Map<String, dynamic> row;
  final ApiClient api;
  final bool selected;
  final ValueChanged<bool> onSelect;
  final VoidCallback onConfirm;
  final VoidCallback onCancelAfterRejection;
  final Future<void> Function(String) onVerifyReceipt;
  final Future<void> Function(String) onRejectReceipt;
  const _ProformaCard({
    required this.row,
    required this.api,
    required this.selected,
    required this.onSelect,
    required this.onConfirm,
    required this.onCancelAfterRejection,
    required this.onVerifyReceipt,
    required this.onRejectReceipt,
  });

  @override
  Widget build(BuildContext context) {
    final receipts = (row['receipts'] as List?)?.whereType<Map<String, dynamic>>().toList() ?? const [];
    final refs = (row['transactionReferences'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[];
    final rejectedNoSubmitted =
        receipts.isNotEmpty && !receipts.any((r) => r['status'] == 'SUBMITTED');
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Checkbox(value: selected, onChanged: (v) => onSelect(v ?? false)),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('TSh ${_fmtNum(row['grandTotal'])} · ${row['proformaNumber'] ?? ''} · ${row['currency'] ?? 'TZS'}',
                    style: const TextStyle(fontWeight: FontWeight.w800)),
                Text('${row['buyerName']} · ${row['paymentMethodType']}'
                      '${row['overdue'] == true ? ' · overdue' : ''}',
                    style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
              ]),
            ),
          ]),
          if (refs.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('Refs: ${refs.join(', ')}', style: const TextStyle(fontSize: 12)),
            ),
          for (final r in receipts)
            _ReceiptTile(receipt: r, api: api, onVerify: () => onVerifyReceipt(r['receiptId'] as String),
                onReject: () => onRejectReceipt(r['receiptId'] as String)),
          const SizedBox(height: 8),
          Row(children: [
            if (row['status'] == 'PAYMENT_SUBMITTED')
              FilledButton(onPressed: onConfirm, child: const Text('Confirm payment')),
            const Spacer(),
            if (rejectedNoSubmitted && row['status'] != 'CANCELLED')
              TextButton(onPressed: onCancelAfterRejection,
                  child: const Text('Cancel invoice (48h window)', style: TextStyle(color: Colors.deepOrange))),
          ]),
        ]),
      ),
    );
  }
}

class _ReceiptTile extends StatelessWidget {
  final Map<String, dynamic> receipt;
  final ApiClient api;
  final VoidCallback onVerify;
  final VoidCallback onReject;
  const _ReceiptTile({required this.receipt, required this.api, required this.onVerify, required this.onReject});

  @override
  Widget build(BuildContext context) {
    final id = receipt['receiptId'] as String?;
    final status = receipt['status'] as String? ?? '';
    final submitted = status == 'SUBMITTED';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(submitted ? Icons.pending_outlined : (status == 'VERIFIED' ? Icons.check_circle : Icons.cancel),
              size: 16,
              color: submitted ? AppPalette.of(context).accentInk : (status == 'VERIFIED' ? AppColors.accentGreen : Colors.deepOrange)),
          const SizedBox(width: 6),
          Expanded(
            child: Text('${receipt['fileName'] ?? 'receipt'} · $status'
                  '${receipt['amount'] != null ? ' · ${receipt['amount']}' : ''}',
                style: const TextStyle(fontSize: 12)),
          ),
          if (id != null && submitted) ...[
            TextButton(onPressed: onVerify, child: const Text('Verify', style: TextStyle(fontSize: 12))),
            TextButton(onPressed: onReject, child: const Text('Reject', style: TextStyle(fontSize: 12, color: Colors.deepOrange))),
          ],
        ]),
        if (receipt['rejectionReasonCode'] != null)
          Text('Rejected: ${receipt['rejectionReasonCode']}',
              style: const TextStyle(fontSize: 11, color: Colors.deepOrange)),
        if (id != null)
          FutureBuilder<Uint8List>(
            future: AuthStore.instance?.token == null
                ? Future.error(StateError('no token'))
                : api.adminReceiptFile(AuthStore.instance!.token!, id),
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator());
              }
              final bytes = snap.data;
              if (bytes == null || bytes.isEmpty || snap.hasError) {
                return const Text('preview unavailable', style: TextStyle(fontSize: 11));
              }
              return Padding(
                padding: const EdgeInsets.only(top: 4),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Image.memory(bytes, height: 120, fit: BoxFit.cover),
                ),
              );
            },
          ),
      ]),
    );
  }
}
