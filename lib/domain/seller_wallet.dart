/// The seller's virtual wallet — port of web `lib/seller-wallet.ts`.
///
/// Read from `GET /api/v1/seller/wallet`: the same orders the admin Payouts
/// tab counts for this seller, with the money breakdown, plain-language
/// reasons, GloboExpats' note, the seller's EFD receipts and the transfer
/// proof GloboExpats attaches once a payout is settled. Every figure comes
/// from the backend — nothing here works money out, it only shows it.
library;

import 'package:intl/intl.dart';

import 'time_utils.dart';

double _num(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
String? _str(Object? v) {
  final s = v?.toString().trim();
  return s == null || s.isEmpty ? null : s;
}

/// The wallet as a whole.
class SellerWallet {
  const SellerWallet({
    required this.summary,
    required this.rows,
    required this.payoutDetailsConfigured,
  });

  final SellerWalletSummary summary;
  final List<SellerWalletRow> rows;

  /// False when the seller has not told GloboExpats where to send money.
  final bool payoutDetailsConfigured;

  factory SellerWallet.fromJson(Map<String, dynamic> j) => SellerWallet(
        summary: SellerWalletSummary.fromJson(
            (j['summary'] as Map?)?.cast<String, dynamic>() ?? const {}),
        rows: [
          for (final r in (j['rows'] as List? ?? const []))
            if (r is Map) SellerWalletRow.fromJson(r.cast<String, dynamic>()),
        ],
        payoutDetailsConfigured: j['payoutDetailsConfigured'] == true,
      );
}

class SellerWalletSummary {
  const SellerWalletSummary({
    this.currency = 'TZS',
    this.unsettledTotal = 0,
    this.unsettledCount = 0,
    this.settledTotal = 0,
    this.settledCount = 0,
    this.total = 0,
    this.totalCount = 0,
  });

  final String currency;
  final double unsettledTotal;
  final int unsettledCount;
  final double settledTotal;
  final int settledCount;
  final double total;
  final int totalCount;

  factory SellerWalletSummary.fromJson(Map<String, dynamic> j) =>
      SellerWalletSummary(
        currency: _str(j['currency']) ?? 'TZS',
        unsettledTotal: _num(j['unsettledTotal']),
        unsettledCount: _int(j['unsettledCount']),
        settledTotal: _num(j['settledTotal']),
        settledCount: _int(j['settledCount']),
        total: _num(j['total']),
        totalCount: _int(j['totalCount']),
      );
}

/// A receipt the seller uploaded, or a transfer proof from GloboExpats.
/// [fileUrl] is a private, signed-in path — never a public link.
class SellerWalletDocument {
  const SellerWalletDocument({
    required this.documentId,
    required this.fileUrl,
    this.fileName,
    this.contentType,
    this.uploadedAt,
  });

  final String documentId;
  final String fileUrl;
  final String? fileName;
  final String? contentType;
  final String? uploadedAt;

  bool get isPdf =>
      contentType == 'application/pdf' ||
      RegExp(r'\.pdf($|\?)', caseSensitive: false)
          .hasMatch(fileName ?? '') ||
      RegExp(r'\.pdf($|\?)', caseSensitive: false).hasMatch(fileUrl);

  factory SellerWalletDocument.fromJson(Map<String, dynamic> j) =>
      SellerWalletDocument(
        documentId: '${j['documentId'] ?? j['receiptId'] ?? ''}',
        fileUrl: '${j['fileUrl'] ?? ''}',
        fileName: _str(j['fileName']),
        contentType: _str(j['contentType']),
        uploadedAt: _str(j['uploadedAt']),
      );
}

enum WalletSettlement { settled, unsettled }

class SellerWalletRow {
  const SellerWalletRow({
    required this.orderId,
    this.orderNumber,
    this.buyerName,
    this.itemsSummary,
    this.currency = 'TZS',
    this.paymentMethod,
    this.buyerPaid = 0,
    this.deliveryFee = 0,
    this.platformFee = 0,
    this.sellerPayout = 0,
    this.withheldAmount = 0,
    this.status = WalletSettlement.unsettled,
    this.delivered = false,
    this.checkoutAt,
    this.settledAt,
    this.reasons = const [],
    this.adminNote,
    this.documents = const [],
    this.transferProofs = const [],
    this.canUploadDocument = false,
  });

  final String orderId;
  final String? orderNumber;
  final String? buyerName;
  final String? itemsSummary;
  final String currency;
  final String? paymentMethod;

  /// Items + delivery: what the buyer paid.
  final double buyerPaid;
  final double deliveryFee;
  final double platformFee;

  /// buyerPaid − deliveryFee − platformFee, as the backend worked it out.
  final double sellerPayout;
  final double withheldAmount;
  final WalletSettlement status;
  final bool delivered;
  final String? checkoutAt;
  final String? settledAt;
  final List<String> reasons;
  final String? adminNote;

  /// The seller's EFD receipts.
  final List<SellerWalletDocument> documents;

  /// Proof of the transfer, uploaded by GloboExpats once this is settled.
  final List<SellerWalletDocument> transferProofs;
  final bool canUploadDocument;

  bool get settled => status == WalletSettlement.settled;

  /// Web `PayoutBreakdown`: what the items themselves sold for.
  double get itemsSold {
    final v = buyerPaid - deliveryFee;
    return v < 0 ? 0 : v;
  }

  factory SellerWalletRow.fromJson(Map<String, dynamic> j) {
    List<SellerWalletDocument> docs(Object? raw) => [
          for (final d in (raw as List? ?? const []))
            if (d is Map) SellerWalletDocument.fromJson(d.cast<String, dynamic>()),
        ];
    return SellerWalletRow(
      orderId: '${j['orderId'] ?? ''}',
      orderNumber: _str(j['orderNumber']),
      buyerName: _str(j['buyerName']),
      itemsSummary: _str(j['itemsSummary']),
      currency: _str(j['currency']) ?? 'TZS',
      paymentMethod: _str(j['paymentMethod']),
      buyerPaid: _num(j['buyerPaid']),
      deliveryFee: _num(j['deliveryFee']),
      platformFee: _num(j['platformFee']),
      sellerPayout: _num(j['sellerPayout']),
      withheldAmount: _num(j['withheldAmount']),
      status: '${j['status']}'.toUpperCase() == 'SETTLED'
          ? WalletSettlement.settled
          : WalletSettlement.unsettled,
      delivered: j['delivered'] == true,
      checkoutAt: _str(j['checkoutAt']),
      settledAt: _str(j['settledAt']),
      reasons: [
        for (final r in (j['reasons'] as List? ?? const []))
          if (_str(r) != null) _str(r)!,
      ],
      adminNote: _str(j['adminNote']),
      documents: docs(j['documents']),
      transferProofs: docs(j['transferProofs']),
      canUploadDocument: j['canUploadDocument'] == true,
    );
  }
}

const _methodLabels = {
  'SELCOM_APP': 'Selcom App',
  'MOBILE_MONEY': 'Mobile Money',
  'BANK_TRANSFER': 'Bank Account',
};

/// Web `paymentMethodLabel`.
String walletPaymentMethodLabel(String? method) =>
    _methodLabels[method] ?? '—';

/// Web `formatWalletMoney`: "TZS 12,000" — payouts are shown in the
/// currency they are paid in, never converted.
String formatWalletMoney(double amount, [String currency = 'TZS']) =>
    '$currency ${NumberFormat('#,##0', 'en_US').format(amount.round())}';

/// Web `walletOrderLabel`: the canonical short order id, matching the
/// order details page.
String walletOrderLabel(SellerWalletRow row) {
  final id = row.orderId;
  final tail = id.length > 8 ? id.substring(id.length - 8) : id;
  return '#${tail.toUpperCase()}';
}

/// Web `filterWalletRows`.
List<SellerWalletRow> filterWalletRows(
    List<SellerWalletRow> rows, WalletSettlement? filter, String query) {
  final needle = query.trim().toLowerCase();
  return rows.where((row) {
    if (filter != null && row.status != filter) return false;
    if (needle.isEmpty) return true;
    return [row.orderNumber, row.orderId, row.buyerName, row.itemsSummary]
        .whereType<String>()
        .any((v) => v.toLowerCase().contains(needle));
  }).toList();
}

/// Web `sortWalletRows`: newest checkout first; undated rows sink.
List<SellerWalletRow> sortWalletRows(List<SellerWalletRow> rows) {
  int time(String? v) =>
      TimeUtils.tryParseBackendTimestamp(v)?.millisecondsSinceEpoch ??
      -1 << 62;
  return [...rows]..sort((a, b) => time(b.checkoutAt).compareTo(time(a.checkoutAt)));
}

/// "18 Sep 2026" in the device's local time, or null when undated.
String? walletShortDate(String? value) {
  final at = TimeUtils.tryParseBackendTimestamp(value);
  return at == null ? null : DateFormat('d MMM y').format(at.toLocal());
}
