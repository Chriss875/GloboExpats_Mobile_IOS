import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/time_utils.dart';
import '../models/order.dart';
import '../theme.dart';
import '../widgets/skeleton_loader.dart';

/// FINANC-01 / LISTIN-17: seller "Payments" under My Space → Selling (web
/// `components/dashboard/payments-received-panel.tsx`, GET
/// `/api/v1/payments/received`). Shows every received/verified payout for the
/// signed-in seller with the buyer receipt trail and the seller's own
/// invoice/EFD documents, so a seller can see exactly what was paid, what is
/// payable to them, and what delivery fee was charged.
///
/// The web panel is filtered to completed orders (status COMPLETED/DELIVERED,
/// plus any row whose order appears in the dashboard's completed selling
/// orders). We mirror the status half of that rule — the panel only ever shows
/// rows whose order has reached a completed/delivered/picked-up state, hiding
/// rows that are still awaiting delivery. PDF/image documents are fetched
/// through their role-authorized relative `fileUrl` with the bearer header,
/// exactly like the web's `AuthenticatedReceiptPreview`.
class SellerPaymentsReceivedPanel extends StatefulWidget {
  const SellerPaymentsReceivedPanel(
      {super.key, this.auth, this.api, this.header = const <Widget>[]});

  final AuthStore? auth;
  final ApiClient? api;

  /// Widgets the host wants scrolled with the list rather than pinned above
  /// it — MySpace hands its section heading and workspace tabs down here so
  /// nothing on the dashboard is sticky (web parity).
  final List<Widget> header;

  @override
  State<SellerPaymentsReceivedPanel> createState() =>
      _SellerPaymentsReceivedPanelState();
}

class _SellerPaymentsReceivedPanelState
    extends State<SellerPaymentsReceivedPanel> {
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  late final ApiClient _api = widget.api ?? ApiClient();
  List<Map<String, dynamic>> _payments = const [];
  bool _loading = true;
  bool _failed = false;
  int _reloadKey = 0;
  String? _uploadingOrderId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final token = _auth.token;
      if (token == null || token.isEmpty) throw 'Not logged in';
      final rows = await _api.fetchReceivedPayments(token);
      // Web parity: completed orders only (the panel appears under a verified
      // seller's workspace, after the related order has been fulfilled).
      final visible = rows.where((p) {
        final status = ((p['orderStatus'] ?? '') as String).toUpperCase();
        return const {'COMPLETED', 'DELIVERED', 'PICKED_UP'}
            .contains(status.replaceAll(RegExp(r'[\s-]+'), '_'));
      }).toList();
      if (!mounted) return;
      setState(() => _payments = visible);
    } catch (_) {
      // A fetch failure is NOT "no payments" (web comment): show the error
      // state with retry instead of a misleading empty state.
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _reload() => setState(() => _reloadKey++);

  @override
  Widget build(BuildContext context) {
    if (_loading && _payments.isEmpty) {
      return _scrollBody(const [FeedSkeleton()]);
    }
    if (_failed && _payments.isEmpty) {
      return _scrollBody([
        _notice(
          title: "Couldn't load your payments",
          body:
              'Something went wrong while fetching your received payments. Please try again.',
          action: OutlinedButton.icon(
            onPressed: _reload,
            icon: const Icon(Icons.refresh),
            label: const Text('Try again'),
          ),
        ),
      ]);
    }
    if (_payments.isEmpty) {
      return _scrollBody([
        _notice(
          title: 'No completed-order payments yet',
          body:
              'Payments appear here after the related order has been delivered and completed.',
        ),
      ]);
    }
    // key: reload forces a fresh fetch even when the panel stays mounted.
    return KeyedSubtree(
      key: ValueKey(_reloadKey),
      child: _scrollBody([
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Column(
            children: [
              for (final payment in _payments)
                _PaymentCard(
                  payment: payment,
                  api: _api,
                  auth: _auth,
                  uploading: _uploadingOrderId == payment['orderId']?.toString(),
                  onPickDocument: (bytes, filename) =>
                      _uploadDocument(payment, bytes, filename),
                ),
            ],
          ),
        ),
      ]),
    );
  }

  /// Every state of this panel is one scroll view whose first children are the
  /// host's [SellerPaymentsReceivedPanel.header], so the MySpace heading and
  /// workspace tabs scroll away with the list instead of being pinned above it.
  Widget _scrollBody(List<Widget> children) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [...widget.header, ...children],
      );

  Widget _notice({required String title, required String body, Widget? action}) =>
      Padding(
        padding: const EdgeInsets.all(32),
        child: Column(children: [
          Icon(Icons.account_balance_wallet_outlined,
              size: 56, color: AppPalette.of(context).textSecondary.withValues(alpha: 0.4)),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style:
                  const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(body,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppPalette.of(context).textSecondary)),
          if (action != null) ...[const SizedBox(height: 16), action],
        ]),
      );

  Future<void> _uploadDocument(Map<String, dynamic> payment, Uint8List bytes,
      String filename) async {
    final orderId = payment['orderId']?.toString();
    final token = _auth.token;
    final messenger = ScaffoldMessenger.of(context);
    if (orderId == null || orderId.isEmpty || token == null) {
      messenger.showSnackBar(
          const SnackBar(content: Text('This order cannot take a document.')));
      return;
    }
    setState(() => _uploadingOrderId = orderId);
    try {
      // Web limits uploads to images/PDF up to 5MB; the gallery picker already
      // returns compressed images, and a PDF picker is not part of this app's
      // dependencies yet (buyer receipt upload has the same constraint).
      await _api.uploadSellerPaymentDocument(token, orderId,
          bytes: bytes, filename: filename);
      messenger.showSnackBar(
          const SnackBar(content: Text('Seller document uploaded')));
      _reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(
          content: Text('Could not upload document: ${e.message}')));
    } finally {
      if (mounted) setState(() => _uploadingOrderId = null);
    }
  }
}

/// Web parity status pill: VERIFIED/CONFIRMED → Approved, REJECTED → Rejected,
/// anything else → Under verification.
({String label, Color background, Color foreground}) _receiptBadge(
    BuildContext context, String? status) {
  final n = (status ?? '').toUpperCase();
  switch (n) {
    case 'VERIFIED':
    case 'CONFIRMED':
      return (
        label: 'Approved',
        background: const Color(0xFFD1FAE5),
        foreground: const Color(0xFF065F46),
      );
    case 'REJECTED':
      return (
        label: 'Rejected',
        background: AppPalette.of(context).dangerFill,
        foreground: const Color(0xFF991B1B),
      );
    default:
      return (
        label: 'Under verification',
        background: const Color(0xFFDBEAFE),
        foreground: const Color(0xFF1E40AF),
      );
  }
}

String _money(num? value, String? currency) {
  final v = value?.toDouble() ?? 0;
  final c = (currency == null || currency.isEmpty) ? 'TZS' : currency;
  return Order.formatAmount(v, c);
}

/// `Approved 26 Aug, 14:05` — EAT list stamp (web formatExactTimestamp).
String? _approvedStamp(String? raw) {
  final t = TimeUtils.tryParseBackendTimestamp(raw);
  if (t == null) return null;
  final e = TimeUtils.toEat(t);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  String two(int n) => n.toString().padLeft(2, '0');
  return 'Approved ${e.day} ${months[e.month - 1]}, ${two(e.hour)}:${two(e.minute)}';
}

/// One received-payment row (web payments-received-panel card).
class _PaymentCard extends StatelessWidget {
  const _PaymentCard({
    required this.payment,
    required this.api,
    required this.auth,
    required this.uploading,
    required this.onPickDocument,
  });

  final Map<String, dynamic> payment;
  final ApiClient api;
  final AuthStore auth;
  final bool uploading;
  final void Function(Uint8List bytes, String filename) onPickDocument;

  List<Map<String, dynamic>> _list(String key) =>
      ((payment[key] as List?) ?? const <dynamic>[])
          .whereType<Map>()
          .map((e) => e.cast<String, dynamic>())
          .toList();

  @override
  Widget build(BuildContext context) {
    final sellerDocuments = _list('sellerDocuments');
    final receipts = _list('receipts');
    final hasSellerDocument = sellerDocuments.isNotEmpty;
    final orderId = payment['orderId']?.toString();
    final badge = _receiptBadge(context, payment['receiptStatus']?.toString());
    final proforma = (payment['proformaNumber'] as String?)?.trim();
    final label = (proforma != null && proforma.isNotEmpty)
        ? proforma
        : (orderId != null && orderId.isNotEmpty)
            ? 'Order #${orderId.length > 8 ? orderId.substring(orderId.length - 8).toUpperCase() : orderId.toUpperCase()}'
            : 'Payment';
    final crossRegion = payment['crossRegionDelivery'] == true;
    final buyerName = (payment['buyerName'] as String?)?.trim();
    final approved = _approvedStamp(payment['verifiedAt']?.toString());

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
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
                        Text(label,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 15)),
                        _Badge(
                            label: badge.label,
                            background: badge.background,
                            foreground: badge.foreground),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (buyerName != null && buyerName.isNotEmpty)
                          'Buyer: $buyerName',
                        if (approved != null) approved,
                      ].join(' · '),
                      style: TextStyle(
                          fontSize: 12, color: AppPalette.of(context).textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(_money(payment['amount'], payment['currency']?.toString()),
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppPalette.of(context).successText)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _metric('Total amount paid',
                    _money(payment['totalAmountPaid'] ?? payment['amount'],
                        payment['currency']?.toString())),
              ),
              Expanded(
                child: _metric(
                    'Amount payable to seller',
                    _money(payment['sellerPayable'] ?? payment['amount'],
                        payment['currency']?.toString())),
              ),
              Expanded(
                child: _metric(
                    'Delivery fee',
                    crossRegion
                        ? '— Arranged\nafter checkout'
                        : _money(payment['deliveryFee'],
                            payment['currency']?.toString())),
              ),
            ],
          ),
          if (orderId != null && orderId.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: hasSellerDocument
                          ? AppPalette.of(context).successFill
                          : AppPalette.of(context).infoFill,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: hasSellerDocument
                            ? AppPalette.of(context).successBorder
                            : AppPalette.of(context).infoBorder,
                        width: 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          hasSellerDocument
                              ? Icons.check_circle_outline
                              : Icons.upload_outlined,
                          size: 20,
                          color: hasSellerDocument
                              ? AppPalette.of(context).successText
                              : AppPalette.of(context).accentInk,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Seller invoice / EFD receipt',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13)),
                              const SizedBox(height: 2),
                              Text(
                                hasSellerDocument
                                    ? 'Uploaded'
                                    : 'Attach a photo after delivery as your proof of sale.',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 12,
                                    color: AppPalette.of(context).textSecondary),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 42,
                  child: OutlinedButton.icon(
                    onPressed: uploading ? null : () => _pick(context),
                    icon: uploading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : Icon(hasSellerDocument
                            ? Icons.refresh
                            : Icons.upload_outlined),
                    label: Text(
                        hasSellerDocument ? 'Replace' : 'Upload'),
                  ),
                ),
              ],
            ),
          ],
          if (sellerDocuments.isNotEmpty) ...[
            const SizedBox(height: 10),
            _ExpandableDocs(
              title: 'Seller documents (${sellerDocuments.length})',
              documents: sellerDocuments,
              api: api,
              auth: auth,
              emerald: true,
            ),
          ],
          if (receipts.isNotEmpty) ...[
            const SizedBox(height: 10),
            _ExpandableDocs(
              title: 'View receipts (${receipts.length})',
              documents: receipts,
              api: api,
              auth: auth,
              emerald: false,
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _pick(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1800,
        imageQuality: 85,
      );
      if (picked == null) return; // cancelled — no upload faked
      final bytes = await picked.readAsBytes();
      if (bytes.isEmpty) {
        messenger.showSnackBar(const SnackBar(
            content: Text('That file is empty - please pick another.')));
        return;
      }
      onPickDocument(bytes, picked.name);
    } catch (e) {
      messenger.showSnackBar(
          SnackBar(content: Text('Could not pick a document: $e')));
    }
  }

  Widget _metric(String label, String value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 11, color: AppColors.textSecondary)),
          const SizedBox(height: 2),
          Text(value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 13)),
        ],
      );
}

class _Badge extends StatelessWidget {
  const _Badge(
      {required this.label,
      required this.background,
      required this.foreground});
  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
          color: background, borderRadius: BorderRadius.circular(999)),
      child: Text(label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: foreground)),
    );
  }
}

/// Seller documents / buyer receipts disclosure. Each file previews its image
/// (fetched through the authed relative fileUrl) or names the PDF.
class _ExpandableDocs extends StatefulWidget {
  const _ExpandableDocs({
    required this.title,
    required this.documents,
    required this.api,
    required this.auth,
    required this.emerald,
  });

  final String title;
  final List<Map<String, dynamic>> documents;
  final ApiClient api;
  final AuthStore auth;
  final bool emerald;

  @override
  State<_ExpandableDocs> createState() => _ExpandableDocsState();
}

class _ExpandableDocsState extends State<_ExpandableDocs> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final docs = widget.documents;
    final color = widget.emerald
        ? AppPalette.of(context).successText
        : AppPalette.of(context).textPrimary;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: widget.emerald ? AppPalette.of(context).successFill : AppPalette.of(context).background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: widget.emerald
                ? AppPalette.of(context).successBorder
                : AppPalette.of(context).border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Expanded(
                    child: Text(widget.title,
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: color)),
                  ),
                  Icon(_open ? Icons.expand_less : Icons.expand_more,
                      size: 18, color: color),
                ],
              ),
            ),
          ),
          if (_open)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                children: [
                  for (var i = 0; i < docs.length; i++) ...[
                    if (i > 0) const SizedBox(height: 8),
                    _FilePreview(
                      document: docs[i],
                      index: i,
                      api: widget.api,
                      auth: widget.auth,
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// One file preview tile: images render inline after an authed byte fetch;
/// PDFs show a labelled document tile (no in-app PDF viewer).
class _FilePreview extends StatelessWidget {
  const _FilePreview({
    required this.document,
    required this.index,
    required this.api,
    required this.auth,
  });

  final Map<String, dynamic> document;
  final int index;
  final ApiClient api;
  final AuthStore auth;

  bool get _isPdf {
    final ct = (document['contentType'] ?? '').toString().toLowerCase();
    final fileName = (document['fileName'] ?? '').toString().toLowerCase();
    return ct == 'application/pdf' ||
        fileName.endsWith('.pdf') ||
        (document['fileUrl'] ?? '').toString().toLowerCase().contains('.pdf');
  }

  String get _name {
    final n = (document['fileName'] as String?)?.trim();
    if (n != null && n.isNotEmpty) return n;
    final ref = (document['transactionReference'] as String?)?.trim();
    return ref != null && ref.isNotEmpty
        ? 'Reference $ref'
        : 'Document ${index + 1}';
  }

  @override
  Widget build(BuildContext context) {
    final fileUrl = (document['fileUrl'] as String?)?.trim();
    if (fileUrl == null || fileUrl.isEmpty) {
      return _tile(context, child: _referenceOnlyTile());
    }
    if (_isPdf) {
      return _tile(context, child: _pdfTile());
    }
    return _imageTile(context, fileUrl);
  }

  Widget _tile(BuildContext context, {required Widget child}) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppPalette.of(context).border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.description_outlined,
                  size: 16, color: AppPalette.of(context).textSecondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(_name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w600)),
              ),
            ]),
            const SizedBox(height: 8),
            child,
          ],
        ),
      );

  Widget _referenceOnlyTile() => SizedBox(
        height: 72,
        child: Center(
          child: Text('Reference-only payment proof',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ),
      );

  Widget _pdfTile() => SizedBox(
        height: 90,
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.picture_as_pdf_outlined, size: 28, color: Colors.redAccent),
            SizedBox(height: 6),
            Text('PDF document',
                style:
                    TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ]),
        ),
      );

  Widget _imageTile(BuildContext context, String fileUrl) {
    final token = auth.token;
    if (token == null || token.isEmpty) {
      return Text('Not signed in',
          style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary));
    }
    return FutureBuilder<Uint8List>(
      future: api.fetchAuthedFileBytes(token, fileUrl),
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const SizedBox(
            height: 72,
            child: Center(
                child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2))),
          );
        }
        if (snap.hasError) {
          return SizedBox(
            height: 72,
            child: Center(
              child: Text('Receipt unavailable',
                  style:
                      TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary)),
            ),
          );
        }
        return ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 200),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.memory(snap.data!,
                fit: BoxFit.contain, gaplessPlayback: true),
          ),
        );
      },
    );
  }
}
