import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/screens/catalog_screens.dart';
import 'package:globoexpats_mobile/widgets/product_grid.dart';

MockClient _browseClient() {
  return MockClient((request) async {
    if (request.url.path == '/api/v1/displayItem/filter' &&
        request.method == 'POST') {
      return http.Response(
        jsonEncode({
          'content': [
            {
              'productId': 201,
              'productName': 'Bose speaker',
              'productAskingPrice': 350000,
              'productCurrency': 'TZS',
              'productImages': [],
            },
            {
              'productId': 202,
              'productName': 'Sony camera',
              'productAskingPrice': 1200000,
              'productCurrency': 'TZS',
              'productImages': [],
            },
          ],
          'totalElements': 2,
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    return http.Response('not found', 404);
  });
}

void main() {
  testWidgets('browse (Marketplace) lists all products from the API',
      (tester) async {
    final api = ApiClient(client: _browseClient());
    await tester.pumpWidget(MaterialApp(home: BrowseScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Bose speaker'), findsOneWidget);
    expect(find.text('Sony camera'), findsOneWidget);
    expect(find.text('TSh 350,000'), findsOneWidget);
    expect(find.text('TSh 1,200,000'), findsOneWidget);
  });

  testWidgets('Marketplace opens in list orientation and can switch to a grid',
      (tester) async {
    final api = ApiClient(client: _browseClient());
    await tester.pumpWidget(MaterialApp(home: BrowseScreen(api: api)));
    await tester.pumpAndSettle();

    // Browse now opens in list view, so the rows are there without a tap and
    // the view-mode control offers the grid instead.
    expect(find.byType(SliverProductListRows), findsOneWidget);
    expect(find.text('Bose speaker'), findsOneWidget);
    expect(find.text('Sony camera'), findsOneWidget);

    await tester.tap(find.byTooltip('Grid view'));
    await tester.pumpAndSettle();

    expect(find.byType(SliverProductGrid), findsOneWidget);
    expect(find.text('Bose speaker'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('search page focuses the query field immediately',
      (tester) async {
    final api = ApiClient(client: _browseClient());
    await tester.pumpWidget(MaterialApp(home: SearchScreen(api: api)));
    await tester.pumpAndSettle();

    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.focusNode?.hasFocus, isTrue);
  });
}
