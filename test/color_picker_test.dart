import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';
import 'package:globoexpats_mobile/screens/sell/product_choice_editor.dart';
import 'package:globoexpats_mobile/widgets/color_picker_sheet.dart';

/// "in buying in adding a new colot should use smth like that" — the browser
/// picker the web gets from `<input type="color">`: a saturation square, a
/// hue strip and R/G/B fields. Mobile only had a row of preset swatches.
void main() {
  group('hex', () {
    test('round-trips the form the backend stores', () {
      expect(colorToHex(const Color(0xFF1E40AF)), '#1E40AF');
      expect(hexToColor('#1E40AF'), const Color(0xFF1E40AF));
      expect(hexToColor('1e40af'), const Color(0xFF1E40AF));
      expect(hexToColor('#abc'), const Color(0xFFAABBCC));
    });

    test('rejects anything that is not a colour', () {
      expect(hexToColor(''), isNull);
      expect(hexToColor('#12345'), isNull);
      expect(hexToColor('#gggggg'), isNull);
    });
  });

  group('the picker', () {
    Future<Color?> open(WidgetTester tester, {Color initial = Colors.red}) async {
      Color? result;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                result = await showColorPickerSheet(context, initial: initial);
              },
              child: const Text('open'),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      return result;
    }

    Color previewColour(WidgetTester tester) {
      final box = tester.widget<Container>(
          find.byKey(const ValueKey('colour-preview')));
      return (box.decoration! as BoxDecoration).color!;
    }

    testWidgets('opens on the colour it was given', (tester) async {
      await open(tester, initial: const Color(0xFF3B82F6));
      expect(find.byKey(const ValueKey('colour-field')), findsOneWidget);
      expect(find.byKey(const ValueKey('colour-hue')), findsOneWidget);
      final hex = tester.widget<TextField>(
          find.byKey(const ValueKey('colour-hex')));
      expect(hex.controller!.text, '#3B82F6');
    });

    testWidgets('reaches a shade no preset offers', (tester) async {
      await open(tester);
      final before = previewColour(tester);

      // Drag across the hue strip: red to something else entirely.
      final hue = find.byKey(const ValueKey('colour-hue'));
      await tester.tapAt(tester.getCenter(hue));
      await tester.pumpAndSettle();

      expect(previewColour(tester), isNot(before));
      final hex = tester.widget<TextField>(
          find.byKey(const ValueKey('colour-hex')));
      expect(hexToColor(hex.controller!.text), previewColour(tester),
          reason: 'the hex field must describe what the swatch shows');
    });

    testWidgets('typing a channel moves everything else with it',
        (tester) async {
      await open(tester, initial: const Color(0xFF000000));

      await tester.enterText(
          find.byKey(const ValueKey('colour-channel-G')), '200');
      await tester.pumpAndSettle();

      expect((previewColour(tester).g * 255).round(), 200);
      final hex = tester.widget<TextField>(
          find.byKey(const ValueKey('colour-hex')));
      expect(hex.controller!.text, '#00C800');
    });

    testWidgets('typing a hex moves everything else with it', (tester) async {
      await open(tester, initial: const Color(0xFF000000));

      await tester.enterText(
          find.byKey(const ValueKey('colour-hex')), '#14B8A6');
      await tester.pumpAndSettle();

      expect(previewColour(tester), const Color(0xFF14B8A6));
      final red = tester.widget<TextField>(
          find.byKey(const ValueKey('colour-channel-R')));
      expect(red.controller!.text, '20');
    });

    testWidgets('hands the colour back only when confirmed', (tester) async {
      Color? picked;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                picked = await showColorPickerSheet(context,
                    initial: const Color(0xFF14B8A6));
              },
              child: const Text('open'),
            ),
          ),
        ),
      ));

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(picked, isNull);

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('colour-use')));
      await tester.pumpAndSettle();
      expect(picked, const Color(0xFF14B8A6));
    });
  });

  group('the sell wizard colour attribute', () {
    testWidgets('offers the picker beside the presets', (tester) async {
      final api = ApiClient(client: MockClient((req) async {
        if (req.url.path.endsWith('/subcategories/10')) {
          return http.Response(
              jsonEncode([
                {
                  'attributeDefinitionId': 1,
                  'name': 'Color',
                  'slug': 'color',
                  'inputType': 'COLOR',
                  'required': false,
                  'allowCustomValues': true,
                  'visual': true,
                  'allowDifferentPrices': false,
                  'status': 'ACTIVE',
                  'predefinedValues': [
                    {'value': 'red', 'label': 'Red', 'colorHex': '#EF4444'},
                  ],
                  'subcategoryIds': [10],
                }
              ]),
              200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 200,
            headers: {'content-type': 'application/json'});
      }));

      final state = SellFormState()..subcategoryId = 10;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ProductChoiceEditor(
                state: state, onChanged: () {}, api: api),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      final button = find.byKey(const ValueKey('choice-custom-colour'));
      expect(button, findsOneWidget,
          reason: 'the presets are a shortcut, not the whole range');

      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('colour-field')), findsOneWidget);
    });
  });
}
