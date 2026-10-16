import 'package:flutter/material.dart';

import 'domain/currency.dart';
import 'storage/kv_store.dart';

/// The currency the buyer reads prices in, persisted across restarts.
///
/// Web parity `providers/currency-provider.tsx` + `components/currency-toggle.tsx`:
/// the desktop header carries a currency switcher that re-denominates every
/// displayed price. Mobile showed a flag with a tooltip and nothing else.
///
/// Display only. Listings are stored and charged in TZS — the rate table in
/// [kCurrencies] is indicative and static on both platforms (the web's
/// `CURRENCY_DEFINITIONS`), so a converted figure is a guide for the shopper,
/// never the amount a payment is taken for.
class CurrencyController extends ChangeNotifier {
  CurrencyController._();
  static final CurrencyController instance = CurrencyController._();

  static const _key = 'display_currency';

  String _code = baseCurrencyCode;

  /// The selected currency's ISO code, e.g. `TZS` or `USD`.
  String get code => _code;

  Currency get currency => currencyFor(_code);

  /// True while the shopper is reading prices in something other than TZS.
  bool get isConverted => _code != baseCurrencyCode;

  /// Read the persisted choice. Safe before [KvStore] has loaded — an unknown
  /// code simply leaves TZS in place.
  void restore() {
    final saved = KvStore.instance.getString(_key);
    if (saved != null && kCurrencies.any((c) => c.code == saved)) {
      _code = saved;
    }
  }

  Future<void> select(String code) async {
    if (_code == code || !kCurrencies.any((c) => c.code == code)) return;
    _code = code;
    notifyListeners();
    await KvStore.instance.setString(_key, code);
  }

  /// A TZS amount as the shopper has chosen to read it.
  String format(double amountTzs) =>
      formatMoney(convertBetween(amountTzs, baseCurrencyCode, _code), _code);

  /// "1 TZS = 0.0004 USD" — the line the web's toggle shows under the list.
  String get rateLine => isConverted
      ? '1 $baseCurrencyCode = ${currency.exchangeRate.toStringAsFixed(4)} $_code'
      : 'Prices are shown in $baseCurrencyCode';
}
