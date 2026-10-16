import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/screens/seller_profile_screen.dart';
import 'package:globoexpats_mobile/widgets/app_image.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});

Map<String, dynamic> _summary({String? profileImageUrl}) => {
      'userId': 7,
      'firstName': 'Anusiata',
      'lastName': 'Mlelwa',
      'position': 'Woodworker',
      'aboutMe': 'Carving since 2010.',
      'verificationStatus': 'VERIFIED',
      'averageRating': 4.6,
      'totalRatingsCount': 1,
      'joinedDate': '2023-06-15T00:00:00Z',
      if (profileImageUrl != null) 'profileImageUrl': profileImageUrl,
    };

Future<void> pumpStorefront(WidgetTester tester, ApiClient api) async {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = const Size(1000, 10000);
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
      MaterialApp(home: SellerProfileScreen(sellerId: 7, api: api)));
  await tester.pumpAndSettle();
}

ApiClient _apiWith({Map<String, dynamic>? summary}) {
  return ApiClient(
    client: MockClient((req) async {
      final path = req.url.path;
      if (path == '/api/v1/userManagement/seller-summary/7') {
        return _json(summary ?? _summary());
      }
      if (path == '/api/v1/displayItem/filter') {
        return _json({'content': <Object>[], 'totalElements': 0});
      }
      if (path.startsWith('/api/v1/user-ratings/')) {
        return _json({'content': <Object>[]});
      }
      return _json({}, 404);
    }),
  );
}

void main() {
  testWidgets(
      'A-19: tapping the seller profile photo opens the dismissible fullscreen preview',
      (tester) async {
    final api = _apiWith(summary: _summary(profileImageUrl: '/uploads/a.jpg'));
    await pumpStorefront(tester, api);

    // The header avatar is the first image on the storefront.
    expect(find.byType(AppImage), findsWidgets);
    await tester.tap(find.byType(AppImage).first);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('fullscreen-image-preview')),
        findsOneWidget);
    // A single profile photo has no pagination counter.
    expect(find.byKey(const ValueKey('fullscreen-image-counter')),
        findsNothing);

    await tester.tap(find.byKey(const ValueKey('fullscreen-preview-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('fullscreen-image-preview')),
        findsNothing);
  });
}
