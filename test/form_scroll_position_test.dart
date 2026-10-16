import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/screens/sell/sell_wizard_screen.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';
import 'package:globoexpats_mobile/widgets/scroll_reveal.dart';

/// "going next stage dsnt always start at top of page it should start at top,
/// then if errors occur be in selling or checkout to always scroll to the
/// error message".
http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
    KvStore.instance.remove('sell_form_draft');
  });

  tearDown(() => AuthStore.instance = null);

  group('the scroll helpers', () {
    Widget tallList(ScrollController c, GlobalKey tail) => MaterialApp(
          home: Scaffold(
            body: ListView(controller: c, children: [
              for (var i = 0; i < 40; i++)
                SizedBox(height: 80, child: Text('row $i')),
              ScrollAnchor(tail),
            ]),
          ),
        );

    testWidgets('scrollToStart returns a scrolled form to the top',
        (tester) async {
      final c = ScrollController();
      addTearDown(c.dispose);
      await tester.pumpWidget(tallList(c, GlobalKey()));

      await tester.drag(find.byType(ListView), const Offset(0, -900));
      await tester.pumpAndSettle();
      expect(c.offset, greaterThan(0));

      scrollToStart(c);
      await tester.pumpAndSettle();
      expect(c.offset, moreOrLessEquals(0, epsilon: 1));
    });

    testWidgets('revealAnchor reaches a marker that was never built',
        (tester) async {
      // The case that matters: a ListView does not lay out what is off
      // screen, so the anchor's context is null exactly when it is needed.
      final c = ScrollController();
      addTearDown(c.dispose);
      final tail = GlobalKey();
      await tester.pumpWidget(tallList(c, tail));

      expect(tail.currentContext, isNull, reason: 'precondition: not built');

      revealAnchor(tail, c, alignment: 0.12);
      await tester.pumpAndSettle();

      expect(c.offset, greaterThan(0));
      expect(tail.currentContext, isNotNull);
    });

    testWidgets('does nothing when the controller has no scroll view',
        (tester) async {
      final c = ScrollController();
      addTearDown(c.dispose);
      await tester
          .pumpWidget(const MaterialApp(home: Scaffold(body: Text('x'))));
      scrollToStart(c);
      revealAnchor(GlobalKey(), c);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('the sell wizard', () {
    ApiClient wizardApi() => ApiClient(client: MockClient((req) async {
          final path = req.url.path;
          if (path == '/api/v1/products/categories') {
            return _json([
              {
                'categoryId': 1,
                'categoryName': 'Electronics',
                'subcategories': [
                  {'subcategoryId': 10, 'subcategoryName': 'Phones'},
                ],
              },
            ]);
          }
          if (path == '/api/v1/get-addresses') {
            return _json([
              {
                'addressId': 5,
                'label': 'Home',
                'street': '44 Coco Beach Rd',
                'region': 'Dar es Salaam',
                'country': 'Tanzania',
                'latitude': -6.7892,
                'longitude': 39.2887,
              },
            ]);
          }
          if (path == '/api/v1/userManagement/user-details') {
            return _json({'userId': 1, 'whatsAppPhoneNumber': '+255700000000'});
          }
          return _json({});
        }));

    /// The offset of the wizard's form list.
    double offset(WidgetTester tester) =>
        tester.widget<Scrollable>(find.byType(Scrollable).first).controller?.offset ??
        0;

    Future<void> pumpWizard(WidgetTester tester) async {
      final api = wizardApi();
      final auth =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
      AuthStore.instance = auth;
      await tester
          .pumpWidget(MaterialApp(home: SellWizardScreen(auth: auth, api: api)));
      await tester.pumpAndSettle();
    }

    testWidgets('scrolls an unfinished step back to its error', (tester) async {
      await pumpWizard(tester);

      // Leave the title empty and read the rest of the step, so the top of
      // the form — where the banner appears — is well off screen.
      await tester.drag(find.byType(Scrollable).first, const Offset(0, -600));
      await tester.pumpAndSettle();
      expect(offset(tester), greaterThan(0),
          reason: 'the test needs the top of the form out of view');

      await tester.ensureVisible(find.text('Continue'));
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      // A ListView does not build children that are scrolled away, so finding
      // the banner at all is the assertion: it is on screen.
      expect(find.text('Item title is required.'), findsOneWidget,
          reason: 'the seller must be shown why Continue did nothing');
      final banner = tester.getRect(find.text('Item title is required.'));
      final viewport = tester.getRect(find.byType(Scrollable).first);
      expect(banner.top, greaterThanOrEqualTo(viewport.top - 1));
      expect(banner.bottom, lessThanOrEqualTo(viewport.bottom + 1));
    });

    testWidgets('opens the next step at the top', (tester) async {
      await pumpWizard(tester);

      await tester.enterText(
          find.widgetWithText(TextFormField, 'e.g., MacBook Pro 14″ M2'),
          'iPhone 12');
      await tester.pumpAndSettle();

      Future<void> tapField(Finder finder) async {
        await tester.ensureVisible(finder);
        await tester.pumpAndSettle();
        await tester.tap(finder);
        await tester.pumpAndSettle();
      }

      await tapField(find.byType(DropdownButtonFormField<int?>).first);
      await tester.tap(find.text('Electronics').last);
      await tester.pumpAndSettle();
      await tapField(find.byType(DropdownButtonFormField<int?>).at(1));
      await tester.tap(find.text('Phones').last);
      await tester.pumpAndSettle();

      // Step 1 is taller than the phone, so Continue is only reachable from
      // the bottom of it — which is exactly where step 2 used to open.
      await tester.ensureVisible(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(offset(tester), greaterThan(0));

      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.text('Description *'), findsOneWidget,
          reason: 'must have landed on step 2');
      expect(offset(tester), moreOrLessEquals(0, epsilon: 1),
          reason: 'a new step starts at its beginning');
    });
  });
}
