import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';

/// The colour picker the web gets for free.
///
/// On the web, "add a colour" is an `<input type="color">`
/// (product-choice-definition-editor.tsx:256) and the browser opens its own
/// picker: a saturation/value square, a hue strip and R/G/B fields. Mobile
/// had only a short row of preset swatches, so a seller listing anything in
/// a shade we had not guessed could not describe it. This is that picker,
/// built from the same three parts.
Future<Color?> showColorPickerSheet(
  BuildContext context, {
  // Required rather than defaulted: a default would be a light-mode
  // neutral literal, and the caller always knows what to open on.
  required Color initial,
  String title = 'Pick a colour',
}) {
  return showModalBottomSheet<Color>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppPalette.of(context).surface,
    builder: (sheetContext) =>
        _ColorPickerSheet(initial: initial, title: title),
  );
}

/// Hex without the alpha, the form the backend stores (`colorHex`).
String colorToHex(Color color) {
  String two(double channel) =>
      (channel * 255).round().clamp(0, 255).toRadixString(16).padLeft(2, '0');
  return '#${two(color.r)}${two(color.g)}${two(color.b)}'.toUpperCase();
}

/// Parses `#RRGGBB`, `RRGGBB` or `#RGB`; null when it is not a colour.
Color? hexToColor(String value) {
  var hex = value.trim().replaceFirst('#', '');
  if (hex.length == 3) {
    hex = hex.split('').map((c) => '$c$c').join();
  }
  if (hex.length != 6 || !RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(hex)) return null;
  return Color(int.parse('FF$hex', radix: 16));
}

class _ColorPickerSheet extends StatefulWidget {
  const _ColorPickerSheet({required this.initial, required this.title});

  final Color initial;
  final String title;

  @override
  State<_ColorPickerSheet> createState() => _ColorPickerSheetState();
}

class _ColorPickerSheetState extends State<_ColorPickerSheet> {
  late HSVColor _hsv = HSVColor.fromColor(widget.initial);
  late final TextEditingController _hex =
      TextEditingController(text: colorToHex(widget.initial));
  final _channels = <String, TextEditingController>{
    'R': TextEditingController(),
    'G': TextEditingController(),
    'B': TextEditingController(),
  };

  Color get _color => _hsv.toColor();

  @override
  void initState() {
    super.initState();
    _syncFields();
  }

  @override
  void dispose() {
    _hex.dispose();
    for (final c in _channels.values) {
      c.dispose();
    }
    super.dispose();
  }

  /// Every control shows the same colour, whichever one was just used.
  void _syncFields({bool skipHex = false, String? skipChannel}) {
    final c = _color;
    if (!skipHex) _hex.text = colorToHex(c);
    final values = {
      'R': (c.r * 255).round(),
      'G': (c.g * 255).round(),
      'B': (c.b * 255).round(),
    };
    for (final entry in _channels.entries) {
      if (entry.key == skipChannel) continue;
      entry.value.text = '${values[entry.key]}';
    }
  }

  void _setColor(Color color, {bool skipHex = false, String? skipChannel}) {
    setState(() {
      final next = HSVColor.fromColor(color);
      // A pure black or a fully desaturated colour reports hue 0, which would
      // silently drag the hue slider to red; keep what the seller chose.
      _hsv = next.saturation == 0 || next.value == 0
          ? next.withHue(_hsv.hue)
          : next;
    });
    _syncFields(skipHex: skipHex, skipChannel: skipChannel);
  }

  void _onChannel(String name, String raw) {
    final value = int.tryParse(raw.trim());
    if (value == null || value < 0 || value > 255) return;
    final c = _color;
    final channels = {
      'R': (c.r * 255).round(),
      'G': (c.g * 255).round(),
      'B': (c.b * 255).round(),
    };
    channels[name] = value;
    _setColor(
      Color.fromARGB(255, channels['R']!, channels['G']!, channels['B']!),
      skipChannel: name,
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            16, 0, 16, MediaQuery.of(context).viewInsets.bottom + 16),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(widget.title,
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800)),
            ),
            const SizedBox(height: 14),
            _SaturationValueField(
              hsv: _hsv,
              onChanged: (hsv) {
                setState(() => _hsv = hsv);
                _syncFields();
              },
            ),
            const SizedBox(height: 14),
            Row(children: [
              Container(
                key: const ValueKey('colour-preview'),
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: _color,
                  shape: BoxShape.circle,
                  border: Border.all(color: palette.borderStrong),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _HueSlider(
                  hue: _hsv.hue,
                  onChanged: (hue) {
                    setState(() => _hsv = _hsv.withHue(hue));
                    _syncFields();
                  },
                ),
              ),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              for (final name in const ['R', 'G', 'B']) ...[
                Expanded(
                  child: TextField(
                    key: ValueKey('colour-channel-$name'),
                    controller: _channels[name],
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(3),
                    ],
                    textAlign: TextAlign.center,
                    decoration: InputDecoration(
                        isDense: true,
                        labelText: name,
                        border: const OutlineInputBorder()),
                    onChanged: (v) => _onChannel(name, v),
                  ),
                ),
                if (name != 'B') const SizedBox(width: 8),
              ],
            ]),
            const SizedBox(height: 10),
            TextField(
              key: const ValueKey('colour-hex'),
              controller: _hex,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [LengthLimitingTextInputFormatter(7)],
              decoration: const InputDecoration(
                  isDense: true,
                  labelText: 'Hex',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.tag, size: 18)),
              onChanged: (v) {
                final parsed = hexToColor(v);
                if (parsed != null) _setColor(parsed, skipHex: true);
              },
            ),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  key: const ValueKey('colour-use'),
                  style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brandBlue),
                  onPressed: () => Navigator.pop(context, _color),
                  child: const Text('Use this colour'),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}

/// The square: saturation left-to-right, value top-to-bottom.
class _SaturationValueField extends StatelessWidget {
  const _SaturationValueField({required this.hsv, required this.onChanged});

  final HSVColor hsv;
  final ValueChanged<HSVColor> onChanged;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      final width = constraints.maxWidth;
      const height = 190.0;

      void handle(Offset local) {
        onChanged(hsv
            .withSaturation((local.dx / width).clamp(0.0, 1.0))
            .withValue(1 - (local.dy / height).clamp(0.0, 1.0)));
      }

      return GestureDetector(
        key: const ValueKey('colour-field'),
        behavior: HitTestBehavior.opaque,
        onPanDown: (d) => handle(d.localPosition),
        onPanUpdate: (d) => handle(d.localPosition),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: width,
            height: height,
            child: CustomPaint(painter: _SaturationValuePainter(hsv)),
          ),
        ),
      );
    });
  }
}

class _SaturationValuePainter extends CustomPainter {
  _SaturationValuePainter(this.hsv);

  final HSVColor hsv;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(
        rect,
        Paint()
          ..shader = LinearGradient(colors: [
            Colors.white,
            HSVColor.fromAHSV(1, hsv.hue, 1, 1).toColor(),
          ]).createShader(rect));
    canvas.drawRect(
        rect,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.transparent, Colors.black],
          ).createShader(rect));

    final centre = Offset(
        hsv.saturation * size.width, (1 - hsv.value) * size.height);
    canvas.drawCircle(centre, 10, Paint()..color = hsv.toColor());
    canvas.drawCircle(
        centre,
        10,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..color = Colors.white);
    canvas.drawCircle(
        centre,
        11.5,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1
          ..color = Colors.black26);
  }

  @override
  bool shouldRepaint(_SaturationValuePainter old) => old.hsv != hsv;
}

/// The rainbow strip under the square.
class _HueSlider extends StatelessWidget {
  const _HueSlider({required this.hue, required this.onChanged});

  final double hue;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      final width = constraints.maxWidth;
      void handle(Offset local) =>
          onChanged(((local.dx / width).clamp(0.0, 1.0)) * 360);

      return GestureDetector(
        key: const ValueKey('colour-hue'),
        behavior: HitTestBehavior.opaque,
        onPanDown: (d) => handle(d.localPosition),
        onPanUpdate: (d) => handle(d.localPosition),
        child: SizedBox(
          width: width,
          height: 28,
          child: CustomPaint(painter: _HuePainter(hue)),
        ),
      );
    });
  }
}

class _HuePainter extends CustomPainter {
  _HuePainter(this.hue);

  final double hue;

  static final _stops = [
    for (var i = 0; i <= 6; i++) HSVColor.fromAHSV(1, i * 60.0, 1, 1).toColor()
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final track = Rect.fromLTWH(0, size.height / 2 - 6, size.width, 12);
    final rounded = RRect.fromRectAndRadius(track, const Radius.circular(6));
    canvas.drawRRect(
        rounded,
        Paint()
          ..shader = LinearGradient(colors: _stops).createShader(track));

    final centre = Offset((hue / 360) * size.width, size.height / 2);
    canvas.drawCircle(
        centre, 10, Paint()..color = HSVColor.fromAHSV(1, hue, 1, 1).toColor());
    canvas.drawCircle(
        centre,
        10,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..color = Colors.white);
    canvas.drawCircle(
        centre,
        11.5,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1
          ..color = Colors.black26);
  }

  @override
  bool shouldRepaint(_HuePainter old) => old.hue != hue;
}
