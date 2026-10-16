import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/requests_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// REQUES-01: the owner responses inbox on the request detail — an absent
/// surface on mobile. The owner should see every nudge with an unread badge,
/// and the API should be told the inbox was opened (markNudgesRead), mirroring
/// the web nudge-inbox.
class _FakeApi extends ApiClient {
  _FakeApi();

  final List<String> calls = [];

  @override
  Future<Map<String, dynamic>> getUserDetails(String token) async {
    calls.add('user-details');
    return {
      'userId': 42,
      'products': [
        {'productId': 900, 'productName': 'My Fixture Listing'},
      ],
    };
  }

  @override
  Future<void> trackRequestView(String token, int id, {String? anonId}) async {
    calls.add('view-$id');
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
  Future<List<Map<String, dynamic>>> fetchRequestNudges(
      String token, int id) async {
    calls.add('nudges-$id');
    return [
      {
        'id': 1,
        'nudgerName': 'Helper Ada',
        'message': 'I can deliver this from my shop.',
        'productId': 5,
        'productName': 'Second-hand fridge',
        'isRead': false,
      },
      {
        'id': 2,
        'nudgerName': 'Bob',
        'message': 'Available next week.',
        'isRead': true,
      },
    ];
  }

  @override
  Future<void> markNudgesRead(String token, int id) async {
    calls.add('mark-read-$id');
  }

  @override
  Future<dynamic> fulfillRequestOutside(String token, int id) async {
    calls.add('outside-fulfill-$id');
    return null;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});
  setUp(() {
    AuthStore.instance = AuthStore(initialToken: 'jwt', initialEmail: 'me@gmail.com');
  });
  tearDown(() => AuthStore.instance = null);

  testWidgets('REQUES-01: owner sees the responses inbox with unread badge',
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

    // The owner no longer sees the nudge CTA; they see the response rows.
    expect(find.byKey(const ValueKey('request-nudge-btn')), findsNothing);
    expect(find.text('Responses (2)'), findsOneWidget);
    expect(find.textContaining('1 new'), findsOneWidget);
    expect(find.text('Helper Ada'), findsOneWidget);
    expect(find.text('I can deliver this from my shop.'), findsOneWidget);
    // A nudge that carries a product offer is fulfillable from the row.
    expect(find.byKey(const ValueKey('fulfill-nudge-1')), findsOneWidget);
    // Opening the inbox tells the API the outstanding nudges were read.
    expect(api.calls.contains('mark-read-7'), isTrue);
  });

  testWidgets('REQUES-03: owner marks the request fulfilled Outside GloboExpats',
      (tester) async {
    final api = _FakeApi();
    await tester.pumpWidget(MaterialApp(home: RequestDetailScreen(req: {
      'id': 7,
      'userId': 42,
      'title': 'Owned fixture',
      'status': 'PENDING',
      'requestType': 'GOODS',
    }, api: api)));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));

    await tester.tap(find.byKey(const ValueKey('request-fulfill-btn')));
    await tester.pumpAndSettle();
    expect(find.text('How was this request fulfilled?'), findsOneWidget);

    // Outside GloboExpats = fulfilled with no linked order (source EXTERNAL).
    await tester.tap(find.text('Outside GloboExpats'));
    await tester.pumpAndSettle();
    expect(api.calls.contains('outside-fulfill-7'), isTrue);
    expect(find.text('Request marked as fulfilled.'), findsOneWidget);

    // Let the snackbar timer elapse so no pending timer fails the teardown.
    await tester.pump(const Duration(seconds: 5));
  });
}
