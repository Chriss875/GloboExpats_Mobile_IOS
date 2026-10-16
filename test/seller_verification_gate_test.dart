import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/widgets/seller_verification_gate.dart';

/// SELLWI-01: the seller-verification predicates behind the /sell route gate.
/// Web RouteGuard `requireVerification="sell"` treats only a VERIFIED /
/// NATURAL_VERIFIED application as sell-capable; both the compact
/// `{application: {reviewStatus}}` response and the wrapped form count.
void main() {
  group('isVerifiedSellerApplication', () {
    test('null and empty applications are not verified', () {
      expect(isVerifiedSellerApplication(null), isFalse);
      expect(isVerifiedSellerApplication(const {}), isFalse);
    });

    test('only VERIFIED / NATURAL_VERIFIED statuses pass', () {
      expect(isVerifiedSellerApplication({'reviewStatus': 'VERIFIED'}), isTrue);
      expect(isVerifiedSellerApplication({'reviewStatus': 'NATURAL_VERIFIED'}),
          isTrue);
      expect(isVerifiedSellerApplication({'status': 'VERIFIED'}), isTrue,
          reason: 'falls back to the hub screen status key');
      expect(isVerifiedSellerApplication({'reviewStatus': 'PENDING'}), isFalse);
      expect(
          isVerifiedSellerApplication({'reviewStatus': 'REJECTED'}), isFalse);
      // Case-insensitive and whitespace-tolerant like the status comparisons.
      expect(
          isVerifiedSellerApplication({'reviewStatus': ' verified '}), isTrue);
    });
  });

  group('isVerifiedSellerResponse', () {
    test('unwraps the compact application envelope', () {
      expect(
          isVerifiedSellerResponse({
            'application': {'reviewStatus': 'VERIFIED'}
          }),
          isTrue);
      expect(
          isVerifiedSellerResponse({
            'application': {'status': 'PENDING'}
          }),
          isFalse);
    });

    test('unwraps the {data: {application}} envelope used by some endpoints',
        () {
      expect(
          isVerifiedSellerResponse({
            'data': {
              'application': {'reviewStatus': 'NATURAL_VERIFIED'}
            }
          }),
          isTrue);
      expect(
          isVerifiedSellerResponse({
            'data': {'application': null}
          }),
          isFalse);
    });

    test('accepts flat and directly data-wrapped verification responses', () {
      expect(isVerifiedSellerResponse({'reviewStatus': 'VERIFIED'}), isTrue);
      expect(
          isVerifiedSellerResponse({
            'data': {'status': 'NATURAL_VERIFIED'}
          }),
          isTrue);
    });

    test('null, empty and malformed bodies are not verified', () {
      expect(isVerifiedSellerResponse(null), isFalse);
      expect(isVerifiedSellerResponse(const {}), isFalse);
      expect(isVerifiedSellerResponse({'application': 'not-a-map'}), isFalse);
    });
  });
}
