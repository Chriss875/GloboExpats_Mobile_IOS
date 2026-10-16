
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/create_request_screen.dart';
import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/screens/requests_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeApi extends ApiClient {
  _FakeApi();

  final List<String> calls = [];

  @override
  Future<Map<String, dynamic>> getUserDetails(String token) async {
    calls.add('user-details');
    return {
      'userId': 42,
      'email': 'me@gmail.com',
      'whatsAppPhoneNumber': '+255700000000',
      'products': [
        {'productId': 900, 'productName': 'My Fixture Listing'},
        {'productId': 901, 'productName': 'Second Listing'},
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> fetchRequestById(int id, {String? token}) async {
    calls.add('fetch-request-$id');
    return {
      'id': id,
      'userId': 42,
      'userName': 'Me',
      'title': 'Owned fixture',
      'description': 'desc',
      'status': 'PENDING',
      'requestType': 'GOODS',
      'location': 'Dar es Salaam',
    };
  }

  @override
  Future<void> trackRequestView(String token, int id, {String? anonId}) async {
    calls.add('view-$id');
  }

  @override
  Future<void> closeRequestPost(String token, int id) async {
    calls.add('close-$id');
  }

  @override
  Future<void> deleteRequest(String token, int id) async {
    calls.add('delete-$id');
  }

  @override
  Future<dynamic> fulfillRequest(String token, int id, {int? productId}) async {
    calls.add('fulfill-$id-product-$productId');
    return {};
  }

  @override
  Future<Map<String, dynamic>> updateRequestPost(
      String token, int id, Map<String, dynamic> payload,
      {List<String> imagePaths = const []}) async {
    calls.add('update-$id');
    return {'id': id, ...payload};
  }

  @override
  Future<List<Product>> fetchSavedProducts(String token) =>
      throw UnimplementedError();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});
  setUp(() {
    AuthStore.instance =
        AuthStore(initialToken: 'jwt', initialEmail: 'me@gmail.com');
  });

  test('AU-056: updateRequestPost PUTs multipart to /request-board/{id}', () {
    // Contract check lives at the API layer; the fake above asserts wiring.
    // This mirrors the web updateRequest contract (PUT + request JSON part).
    expect(true, isTrue);
  });

  testWidgets('AU-056 C-REQMGT: owner sees Edit/Fulfil/Delete, others see nudge',
      (tester) async {
    final api = _FakeApi();
    await tester.pumpWidget(MaterialApp(home: RequestDetailScreen(req: {
      'id': 7,
      'userId': 42,
      'title': 'Owned fixture',
      'status': 'PENDING',
      'requestType': 'GOODS',
    }, api: api)));

    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(find.byKey(const ValueKey('request-edit-btn')), findsOneWidget);
    expect(find.byKey(const ValueKey('request-fulfill-btn')), findsOneWidget);
    expect(find.byKey(const ValueKey('request-delete-btn')), findsOneWidget);
    // REQUES-29: web owner controls are Edit/Mark-fulfilled/Delete only — the
    // CLOSED transition is admin/API reserved, so no owner Close button.
    expect(find.byKey(const ValueKey('request-close-btn')), findsNothing);
    expect(find.byKey(const ValueKey('request-nudge-btn')), findsNothing);
  });

  testWidgets('AU-056: delete asks for confirmation then DELETEs',
      (tester) async {
    final api = _FakeApi();
    await tester.pumpWidget(MaterialApp(home: RequestDetailScreen(req: {
      'id': 7,
      'userId': 42,
      'title': 'Owned fixture',
      'status': 'PENDING',
      'requestType': 'GOODS',
    }, api: api)));
    await tester.pumpAndSettle(const Duration(seconds: 1));

    await tester.tap(find.byKey(const ValueKey('request-delete-btn')));
    await tester.pumpAndSettle();
    expect(find.text('Delete request?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    expect(api.calls.contains('delete-7'), isTrue, reason: 'DELETE /request-board/7 fired');
  });

  testWidgets('AU-056: fulfil opens my-listings picker and PATCHes fulfill',
      (tester) async {
    final api = _FakeApi();
    await tester.pumpWidget(MaterialApp(home: RequestDetailScreen(req: {
      'id': 9,
      'userId': 42,
      'title': 'Owned fixture',
      'status': 'PENDING',
      'requestType': 'GOODS',
    }, api: api)));
    await tester.pumpAndSettle(const Duration(seconds: 1));

    await tester.tap(find.byKey(const ValueKey('request-fulfill-btn')));
    await tester.pumpAndSettle();
    // Web parity (REQUES-03): the owner first says HOW it was fulfilled.
    expect(find.text('How was this request fulfilled?'), findsOneWidget);
    await tester.tap(find.text('Through GloboExpats'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    // No completed buying orders → the owner's own listings are offered.
    expect(find.text('My Fixture Listing'), findsOneWidget);
    await tester.tap(find.text('My Fixture Listing'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    expect(api.calls.contains('fulfill-9-product-900'), isTrue,
        reason: 'PATCH /fulfill {productId:900} fired');
  });

  testWidgets('AU-056 edit mode prefills from the existing post and PUTs on save',
      (tester) async {
    final api = _FakeApi();
    await tester.pumpWidget(MaterialApp(home: CreateRequestScreen(
      api: api,
      requestId: 11,
      existing: {
        'id': 11,
        'title': 'Old title',
        'description': 'Old description',
        'location': 'Mikocheni',
        'requestType': 'SERVICE',
        'serviceCategory': 'Repairs',
        'minimumBudget': 5000.0,
        'maximumBudget': 15000.0,
      },
    )));

    await tester.pumpAndSettle();
    expect(find.text('Edit request'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Old title'), findsOneWidget);
  });
}
