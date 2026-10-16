import 'dart:math' as math;
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/domain/pending_actions.dart';
import 'package:globoexpats_mobile/screens/shell.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Phones set to 3-button navigation give up ~48dp at the bottom of the
/// screen to the system's back/home/recents bar — twice what the gesture pill
/// takes. Anything pinned to the bottom has to be inset by
/// `MediaQuery.padding.bottom` or the system bar sits on top of it, and the
/// dev phone used here runs gesture navigation, so nothing about this is
/// visible in day-to-day testing.
void main() {
  const threeButtonNav = EdgeInsets.only(bottom: 48);

  setUp(() {
    ApiClient.invalidateReads();
    PendingActionsStore.instance.clear();
  });
  tearDown(() {
    ApiClient.invalidateReads();
    AuthStore.instance = null;
  });

  Widget underNav(Widget child, {EdgeInsets padding = threeButtonNav}) =>
      MediaQuery(
        data: MediaQueryData(size: const Size(400, 800), padding: padding),
        child: child,
      );

  testWidgets('the bottom navigation clears the system bar', (tester) async {
    final api = ApiClient(client: MockClient((_) async => http.Response(
        jsonEncode(const {}), 200,
        headers: {'content-type': 'application/json'})));
    final store = AuthStore(api: api);
    AuthStore.instance = store;

    await tester.pumpWidget(MaterialApp(
      home: underNav(AppShell(store: store, api: api, location: Uri.parse('/'))),
    ));
    await tester.pumpAndSettle();

    final label = tester.getRect(find.text('Home'));
    expect(label.bottom, lessThanOrEqualTo(800 - 48),
        reason: 'the tab label is underneath the 3-button system bar');
  });

  testWidgets('a sheet is inset by the system bar even though the route '
      'hides it', (tester) async {
    // The trap this pins down: inside a modal sheet MediaQuery.padding.bottom
    // reads 0 — the route strips it — so a sheet that asks its OWN context
    // for the inset gets nothing and its save button ends up under the
    // 3-button navigation bar. The inset has to be read from the calling
    // context and carried in.
    double? insetSeenInsideSheet;
    await tester.pumpWidget(MaterialApp(
      home: underNav(
        Scaffold(
          body: Builder(
            builder: (context) {
              final systemInset = MediaQuery.of(context).padding.bottom;
              return TextButton(
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  builder: (ctx) {
                    insetSeenInsideSheet = MediaQuery.of(ctx).padding.bottom;
                    return Padding(
                      padding: EdgeInsets.only(
                          bottom: math.max(
                              MediaQuery.of(ctx).viewInsets.bottom,
                              systemInset)),
                      child: const SizedBox(
                          height: 120,
                          child: Center(child: Text('Save address'))),
                    );
                  },
                ),
                child: const Text('open'),
              );
            },
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(insetSeenInsideSheet, 0,
        reason: 'if this ever becomes 48 the workaround above is obsolete');
    expect(tester.getRect(find.text('Save address')).bottom,
        lessThanOrEqualTo(800 - 48),
        reason: 'the save button is underneath the 3-button system bar');
  });
}
