/// Exact port of the web reference's `lib/commission.ts` (SELL_FLOW_SPEC §3).
///
/// The backend TRUSTS these client-computed fields — omitting or miscomputing
/// them means platform revenue is undefined for every listing created by this
/// client. Vectors in test/commission_test.dart are normative.
///
/// Live platform commission settings (GET `/api/v1/platform-settings/commission`,
/// web `hooks/use-platform-commission-settings.ts`) are cached here after the
/// first successful fetch. Everything that prices a listing reads
/// [currentCommissionRates] so admin changes to VAT/Selcom rates flow into
/// mobile-computed commission, falling back to the documented defaults when no
/// fetch has succeeded yet. The cache is process-lifetime; the web uses a 60s
/// TTL and re-fetches on a `SETTINGS_UPDATED_EVENT`, but a long-lived value is
/// the correct mobile equivalent for a single session.
CommissionRates? _liveCommissionRates;

/// The rates every pricing calculation should use: the cached live settings
/// when available, otherwise the constructor defaults (0.18 / 0.02 / 0.02).
CommissionRates get currentCommissionRates =>
    _liveCommissionRates ?? const CommissionRates();

/// Records a freshly-fetched platform-settings payload (or a `null`/failed
/// fetch as a no-op). Web parity: failures keep the previous/default rates.
void setLiveCommissionRates(Map<String, dynamic>? json) {
  if (json == null) return;
  _liveCommissionRates = CommissionRates.fromJson(json);
}

class CommissionRates {
  final double vatRate;
  final double selcomCommissionRate;
  final double selcomTransactionRate;
  const CommissionRates({
    this.vatRate = 0.18,
    this.selcomCommissionRate = 0.02,
    this.selcomTransactionRate = 0.02,
  });

  factory CommissionRates.fromJson(Map<String, dynamic> j) => CommissionRates(
        vatRate: (j['vatRate'] as num?)?.toDouble() ?? 0.18,
        selcomCommissionRate:
            (j['selcomCommissionRate'] as num?)?.toDouble() ?? 0.02,
        selcomTransactionRate:
            (j['selcomTransactionRate'] as num?)?.toDouble() ?? 0.02,
      );
}

class CommissionBreakdown {
  /// What the seller receives (the "You receive" input).
  final double sellerPayout;

  /// Final buyer-facing price ("Final Total Asking Price").
  final double price;

  final double sellerFacingCommissionAmount;
  final double categoryCommissionAmount;
  final double selcomCommissionFee;
  final double selcomTransactionFee;
  final double grossPlatformCommission;
  final double vat;
  final double platformNetProfitBeforeCuts;
  final double platformNetProfitAfterCuts;
  final double roundingAdjustment;
  final double categoryCommissionPercentage;

  const CommissionBreakdown({
    required this.sellerPayout,
    required this.price,
    required this.sellerFacingCommissionAmount,
    required this.categoryCommissionAmount,
    required this.selcomCommissionFee,
    required this.selcomTransactionFee,
    required this.grossPlatformCommission,
    required this.vat,
    required this.platformNetProfitBeforeCuts,
    required this.platformNetProfitAfterCuts,
    required this.roundingAdjustment,
    required this.categoryCommissionPercentage,
  });
}

class CommissionCalculator {
  final CommissionRates rates;
  const CommissionCalculator({this.rates = const CommissionRates()});

  double get _vat => rates.vatRate;
  double get _selcComm => rates.selcomCommissionRate;
  double get _selcTxn => rates.selcomTransactionRate;

  /// grossTargetRate = (t + sc*(1 + st*(1+vat))) / (1 - sc*(1+vat))
  double grossTargetRate(double targetNetRate) {
    final denom = 1 - _selcComm * (1 + _vat);
    if (denom <= 0) return 0;
    return (targetNetRate + _selcComm * (1 + _selcTxn * (1 + _vat))) / denom;
  }

  /// multiplier = 1 + (grossTargetRate + st) * (1 + vat)
  double multiplier(double targetNetRate) =>
      1 + (grossTargetRate(targetNetRate) + _selcTxn) * (1 + _vat);

  /// FORWARD: seller types their desired payout → buyer price.
  /// unroundedFinal = amount*multiplier ; price = ceil(unrounded/1000)*1000
  double priceForPayout(double payout, double targetNetRate) {
    if (payout <= 0) return 0;
    final unrounded = payout * multiplier(targetNetRate);
    return _ceilTo1000(unrounded);
  }

  /// REVERSE: buyer-facing price typed → what the seller receives.
  /// unroundedPay = amount/multiplier ; payout = floor(unrounded/1000)*1000
  /// (>0 floor else raw value).
  double payoutForPrice(double price, double targetNetRate) {
    if (price <= 0) return 0;
    final unrounded = price / multiplier(targetNetRate);
    final floored = _floorTo1000(unrounded);
    return floored > 0 ? floored : unrounded;
  }

  /// Full breakdown from the two headline amounts (SELL_FLOW_SPEC §3 lines).
  CommissionBreakdown breakdown({
    required double sellerPayout,
    required double price,
    required double categoryRate,
  }) {
    final sellerFacingCommissionAmount = (price - sellerPayout) < 0
        ? 0.0
        : price - sellerPayout;
    final categoryCommissionAmount = sellerPayout * categoryRate;
    final selcomTransactionFee = sellerPayout * _selcTxn;
    final grossPlatformCommission =
        (price - sellerPayout * (1 + _selcTxn * (1 + _vat))) / (1 + _vat);
    final vat = (grossPlatformCommission + selcomTransactionFee) * _vat;
    final selcomCommissionFee = price * _selcComm;
    final platformNetProfitBeforeCuts = grossPlatformCommission;
    final platformNetProfitAfterCuts =
        grossPlatformCommission - selcomCommissionFee;
    final roundingAdjustment =
        platformNetProfitAfterCuts - categoryCommissionAmount;
    return CommissionBreakdown(
      sellerPayout: sellerPayout,
      price: price,
      sellerFacingCommissionAmount: sellerFacingCommissionAmount,
      categoryCommissionAmount: categoryCommissionAmount,
      selcomCommissionFee: selcomCommissionFee,
      selcomTransactionFee: selcomTransactionFee,
      grossPlatformCommission: grossPlatformCommission,
      vat: vat,
      platformNetProfitBeforeCuts: platformNetProfitBeforeCuts,
      platformNetProfitAfterCuts: platformNetProfitAfterCuts,
      roundingAdjustment: roundingAdjustment,
      categoryCommissionPercentage: categoryRate * 100,
    );
  }
}

double _ceilTo1000(double v) => (v / 1000).ceilToDouble() * 1000;
double _floorTo1000(double v) => (v / 1000).floorToDouble() * 1000;

/// Category commission fallback table keyed on NORMALIZED name
/// (`&`→`and` with no added spaces, runs of non-alphanumerics→space,
/// lowercase — matching web `lib/commission.ts` `normalizeCategoryName`).
/// Default 0.10. Only applies when a Category row omits `commissionRate`; the
/// backend's own value always wins.
///
/// Verified against the live catalog on 2026-09-04, which also corrected
/// Electronics: this table said 0.10 while both the live category row and the
/// web reference say 0.12. The fallback rarely fires today (every live
/// category supplies a rate), but when it did it under-charged commission on
/// the largest category, and the backend trusts what this client computes.
const Map<String, double> kCategoryCommissionFallbacks = {
  'electronics': 0.12,
  'food and groceries': 0.10,
  'furniture': 0.10,
  'clothing': 0.12,
  'vehicle and supplies': 0.06,
  'vehicles': 0.06, // alias
  'art and crafts': 0.12,
  'books and media': 0.10,
  'sports and games': 0.10,
  'home and kitchen appliances': 0.08,
  'real estate': 0.08,
  'beauty and personal care': 0.12,
  'garden and outdoors': 0.10,
  'pet supplies': 0.10,
  'pet and supplies': 0.10, // alias
  'decorations': 0.12,
  'others': 0.10,
  'other': 0.10, // alias
};

String normalizeCategoryName(String name) => name
    .toLowerCase()
    .replaceAll('&', 'and')
    .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
    .trim();

double categoryCommissionRateFor(String categoryName) =>
    kCategoryCommissionFallbacks[normalizeCategoryName(categoryName)] ?? 0.10;
