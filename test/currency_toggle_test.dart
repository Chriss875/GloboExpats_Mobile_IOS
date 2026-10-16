import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/currency_controller.dart';
import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/widgets/currency_toggle.dart';
import 'package:globoexpats_mobile/widgets/globo_app_bar.dart';

/// "Can we change this into exchange rate as in the desktop version?" — asked
/// of the Tanzanian flag in the app bar, which was a tooltip and nothing
/// else: mobile had no currency state to switch.
///
/// Web parity `components/currency-toggle.tsx` + `price-display.tsx`: the
/// header picks the currency and every displayed price follows it, while the
/// order itself stays in TZS.
void main() {
  tearDown(() => CurrencyController.instance.select('TZS'));

  group('the header control', () {
    testWidgets('replaces the static flag with a currency picker',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
          home: Scaffold(appBar: GloboAppBar(), body: SizedBox())));
      await tester.pumpAndSettle();

      expect(find.byType(CurrencyToggle), findsOneWidget);
      expect(find.text('TZS'), findsOneWidget,
          reason: 'the trigger names the currency in force, like the web');
    });

    testWidgets('opens the list and applies the pick', (tester) async {
      await tester.pumpWidget(const MaterialApp(
          home: Scaffold(appBar: GloboAppBar(), body: SizedBox())));
      await tester.pumpAndSettle();

      await tester.tap(find.byType(CurrencyToggle));
      await tester.pumpAndSettle();

      expect(find.text('Select currency'), findsOneWidget);
      expect(find.text('US Dollar\n1 USD = TSh 2,632'), findsOneWidget,
          reason: 'the rate line is what makes this an exchange-rate control '
              'rather than a country label');

      await tester.tap(find.text('USD'));
      await tester.pumpAndSettle();

      expect(CurrencyController.instance.code, 'USD');
      expect(find.text('USD'), findsOneWidget, reason: 'the trigger follows');
    });

    testWidgets('says that orders are still charged in shillings',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
          home: Scaffold(appBar: GloboAppBar(), body: SizedBox())));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(CurrencyToggle));
      await tester.pumpAndSettle();

      expect(find.textContaining('charged in Tanzanian Shillings'),
          findsOneWidget,
          reason: 'the rates are indicative and Selcom only collects TZS — a '
              'converted figure must not read as a payable amount');
    });
  });

  group('prices follow the choice', () {
    test('a stored TZS amount is shown in the selected currency', () async {
      expect(Product.formatPrice(50000), r'TSh 50,000');

      await CurrencyController.instance.select('USD');
      expect(Product.formatPrice(50000), r'$ 19.00');

      await CurrencyController.instance.select('KES');
      expect(Product.formatPrice(50000), 'KSh 2,450');
    });

    test('an amount already stored in another currency is left alone',
        () async {
      await CurrencyController.instance.select('USD');
      expect(Product.formatPrice(1200, 'EUR'), '1,200 EUR',
          reason: 'the second argument is the SOURCE currency; converting it '
              'again would double-apply a rate');
    });

    test('the rate line quotes against the base currency', () async {
      expect(CurrencyController.instance.isConverted, isFalse);
      await CurrencyController.instance.select('USD');
      expect(CurrencyController.instance.isConverted, isTrue);
      expect(CurrencyController.instance.rateLine, contains('1 TZS = 0.0004'));
    });

    test('an unknown code is ignored rather than breaking every price',
        () async {
      await CurrencyController.instance.select('XXX');
      expect(CurrencyController.instance.code, 'TZS');
    });
  });
}
