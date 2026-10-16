import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../theme.dart';
import '../widgets/error_text.dart';
import '../widgets/skeleton_loader.dart';

/// AU-060 + ACCOUN-10/11: seller payout details (web SellerPayoutDetailsCard
/// parity). Lists the seller's configured payout destinations from
/// GET /userManagement/payout-details, creates/updates via PUT, and now also
/// supports DELETE, set-primary, a primary-first list, web validation rules
/// (default BANK_ACCOUNT; method locked while editing) and per-row
/// Edit / Delete / Make-default actions (FINANC-04/05). Methods:
/// BANK_ACCOUNT / LIPA_NUMBER / MOBILE_MONEY with method-appropriate labels.
///
/// [PayoutDetailsSection] is the shared body, embedded as the "Payout" toggle
/// section on Profile Information (web parity: the seller's payout card sits
/// directly on that page) — this screen wraps it in a Scaffold for anyone
/// reaching it as its own destination.
class PayoutDetailsScreen extends StatelessWidget {
  const PayoutDetailsScreen({super.key, this.api});
  final ApiClient? api;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payout details')),
      body: PayoutDetailsSection(api: api),
    );
  }
}

/// Web `payoutMethodLabel` + per-method field labels/placeholders
/// (lib/payout-details.ts PAYOUT_METHODS / payoutFieldLabels).
const _methodLabels = {
  'BANK_ACCOUNT': 'Bank account',
  'LIPA_NUMBER': 'Lipa number',
  'MOBILE_MONEY': 'Mobile money',
};

/// (provider, providerHint, accountName, accountNameHint, accountNumber,
/// accountNumberHint) — web payoutFieldLabels order.
const _fieldLabels = {
  'BANK_ACCOUNT': (
    'Bank name',
    'e.g., CRDB Bank',
    'Account holder name',
    'Name registered on the bank account',
    'Account number',
    'Enter your bank account number',
  ),
  'LIPA_NUMBER': (
    'Telecom provider',
    'e.g., Vodacom or Airtel',
    'Business or account name',
    'Name registered to the Lipa number',
    'Lipa number',
    'Enter your merchant or business number',
  ),
  'MOBILE_MONEY': (
    'Telecom provider',
    'e.g., Vodacom or Airtel',
    'Registered account name',
    'Name registered to the mobile wallet',
    'Mobile money number',
    'e.g., +255 754 123 456',
  ),
};

/// Web `validatePayoutDetails` — returns the first problem or null.
String? _validatePayoutInput(
    String method, String provider, String accountName, String accountNumber) {
  final f = _fieldLabels[method]!;
  if (provider.trim().length < 2) return '${f.$1} is required.';
  if (accountName.trim().length < 2) return '${f.$3} is required.';

  final raw = accountNumber.trim();
  if (method == 'BANK_ACCOUNT') {
    if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9 ./-]{3,33}$').hasMatch(raw)) {
      return 'Enter a valid bank account number using 4 to 34 letters or digits.';
    }
    return null;
  }
  final normalized = raw.replaceAll(RegExp(r'[\s()-]'), '');
  if (!RegExp(r'^\+?\d{4,20}$').hasMatch(normalized)) {
    return 'Enter a valid ${f.$5.toLowerCase()} using 4 to 20 digits.';
  }
  return null;
}

class PayoutDetailsSection extends StatefulWidget {
  const PayoutDetailsSection({super.key, this.api, this.embedded = false});
  final ApiClient? api;

  /// True when rendered inside Profile Information's Payout toggle section
  /// rather than its own page: drops pull-to-refresh (a scroll parent already
  /// owns that) and shows "Add" as a heading button instead of a FAB, which
  /// has no Scaffold to dock to when embedded.
  final bool embedded;

  @override
  State<PayoutDetailsSection> createState() => _PayoutDetailsSectionState();
}

class _PayoutDetailsSectionState extends State<PayoutDetailsSection> {
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<List<Map<String, dynamic>>> _future = _load();

  /// Web sortDetails: primary rows first (stable for ties).
  static List<Map<String, dynamic>> _primaryFirst(
          List<Map<String, dynamic>> rows) =>
      [...rows]
        ..sort((a, b) => (b['primary'] == true ? 1 : 0) - (a['primary'] == true ? 1 : 0));

  Future<List<Map<String, dynamic>>> _load() async {
    final token = AuthStore.instance?.token;
    if (token == null) return const [];
    final rows = await _api.fetchPayoutDetails(token);
    return _primaryFirst(rows);
  }

  void _reload() {
    if (!mounted) return;
    setState(() {
      _future = _load();
    });
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _makeDefault(Map<String, dynamic> row) async {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    final method = (row['payoutMethod'] ?? '').toString();
    try {
      await _api.setPrimaryPayoutDetails(token, (row['id'] as num).toInt());
      _toast('${_methodLabels[method] ?? method} is now your default.');
      _reload();
    } on ApiException catch (e) {
      if (e.unauthorized) AuthStore.instance?.handleUnauthorized();
      _toast('Could not update default method: ${e.message}');
    }
  }

  Future<void> _deleteFlow(Map<String, dynamic> row) async {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    final primary = row['primary'] == true;
    final count = await _countRows();
    if (!mounted) return;
    final description = primary && count > 1
        ? 'Another saved method will automatically become the default.'
        : 'You can add this payout method again later.';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this payout method?'),
        content: Text(description),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Keep method')),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: AppPalette.of(context).dangerText),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Remove method'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _api.deletePayoutDetails(token, (row['id'] as num).toInt());
      _toast('Payout method removed');
      _reload();
    } on ApiException catch (e) {
      if (e.unauthorized) AuthStore.instance?.handleUnauthorized();
      _toast('Could not remove payout method: ${e.message}');
    }
  }

  Future<int> _countRows() async {
    try {
      final rows = await _load();
      return rows.length;
    } catch (_) {
      return 0;
    }
  }

  Future<void> _sheet(Map<String, dynamic>? existing) async {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    final form = GlobalKey<FormState>();
    final isEdit = existing != null;
    // Web: a NEW method defaults to BANK_ACCOUNT; editing keeps the saved one
    // and locks the method entirely.
    String method =
        (existing?['payoutMethod'] ?? 'BANK_ACCOUNT').toString();
    final provider =
        TextEditingController(text: existing?['providerName']?.toString() ?? '');
    final accountName =
        TextEditingController(text: existing?['accountName']?.toString() ?? '');
    final accountNumber =
        TextEditingController(text: existing?['accountNumber']?.toString() ?? '');

    final systemInset = MediaQuery.of(context).padding.bottom;
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          // `MediaQuery.padding` is ZERO inside a modal sheet — the route
          // strips it — so the system navigation bar's inset has to be read
          // from the calling context and carried in. Whichever of the two
          // bottom obstructions is taller wins: with the keyboard up it
          // covers the navigation bar, so they must not be added together.
          padding: EdgeInsets.only(
              bottom: math.max(MediaQuery.of(ctx).viewInsets.bottom,
                  systemInset)),
          child: Form(
            key: form,
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                    isEdit
                        ? 'Edit ${_methodLabels[method] ?? method}'
                        : 'Add a payout method',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text('Use the exact name and number registered with the bank or telecom provider.',
                    style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
                const SizedBox(height: 14),
                if (isEdit)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).background,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppPalette.of(context).border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Payment method',
                            style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
                        Text(_methodLabels[method] ?? method,
                            style: const TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  )
                else
                  DropdownButtonFormField<String>(
                    value: method,
                    decoration: const InputDecoration(
                        labelText: 'Payout method', border: OutlineInputBorder()),
                    items: [
                      for (final e in _fieldLabels.entries)
                        DropdownMenuItem(
                            value: e.key,
                            child: Text(_methodLabels[e.key] ?? e.key)),
                    ],
                    onChanged: (v) => setSheet(() {
                      method = v ?? 'BANK_ACCOUNT';
                      // Web updateMethod clears the previously typed fields.
                      provider.text = '';
                      accountName.text = '';
                      accountNumber.text = '';
                    }),
                  ),
                const SizedBox(height: 12),
                TextFormField(
                    controller: provider,
                    maxLength: 120,
                    decoration: InputDecoration(
                        labelText: _fieldLabels[method]!.$1,
                        hintText: _fieldLabels[method]!.$2,
                        border: const OutlineInputBorder()),
                    validator: (v) => _validatePayoutInput(method, v ?? '', accountName.text, accountNumber.text),
                    onChanged: (_) => form.currentState?.validate(),
                ),
                const SizedBox(height: 4),
                TextFormField(
                    controller: accountName,
                    maxLength: 120,
                    decoration: InputDecoration(
                        labelText: _fieldLabels[method]!.$3,
                        hintText: _fieldLabels[method]!.$4,
                        border: const OutlineInputBorder()),
                    validator: (v) => _validatePayoutInput(method, provider.text, v ?? '', accountNumber.text),
                    onChanged: (_) => form.currentState?.validate(),
                ),
                const SizedBox(height: 4),
                TextFormField(
                    controller: accountNumber,
                    maxLength: 64,
                    keyboardType: method == 'BANK_ACCOUNT'
                        ? TextInputType.text
                        : TextInputType.phone,
                    decoration: InputDecoration(
                        labelText: _fieldLabels[method]!.$5,
                        hintText: _fieldLabels[method]!.$6,
                        border: const OutlineInputBorder()),
                    validator: (v) => _validatePayoutInput(method, provider.text, accountName.text, v ?? ''),
                    onChanged: (_) => form.currentState?.validate(),
                ),
                const SizedBox(height: 8),
                FilledButton(
                  style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brandBlue,
                      minimumSize: const Size.fromHeight(46)),
                  onPressed: () async {
                    if (!form.currentState!.validate()) return;
                    try {
                      await _api.savePayoutDetails(token, {
                        'payoutMethod': method,
                        'providerName': provider.text.trim(),
                        'accountName': accountName.text.trim(),
                        'accountNumber': accountNumber.text.trim(),
                      }, detailsId: existing == null ? null : (existing['id'] as num).toInt());
                      if (ctx.mounted) Navigator.of(ctx).pop(true);
                    } on ApiException catch (e) {
                      if (e.unauthorized) AuthStore.instance?.handleUnauthorized();
                      setSheet(() {});
                      if (ctx.mounted) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text('Could not save payout method: ${e.message}')));
                      }
                    }
                  },
                  child: const Text('Save payout method'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    // Dispose after the sheet's exit animation completes (see addresses
    // screen note — disposing during teardown rebuilds dead controllers).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      provider.dispose();
      accountName.dispose();
      accountNumber.dispose();
    });
    _reload();
  }

  Widget _header() => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(children: [
          Icon(Icons.payments_outlined, size: 18, color: AppPalette.of(context).textSecondary),
          const SizedBox(width: 8),
          const Expanded(
            child: Text('Payout details',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          ),
          OutlinedButton.icon(
            onPressed: () => _sheet(null),
            icon: const Icon(Icons.add, size: 16),
            label: const Text('Add'),
            style: OutlinedButton.styleFrom(
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.symmetric(horizontal: 10)),
          ),
        ]),
      );

  Widget _body(AsyncSnapshot<List<Map<String, dynamic>>> snap) {
    if (snap.connectionState == ConnectionState.waiting) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: FeedSkeleton(),
      );
    }
    if (snap.hasError) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text('Could not load payout details: ${friendlyApiError(snap.error)}',
            textAlign: TextAlign.center),
      );
    }
    final rows = snap.data ?? const [];
    if (rows.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 12),
        decoration: BoxDecoration(
          border: Border.all(color: AppPalette.of(context).border),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
            'No payout details yet.\nAdd one so GloboExpats can pay you after a sale.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppPalette.of(context).textSecondary)),
      );
    }
    return Column(children: [
      for (final r in rows) ...[
        _row(r),
        const SizedBox(height: 10),
      ],
    ]);
  }

  Widget _row(Map<String, dynamic> r) {
    final method = (r['payoutMethod'] ?? '').toString();
    final label = _methodLabels[method] ?? method.replaceAll('_', ' ').toLowerCase();
    final primary = r['primary'] == true;
    final methodIcon = method == 'BANK_ACCOUNT'
        ? Icons.account_balance_outlined
        : method == 'LIPA_NUMBER'
            ? Icons.storefront_outlined
            : Icons.smartphone_outlined;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppPalette.of(context).border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(methodIcon, color: AppPalette.of(context).accentInk),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Text(label,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (primary) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppPalette.of(context).infoFill,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text('Default',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppPalette.of(context).accentInk)),
                      ),
                    ],
                  ]),
                  const SizedBox(height: 2),
                  Text('${r['accountName']} · ${r['accountNumber']}',
                      style: TextStyle(
                          fontSize: 13, color: AppPalette.of(context).textSecondary)),
                  if ((r['providerName'] ?? '').toString().isNotEmpty)
                    Text(r['providerName'],
                        style: TextStyle(
                            fontSize: 12, color: AppPalette.of(context).textSecondary)),
                ],
              ),
            ),
          ]),
          const SizedBox(height: 6),
          // Web seller-payout-row action set: Make default | Edit | Delete.
          Row(
            children: [
              if (!primary)
                TextButton.icon(
                  onPressed: () => _makeDefault(r),
                  icon: const Icon(Icons.star_border, size: 18),
                  label: const Text('Make default'),
                  style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                ),
              TextButton.icon(
                onPressed: () => _sheet(r),
                icon: const Icon(Icons.edit_outlined, size: 18),
                label: const Text('Edit'),
                style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
              ),
              TextButton.icon(
                onPressed: () => _deleteFlow(r),
                icon: const Icon(Icons.delete_outline, size: 18),
                label: const Text('Delete'),
                style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    foregroundColor: AppPalette.of(context).dangerText),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final section = FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snap) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [_header(), _body(snap)],
      ),
    );

    if (widget.embedded) return section;

    return RefreshIndicator(
      onRefresh: () async => _reload(),
      child: ListView(padding: const EdgeInsets.all(16), children: [section]),
    );
  }
}
