import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/countdown.dart';
import '../theme.dart';

/// GloboExpats' own receiving details, one block per method — both run on the
/// Selcom merchant account. Static like the web (`PAYMENT_METHOD_DETAILS` in
/// app/checkout/steps/payment-confirmation-step.tsx): the proforma's
/// `paymentInstructions` is only a method-agnostic blob generated before the
/// buyer picks a method, so it is shown as a hint, never as the account data.
const _mobileMoneyDetails = [
  ('Lipa Namba', '7003 9305'),
  ('Name', 'GloboExpats Limited'),
  ('Network', 'Selcom'),
];

const _bankTransferDetails = [
  ('Account number', '5527108094688'),
  ('Account name', 'GloboExpats Limited'),
  ('Bank', 'Selcom'),
];

/// Payment step for a created proforma (web Step 3 parity). Surfaces the
/// platform's real receiving details for the chosen method + the payment
/// reference (= proformaNumber), then calls the sandbox `submit-payment` and
/// renders the REAL backend result — we never fake a payment success.
class PaymentScreen extends StatefulWidget {
  final String proformaId;
  final ApiClient? api;
  const PaymentScreen({super.key, required this.proformaId, this.api});
  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  bool _submitting = false;
  // Bank first and selected by default, as the product asks; Lipa Namba
  // stays available as the second option.
  String _method = 'BANK_TRANSFER';
  final _referenceController = TextEditingController();
  Map<String, dynamic>? _result;
  String? _error;

  late final ApiClient _api = widget.api ?? ApiClient();

  @override
  void dispose() {
    _referenceController.dispose();
    super.dispose();
  }

  Future<void> _pay() async {
    final auth = AuthStore.instance;
    final token = auth?.token;
    if (token == null) {
      setState(() => _error = 'You need to be logged in.');
      return;
    }
    setState(() { _submitting = true; _error = null; _result = null; });
    try {
      final res = await _api.submitPayment(
        token,
        widget.proformaId,
        transactionReferences: [_referenceController.text.trim()],
        // AU-029: backend PaymentMethodType accepts MOBILE_MONEY |
        // BANK_TRANSFER only ('CARD' is invalid); MOBILE_MONEY is the default.
        paymentMethodType: _method,
      );
      if (!mounted) return;
      setState(() { _submitting = false; _result = res; });
    } on ApiException catch (e) {
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      setState(() { _submitting = false; _error = e.message; });
    }
  }

  /// Success branches ONLY on the authoritative status field (BUYER_FLOW_SPEC
  /// §6) — a non-error body alone is not a success.
  bool get _submittedOk => (_result?['status'] ?? '').toString() == 'PAYMENT_SUBMITTED';

  String get _proformaNumber =>
      (_result?['proformaNumber'] ?? widget.proformaId).toString();

  /// First per-seller order id from the submit-payment response (web parity:
  /// `sellerGroups.find(g => g.orderId)?.orderId`).
  String? get _firstOrderId {
    for (final group in (_result?['sellerGroups'] as List<dynamic>? ?? const [])) {
      if (group is Map && group['orderId'] != null) return group['orderId'].toString();
    }
    return null;
  }

  List<(String, String)> get _receivingDetails =>
      _method == 'BANK_TRANSFER' ? _bankTransferDetails : _mobileMoneyDetails;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (!_submittedOk) ...[
            Icon(Icons.lock_outline, size: 48, color: AppPalette.of(context).accentInk),
            const SizedBox(height: 12),
            const Text('Complete payment',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text('Pay $_proformaNumber',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 13)),
            const SizedBox(height: 20),

            // Method picker (web V2_PAYMENT_METHODS).
            Row(children: [
              Expanded(
                child: ChoiceChip(
                  label: const Text('Bank Account'),
                  selected: _method == 'BANK_TRANSFER',
                  onSelected: (_) => setState(() => _method = 'BANK_TRANSFER'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ChoiceChip(
                  label: const Text('Lipa Namba'),
                  selected: _method == 'MOBILE_MONEY',
                  onSelected: (_) => setState(() => _method = 'MOBILE_MONEY'),
                ),
              ),
            ]),
            const SizedBox(height: 12),

            // Receiving details for the chosen method (web #selcom-payment-details).
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppPalette.of(context).surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppPalette.of(context).border),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Pay via ${_method == 'BANK_TRANSFER' ? 'Bank Account' : 'Lipa Namba'}',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text('Use only the official GloboExpats account below.',
                    style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 12)),
                const SizedBox(height: 10),
                for (final (label, value) in _receivingDetails)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      Expanded(child: Text(label, style: TextStyle(color: AppPalette.of(context).textSecondary))),
                      Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
                    ]),
                  ),
                const Divider(height: 18),
                Row(children: [
                  Expanded(child: Text('Payment reference',
                      style: TextStyle(color: AppPalette.of(context).textSecondary))),
                  Flexible(
                    child: Text(_proformaNumber,
                        textAlign: TextAlign.right,
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ]),
              ]),
            ),
            const SizedBox(height: 12),

            TextFormField(
              controller: _referenceController,
              decoration: const InputDecoration(
                labelText: 'Transaction reference number',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              "This sandbox runs the backend's payment/settlement logic. We show only the "
              'result the backend actually returns — a payment is never reported as successful '
              'unless the backend confirms it.',
              style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 13, height: 1.4),
            ),

            // Countdown until the proforma expires (hidden once submitted).
            Builder(builder: (context) {
              final label = Countdown.proformaLabel(
                proformaStatus: (_result?['status'] ?? 'PENDING_PAYMENT').toString(),
                expiresAt: _result?['expiresAt'],
                nowUtc: DateTime.now().toUtc(),
              );
              if (label == null) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(label,
                    style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.price)),
              );
            }),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.brandBlue, padding: const EdgeInsets.symmetric(vertical: 16)),
              onPressed: _submitting ? null : _pay,
              child: _submitting
                  ? SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppPalette.of(context).surface))
                  : const Text('Submit Payment for Verification', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ] else ...[
            const Icon(Icons.check_circle_outline, size: 48, color: AppColors.accentGreen),
            const SizedBox(height: 12),
            const Text('Payment Submitted and Under review',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text('Reference: ${_firstOrderId ?? _proformaNumber}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              'Your payment confirmation has been received. GloboExpats will verify your '
              'payment and notify you within 30 minutes as soon as it is confirmed.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 24),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.brandBlue, minimumSize: const Size.fromHeight(48)),
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text('Order reference: ${_firstOrderId ?? _proformaNumber}'),
                ));
              },
              child: const Text('View Order Details'),
            ),
          ],
        ],
      ),
    );
  }
}
