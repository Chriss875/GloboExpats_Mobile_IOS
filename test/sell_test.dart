import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/sell_screen.dart';

MockClient _sellClient({void Function()? posted}) => MockClient((r) async {
      if (r.url.path == '/api/v1/products/categories') {
        return http.Response(jsonEncode([
          {'categoryId': 1, 'categoryName': 'Electronics', 'subcategories': [
            {'subcategoryId': 10, 'subcategoryName': 'Phones'},
          ]},
        ]), 200, headers: {'content-type': 'application/json'});
      }
      if (r.url.path == '/api/v1/products/post-product') {
        posted?.call();
        return http.Response(jsonEncode({'id': 1}), 200, headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 404);
    });

Future<void> _tapListItem(WidgetTester tester) async {
  final btn = find.text('List item');
  await tester.scrollUntilVisible(btn, 120, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  await tester.tap(btn);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('sell form renders fields and empty submit does NOT post', (tester) async {
    var posted = false;
    final api = ApiClient(client: _sellClient(posted: () => posted = true));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: SellScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Sell'), findsOneWidget);
    expect(find.text('Title'), findsOneWidget);

    // Empty form: submit must be blocked (no POST) by the title/category validation.
    await _tapListItem(tester);
    expect(posted, isFalse);
  });

  testWidgets('sell submits a real multipart post-product when complete', (tester) async {
    var posted = false;
    final api = ApiClient(client: _sellClient(posted: () => posted = true));
    final auth = AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
    await tester.pumpWidget(MaterialApp(home: SellScreen(auth: auth, api: api)));
    await tester.pumpAndSettle();

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Wooden table');
    await tester.enterText(fields.at(1), '150000');

    // open the Category dropdown and pick Electronics
    final catDropdown = find.byType(DropdownButtonFormField<int?>).first;
    await tester.ensureVisible(catDropdown);
    await tester.pumpAndSettle();
    await tester.tap(catDropdown);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Electronics').last);
    await tester.pumpAndSettle();

    await _tapListItem(tester);

    expect(posted, isTrue);
    expect(find.textContaining('Listing created'), findsOneWidget);
  });
}
