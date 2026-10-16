import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../config.dart';
import '../domain/countdown.dart';
import '../domain/escrow.dart';
import '../domain/time_utils.dart';
import '../domain/pending_actions.dart';
import '../models/product.dart' show Product;
import '../theme.dart';
import '../widgets/skeleton_loader.dart';

/// AU-033: buyer "My Payments" panel — GET /api/v1/payments/my.
///
/// Port of the web's `components/dashboard/my-payments-panel.tsx` +
/// `lib/buyer-payment-recovery.ts` + `lib/payment-timing.ts`:
/// - rows grouped into Pending / Approved / Rejected / Expired tabs;
/// - PENDING_PAYMENT rows show a ticking proforma countdown + "Continue
///   payment" → `/checkout?proforma=<id>`;
/// - rejected rows show the admin's reasonCode/reason + the 48 h correction
///   window countdown ("… remaining to upload corrected proof." /
///   "overstayed by …"), and an inline re-upload that POSTs new receipts to
///   `/api/v1/proformas/{id}/receipts` — which restarts the 30-min review and
///   clears the rejection (the row moves back to Pending);
/// - uploads after the correction window are refused client-side with
///   CORRECTION_WINDOW_CLOSED (the backend refuses them too).
class MyPaymentsScreen extends StatefulWidget {
  const MyPaymentsScreen({
    super.key,
    this.auth,
    this.api,
    this.paymentsHttpClient,
    this.initialGroup = PaymentGroup.pending,
    this.onContinuePayment,
    this.nowUtc,
    this.embedded = false,
    this.header = const <Widget>[],
  });

  final AuthStore? auth;
  final ApiClient? api;

  /// Widgets the host wants scrolled with the list rather than pinned above
  /// it — MySpace hands its section heading and workspace tabs down here so
  /// nothing on the dashboard is sticky (web parity).
  final List<Widget> header;

  /// True when rendered inside a MySpace tab (Buying → Payments), where the
  /// shared GloboAppBar and tab bar already own the chrome — drops this
  /// screen's own Scaffold+AppBar, same pattern as the other embeddable
  /// sections (AddressBookSection, PayoutDetailsSection).
  final bool embedded;

  /// Test seam: the http transport PaymentsApi uses (mocked in widget tests).
  final http.Client? paymentsHttpClient;

  /// Deep-link parity: web reads `?paymentStatus=rejected` into the active tab.
  final PaymentGroup initialGroup;

  /// Test/verification seam for "Continue payment" navigation (defaults to
  /// pushing `/checkout?proforma=<id>` on the root router).
  final void Function(BuildContext context, String proformaId)? onContinuePayment;

  /// Injectable clock so the correction-window math is testable.
  final DateTime? nowUtc;

  @override
  State<MyPaymentsScreen> createState() => _MyPaymentsScreenState();
}

class _MyPaymentsScreenState extends State<MyPaymentsScreen> {
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  // Payments endpoints live in PaymentsApi (this file) — the shared
  // ApiClient stays untouched for the lanes that own it.
  late final PaymentsApi _api =
      PaymentsApi(client: widget.paymentsHttpClient);
  late PaymentGroup _group = widget.initialGroup;
  List<BuyerPayment> _payments = const [];
  bool _loading = true;
  bool _failed = false;
  Timer? _ticker;
  DateTime _now = DateTime.now().toUtc();

  /// Raw `expiresAt` values already refetched for after their countdown
  /// crossed zero. Guards the expiry recheck so a row whose server deadline is
  /// unchanged does not refetch on every tick, while a genuinely new deadline
  /// (server extended) reloads again.
  final Set<String> _expiryReloaded = {};

  @override
  void initState() {
    super.initState();
    _load();
    // Web refreshes `now` every 30 s so countdowns keep moving without a
    // per-second rebuild of the whole list. FINANC-10/13 residual: when a
    // proforma countdown expires the row must be refetched so a Pending
    // badge/row is not left stale (web reloads on expiry).
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      final now = DateTime.now().toUtc();
      var crossed = false;
      for (final p in _payments) {
        if (!Countdown.visibleForStatus(p.status)) continue;
        final raw = p.raw['expiresAt'];
        if (raw == null) continue;
        final key = raw.toString();
        if (_expiryReloaded.contains(key)) continue;
        final exp = TimeUtils.tryParseBackendTimestamp(raw);
        if (exp != null && !exp.isAfter(now)) {
          _expiryReloaded.add(key);
          crossed = true;
        }
      }
      setState(() => _now = now);
      if (crossed) _load();
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final token = _auth.token;
      if (token == null || token.isEmpty) throw 'Not logged in';
      final list = await _api.fetchMyPayments(token);
      if (!mounted) return;
      setState(() => _payments = list);
    } catch (_) {
      // A fetch failure is NOT "no payments" (web comment): show the error
      // state with retry instead of a misleading empty state.
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resendProof(BuyerPayment payment, Uint8List bytes, String fileName) async {
    final token = _auth.token;
    if (token == null || token.isEmpty) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.uploadPaymentReceipts(token, payment.proformaId!, bytes,
          fileName: fileName);
      requestPendingActionsRefresh();
      // Web: toast + jump to Pending + refetch. The backend cleared the
      // rejection fields and reopened a fresh 30-min review.
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(const SnackBar(
        content: Text('New proof sent'),
        backgroundColor: Colors.green,
      ));
      if (!mounted) return;
      setState(() => _group = PaymentGroup.pending);
      await _load();
    } on ApiException catch (e) {
      final closed =
          e.message.toUpperCase().contains('CORRECTION_WINDOW_CLOSED');
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(SnackBar(
        content: Text(closed
            ? 'The 48-hour correction period has ended — GloboExpats can now '
                'cancel this invoice. Please contact support.'
            : e.message),
        backgroundColor: Colors.red,
      ));
    } catch (e) {
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(SnackBar(
        content: Text('Upload failed: $e'),
        backgroundColor: Colors.red,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_loading) {
      body = _scrollBody(const [FeedSkeleton()]);
    } else if (_failed) {
      body = _scrollBody([
        const SizedBox(height: 48),
        const Icon(Icons.credit_card_outlined, size: 56, color: Colors.grey),
        const SizedBox(height: 12),
        const Text("Couldn't load your payments",
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 32),
          child: Text(
            'Something went wrong while fetching your payment history. '
            'Please try again.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppPalette.of(context).textSecondary),
          ),
        ),
        const SizedBox(height: 16),
        Center(
          child:
              OutlinedButton(onPressed: _load, child: const Text('Try again')),
        ),
      ]);
    } else if (_payments.isEmpty) {
      body = _scrollBody([
        SizedBox(height: 48),
        Icon(Icons.receipt_long_outlined, size: 56, color: Colors.grey),
        SizedBox(height: 12),
        Text('No payments yet',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        SizedBox(height: 6),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 32),
          child: Text(
            'When you place an order and confirm your payment, your '
            'proforma invoices and receipts will appear here.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppPalette.of(context).textSecondary),
          ),
        ),
      ]);
    } else {
      body = _scrollBody([
        _GroupTabs(
          payments: _payments,
          active: _group,
          onSelect: (g) => setState(() => _group = g),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              for (final p
                  in _payments.where((p) => BuyerPayment.groupOf(p) == _group))
                _PaymentCard(
                  key: ValueKey(p.proformaId ?? p.proformaNumber),
                  payment: p,
                  nowUtc: widget.nowUtc ?? _now,
                  onResend: _resendProof,
                  onContinuePayment: widget.onContinuePayment,
                ),
              if (_payments
                  .where((p) => BuyerPayment.groupOf(p) == _group)
                  .isEmpty)
                _EmptyGroup(group: _group),
            ],
          ),
        ),
      ]);
    }
    if (widget.embedded) return body;
    return Scaffold(
      appBar: AppBar(title: const Text('My Payments')),
      body: body,
    );
  }

  /// Every state of this screen is one scroll view whose first children are
  /// the host's [MyPaymentsScreen.header], so the MySpace heading and
  /// workspace tabs scroll away with the list instead of being pinned above it.
  Widget _scrollBody(List<Widget> children) => RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [...widget.header, ...children],
        ),
      );
}

enum PaymentGroup { pending, verified, rejected, expired }

/// One row of GET /payments/my (BUYER_FLOW_SPEC §6 T15 shape).
class BuyerPayment {
  BuyerPayment(this.raw);

  final Map<String, dynamic> raw;

  static String _norm(dynamic v) => (v ?? '').toString().trim().toUpperCase();

  String? get proformaId => raw['proformaId']?.toString();
  String get proformaNumber => (raw['proformaNumber'] ?? '').toString();
  num get grandTotal =>
      (raw['grandTotal'] ?? raw['amount'] ?? 0) is num
          ? (raw['grandTotal'] ?? raw['amount'] ?? 0) as num
          : 0;
  String get currency => (raw['currency'] ?? 'TZS').toString();
  String get status => _norm(raw['status']);
  String get paymentMethodType =>
      ((raw['paymentMethodType'] ?? '') as String).replaceAll('_', ' ').toLowerCase();
  List<String> get orderIds =>
      [for (final id in (raw['orderIds'] as List? ?? const [])) id.toString()];
  List<Map<String, dynamic>> get receipts => [
        for (final r in (raw['receipts'] as List? ?? const []))
          if (r is Map) r.cast<String, dynamic>(),
      ];

  /// Recovery-state precedence (web lib/buyer-payment-recovery.ts): a
  /// replacement SUBMITTED receipt outranks an older REJECTED one.
  static bool _in(String status, List<String> of) => of.contains(status);

  static PaymentGroup groupOf(BuyerPayment p) {
    final s = p.status;
    final receiptStatuses = [for (final r in p.receipts) _norm(r['status'])];
    if (_in(s, const ['CONFIRMED', 'VERIFIED'])) return PaymentGroup.verified;
    if (_in(s, const ['EXPIRED', 'CANCELLED'])) return PaymentGroup.expired;
    if (receiptStatuses.contains('SUBMITTED')) return PaymentGroup.pending;
    if (s == 'REJECTED' || receiptStatuses.contains('REJECTED')) {
      return PaymentGroup.rejected;
    }
    if (_in(s, const [
      'PAYMENT_SUBMITTED',
      'SUBMITTED',
      'PENDING_VERIFICATION',
      'UNDER_REVIEW'
    ])) {
      return PaymentGroup.pending;
    }
    return PaymentGroup.pending; // PENDING_PAYMENT and unknowns
  }

  bool get resumable => status == 'PENDING_PAYMENT';

  /// Rejected receipts on a payment that isn't settled yet — these are what
  /// the buyer must correct.
  List<Map<String, dynamic>> get rejectedReceipts {
    if (groupOf(this) != PaymentGroup.rejected) return const [];
    return [
      for (final r in receipts)
        if (_norm(r['status']) == 'REJECTED') r,
    ];
  }

  /// 48 h correction deadline: explicit field > rejectedAt+48h >
  /// max(receipt reviewedAt|submittedAt)+48h (Escrow.correctionDeadline).
  DateTime? correctionDeadline() => Escrow.correctionDeadline(
        explicitDeadline: raw['correctionDeadline'],
        rejectedAt: raw['rejectedAt'],
        receiptStamps: [
          for (final r in rejectedReceipts)
            r['reviewedAt'] ?? r['submittedAt'],
        ],
      );

  /// Human label for a rejection: prefer the admin's free-text reason, then
  /// fall back to a readable form of the reasonCode.
  String rejectionLabel(Map<String, dynamic> receipt) {
    final code = _norm(receipt['rejectionReasonCode']);
    final reason = (receipt['rejectionReason'] ?? '').toString().trim();
    if (reason.isNotEmpty) return '$code — $reason';
    return code.isEmpty ? 'No reason provided - contact support.' : code;
  }

  /// "Pending since 8/23/2026, 3:18 PM" — web formatExactTimestamp.
  String pendingSinceLabel() {
    final t = TimeUtils.tryParseBackendTimestamp(raw['submittedAt'] ?? raw['createdAt']);
    if (t == null) return 'Pending since Recent';
    final eat = TimeUtils.toEat(t);
    final nf = NumberFormat();
    return 'Pending since ${eat.month}/${eat.day}/${eat.year}, '
        '${_hour12(eat.hour)}:${nf.format(eat.minute).padLeft(2, '0')} '
        '${eat.hour >= 12 ? 'PM' : 'AM'}';
  }

  static String _hour12(int h) {
    final hh = h % 12 == 0 ? 12 : h % 12;
    return hh.toString();
  }
}

class _GroupTabs extends StatelessWidget {
  const _GroupTabs({required this.payments, required this.active, required this.onSelect});

  final List<BuyerPayment> payments;
  final PaymentGroup active;
  final ValueChanged<PaymentGroup> onSelect;

  String _title(PaymentGroup g) {
    switch (g) {
      case PaymentGroup.pending:
        return 'Pending';
      case PaymentGroup.verified:
        return 'Approved';
      case PaymentGroup.rejected:
        return 'Rejected';
      case PaymentGroup.expired:
        return 'Expired';
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget iconFor(PaymentGroup g) {
      switch (g) {
        case PaymentGroup.pending:
          return const Icon(Icons.schedule_outlined, size: 16);
        case PaymentGroup.verified:
          return const Icon(Icons.check_circle_outline, size: 16);
        case PaymentGroup.rejected:
          return const Icon(Icons.error_outline, size: 16);
        case PaymentGroup.expired:
          return const Icon(Icons.event_busy_outlined, size: 16);
      }
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Row(
        children: [
          for (final g in PaymentGroup.values)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => onSelect(g),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
                    decoration: BoxDecoration(
                      color: active == g ? AppColors.brandBlue : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        IconTheme.merge(
                          data: IconThemeData(
                              color: active == g ? Colors.white : AppPalette.of(context).textSecondary),
                          child: iconFor(g),
                        ),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            '${_title(g)} ${payments.where((p) => BuyerPayment.groupOf(p) == g).length}',
                            maxLines: 1,
                            overflow: TextOverflow.fade,
                            softWrap: false,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: active == g ? Colors.white : AppPalette.of(context).textPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _EmptyGroup extends StatelessWidget {
  const _EmptyGroup({required this.group});
  final PaymentGroup group;

  @override
  Widget build(BuildContext context) {
    final copy = switch (group) {
      PaymentGroup.pending => 'Payments awaiting payment or GloboExpats verification',
      PaymentGroup.verified => 'Payments approved by GloboExpats',
      PaymentGroup.rejected => 'Payments that need corrected proof',
      PaymentGroup.expired => 'Expired or cancelled invoices',
    };
    final title = switch (group) {
      PaymentGroup.pending => 'No pending payments',
      PaymentGroup.verified => 'No approved payments',
      PaymentGroup.rejected => 'No rejected payments',
      PaymentGroup.expired => 'No expired payments',
    };
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        border: Border.all(color: AppPalette.of(context).border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          const Icon(Icons.receipt_long_outlined, size: 40, color: Colors.grey),
          const SizedBox(height: 10),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(copy,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppPalette.of(context).textSecondary, fontSize: 12)),
        ],
      ),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({
    super.key,
    required this.payment,
    required this.nowUtc,
    required this.onResend,
    required this.onContinuePayment,
  });

  final BuyerPayment payment;
  final DateTime nowUtc;
  final Future<void> Function(BuyerPayment, Uint8List, String) onResend;
  final void Function(BuildContext, String)? onContinuePayment;

  Color get _badgeColor {
    switch (payment.status) {
      case 'CONFIRMED':
      case 'VERIFIED':
        return Colors.green.shade50;
      case 'PAYMENT_SUBMITTED':
      case 'SUBMITTED':
        return Colors.blue.shade50;
      case 'EXPIRED':
        return Colors.orange.shade100;
      case 'CANCELLED':
      case 'REJECTED':
        return Colors.red.shade50;
      default:
        return Colors.amber.shade100;
    }
  }

  String get _badgeText {
    if (payment.rejectedReceipts.isNotEmpty) return 'Action needed - new proof';
    switch (payment.status) {
      case 'CONFIRMED':
      case 'VERIFIED':
        return 'Approved';
      case 'PAYMENT_SUBMITTED':
      case 'SUBMITTED':
        return 'Pending';
      case 'EXPIRED':
        return 'Expired';
      case 'REJECTED':
        return 'Rejected';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return 'Pending payment';
    }
  }

  void _openCheckout(BuildContext context, String proformaId) {
    if (onContinuePayment != null) {
      onContinuePayment!(context, proformaId);
      return;
    }
    // Web parity: /checkout?proforma=<id> resumes the active proforma.
    GoRouter.of(context).push('/checkout?proforma=$proformaId');
  }

  Future<void> _pickAndSend(BuildContext context) async {
    // image_picker is the only real file source on mobile; the web ReceiptUpload
    // accepts JPEG/PNG/WebP/PDF up to 5 files x 5MB and compresses before
    // sending. Picking is async platform work — surface honest failures.
    final messenger = ScaffoldMessenger.of(context);
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1600,
        imageQuality: 80,
      );
      if (picked == null) return; // user cancelled — no upload faked
      final bytes = await picked.readAsBytes();
      if (bytes.isEmpty) {
        messenger.showSnackBar(const SnackBar(
            content: Text('That file is empty - please pick another.')));
        return;
      }
      await onResend(payment, bytes, picked.name);
    } catch (e) {
      messenger.showSnackBar(
          SnackBar(content: Text('Could not pick a receipt file: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final rejected = payment.rejectedReceipts;
    final needsNewProof = rejected.isNotEmpty;
    final deadline = needsNewProof ? payment.correctionDeadline() : null;
    Duration? remaining;
    Duration? overdue;
    if (deadline != null) {
      final d = deadline.difference(nowUtc.toUtc());
      remaining = d.isNegative ? Duration.zero : d;
      overdue = d.isNegative ? d.abs() : Duration.zero;
    }
    final windowClosed = overdue != null && overdue > Duration.zero;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          payment.proformaNumber.isEmpty
                              ? 'Proforma Invoice'
                              : payment.proformaNumber,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: _badgeColor,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(_badgeText,
                              style: const TextStyle(
                                  fontSize: 11, fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if ((payment.raw['submittedAt'] ?? payment.raw['createdAt']) != null)
                          payment.pendingSinceLabel(),
                        if (payment.paymentMethodType.isNotEmpty) payment.paymentMethodType,
                        if (payment.receipts.isNotEmpty)
                          '${payment.receipts.length} receipt${payment.receipts.length > 1 ? 's' : ''}',
                      ].join(' · '),
                      style: TextStyle(
                          fontSize: 12, color: AppPalette.of(context).textSecondary),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(Product.formatPrice(payment.grandTotal.toDouble(), payment.currency),
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  if (payment.resumable && payment.proformaId != null)
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brandBlue,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                      onPressed: () => _openCheckout(context, payment.proformaId!),
                      icon: const Icon(Icons.arrow_forward, size: 16),
                      label: const Text('Continue payment',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                    )
                  else if (payment.orderIds.isNotEmpty)
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                      // Navigator.pushNamed does not resolve under
                      // MaterialApp.router — GoRouter owns these routes.
                      onPressed: () =>
                          context.push('/orders/${payment.orderIds.first}'),
                      child: const Text('Order'),
                    ),
                ],
              ),
            ],
          ),

          // Ticking proforma countdown while still awaiting payment (hidden
          // under review / once settled — Countdown.visibleForStatus).
          if (payment.resumable && Countdown.visibleForStatus(payment.status)) ...[
            const SizedBox(height: 8),
            Builder(builder: (context) {
              final label = Countdown.proformaLabel(
                proformaStatus: payment.status,
                expiresAt: payment.raw['expiresAt'],
                nowUtc: nowUtc,
              );
              return label == null
                  ? const SizedBox.shrink()
                  : Row(
                      children: [
                        Icon(Icons.timer_outlined,
                            size: 14, color: AppPalette.of(context).textSecondary),
                        const SizedBox(width: 4),
                        // The expired-state copy is a full sentence; keep it
                        // inside the card instead of overflowing the row.
                        Expanded(
                          child: Text(label,
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppPalette.of(context).accentInk)),
                        ),
                      ],
                    );
            }),
          ],

          // Rejection block: reason + correction-window countdown + re-upload.
          if (needsNewProof && payment.proformaId != null) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.amber.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.warning_amber_rounded,
                          size: 16, color: Colors.amber.shade800),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Your proof of payment was rejected - please upload a new one.',
                          style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                              color: Colors.amber.shade900),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  for (final r in rejected)
                    Padding(
                      padding: const EdgeInsets.only(left: 22, bottom: 2),
                      child: Text(
                        '${(r['fileName'] ?? '').toString().isEmpty ? '' : '${r['fileName']}: '}'
                        '${payment.rejectionLabel(r)}',
                        style: TextStyle(fontSize: 12, color: Colors.amber.shade900),
                      ),
                    ),
                  if (deadline != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      windowClosed
                          ? 'The 48-hour correction period overstayed by '
                              '${formatDuration(overdue)}. GloboExpats can now cancel this invoice.'
                          : '${formatDuration(remaining)} remaining to upload corrected proof.',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                    ),
                  ],
                  if (!windowClosed)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Wrap(
                        spacing: 8,
                        children: [
                          FilledButton.icon(
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.brandBlue,
                            ),
                            onPressed: () => _pickAndSend(context),
                            icon: const Icon(Icons.upload_file_outlined, size: 16),
                            label: const Text('Reopen & update payment'),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}


/// `1d 3h 20m`-style duration label (web formatPaymentDuration).
String formatDuration(Duration? d) {
  if (d == null) return '';
  final minutes = d.inMinutes;
  final days = minutes ~/ (24 * 60);
  final hours = (minutes % (24 * 60)) ~/ 60;
  final mins = minutes % 60;
  return [
    if (days > 0) '${days}d',
    '${hours}h',
    '${mins}m',
  ].join(' ');
}

/// AU-033 contract wrappers. They live here (not in api_client.dart, owned by
/// another lane) with their own injectable http client — same pattern as
/// ApiClient(baseUrl/client) so widget tests can mock the transport.
class PaymentsApi {
  PaymentsApi({http.Client? client, String? baseUrl})
      : _http = client ?? http.Client(),
        baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  final http.Client _http;
  final String baseUrl;

  /// GET /payments/my typed to rows.
  Future<List<BuyerPayment>> fetchMyPayments(String token) async {
    final resp = await _http.get(
      Uri.parse('$baseUrl/api/v1/payments/my'),
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
      },
    );
    if (resp.statusCode == 401) {
      AuthStore.instance?.handleUnauthorized();
      throw ApiException('401 unauthorized', unauthorized: true);
    }
    if (resp.statusCode != 200) throw ApiException('HTTP ${resp.statusCode}');
    final data = jsonDecode(resp.body);
    final list = data is List
        ? data
        : data is Map
            ? (data['content'] ?? data['items'] ?? const [])
            : const [];
    return [
      for (final row in list.whereType<Map>())
        BuyerPayment(row.cast<String, dynamic>()),
    ];
  }

  /// Re-upload corrected proof: POST /proformas/{id}/receipts multipart with
  /// one or more `receipts` file parts (+ optional plain-text `details` JSON).
  /// The backend clears the rejection fields and restarts a fresh 30-min
  /// review; after the 48-h correction window it answers
  /// CORRECTION_WINDOW_CLOSED (surfaced verbatim by the caller).
  Future<List<dynamic>> uploadPaymentReceipts(
    String token,
    String proformaId,
    Uint8List bytes, {
    String fileName = 'receipt.png',
    String contentType = 'image/png',
    List<String>? transactionReferences,
  }) async {
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('$baseUrl/api/v1/proformas/$proformaId/receipts'),
    )..headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
      });
    req.files.add(http.MultipartFile.fromBytes('receipts', bytes,
        filename: fileName));
    if (transactionReferences != null && transactionReferences.isNotEmpty) {
      // Plain text, not application/json: the backend's `details` field is a
      // raw String it parses itself (same gotcha as the web client).
      req.fields['details'] =
          jsonEncode({'transactionReferences': transactionReferences});
    }
    final streamed = await _http.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode == 401) {
      AuthStore.instance?.handleUnauthorized();
      throw ApiException('401 unauthorized', unauthorized: true);
    }
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      // Backend business failures ride inside the body (message/error-code
      // tokens) — surface those rather than a bare HTTP number.
      var msg = 'HTTP ${resp.statusCode}';
      try {
        final body = jsonDecode(resp.body);
        if (body is Map && body['message'] != null) msg = body['message'].toString();
      } catch (_) {
        if (resp.body.trim().isNotEmpty && resp.body.length < 300) {
          msg = resp.body.trim();
        }
      }
      throw ApiException(msg);
    }
    final body = resp.body.isEmpty ? '[]' : resp.body;
    final decoded = jsonDecode(body);
    return decoded is List ? decoded : [if (decoded is Map) decoded];
  }
}
