import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/domain/pending_actions.dart';
import 'package:globoexpats_mobile/screens/shell.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// What "the whole UX is bad, everything loads late" actually was: opening the
/// app, then moving between tabs, re-issued the same handful of requests over
/// and over. The signed-in profile alone went out twice per tab change — once
/// for the top bar's avatar, once for the pending-actions strip — on top of
/// the full order and payment lists.
///
/// These budgets are the contract. They may fall; a change that pushes one up
/// is putting a round trip back in front of the user.
void main() {
  late Map<String, int> hits;

  setUp(() {
    ApiClient.invalidateReads();
    PendingActionsStore.instance.clear();
    PendingActionsStore.instance.clearSnoozes();
    hits = {};
  });
  tearDown(() {
    ApiClient.invalidateReads();
    PendingActionsStore.instance.clear();
  });

  ApiClient countingApi() => ApiClient(client: MockClient((request) async {
        final path = request.url.path;
        hits[path] = (hits[path] ?? 0) + 1;
        Object body = const [];
        if (path.endsWith('/user-details')) {
          body = {'userId': 7, 'firstName': 'Globo', 'lastName': 'Expat'};
        } else if (path.contains('unread-count')) {
          body = 0;
        } else if (path.contains('displayItem')) {
          body = {'content': const [], 'totalElements': 0};
        }
        return http.Response(jsonEncode(body), 200,
            headers: {'content-type': 'application/json'});
      }));

  Future<void> pumpShell(WidgetTester tester, ApiClient api) async {
    final store =
        AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    AuthStore.instance = store;
    addTearDown(() => AuthStore.instance = null);
    await tester.pumpWidget(MaterialApp(
      home: AppShell(store: store, api: api, location: Uri.parse('/')),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('the profile is read once for the whole shell, not per widget',
      (tester) async {
    final api = countingApi();
    await pumpShell(tester, api);

    expect(hits['/api/v1/userManagement/user-details'], 1,
        reason: 'the top bar, the strip and the Account tab all want the same '
            'profile; they should not each pay for it');
  });

  testWidgets('moving between tabs does not re-read the order and payment lists',
      (tester) async {
    final api = countingApi();
    await pumpShell(tester, api);

    final ordersAfterLaunch = hits['/api/v1/orders'] ?? 0;
    expect(ordersAfterLaunch, lessThanOrEqualTo(1));

    // Four tab changes in quick succession, as any real session has.
    for (final label in ['Community', 'MySpace', 'Home', 'Community']) {
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
    }

    expect(hits['/api/v1/orders'], ordersAfterLaunch,
        reason: 'a tab change does not change what work is outstanding; only '
            'a real mutation does, and that signals its own refresh');
  });

  testWidgets('a completed action still refreshes the strip immediately',
      (tester) async {
    // The debounce must never swallow a refresh that something actually
    // asked for — otherwise a finished step keeps nagging for 20 seconds.
    final api = countingApi();
    await pumpShell(tester, api);
    final before = hits['/api/v1/orders'] ?? 0;

    requestPendingActionsRefresh();
    await tester.pumpAndSettle();

    expect(hits['/api/v1/orders'], greaterThan(before));
  });
}
