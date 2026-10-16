import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/domain/seller_display.dart';
import 'package:globoexpats_mobile/screens/seller_profile_screen.dart';

void main() {
  testWidgets(
      'seller profile renders MASKED summary from the public endpoint (LISTIN-23)',
      (tester) async {
    final api = ApiClient(client: MockClient((r) async {
      return http.Response(jsonEncode({
        'userId': 59,
        'firstName': 'Radha',
        'lastName': 'Saindrane',
        'position': 'Founder',
        'aboutMe': 'Creator of nature-based skincare.',
      }), 200, headers: {'content-type': 'application/json'});
    }));
    await tester.pumpWidget(MaterialApp(home: SellerProfileScreen(sellerId: 59, api: api)));
    await tester.pumpAndSettle();

    // Web privacy masking: first name + uppercased last initial — never the
    // full legal name the old screen printed.
    expect(find.text('Radha S.'), findsOneWidget);
    expect(find.text('Radha Saindrane'), findsNothing);
    // The position header is uppercase on web AND mobile.
    expect(find.text('FOUNDER'), findsOneWidget);
    expect(find.text('Founder'), findsNothing);
    expect(find.textContaining('skincare'), findsOneWidget);
    // Member Since falls back to 2024 when the summary has no joined date.
    expect(find.text('Member Since'), findsOneWidget);
    expect(find.text('2024'), findsOneWidget);
  });

  group('seller route helpers (LISTIN-28 / B7)', () {
    test('slugifySellerName strips diacritics and joins with dashes', () {
      expect(slugifySellerName('Anusiata Mlelwa'), 'anusiata-mlelwa');
      expect(slugifySellerName('José García'), 'jose-garcia');
      expect(slugifySellerName('Radha'), 'radha');
    });

    test('buildSellerProfilePath produces {slug}-p{base36}', () {
      expect(buildSellerProfilePath('Anusiata Mlelwa', 7),
          '/seller/anusiata-mlelwa-p7');
      // base36: 100 -> '2s'
      expect(buildSellerProfilePath('Sam T', 100), '/seller/sam-t-p2s');
      expect(buildSellerProfilePath('No Id', null), '/seller/no-id');
    });

    test('parseSellerProfileSegment resolves numeric ids', () {
      final parsed = parseSellerProfileSegment('7');
      expect(parsed.sellerId, 7);
      expect(parsed.sellerName, '');
    });

    test('parseSellerProfileSegment resolves {name}-p{base36} slugs', () {
      final parsed = parseSellerProfileSegment('anusiata-mlelwa-p7');
      expect(parsed.sellerId, 7);
      expect(parsed.sellerName, 'anusiata mlelwa');

      final sam = parseSellerProfileSegment('sam-t-p2s');
      expect(sam.sellerId, 100);
      expect(sam.sellerName, 'sam t');
    });

    test('parseSellerProfileSegment leaves name-only legacy slugs to the 404 path',
        () {
      final parsed = parseSellerProfileSegment('some-seller');
      expect(parsed.sellerId, isNull);
      expect(parsed.sellerName, 'some seller');
    });
  });
}
