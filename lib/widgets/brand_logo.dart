import 'package:flutter/material.dart';

import '../theme.dart';

/// The GloboExpats wordmark, the mobile copy of the web's auth-screen logo.
///
/// Web parity: the login/register pages render this as styled text, not an
/// image — `Globo` in one colour and `expats` in brand amber
/// (`app/login/page.tsx` CardHeader, and `components/header/logo.tsx`). White
/// "Globo" on the blue gradient, brand blue on the white card. There is no
/// wordmark image in the project (`assets/branding/app_icon.png` is the GE
/// monogram), so text is the faithful reproduction.
class GloboExpatsWordmark extends StatelessWidget {
  const GloboExpatsWordmark({
    super.key,
    this.fontSize = 30,
    this.globoColor = AppColors.brandBlue,
  });

  final double fontSize;
  final Color globoColor;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(children: [
        TextSpan(
            text: 'Globo',
            style: TextStyle(color: globoColor, fontWeight: FontWeight.w800)),
        const TextSpan(
            text: 'expats',
            style:
                TextStyle(color: AppColors.brandAmber, fontWeight: FontWeight.w800)),
      ]),
      style: TextStyle(fontSize: fontSize, letterSpacing: -0.5),
    );
  }
}

/// The web header's cart glyph, drawn to lucide-react's `shopping-cart` path
/// so the app's cart reads as the same icon rather than Material's differently
/// proportioned one: two wheel circles under an angular basket, stroked at 2
/// units on lucide's 24x24 grid with round caps and joins.
class LucideCartIcon extends StatelessWidget {
  const LucideCartIcon({super.key, this.size = 20, this.color = Colors.white});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: CustomPaint(painter: _CartPainter(color)),
      );
}

class _CartPainter extends CustomPainter {
  const _CartPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 24, size.height / 24);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // <circle cx="8" cy="21" r="1"/> and <circle cx="19" cy="21" r="1"/>
    canvas.drawCircle(const Offset(8, 21), 1, paint);
    canvas.drawCircle(const Offset(19, 21), 1, paint);

    // <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0
    //          1.95-1.57l1.65-7.43H5.12"/>
    final basket = Path()
      ..moveTo(2.05, 2.05)
      ..lineTo(4.05, 2.05)
      ..lineTo(6.71, 14.47)
      ..cubicTo(6.9, 15.38, 7.71, 16.04, 8.64, 16.05)
      ..lineTo(18.42, 16.05)
      ..cubicTo(19.35, 16.04, 20.16, 15.39, 20.36, 14.48)
      ..lineTo(22.01, 7.05)
      ..lineTo(5.12, 7.05);
    canvas.drawPath(basket, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _CartPainter oldDelegate) =>
      oldDelegate.color != color;
}

/// The Google "G" mark, drawn rather than shipped as an asset.
///
/// The project has no Google logo file, and the only copies on the machine live
/// in the generated `build/` tree (bundled by the `google_sign_in` plugin), so
/// they cannot be used as app assets. These are the four official brand paths
/// on the standard 48x48 grid, hand-converted from the SVG to [Path] calls —
/// fills #4285F4 / #34A853 / #FBBC05 / #EA4335, as the web renders them
/// (`app/login/page.tsx` inline SVG).
class GoogleGLogo extends StatelessWidget {
  const GoogleGLogo({super.key, this.size = 20});

  final double size;

  @override
  Widget build(BuildContext context) =>
      SizedBox(width: size, height: size, child: CustomPaint(painter: _GPainter()));
}

class _GPainter extends CustomPainter {
  static const _blue = Color(0xFF4285F4);
  static const _green = Color(0xFF34A853);
  static const _yellow = Color(0xFFFBBC05);
  static const _red = Color(0xFFEA4335);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 48, size.height / 48);
    void fill(Path path, Color color) =>
        canvas.drawPath(path, Paint()..color = color);
    fill(_redPath(), _red);
    fill(_bluePath(), _blue);
    fill(_yellowPath(), _yellow);
    fill(_greenPath(), _green);
    canvas.restore();
  }

  Path _redPath() => Path()
    ..moveTo(24, 9.5)
    ..cubicTo(27.54, 9.5, 30.71, 10.72, 33.21, 13.1)
    ..lineTo(40.06, 6.25)
    ..cubicTo(35.9, 2.38, 30.47, 0, 24, 0)
    ..cubicTo(14.62, 0, 6.51, 5.38, 2.56, 13.22)
    ..lineTo(10.54, 19.41)
    ..cubicTo(12.43, 13.72, 17.74, 9.5, 24, 9.5)
    ..close();

  Path _bluePath() => Path()
    ..moveTo(46.98, 24.55)
    ..cubicTo(46.98, 22.98, 46.83, 21.46, 46.6, 20.0)
    ..lineTo(24, 20.0)
    ..lineTo(24, 29.02)
    ..lineTo(36.94, 29.02)
    ..cubicTo(36.36, 31.98, 34.68, 34.5, 32.16, 36.2)
    ..lineTo(39.89, 42.2)
    ..cubicTo(44.4, 38.02, 46.98, 31.84, 46.98, 24.55)
    ..close();

  Path _yellowPath() => Path()
    ..moveTo(10.53, 28.59)
    ..cubicTo(10.05, 27.14, 9.77, 25.6, 9.77, 24.0)
    ..cubicTo(9.77, 22.4, 10.04, 20.86, 10.53, 19.41)
    ..lineTo(2.55, 13.22)
    ..cubicTo(0.92, 16.46, 0, 20.12, 0, 24)
    ..cubicTo(0, 27.88, 0.92, 31.54, 2.56, 34.78)
    ..lineTo(10.53, 28.59)
    ..close();

  Path _greenPath() => Path()
    ..moveTo(24, 48)
    ..cubicTo(30.48, 48, 35.93, 45.87, 39.89, 42.19)
    ..lineTo(32.16, 36.19)
    ..cubicTo(30.01, 37.64, 27.24, 38.49, 24.0, 38.49)
    ..cubicTo(17.74, 38.49, 12.43, 34.27, 10.53, 28.58)
    ..lineTo(2.55, 34.77)
    ..cubicTo(6.51, 42.62, 14.62, 48, 24, 48)
    ..close();

  @override
  bool shouldRepaint(covariant _GPainter oldDelegate) => false;
}
