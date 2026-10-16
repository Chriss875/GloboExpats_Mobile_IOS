import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/account_misc_screens.dart';

/// Phase 8b parity patch on the notifications feed (items A-12, A-13, A-14).
///
/// A-12: per-row delete + bulk "Delete shown" wired to the existing
/// deleteNotification / deleteNotificationsBulk API (previously zero UI
/// callers). A-13: the feed paginates past the fixed 20-row fetch with a
/// "Load more notifications" footer. A-14's richer empty state is asserted in
/// test/notifications_test.dart.
http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Map<String, dynamic> _n({
  required int id,
  required String title,
  String type = 'NEW_ORDER',
}) =>
    {
      'notificationId': id,
      'title': title,
      'message': 'message $id',
      'notificationType': type,
      'isRead': false,
      'createdAt': '2026-03-01T09:00:00Z',
    };

ApiClient _apiWith(List<Map<String, dynamic>> rows, {List<String>? calls}) =>
    ApiClient(client: MockClient((req) async {
      final path = req.url.path;
      calls?.add('${req.method} $path');
      if (path == '/api/v1/notifications') {
        return _json({'content': rows});
      }
      return _json({}, 204);
    }));

Future<void> _pump(WidgetTester tester, ApiClient api) async {
  AuthStore.instance = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
  await tester.pumpWidget(MaterialApp(home: NotificationsScreen(api: api)));
  await tester.pumpAndSettle();
}

/// The vertical feed ListView lives under the screen's RefreshIndicator; the
/// tab bar is a second (horizontal) ListView so we must not use Scrollable.first.
Finder _feedScrollable() => find.descendant(
    of: find.byType(RefreshIndicator), matching: find.byType(Scrollable));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  tearDown(() => AuthStore.instance = null);

  testWidgets('A-12: the per-row delete icon removes just that notification',
      (tester) async {
    final calls = <String>[];
    final api = _apiWith(
      [_n(id: 5, title: 'Order five'), _n(id: 6, title: 'Order six')],
      calls: calls,
    );
    await _pump(tester, api);

    expect(find.text('Order five'), findsOneWidget);
    expect(find.byKey(const ValueKey('notif-delete-5')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('notif-delete-5')));
    await tester.pumpAndSettle();

    expect(calls, contains('DELETE /api/v1/notifications/5'),
        reason: 'A-12: per-row delete hits the backend endpoint');
    expect(find.text('Order five'), findsNothing,
        reason: 'A-12: deleted row leaves the feed immediately');
    expect(find.text('Order six'), findsOneWidget,
        reason: 'A-12: neighbouring rows survive');
  });

  testWidgets('A-12: bulk "Delete shown" removes only the filtered rows',
      (tester) async {
    final calls = <String>[];
    final bodies = <Object>[];
    final api = ApiClient(client: MockClient((req) async {
      final path = req.url.path;
      calls.add('${req.method} $path');
      if (path == '/api/v1/notifications') {
        return _json({
          'content': [
            _n(id: 1, title: 'New order received'),
            _n(id: 2, title: 'Someone needs a plumber', type: 'NEW_REQUEST'),
          ]
        });
      }
      if (path == '/api/v1/notifications/bulk') {
        bodies.add(jsonDecode(req.body));
        return _json({}, 204);
      }
      return _json({}, 204);
    }));
    await _pump(tester, api);

    // Narrow to the Selling tab: only the NEW_ORDER row is shown.
    await tester.tap(find.byKey(const ValueKey('notif-tab-selling')));
    await tester.pumpAndSettle();
    expect(find.text('New order received'), findsOneWidget);
    expect(find.text('Someone needs a plumber'), findsNothing);
    expect(find.text('Delete shown (1)'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('notif-delete-shown')));
    await tester.pumpAndSettle();

    expect(calls, contains('DELETE /api/v1/notifications/bulk'),
        reason: 'A-12: bulk delete hits the bulk endpoint');
    expect(bodies, [
      {'ids': [1]}
    ], reason: 'A-12: only the SHOWN (filtered) rows are sent for deletion');

    // The request row was not shown, so it survives; flip back to All to see it.
    expect(find.text('New order received'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('notif-tab-all')));
    await tester.pumpAndSettle();
    expect(find.text('Someone needs a plumber'), findsOneWidget,
        reason: 'A-12: an un-shown row is untouched by bulk delete');
  });

  testWidgets(
      'A-13: a full first page keeps the footer and a tap loads the next page',
      (tester) async {
    const total = 25;
    final requestedPages = <int>[];
    final requestedSizes = <int>[];
    final api = ApiClient(client: MockClient((req) async {
      if (req.url.path == '/api/v1/notifications') {
        final page = int.parse(req.url.queryParameters['page'] ?? '0');
        requestedPages.add(page);
        requestedSizes.add(int.parse(req.url.queryParameters['size'] ?? '0'));
        final first = page * 20;
        final last = math.min(total, first + 20);
        return _json({
          'content': [
            for (var id = first + 1; id <= last; id++) _n(id: id, title: 'Notification $id')
          ]
        });
      }
      return _json({}, 404);
    }));
    await _pump(tester, api);

    // Page 0 fetched with the app's page size; the fixed 20-row cap is gone.
    expect(requestedPages, [0]);
    expect(requestedSizes, [20]);

    // The feed starts at the top: older rows sit below the viewport.
    expect(find.text('Notification 1'), findsOneWidget);
    expect(find.byKey(const ValueKey('notif-load-more')), findsNothing,
        reason: 'the footer is below the fold until scrolled to');

    // A full 20-row page means more rows exist — scroll to the footer.
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('notif-load-more')), 400,
        scrollable: _feedScrollable());
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('notif-load-more')), findsOneWidget,
        reason: 'A-13: hasMore shows the load-more footer');

    await tester.tap(find.byKey(const ValueKey('notif-load-more')));
    await tester.pumpAndSettle();

    expect(requestedPages, [0, 1],
        reason: 'A-13: the tap fetches the next page');
    expect(find.byKey(const ValueKey('notif-load-more')), findsNothing,
        reason: 'A-13: the 5-row last page ends the feed, footer disappears');

    // The older rows are appended after the first 20.
    await tester.scrollUntilVisible(find.text('Notification 25'), 400,
        scrollable: _feedScrollable());
    await tester.pumpAndSettle();
    expect(find.text('Notification 25'), findsOneWidget,
        reason: 'A-13: rows past the old 20-row cap are reachable');
  });
}
