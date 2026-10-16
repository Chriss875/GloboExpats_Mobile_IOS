import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/domain/checkout_proforma.dart';

void main() {
  group('proforma failure copy (web parity error taxonomy)', () {
    test('a blocked account says so instead of leaking the code', () {
      final msg = proformaFailureMessage(
          ApiException('ACCOUNT_BLOCKED: user is blocked'));
      expect(msg, 'Your account is blocked from placing orders. Please contact support.');
    });

    test('a stock race explains it was not the buyer\'s doing', () {
      final msg = proformaFailureMessage(ApiException('INSUFFICIENT_STOCK'));
      expect(msg, contains('Another buyer reserved'));
      expect(msg, contains('review your cart'));
    });

    test('a failed buyer-profile setup tells them to retry once', () {
      final msg = proformaFailureMessage(ApiException('BUYER_PROFILE_SETUP_FAILED'));
      expect(msg, contains('retry'));
      expect(msg, contains('verification is not required'));
    });

    test('anything else keeps the server reason verbatim', () {
      // CHECKOUT_DATA_INVALID/422 carry the useful detail in the message.
      final msg = proformaFailureMessage(
          ApiException('Delivery address is outside the service area.'));
      expect(msg, 'Delivery address is outside the service area.');
    });

    test('the ApiException prefix never reaches the buyer', () {
      expect(proformaFailureMessage(ApiException('boom')), 'boom');
    });
  });
}
