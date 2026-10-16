import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/auth_screens.dart';

/// "login the white part with details is too streched" — reported from the
/// phone, one build after the opposite complaint ("the blue bg covers like 3/4
/// of the page").
///
/// Both were the same defect seen from either side. The `minHeight` that
/// reserves the column for the card to centre in sat on the card itself, so
/// the card was stretched to the full height of the page: first it read as too
/// little card, then — once the reservation filled the screen — as a
/// mostly-empty white slab. The card is now sized by its content and centred in
/// the reserved column, which is what these two assertions pin.
void main() {
  testWidgets('login card keeps its content height instead of filling the page',
      (tester) async {
    // A real handset viewport: the defect only shows on a tall screen, since it
    // is the leftover vertical space the card was absorbing.
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(home: LoginScreen(store: AuthStore())));
    await tester.pumpAndSettle();

    final card = find
        .ancestor(of: find.byType(Form), matching: find.byType(Container))
        .first;
    final rect = tester.getRect(card);

    // Measured against the scroll view, not the screen: the body starts below
    // the app bar, so screen coordinates would offset both gaps by the same
    // 56px and hide a real off-centre. The 20s are the scroll view's own
    // symmetric padding, the edge the card actually centres within.
    final scroll = tester.getRect(find.byType(SingleChildScrollView).first);
    final contentTop = scroll.top + 20;
    final contentBottom = scroll.bottom - 20;

    expect(rect.height, lessThan(contentBottom - contentTop),
        reason: 'the card is absorbing the reserved column again');

    final above = rect.top - contentTop;
    final below = contentBottom - rect.bottom;
    expect((above - below).abs(), lessThan(2),
        reason: 'card is off-centre: $above above vs $below below');
  });
}
