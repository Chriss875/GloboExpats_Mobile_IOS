import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';

void main() {
  test('T26: proforma payload carries real enums — no CARD, no SALE', () async {
    Map<String, dynamic>? sent;
    final client = MockClient((req) async {
      if (req.url.path == '/api/v1/checkout/proforma') {
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'proformaId': 'pf-1',
            'proformaNumber': 'PF-2026-000001',
            'status': 'PENDING_PAYMENT',
            'grandTotal': 630000,
            'itemsTotal': 626000,
            'deliveryTotal': 4000,
            'sellerGroups': [],
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('not found', 404);
    });

    final api = ApiClient(client: client);
    await api.createProforma(
      'tok',
      buyDetails: {
        'firstName': 'A',
        'lastName': 'B',
        'emailAddress': 'a@b.c',
        'phoneNumber': '+255700000000',
        'address': 'x',
        'city': 'Dar es Salaam',
        'state': 'Dar es Salaam',
        'country': 'Tanzania',
        'fulfillmentType': 'SELLER_DELIVERY',
        'paymentMethodType': 'MOBILE_MONEY',
        'agreeToTerms': true,
        'currency': 'TZS',
      },
      items: [
        {'productId': 615, 'quantity': 1},
      ],
    );
    expect(sent, isNotNull);
    final bd = sent!['buyDetails'] as Map<String, dynamic>;
    expect(bd['fulfillmentType'], 'SELLER_DELIVERY');
    expect(bd['paymentMethodType'], 'MOBILE_MONEY');
    expect(jsonEncode(sent), isNot(contains('"CARD"')));
    expect(jsonEncode(sent), isNot(contains('"SALE"')));
  });
}
