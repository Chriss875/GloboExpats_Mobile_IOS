import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/config.dart';
import 'package:globoexpats_mobile/screens/requests_screen.dart';

/// "in request detail page pictures dont show" — reported from the phone.
///
/// The request board returns `imageUrls` as **relative** paths. The feed card
/// resolved them through [AppConfig.resolveAssetUrl] and the detail page's
/// gallery did not, so the very same post showed its photo on the card and a
/// grey placeholder on its own page. The fetch succeeded in both cases, which
/// is why nothing here is about the API call: the test asserts what the widget
/// tree asks the network for.
class _FakeApi extends ApiClient {
  _FakeApi(this.payload);

  final Map<String, dynamic> payload;

  @override
  Future<void> trackRequestView(String token, int id, {String? anonId}) async {}

  @override
  Future<Map<String, dynamic>> getUserDetails(String token) async =>
      const {'userId': 999};

  @override
  Future<Map<String, dynamic>> fetchRequestById(int id, {String? token}) async =>
      payload;

  @override
  Future<Map<String, dynamic>> fetchSellerVerification(String token) async =>
      const {};

  @override
  Future<List<Map<String, dynamic>>> fetchRequestNudges(String token, int id) async =>
      const [];

  @override
  Future<RequestBoardPageData> fetchRequestBoardFeed({
    String? status,
    String? category,
    String? location,
    String? search,
    String? requestType,
    int page = 0,
    int size = 20,
  }) async =>
      const RequestBoardPageData();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues(<String, Object>{});

  setUp(() {
    AuthStore.instance =
        AuthStore(initialToken: 'jwt', initialEmail: 'me@gmail.com');
  });

  tearDown(() => AuthStore.instance = null);

  testWidgets('request detail asks the network for the RESOLVED photo URL',
      (tester) async {
    const relative = 'uploads/fixture-photo-1.png';
    final api = _FakeApi({
      'id': 7,
      'userId': 999,
      'userName': 'Someone',
      'title': 'A request with a photo',
      'description': 'desc',
      'status': 'PENDING',
      'requestType': 'GOODS',
      'imageUrls': [relative, 'uploads/fixture-photo-2.png'],
    });

    await tester.pumpWidget(MaterialApp(
      home: RequestDetailScreen(req: api.payload, api: api),
    ));
    await tester.pumpAndSettle(const Duration(seconds: 1));

    final urls = [
      for (final image in tester.widgetList<Image>(find.byType(Image)))
        if (image.image is NetworkImage) (image.image as NetworkImage).url,
    ];
    expect(urls, isNotEmpty,
        reason: 'the gallery should be asking for the post\'s photos');

    // The bug: `Image.network('uploads/…')` names no host, so it can only ever
    // paint the errorBuilder.
    expect(urls, isNot(contains(relative)),
        reason: 'a relative path must never reach Image.network');
    for (final url in urls) {
      expect(url, startsWith('http'),
          reason: '$url is not addressable; it renders as a placeholder');
    }
    expect(urls, contains(AppConfig.resolveAssetUrl(relative)));
  });
}
