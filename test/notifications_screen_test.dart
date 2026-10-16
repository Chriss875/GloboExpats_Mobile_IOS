import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/account_misc_screens.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Map<String, dynamic> _n({
  required int id,
  required String title,
  String message = '',
  String type = 'SYSTEM',
  bool isRead = false,
  String? referenceId,
}) =>
    {
      'notificationId': id,
      'title': title,
      'message': message,
      'notificationType': type,
      'isRead': isRead,
      if (referenceId != null) 'referenceId': referenceId,
      'createdAt': '2026-03-01T09:00:00Z',
    };

ApiClient _apiWith(List<Map<String, dynamic>> rows, {List<String>? readCalls}) =>
    ApiClient(client: MockClient((req) async {
      if (req.url.path == '/api/v1/notifications') {
        return _json({'content': rows});
      }
      if (req.url.path.endsWith('/read')) {
        readCalls?.add(req.url.path);
        return _json({});
      }
      return _json({});
    }));

Future<void> _pump(WidgetTester tester, ApiClient api) async {
  AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
  await tester.pumpWidget(MaterialApp(home: NotificationsScreen(api: api)));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(() => AuthStore.instance = null);

  testWidgets('the role tabs narrow the feed the way web does', (tester) async {
    final api = _apiWith([
      _n(id: 1, title: 'New order received', type: 'NEW_ORDER'),
      _n(id: 2, title: 'Rate seller', message: 'Your purchase is complete'),
      _n(id: 3, title: 'Someone needs a plumber', type: 'NEW_REQUEST'),
    ]);
    await _pump(tester, api);

    // All
    expect(find.text('New order received'), findsOneWidget);
    expect(find.text('Rate seller'), findsOneWidget);
    expect(find.text('Someone needs a plumber'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('notif-tab-selling')));
    await tester.pumpAndSettle();
    expect(find.text('New order received'), findsOneWidget);
    expect(find.text('Rate seller'), findsNothing,
        reason: 'a buying rating is not a selling concern');
    expect(find.text('Someone needs a plumber'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('notif-tab-requests')));
    await tester.pumpAndSettle();
    expect(find.text('Someone needs a plumber'), findsOneWidget);
    expect(find.text('New order received'), findsNothing);
  });

  testWidgets('a generic order update stays in both role tabs', (tester) async {
    final api = _apiWith([
      _n(id: 1, title: 'Order updated', type: 'ORDER_UPDATE'),
    ]);
    await _pump(tester, api);

    for (final tab in ['buying', 'selling']) {
      await tester.tap(find.byKey(ValueKey('notif-tab-$tab')));
      await tester.pumpAndSettle();
      expect(find.text('Order updated'), findsOneWidget, reason: 'missing from $tab');
    }
  });

  testWidgets('the action-type filter narrows by what the row asks for',
      (tester) async {
    final api = _apiWith([
      _n(id: 1, title: 'Refund processed', type: 'PAYMENT'),
      _n(id: 2, title: 'Confirm receipt', type: 'ORDER_UPDATE'),
    ]);
    await _pump(tester, api);

    await tester.tap(find.byKey(const ValueKey('notif-filter')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Receipt').last);
    await tester.pumpAndSettle();

    expect(find.text('Confirm receipt'), findsOneWidget);
    expect(find.text('Refund processed'), findsNothing);
  });

  testWidgets('search matches the title and the message', (tester) async {
    final api = _apiWith([
      _n(id: 1, title: 'Order updated', message: 'Your sofa is on the way'),
      _n(id: 2, title: 'Something else', message: 'unrelated'),
    ]);
    await _pump(tester, api);

    await tester.enterText(find.byKey(const ValueKey('notif-search')), 'sofa');
    await tester.pumpAndSettle();
    expect(find.text('Order updated'), findsOneWidget);
    expect(find.text('Something else'), findsNothing);
  });

  testWidgets('a read informational payment row drops out of the active feed',
      (tester) async {
    final api = _apiWith([
      _n(id: 1, title: 'Payment verified', type: 'PAYMENT_VERIFIED', isRead: true),
      _n(id: 2, title: 'Payment verified too', type: 'PAYMENT_VERIFIED'),
    ]);
    await _pump(tester, api);

    // Read one is gone; the unread one still needs the buyer's attention.
    expect(find.text('Payment verified'), findsNothing);
    expect(find.text('Payment verified too'), findsOneWidget);
  });

  testWidgets('opening a row marks it read before navigating', (tester) async {
    final calls = <String>[];
    final api = _apiWith(
      [_n(id: 5, title: 'Order updated', type: 'ORDER_UPDATE', referenceId: '42')],
      readCalls: calls,
    );
    await _pump(tester, api);

    await tester.tap(find.text('Order updated'));
    await tester.pumpAndSettle();
    expect(calls, contains('/api/v1/notifications/5/read'));
  });

  testWidgets('a dateless row renders instead of crashing the feed',
      (tester) async {
    // TimeUtils.parseBackendTimestamp throws on null - one such row used to
    // be enough to take the whole screen down.
    final api = ApiClient(client: MockClient((req) async {
      if (req.url.path == '/api/v1/notifications') {
        return _json({
          'content': [
            {'notificationId': 1, 'title': 'No date', 'message': 'm'},
          ]
        });
      }
      return _json({});
    }));
    await _pump(tester, api);

    expect(find.text('No date'), findsOneWidget);
    expect(find.textContaining('Date unavailable'), findsOneWidget);
  });
}
