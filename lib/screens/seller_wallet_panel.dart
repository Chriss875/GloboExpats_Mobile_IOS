import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/seller_wallet.dart';
import '../theme.dart';
import '../widgets/skeleton_loader.dart' show SkeletonBox;
import '../domain/image_upload.dart' show renameForMime, sniffImageMime;

/// Web parity `components/dashboard/seller-virtual-wallet.tsx` (phone
/// layout): unsettled, settled and total earnings, then each payout with
/// how it was worked out, why it is waiting, the seller's EFD receipt and —
/// once GloboExpats has paid — the transfer proof.
///
/// It reports money; it never moves it. The only thing a seller does here is
/// attach their EFD receipt to a delivered order.
class SellerWalletPanel extends StatefulWidget {
  const SellerWalletPanel({
    super.key,
    required this.api,
    this.header = const <Widget>[],
    this.pickReceipt,
  });
  final ApiClient api;
  final List<Widget> header;

  /// Test seam for the receipt picker (image_picker has no platform under
  /// `flutter test`).
  final Future<XFile?> Function()? pickReceipt;

  @override
  State<SellerWalletPanel> createState() => _SellerWalletPanelState();
}

class _SellerWalletPanelState extends State<SellerWalletPanel> {
  static const _pageSize = 15;
  static const _maxReceiptBytes = 5 * 1024 * 1024;

  late Future<SellerWallet> _future = _load();
  WalletSettlement? _filter; // null = All
  final _search = TextEditingController();
  int _page = 1;
  String? _uploadingOrderId;

  Future<SellerWallet> _load() {
    final token = AuthStore.instance?.token;
    if (token == null) {
      return Future.value(const SellerWallet(
          summary: SellerWalletSummary(),
          rows: [],
          payoutDetailsConfigured: true));
    }
    return widget.api.getSellerWallet(token);
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next.catchError((Object _) => const SellerWallet(
        summary: SellerWalletSummary(),
        rows: [],
        payoutDetailsConfigured: true));
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Widget _scroll(List<Widget> children) => RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            ...widget.header,
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [_heading(), const SizedBox(height: 16), ...children],
              ),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) => FutureBuilder<SellerWallet>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return _scroll(const [_WalletSkeleton()]);
          }
          if (snap.hasError) return _scroll([_loadFailed()]);
          final wallet = snap.data!;
          // Web: nothing below the heading until there is a payout to show.
          if (wallet.rows.isEmpty) return _scroll(const []);
          return _scroll(_content(wallet));
        },
      );

  Widget _heading() {
    final palette = AppPalette.of(context);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: palette.infoFill,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: palette.infoBorder),
        ),
        child: Icon(Icons.account_balance_wallet_outlined,
            size: 20, color: palette.accentInk),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Virtual wallet',
              style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: palette.textPrimary)),
          const SizedBox(height: 3),
          Text(
              'Money from your sales: what is unsettled, what is settled, '
              'and how each amount is worked out.',
              style: TextStyle(
                  fontSize: 12.5, height: 1.4, color: palette.textSecondary)),
        ]),
      ),
    ]);
  }

  Widget _loadFailed() {
    final palette = AppPalette.of(context);
    return Container(
      key: const ValueKey('wallet-load-failed'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.border),
      ),
      child: Column(children: [
        Text('Couldn’t load your wallet',
            style: TextStyle(
                fontWeight: FontWeight.w700, color: palette.textPrimary)),
        const SizedBox(height: 4),
        Text('Please check your connection and try again.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12.5, color: palette.textSecondary)),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: _refresh,
          icon: const Icon(Icons.refresh_rounded, size: 18),
          label: const Text('Try again'),
        ),
      ]),
    );
  }

  List<Widget> _content(SellerWallet wallet) {
    final palette = AppPalette.of(context);
    final summary = wallet.summary;
    final currency = summary.currency;
    final rows = sortWalletRows(wallet.rows);
    final filtered = filterWalletRows(rows, _filter, _search.text);
    final pageCount = (filtered.length / _pageSize).ceil().clamp(1, 1 << 30);
    final page = _page > pageCount ? pageCount : _page;
    final visible =
        filtered.skip((page - 1) * _pageSize).take(_pageSize).toList();

    return [
      if (!wallet.payoutDetailsConfigured && summary.unsettledCount > 0) ...[
        _payoutDetailsBanner(),
        const SizedBox(height: 14),
      ],
      Row(children: [
        Expanded(
          child: _SummaryCard(
            label: 'Unsettled',
            value: formatWalletMoney(summary.unsettledTotal, currency),
            count: summary.unsettledCount,
            accent: palette.warningText,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _SummaryCard(
            label: 'Settled',
            value: formatWalletMoney(summary.settledTotal, currency),
            count: summary.settledCount,
            accent: palette.successText,
          ),
        ),
      ]),
      const SizedBox(height: 10),
      _SummaryCard(
        label: 'Total earnings',
        value: formatWalletMoney(summary.total, currency),
        count: summary.totalCount,
        accent: palette.accentInk,
      ),
      const SizedBox(height: 18),
      Container(
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: palette.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Payouts',
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: palette.textPrimary)),
                  const SizedBox(height: 2),
                  Text(
                      '${filtered.length} '
                      '${filtered.length == 1 ? 'order' : 'orders'} · amounts in $currency',
                      style: TextStyle(
                          fontSize: 11.5, color: palette.textSecondary)),
                  const SizedBox(height: 10),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    for (final f in <({String label, WalletSettlement? value, int count})>[
                      (label: 'All', value: null, count: summary.totalCount),
                      (
                        label: 'Unsettled',
                        value: WalletSettlement.unsettled,
                        count: summary.unsettledCount
                      ),
                      (
                        label: 'Settled',
                        value: WalletSettlement.settled,
                        count: summary.settledCount
                      ),
                    ])
                      ChoiceChip(
                        key: ValueKey('wallet-filter-${f.label.toLowerCase()}'),
                        label: Text('${f.label} ${f.count}'),
                        selected: _filter == f.value,
                        onSelected: (_) => setState(() {
                          _filter = f.value;
                          _page = 1;
                        }),
                      ),
                  ]),
                  const SizedBox(height: 10),
                  TextField(
                    key: const ValueKey('wallet-search'),
                    controller: _search,
                    onChanged: (_) => setState(() => _page = 1),
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      isDense: true,
                      hintText: 'Search order, item or buyer',
                      prefixIcon: const Icon(Icons.search_rounded, size: 20),
                      filled: true,
                      fillColor: palette.surfaceMuted,
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(999),
                          borderSide: BorderSide(color: palette.border)),
                      enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(999),
                          borderSide: BorderSide(color: palette.border)),
                    ),
                  ),
                ]),
          ),
          if (visible.isNotEmpty)
            Container(
              color: palette.background,
              padding: const EdgeInsets.all(10),
              child: Column(children: [
                for (final row in visible)
                  _PayoutCard(
                    row: row,
                    uploading: _uploadingOrderId == row.orderId,
                    onUpload: () => _uploadReceipt(row),
                    onViewReceipts: () => _showDocuments(
                        row, 'EFD receipt', row.documents, 'Receipt'),
                    onViewProof: () => _showDocuments(
                        row,
                        'Payment transfer proof',
                        row.transferProofs,
                        'Payment transfer proof'),
                  ),
              ]),
            ),
          if (pageCount > 1)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton.icon(
                      onPressed: page == 1
                          ? null
                          : () => setState(() => _page = page - 1),
                      icon: const Icon(Icons.chevron_left_rounded, size: 18),
                      label: const Text('Previous'),
                    ),
                    Text('Page $page of $pageCount',
                        style: TextStyle(
                            fontSize: 12, color: palette.textSecondary)),
                    TextButton.icon(
                      onPressed: page == pageCount
                          ? null
                          : () => setState(() => _page = page + 1),
                      icon: const Icon(Icons.chevron_right_rounded, size: 18),
                      label: const Text('Next'),
                      iconAlignment: IconAlignment.end,
                    ),
                  ]),
            ),
        ]),
      ),
    ];
  }

  Widget _payoutDetailsBanner() {
    final palette = AppPalette.of(context);
    return Container(
      key: const ValueKey('wallet-payout-details-banner'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.warningFill,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.warningBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Add your payout details so we know where to send your money.',
            style: TextStyle(
                fontSize: 13,
                height: 1.35,
                fontWeight: FontWeight.w600,
                color: palette.warningTextStrong)),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: () => GoRouter.maybeOf(context)
              ?.push('/account/payout-details'),
          style: FilledButton.styleFrom(
            backgroundColor: palette.warningTextStrong,
            foregroundColor: palette.warningFill,
            iconColor: palette.warningFill,
            shape: const StadiumBorder(),
          ),
          icon: const Icon(Icons.arrow_forward_rounded, size: 16),
          iconAlignment: IconAlignment.end,
          label: const Text('Add payout details'),
        ),
      ]),
    );
  }

  /// Web `uploadReceipt`: an image of the EFD receipt, up to 5 MB.
  Future<void> _uploadReceipt(SellerWalletRow row) async {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    final messenger = ScaffoldMessenger.of(context);
    XFile? picked;
    try {
      picked = await (widget.pickReceipt?.call() ??
          ImagePicker().pickImage(
              source: ImageSource.gallery, maxWidth: 2000, imageQuality: 88));
    } catch (e) {
      messenger.showSnackBar(
          SnackBar(content: Text('Could not open your photos: $e')));
      return;
    }
    if (picked == null) return;
    final Uint8List bytes = await picked.readAsBytes();
    if (bytes.isEmpty || bytes.length > _maxReceiptBytes) {
      messenger.showSnackBar(const SnackBar(
          content: Text('This file can’t be used. Choose an image up to 5 MB.')));
      return;
    }
    // The backend takes the part's Content-Type as given, so read it off the
    // bytes: a HEIC photo named .jpg would pass the check and then fail to
    // convert on the server.
    final type = sniffImageMime(bytes);
    if (type == null) {
      messenger.showSnackBar(const SnackBar(
          content: Text('Choose a JPEG, PNG or WebP photo of the receipt.')));
      return;
    }
    final name = renameForMime(
        picked.name.isEmpty ? 'efd-receipt' : picked.name, type);
    setState(() => _uploadingOrderId = row.orderId);
    try {
      await widget.api.uploadSellerPaymentDocument(token, row.orderId,
          bytes: bytes,
          filename: name.replaceAll(RegExp(r'[^\w\-.]'), '_'),
          contentType: type);
      messenger.showSnackBar(
          const SnackBar(content: Text('EFD receipt uploaded')));
      await _refresh();
    } catch (e) {
      messenger.showSnackBar(SnackBar(
          content: Text('Upload failed. ${e is ApiException ? e.message : 'Please try again.'}')));
    } finally {
      if (mounted) setState(() => _uploadingOrderId = null);
    }
  }

  void _showDocuments(SellerWalletRow row, String title,
      List<SellerWalletDocument> docs, String fallbackName) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheet) {
        final palette = AppPalette.of(sheet);
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(
                maxHeight: MediaQuery.of(sheet).size.height * .8),
            child: ListView(
              key: ValueKey('wallet-documents-$title'),
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              children: [
                Text(title,
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: palette.textPrimary)),
                const SizedBox(height: 2),
                Text(
                    [walletOrderLabel(row), if (row.itemsSummary != null) row.itemsSummary!]
                        .join(' · '),
                    style: TextStyle(fontSize: 12.5, color: palette.textSecondary)),
                const SizedBox(height: 14),
                for (final d in docs) ...[
                  Text(
                      [
                        d.fileName ?? fallbackName,
                        if (walletShortDate(d.uploadedAt) != null)
                          walletShortDate(d.uploadedAt)!,
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: palette.textSecondary)),
                  const SizedBox(height: 6),
                  _AuthedDocumentPreview(api: widget.api, document: d),
                  const SizedBox(height: 16),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.label,
    required this.value,
    required this.count,
    required this.accent,
  });
  final String label;
  final String value;
  final int count;
  final Color accent;

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
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(height: 4, color: accent),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label,
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: palette.textSecondary)),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value,
                  style: TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                      color: palette.textPrimary)),
            ),
            const SizedBox(height: 2),
            Text('$count ${count == 1 ? 'order' : 'orders'}',
                style: TextStyle(fontSize: 11.5, color: palette.textSecondary)),
          ]),
        ),
      ]),
    );
  }
}

/// One payout — the web's phone card.
class _PayoutCard extends StatelessWidget {
  const _PayoutCard({
    required this.row,
    required this.uploading,
    required this.onUpload,
    required this.onViewReceipts,
    required this.onViewProof,
  });
  final SellerWalletRow row;
  final bool uploading;
  final VoidCallback onUpload;
  final VoidCallback onViewReceipts;
  final VoidCallback onViewProof;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final date = walletShortDate(row.checkoutAt);
    final money = (double v) => formatWalletMoney(v, row.currency);

    Widget line(String label, Widget value, {bool strong = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Text(label,
                  style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: strong ? FontWeight.w700 : FontWeight.w500,
                      color: strong ? palette.textPrimary : palette.textSecondary)),
            ),
            const SizedBox(width: 10),
            Flexible(flex: 2, child: Align(alignment: Alignment.centerRight, child: value)),
          ]),
        );

    final divider = Divider(height: 20, color: palette.border);
    return Container(
      key: ValueKey('wallet-row-${row.orderId}'),
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: palette.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(row.itemsSummary ?? walletOrderLabel(row),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontWeight: FontWeight.w700, color: palette.textPrimary)),
              const SizedBox(height: 2),
              Text(walletOrderLabel(row),
                  style: TextStyle(fontSize: 11.5, color: palette.textSecondary)),
              if (date != null) ...[
                const SizedBox(height: 2),
                Text(date,
                    style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: palette.textSecondary)),
              ],
            ]),
          ),
          const SizedBox(width: 10),
          _StatusPill(settled: row.settled),
        ]),
        divider,
        line('Paid with',
            Text(walletPaymentMethodLabel(row.paymentMethod),
                style: TextStyle(fontSize: 12.5, color: palette.textPrimary))),
        line('Buyer paid',
            Text(money(row.buyerPaid),
                style: TextStyle(fontSize: 12.5, color: palette.textPrimary))),
        line(
          'Payout',
          Column(
            key: ValueKey('wallet-breakdown-${row.orderId}'),
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(money(row.sellerPayout),
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: palette.textPrimary)),
              const SizedBox(height: 2),
              for (final t in [
                'Items sold: ${money(row.itemsSold)}',
                'Delivery fee: ${money(row.deliveryFee)}',
                'GloboExpats fee: ${money(row.platformFee)}',
              ])
                Text(t,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: 11, height: 1.4, color: palette.textSecondary)),
            ],
          ),
          strong: true,
        ),
        if (row.reasons.isNotEmpty || row.adminNote != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: palette.surfaceMuted,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (final r in row.reasons)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 1.5),
                  child: Text(r,
                      style: TextStyle(
                          fontSize: 12, height: 1.4, color: palette.textSecondary)),
                ),
              if (row.adminNote != null)
                Padding(
                  padding: const EdgeInsets.only(top: 1.5),
                  child: Text.rich(TextSpan(children: [
                    const TextSpan(
                        text: 'GloboExpats: ',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                    TextSpan(text: row.adminNote),
                  ]),
                      style: TextStyle(
                          fontSize: 12, height: 1.4, color: palette.textPrimary)),
                ),
            ]),
          ),
        ],
        divider,
        Row(children: [
          Expanded(
            child: Text('EFD receipt',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: palette.textSecondary)),
          ),
          if (row.documents.isEmpty && !row.canUploadDocument)
            Text('After delivery',
                style: TextStyle(fontSize: 12, color: palette.textMuted))
          else ...[
            if (row.documents.isNotEmpty)
              _PillButton(
                key: ValueKey('wallet-receipt-view-${row.orderId}'),
                label: 'View',
                icon: Icons.description_outlined,
                fill: palette.successFill,
                edge: palette.successBorder,
                ink: palette.successText,
                onTap: onViewReceipts,
              ),
            if (row.canUploadDocument) ...[
              const SizedBox(width: 6),
              _PillButton(
                key: ValueKey('wallet-receipt-upload-${row.orderId}'),
                label: uploading
                    ? 'Uploading'
                    : row.documents.isEmpty
                        ? 'Upload'
                        : 'Replace',
                icon: row.documents.isEmpty ? Icons.upload_rounded : null,
                busy: uploading,
                fill: row.documents.isEmpty ? AppColors.brandBlue : null,
                edge: row.documents.isEmpty ? AppColors.brandBlue : palette.border,
                ink: row.documents.isEmpty ? BrandStage.ink : palette.textSecondary,
                onTap: uploading ? null : onUpload,
              ),
            ],
          ],
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: Text('Transfer proof',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: palette.textSecondary)),
          ),
          if (row.transferProofs.isEmpty)
            Text('After settlement',
                style: TextStyle(fontSize: 12, color: palette.textMuted))
          else
            _PillButton(
              key: ValueKey('wallet-proof-view-${row.orderId}'),
              label: 'View proof',
              icon: Icons.description_outlined,
              fill: palette.infoFill,
              edge: palette.infoBorder,
              ink: palette.infoText,
              onTap: onViewProof,
            ),
        ]),
      ]),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.settled});
  final bool settled;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final (fill, edge, ink) = settled
        ? (palette.successFill, palette.successBorder, palette.successText)
        : (palette.warningFill, palette.warningBorder, palette.warningText);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: edge),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: ink, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(settled ? 'Settled' : 'Unsettled',
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w700, color: ink)),
      ]),
    );
  }
}

class _PillButton extends StatelessWidget {
  const _PillButton({
    super.key,
    required this.label,
    required this.ink,
    required this.edge,
    this.fill,
    this.icon,
    this.busy = false,
    this.onTap,
  });
  final String label;
  final IconData? icon;
  final Color? fill;
  final Color edge;
  final Color ink;
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: fill ?? Colors.transparent,
        shape: StadiumBorder(side: BorderSide(color: edge)),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (busy)
                SizedBox(
                    width: 13,
                    height: 13,
                    child: CircularProgressIndicator(strokeWidth: 2, color: ink))
              else if (icon != null)
                Icon(icon, size: 14, color: ink),
              if (busy || icon != null) const SizedBox(width: 5),
              Text(label,
                  style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700, color: ink)),
            ]),
          ),
        ),
      );
}

/// Web `AuthenticatedReceiptPreview`: receipts and proofs are private, so
/// the file is fetched with the seller's session, never from a public URL.
class _AuthedDocumentPreview extends StatelessWidget {
  const _AuthedDocumentPreview({required this.api, required this.document});
  final ApiClient api;
  final SellerWalletDocument document;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    Widget box(Widget child) => Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: 90),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: palette.surfaceMuted,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: palette.border),
          ),
          child: child,
        );
    if (document.isPdf) {
      return box(Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.picture_as_pdf_outlined, size: 28, color: palette.dangerText),
        const SizedBox(height: 6),
        Text('PDF document',
            style: TextStyle(fontSize: 12, color: palette.textSecondary)),
      ]));
    }
    final token = AuthStore.instance?.token;
    if (token == null || document.fileUrl.isEmpty) {
      return box(Text('Unavailable',
          style: TextStyle(fontSize: 12, color: palette.textSecondary)));
    }
    return FutureBuilder<Uint8List>(
      future: api.fetchAuthedFileBytes(token, document.fileUrl),
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return box(const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2)));
        }
        if (snap.hasError || snap.data == null) {
          return box(Text('Couldn’t load this file',
              style: TextStyle(fontSize: 12, color: palette.textSecondary)));
        }
        return ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 420),
            child: Image.memory(snap.data!, fit: BoxFit.contain),
          ),
        );
      },
    );
  }
}

class _WalletSkeleton extends StatelessWidget {
  const _WalletSkeleton();

  @override
  Widget build(BuildContext context) => const Column(
        key: ValueKey('wallet-loading'),
        children: [
          Row(children: [
            Expanded(child: SkeletonBox(height: 92, radius: 16)),
            SizedBox(width: 10),
            Expanded(child: SkeletonBox(height: 92, radius: 16)),
          ]),
          SizedBox(height: 10),
          SkeletonBox(height: 92, radius: 16),
          SizedBox(height: 18),
          SkeletonBox(height: 260, radius: 18),
        ],
      );
}
