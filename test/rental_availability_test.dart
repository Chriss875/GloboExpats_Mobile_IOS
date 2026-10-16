import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/domain/rentals.dart';
import 'package:globoexpats_mobile/screens/rental_availability_screen.dart';

/// Phase 1, unit 3 + LISTIN-29: the owner's availability editor. Drives the
/// real screen against a stubbed backend so the request bodies are asserted,
/// not assumed. LISTIN-29 parity replaces the bare date-range picker with a
/// month-grid calendar ('Booked from'/'Available again'), a seller-only
/// explainer, a bookedToday/availableFrom status line and labelled cards.
void main() {
  late List<http.Request> sent;

  setUp(() {
    sent = [];
    AuthStore.instance = AuthStore(initialToken: 'test-token');
  });

  // Dates used to drive the grid deterministically: the month AFTER the real
  // current one is always fully in the future, so its day numbers are unique
  // and selectable regardless of the day the test runs.
  DateTime nextMonthDay(int day) {
    final now = DateTime.now();
    return DateTime(now.year, now.month + 1, day);
  }

  String iso(DateTime d) => rentalDateToJson(d);

  ApiClient apiWith({
    List<Map<String, dynamic>> blocks = const [],
    List<Map<String, dynamic>> booked = const [],
    int createStatus = 201,
    bool bookedToday = false,
    String? availableFrom = '2026-01-01',
  }) {
    return ApiClient(
      client: MockClient((request) async {
        sent.add(request);
        final path = request.url.path;
        if (path.endsWith('/rental-availability')) {
          return http.Response(
            jsonEncode({
              'productId': 42,
              'bookedToday': bookedToday,
              'availableFrom': availableFrom,
              'bookedRanges': booked,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (path.contains('/rental-blocks')) {
          if (request.method == 'GET') {
            return http.Response(jsonEncode(blocks), 200,
                headers: {'content-type': 'application/json'});
          }
          if (request.method == 'POST') {
            final body = jsonDecode(request.body) as Map<String, dynamic>;
            return http.Response(
              jsonEncode({
                'rentalCalendarBlockId': 99,
                'productId': 42,
                'startDate': body['startDate'],
                'endDate': body['endDate'],
              }),
              createStatus,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.method == 'DELETE') {
            return http.Response('', 204);
          }
        }
        return http.Response('{}', 404);
      }),
    );
  }

  Future<void> pump(WidgetTester tester, ApiClient api) async {
    // The editor is one long scroll: grid, then reserved/booked cards. A tall
    // surface keeps every section built so assertions and taps need no drag.
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(1000, 5200);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      home: RentalAvailabilityScreen(
        productId: 42,
        title: 'Beach house in Msasani',
        api: api,
      ),
    ));
    await tester.pumpAndSettle();
  }

  /// Moves the calendar one month forward and taps day [start] then day [end].
  Future<void> pickRange(
      WidgetTester tester, int start, int end) async {
    await tester.tap(find.byTooltip('Next month'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('$start'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('$end'));
    await tester.pumpAndSettle();
  }

  testWidgets('shows listing, seller explainer, grid, reserved dates and bookings',
      (tester) async {
    await pump(
      tester,
      apiWith(
        blocks: [
          {
            'rentalCalendarBlockId': 1,
            'productId': 42,
            'startDate': '2026-02-10',
            'endDate': '2026-02-13',
          }
        ],
        booked: [
          {'startDate': [2026, 3, 1], 'endDate': [2026, 3, 4]},
        ],
      ),
    );

    expect(find.text('Beach house in Msasani'), findsOneWidget);
    // LISTIN-29: the seller-only shortcut explainer (web dialog copy).
    expect(find.textContaining('Seller-only shortcut.', findRichText: true),
        findsOneWidget);
    expect(find.textContaining('buyers will see them crossed out',
        findRichText: true), findsOneWidget);
    // A calendar grid replaced the bare picker.
    expect(find.text('Choose dates'), findsWidgets);
    expect(find.byTooltip('Next month'), findsOneWidget);
    // status line reflects the availability payload.
    expect(find.text('Available again from 01/01/2026'), findsOneWidget);

    expect(find.text('DATES YOU RESERVED'), findsOneWidget);
    // Three nights, with the exclusive end shown as the checkout day, and the
    // web-style 'Booked from / Available again' subtitle.
    expect(find.textContaining('10/02/2026 - 13/02/2026'), findsOneWidget);
    expect(find.textContaining('Booked from 10/02/2026'), findsOneWidget);
    expect(find.textContaining('Available again 13/02/2026'), findsOneWidget);

    expect(find.text('BOOKED BY GUESTS'), findsOneWidget);
    expect(find.textContaining('3 nights'), findsNWidgets(2));
    // A guest booking cannot be reopened by the owner from here.
    expect(find.text('Cannot be reopened from here'), findsOneWidget);
  });

  testWidgets('a listing with nothing closed shows the action only',
      (tester) async {
    await pump(tester, apiWith());

    expect(find.text('Reserve dates'), findsOneWidget);
    // No empty scaffolding around zero rows — the sections simply are not there.
    expect(find.text('DATES YOU RESERVED'), findsNothing);
    expect(find.text('BOOKED BY GUESTS'), findsNothing);
    // The status line falls back to the generic prompt when there is no
    // bookedToday/availableFrom signal (here availableFrom IS set by the mock,
    // so it is shown).
    expect(find.text('Available again from 01/01/2026'), findsOneWidget);
  });

  testWidgets('bookedToday renders the today status line (LISTIN-29)',
      (tester) async {
    final now = DateTime.now();
    await pump(
      tester,
      apiWith(bookedToday: true, booked: [
        {
          'startDate': iso(now),
          'endDate': iso(DateTime(now.year, now.month + 1, 1)),
        }
      ]),
    );
    expect(find.text('Booked today; later dates may be open'), findsOneWidget);
  });

  testWidgets('selecting two dates reserves a one-night block with an exclusive end',
      (tester) async {
    await pump(tester, apiWith());
    final expectedStart = nextMonthDay(1);
    final expectedEnd = nextMonthDay(2);

    await pickRange(tester, 1, 2);
    // The selection summary labels the pair Booked from / Available again.
    expect(find.textContaining('BOOKED FROM'), findsOneWidget);
    expect(find.textContaining('AVAILABLE AGAIN'), findsOneWidget);
    expect(find.text(formatRentalDate(expectedStart)), findsOneWidget);
    expect(find.text(formatRentalDate(expectedEnd)), findsOneWidget);

    await tester.tap(find.text('Reserve dates'));
    await tester.pumpAndSettle();

    final post = sent.firstWhere((r) => r.method == 'POST');
    final body = jsonDecode(post.body) as Map<String, dynamic>;
    expect(body['startDate'], iso(expectedStart));
    expect(body['endDate'], iso(expectedEnd));
    expect(find.text('Dates reserved. Buyers can no longer select that date range.'),
        findsOneWidget);
    expect(find.text('DATES YOU RESERVED'), findsOneWidget);
  });

  testWidgets('refuses to close dates a guest has already booked',
      (tester) async {
    // Book next month days 5..10 so the grid stays in the future and the
    // seller can pick a free start (day 3) that would swallow the booking.
    final bookedStart = nextMonthDay(5);
    final bookedEnd = nextMonthDay(10);
    await pump(
      tester,
      apiWith(booked: [
        {
          'startDate': iso(bookedStart),
          'endDate': iso(bookedEnd),
        }
      ]),
    );

    await tester.tap(find.byTooltip('Next month'));
    await tester.pumpAndSettle();
    // A booked night cannot even become the start of a selection: Reserve stays
    // disabled and no summary appears.
    await tester.tap(find.text('${bookedStart.day}'));
    await tester.pumpAndSettle();
    final reserve = find.ancestor(
        of: find.text('Reserve dates'), matching: find.bySubtype<FilledButton>());
    expect(reserve, findsOneWidget);
    expect(tester.widget<FilledButton>(reserve).onPressed, isNull,
        reason: 'a booked night starts nothing');

    // Picking a free start then an end that swallows the booking is refused
    // before anything is written.
    await tester.tap(find.text('3'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('${bookedEnd.day + 1}'));
    await tester.pumpAndSettle();

    expect(
        find.text('That range includes a booked or already-closed date, so it '
            'cannot be reserved.'),
        findsOneWidget);
    expect(sent.where((r) => r.method == 'POST'), isEmpty,
        reason: 'the clash is caught before anything is written');
  });

  testWidgets('reopening a range deletes it and drops it from the list',
      (tester) async {
    await pump(
      tester,
      apiWith(blocks: [
        {
          'rentalCalendarBlockId': 7,
          'productId': 42,
          'startDate': '2026-02-10',
          'endDate': '2026-02-13',
        }
      ]),
    );

    await tester.tap(find.byTooltip('Remove reserved dates from 10/02/2026'));
    await tester.pumpAndSettle();

    expect(sent.any((r) => r.method == 'DELETE' && r.url.path.endsWith('/7')),
        isTrue);
    expect(find.textContaining('10/02/2026'), findsNothing);
    expect(find.text('Dates available again'), findsOneWidget);
  });
}
