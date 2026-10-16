// Listing a property the way the web does since 2026-10: a short stay states
// its minimum stay and its six key facts (type, bedrooms, bathrooms, guests,
// check-in and checkout time), each a single value; a longer let hides the
// stay-only facts; and property photos can be grouped and reordered.
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/domain/product_choices.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';
import 'package:globoexpats_mobile/screens/sell/product_choice_editor.dart';

Map<String, dynamic> _def(int id, String name,
        [List<String> values = const []]) =>
    {
      'attributeDefinitionId': id,
      'name': name,
      'slug': name.toLowerCase().replaceAll(' ', '-'),
      'inputType': 'SELECT',
      'required': false,
      'allowCustomValues': true,
      'visual': false,
      'allowDifferentPrices': false,
      'status': 'ACTIVE',
      'predefinedValues': [
        for (final v in values) {'value': v.toLowerCase(), 'label': v}
      ],
      'subcategoryIds': [45],
    };

final _definitions = [
  _def(1, 'Property Type', ['Apartment', 'Villa']),
  _def(2, 'Bedrooms', ['1', '2', '3+']),
  _def(3, 'Bathrooms'),
  _def(4, 'Number of allowed Guests'),
  _def(5, 'Check-in time'),
  _def(6, 'Checkout time'),
  _def(7, 'Wi-Fi', ['Yes', 'No']),
];

SellFormState _stay() => SellFormState()
  ..setCategory(id: 9, name: 'Real Estate', slug: 'real-estate')
  ..setSubcategory(45, slug: 'short-stays-holiday-rentals');

ApiClient _api() => ApiClient(
    client: MockClient((req) async => http.Response(jsonEncode(_definitions),
        200,
        headers: {'content-type': 'application/json'})));

Widget _harness(SellFormState state) => MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: StatefulBuilder(
            builder: (context, setState) => ProductChoiceEditor(
              state: state,
              onChanged: () => setState(() {}),
              api: _api(),
            ),
          ),
        ),
      ),
    );

void main() {
  group('minimum stay', () {
    test('a short stay starts at one night and carries the rule', () {
      final s = _stay();
      expect(s.rentalConfiguration.isShortStay, isTrue);
      expect(s.rentalConfiguration.minimumKind(vehicle: false), 'nights');
      s.setMinimumStay(3);
      final json = s.buildProductJson()['rentalConfiguration'] as Map;
      expect(json['shortStay'], isTrue);
      expect(json['minimumNights'], 3);
    });

    test('out-of-range minimums stop step 1', () {
      final s = _stay()..setMinimumStay(0);
      expect(validateMinimumStay(s.rentalConfiguration, vehicle: false),
          'Minimum stay must be between 1 and 365 nights');
      s.setRatePeriod('MONTH');
      expect(s.rentalConfiguration.minimumKind(vehicle: false), 'months');
      s.setMinimumStay(121);
      expect(validateMinimumStay(s.rentalConfiguration, vehicle: false),
          'Minimum stay must be between 1 and 120 months');
    });

    test('a hire car has no minimum to set', () {
      final car = SellFormState()
        ..setCategory(id: 2, name: 'Vehicle & Supplies', slug: 'vehicle-supplies')
        ..setSubcategory(151, slug: 'cars-for-rent');
      expect(car.rentalConfiguration.minimumKind(vehicle: true), isNull);
    });
  });

  group('property details', () {
    testWidgets('a short stay asks for its six facts first, one value each',
        (tester) async {
      final s = _stay();
      await tester.pumpWidget(_harness(s));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('property-details')), findsOneWidget);
      expect(find.text('Max guests *'), findsOneWidget);
      expect(find.text('More details'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('property-detail-2')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('2').last);
      await tester.pumpAndSettle();

      final bedrooms = s.choiceConfiguration.attributes
          .firstWhere((a) => a.name == 'Bedrooms');
      expect(bedrooms.values.single.label, '2');
      expect(s.choiceConfiguration.hasChoices, isTrue);
    });

    testWidgets('a monthly let hides guests and check-in times',
        (tester) async {
      final s = SellFormState()
        ..setCategory(id: 9, name: 'Real Estate', slug: 'real-estate')
        ..setSubcategory(45, slug: 'houses-for-rent');
      await tester.pumpWidget(_harness(s));
      await tester.pumpAndSettle();
      expect(find.text('Max guests'), findsNothing);
      expect(find.textContaining('Check-in time'), findsNothing);
      expect(find.text('Bedrooms'), findsOneWidget);
    });

    test('step 2 names the facts still missing', () {
      final s = _stay()
        ..addImage('a.jpg', Uint8List.fromList([1]))
        ..description = 'Sea view';
      s.setChoiceConfiguration(const ProductChoiceConfiguration(
          hasChoices: true,
          attributes: [
            ProductChoiceAttribute(
                definitionId: 1,
                name: 'Property Type',
                inputType: AttributeInputType.select,
                required: false,
                visual: false,
                values: [ProductChoiceValue(id: 'villa', label: 'Villa')]),
          ]));
      expect(
          s.validateStep(2),
          'Choose one value for: Bedrooms, Bathrooms, Number of allowed '
          'Guests, Check-in time, Checkout time');
    });
  });

  group('photo groups', () {
    test('property photos keep a group through cover and order changes', () {
      final s = _stay()
        ..addImage('a.jpg', Uint8List.fromList([1]))
        ..addImage('b.jpg', Uint8List.fromList([2]))
        ..addImage('c.jpg', Uint8List.fromList([3]));
      expect(s.groupsPhotos, isTrue);
      s.setImageGroup(1, ' Bedroom ');
      s.setImageGroup(2, 'Kitchen');
      s.makeCover(2);
      s.moveImage(1, 0);
      expect(s.images.first.groupName, 'Bedroom');
      expect(s.images.last.isCover, isTrue);
      expect(s.images.last.groupName, 'Kitchen');
      expect(s.photoGroups, ['Bedroom', 'Kitchen']);
      s.setImageGroup(0, '');
      expect(s.images.first.groupName, isNull);
    });

    test('only property listings group photos', () {
      final s = SellFormState()
        ..setCategory(id: 3, name: 'Electronics', slug: 'electronics');
      expect(s.groupsPhotos, isFalse);
    });
  });
}
