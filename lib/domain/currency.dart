/// Seller-facing currency support — port of web `lib/currency-converter.ts`
/// (`CURRENCY_DEFINITIONS`).
///
/// TZS is the base: every `exchangeRate` reads "1 TZS = rate units of this
/// currency", so an amount typed in currency X becomes TZS by DIVIDING by
/// that currency's rate — which is exactly what the publish payload does,
/// since the backend only ever stores TZS.
class Currency {
  final String code;
  final String symbol;
  final String name;
  final double exchangeRate;
  final int decimals;
  final bool symbolAfter;

  /// The flag the currency picker shows beside the code, matching the web's
  /// `CURRENCY_DEFINITIONS` (lib/currency-converter.ts).
  final String flag;
  const Currency({
    required this.code,
    required this.symbol,
    required this.name,
    required this.exchangeRate,
    required this.decimals,
    this.symbolAfter = false,
    this.flag = '',
  });
}

/// Rates are indicative and mirror the web table exactly; they are not fetched
/// live on either platform.
const List<Currency> kCurrencies = [
  Currency(code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', exchangeRate: 1, decimals: 0, flag: '🇹🇿'),
  Currency(code: 'USD', symbol: '\$', name: 'US Dollar', exchangeRate: 0.00038, decimals: 2, flag: '🇺🇸'),
  Currency(code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', exchangeRate: 0.049, decimals: 0, flag: '🇰🇪'),
  Currency(code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', exchangeRate: 1.4, decimals: 0, flag: '🇺🇬'),
  Currency(code: 'EUR', symbol: '€', name: 'Euro', exchangeRate: 0.00035, decimals: 2, flag: '🇪🇺'),
  Currency(code: 'JPY', symbol: '¥', name: 'Japanese Yen', exchangeRate: 0.055, decimals: 0, flag: '🇯🇵'),
  Currency(code: 'KRW', symbol: '₩', name: 'Korean Won', exchangeRate: 0.5, decimals: 0, flag: '🇰🇷'),
  Currency(code: 'CNY', symbol: '¥', name: 'Chinese Yuan', exchangeRate: 0.0026, decimals: 2, flag: '🇨🇳'),
  Currency(code: 'GBP', symbol: '£', name: 'British Pound', exchangeRate: 0.00029, decimals: 2, flag: '🇬🇧'),
  Currency(code: 'CAD', symbol: '\$', name: 'Canadian Dollar', exchangeRate: 0.0005, decimals: 2, flag: '🇨🇦'),
  Currency(code: 'AUD', symbol: '\$', name: 'Australian Dollar', exchangeRate: 0.00058, decimals: 2, flag: '🇦🇺'),
  Currency(code: 'ZAR', symbol: 'R', name: 'South African Rand', exchangeRate: 0.007, decimals: 2, flag: '🇿🇦'),
  Currency(code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', exchangeRate: 0.0014, decimals: 2, symbolAfter: true, flag: '🇦🇪'),
  Currency(code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', exchangeRate: 0.00142, decimals: 2, symbolAfter: true, flag: '🇸🇦'),
  Currency(code: 'INR', symbol: '₹', name: 'Indian Rupee', exchangeRate: 0.031, decimals: 2, flag: '🇮🇳'),
  Currency(code: 'TRY', symbol: '₺', name: 'Turkish Lira', exchangeRate: 0.012, decimals: 2, flag: '🇹🇷'),
  Currency(code: 'RUB', symbol: '₽', name: 'Russian Ruble', exchangeRate: 0.0294, decimals: 2, flag: '🇷🇺'),
];

/// What the backend stores and charges in; every rate is quoted against it.
const String baseCurrencyCode = 'TZS';

Currency currencyFor(String code) => kCurrencies.firstWhere(
      (c) => c.code == code,
      orElse: () => kCurrencies.first,
    );

/// The amount as stored by the backend. Web parity: `amount / exchangeRate`,
/// with TZS short-circuited so it never picks up a rounding wobble.
double toTzs(double amount, String fromCode) {
  if (fromCode == 'TZS') return amount;
  final rate = currencyFor(fromCode).exchangeRate;
  if (!rate.isFinite || rate <= 0) return amount;
  return amount / rate;
}

/// Re-denominates an amount when the seller switches the selector, so the
/// TZS value it represents stays put (web `handleCurrencyChange`).
double convertBetween(double amount, String fromCode, String toCode) {
  if (fromCode == toCode) return amount;
  return toTzs(amount, fromCode) * currencyFor(toCode).exchangeRate;
}

String formatMoney(double amount, String code) {
  final c = currencyFor(code);
  final fixed = amount.toStringAsFixed(c.decimals);
  final parts = fixed.split('.');
  final digits = parts.first.replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  final body = parts.length > 1 ? '$digits.${parts[1]}' : digits;
  return c.symbolAfter ? '$body ${c.symbol}' : '${c.symbol} $body';
}

/// The platform's listing floor, in the base currency the backend stores.
///
/// Everything the seller types is in their chosen display currency, but the
/// floor is a TZS number — so it can only be judged on the CONVERTED amount.
/// Comparing the typed figure straight against 1000 told a seller pricing in
/// dollars that "$50" was under "TSh 1,000", when $50 is about TSh 131,000.
const double kMinListingPriceTzs = 1000;

/// Whether an amount typed in [currency] clears the TSh 1,000 floor.
bool meetsListingFloor(double amount, String currency) =>
    toTzs(amount, currency) >= kMinListingPriceTzs;

/// The floor as the seller sees it: always the real TSh figure, plus the
/// equivalent in their own currency when that is not what they are typing in,
/// so the number in the message is one they can act on.
String listingFloorLabel(String currency) {
  final base = formatMoney(kMinListingPriceTzs, baseCurrencyCode);
  if (currency == baseCurrencyCode) return base;
  final local = kMinListingPriceTzs * currencyFor(currency).exchangeRate;
  return '$base (about ${formatMoney(local, currency)})';
}
