import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:qr/qr.dart';

import '../../theme.dart';

/// The Share Kit pictures — a port of the web's
/// `components/share-kit/share-cards.tsx` and `share-cards.module.css`.
///
/// Every measurement below is the web's, in the same units: `u` is 1% of the
/// card's width (CSS `cqw`) and vertical positions are percentages of its
/// height, so the preview in the sheet and the 1080px export are the same
/// picture at two sizes.
///
/// Two deliberate departures from the web: the pictures never carry the
/// seller's photo or initials (they broke the posters' composition), and the
/// Shop showcase is a full-bleed catalogue collage instead of a 2×2 grid of
/// letterboxed photos.
enum ShareDesign { story, square, sheet, poster, shop, qr }

enum ShareTemplate { studio, flat, white, minimal }

enum ShareFrameStyle { corners, outline, orange, blue }

/// How the Shop showcase lays out the catalogue.
enum ShareShopLayout { collage, grid, spotlight }

const Map<ShareShopLayout, String> shareShopLayouts = {
  ShareShopLayout.collage: 'Collage',
  ShareShopLayout.grid: 'Grid',
  ShareShopLayout.spotlight: 'Spotlight',
};

class ShareDesignSpec {
  const ShareDesignSpec(this.name, this.short, this.width, this.height);
  final String name;
  final String short;
  final int width;
  final int height;
  double get aspectRatio => width / height;
}

/// Web `SHARE_DESIGNS`: the feed artwork is 4:5, stories 9:16.
const Map<ShareDesign, ShareDesignSpec> shareDesigns = {
  ShareDesign.story: ShareDesignSpec('Story poster', 'Story', 1080, 1920),
  ShareDesign.square: ShareDesignSpec('Portrait post', 'Portrait', 1080, 1350),
  ShareDesign.sheet: ShareDesignSpec('Photo poster', 'Photo', 1080, 1350),
  ShareDesign.poster: ShareDesignSpec('QR poster', 'QR poster', 1080, 1350),
  ShareDesign.shop: ShareDesignSpec('Shop showcase', 'Shop', 1080, 1920),
  ShareDesign.qr: ShareDesignSpec('QR code only', 'QR only', 1080, 1080),
};

/// Web `SHARE_TEMPLATES`.
const Map<ShareTemplate, (String, Color)> shareTemplates = {
  ShareTemplate.studio: ('Studio', ShareArt.blue),
  ShareTemplate.flat: ('Flat blue', ShareArt.blue),
  ShareTemplate.white: ('White', ShareArt.white),
  ShareTemplate.minimal: ('Minimal', ShareArt.minimal),
};

/// Web `SHARE_FRAMES`, in the web's picker order.
const Map<ShareFrameStyle, (String, Color)> shareFrames = {
  ShareFrameStyle.corners: ('Corners', ShareArt.orange),
  ShareFrameStyle.outline: ('Double line', ShareArt.frameBlue),
  ShareFrameStyle.orange: ('Orange', ShareArt.orange),
  ShareFrameStyle.blue: ('Blue', ShareArt.deepBlue),
};

/// The studio backdrops (web `public/images/share/*.png`, as WebP).
class ShareBackdrops {
  ShareBackdrops._();
  static const String portrait = 'assets/images/share/studio-portrait-v1.webp';
  static const String story = 'assets/images/share/studio-story-v1.webp';
  static const String editorial =
      'assets/images/share/editorial-portrait-v1.webp';
  static const List<String> all = [portrait, story, editorial];
}

class ShareCardSeller {
  const ShareCardSeller({
    required this.name,
    this.verified = false,
    this.city,
    this.statsText,
  });
  final String name;
  final bool verified;
  final String? city;
  final String? statsText;
}

class ShareCardItem {
  const ShareCardItem({required this.imageUrl, required this.price});
  final String imageUrl;
  final String price;
}

enum ShareCardKind { product, shop }

/// The Halal mark painted on a Halal listing's photo — the same artwork as
/// the app's product cards ([HalalBadge]).
const String kShareHalalAsset = 'assets/images/brand/halal-logo.webp';

class ShareCardData {
  const ShareCardData({
    required this.kind,
    required this.title,
    required this.seller,
    required this.displayUrl,
    required this.qrUrl,
    this.price,
    this.description,
    this.category,
    this.condition,
    this.area,
    this.imageUrl,
    this.specs = const [],
    this.items = const [],
    this.itemCount,
    this.reference,
    this.halal = false,
  });
  final ShareCardKind kind;

  /// A Halal listing: its photo carries the Halal mark, as in the app.
  final bool halal;
  final String title;
  final String? price;
  final String? description;
  final String? category;
  final String? condition;
  final String? area;
  final String? imageUrl;
  final List<(String, String)> specs;
  final List<ShareCardItem> items;

  /// The whole catalogue's size, when [items] shows only part of it.
  final int? itemCount;
  final ShareCardSeller seller;
  final String displayUrl;
  final String qrUrl;
  final String? reference;
}

bool _has(String? v) => v != null && v.trim().isNotEmpty;

/// One Share Kit picture. [images] holds the decoded photos (listing,
/// seller, backdrops) keyed by URL/asset path: painting from decoded images
/// is synchronous, so what the preview shows is exactly what gets exported.
class ShareCard extends StatelessWidget {
  const ShareCard({
    super.key,
    required this.design,
    required this.data,
    this.template = ShareTemplate.studio,
    this.imageSize = 100,
    this.imageFrame = false,
    this.frameStyle = ShareFrameStyle.blue,
    this.shopLayout = ShareShopLayout.collage,
    this.images = const {},
  });

  final ShareDesign design;
  final ShareCardData data;
  final ShareTemplate template;
  final int imageSize;
  final bool imageFrame;
  final ShareFrameStyle frameStyle;
  final ShareShopLayout shopLayout;
  final Map<String, ui.Image> images;

  @override
  Widget build(BuildContext context) {
    final spec = shareDesigns[design]!;
    return AspectRatio(
      aspectRatio: spec.aspectRatio,
      child: LayoutBuilder(builder: (context, box) {
        final a = _Art(
          width: box.maxWidth,
          height: box.maxHeight,
          template: design == ShareDesign.qr ? ShareTemplate.studio : template,
          scale: imageSize.clamp(70, 130) / 100,
          framed: imageFrame,
          frameStyle: frameStyle,
          shopLayout: shopLayout,
          images: images,
        );
        final Widget card = switch (design) {
          ShareDesign.story => _productPoster(a, data, story: true),
          ShareDesign.square => _productPoster(a, data, story: false),
          ShareDesign.sheet => _photoPoster(a, data),
          ShareDesign.poster => _qrPoster(a, data),
          ShareDesign.shop => _shopCard(a, data),
          ShareDesign.qr => _qrOnly(a, data),
        };
        return ClipRect(
          child: DefaultTextStyle(
            style: TextStyle(
              fontFamily: 'Inter',
              color: a.ink,
              fontSize: 3 * a.u,
              height: 1.25,
              letterSpacing: 0,
              decoration: TextDecoration.none,
            ),
            child: ColoredBox(
                color: design == ShareDesign.qr ? ShareArt.white : a.background,
                child: SizedBox.expand(child: card)),
          ),
        );
      }),
    );
  }
}

class _Art {
  _Art({
    required this.width,
    required this.height,
    required this.template,
    required this.scale,
    required this.framed,
    required this.frameStyle,
    required this.shopLayout,
    required this.images,
  });
  final double width;
  final double height;
  final ShareTemplate template;
  final double scale;
  final bool framed;
  final ShareFrameStyle frameStyle;
  final ShareShopLayout shopLayout;
  final Map<String, ui.Image> images;

  double get u => width / 100;
  double top(double percent) => height * percent / 100;
  bool get studio => template == ShareTemplate.studio;
  bool get minimal => template == ShareTemplate.minimal;

  Color get background => switch (template) {
        ShareTemplate.white => ShareArt.white,
        ShareTemplate.minimal => ShareArt.minimal,
        _ => ShareArt.blue,
      };
  Color get ink =>
      template == ShareTemplate.white ? ShareArt.navy : ShareArt.white;
  Color get muted => switch (template) {
        ShareTemplate.white => ShareArt.whiteMuted,
        ShareTemplate.minimal => ShareArt.minimalMuted,
        _ => ShareArt.muted,
      };
  Color get photoBackground => switch (template) {
        ShareTemplate.white => ShareArt.whitePhoto,
        ShareTemplate.minimal => ShareArt.minimalPhoto,
        _ => ShareArt.photo,
      };
  Color get priceColor => switch (template) {
        ShareTemplate.flat => ShareArt.flatPrice,
        ShareTemplate.white => ShareArt.blue,
        _ => ink,
      };

  ui.Image? image(String? key) =>
      key == null || key.isEmpty ? null : images[key];
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

Widget _text(String value, double size,
    {FontWeight weight = FontWeight.w400,
    Color? color,
    double height = 1.25,
    int? maxLines,
    TextAlign? align}) {
  return Text(value,
      maxLines: maxLines,
      softWrap: maxLines != 1,
      overflow: maxLines == null ? TextOverflow.clip : TextOverflow.ellipsis,
      textAlign: align,
      style: TextStyle(
          fontSize: size, fontWeight: weight, color: color, height: height));
}

List<Widget> _backdrop(_Art a, String asset) {
  final image = a.studio ? a.image(asset) : null;
  return [
    if (image != null)
      Positioned.fill(
          child: RawImage(
              image: image,
              fit: BoxFit.cover,
              filterQuality: FilterQuality.high)),
    // The flat and white templates carry an orange tab along the top edge.
    if (a.template == ShareTemplate.flat || a.template == ShareTemplate.white)
      Positioned(
          top: 0,
          left: 7 * a.u,
          width: 20 * a.u,
          height: 1.2 * a.u,
          child: const ColoredBox(color: ShareArt.orange)),
  ];
}

/// The rounded wordmark: "Globo" in the card ink, "expats" in orange.
class ShareBrandLockup extends StatelessWidget {
  const ShareBrandLockup({super.key, required this.fontSize, this.inverse = true});
  final double fontSize;
  final bool inverse;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Globoexpats',
      child: ExcludeSemantics(
        child: Text.rich(
          TextSpan(children: [
            TextSpan(
                text: 'Globo',
                style:
                    TextStyle(color: inverse ? ShareArt.white : ShareArt.blue)),
            const TextSpan(
                text: 'expats', style: TextStyle(color: ShareArt.orange)),
          ]),
          maxLines: 1,
          softWrap: false,
          style: TextStyle(
              fontFamily: 'Lexend',
              fontSize: fontSize,
              height: 1,
              fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

Widget _brand(_Art a, double size) => ShareBrandLockup(
    fontSize: size * a.u, inverse: a.template != ShareTemplate.white);

Widget _price(_Art a, String price, {required double size}) => _text(
      price,
      (a.minimal ? (size >= 7 ? 6.5 : 5.5) : size) * a.u,
      weight: a.minimal ? FontWeight.w600 : FontWeight.w700,
      color: a.priceColor,
      height: 1.05,
      maxLines: 1,
    );

/// The link line and QR at the foot of the studio posters.
Widget _studioLink(_Art a, ShareCardData data,
    {required String? callToAction, required double qrWidth}) {
  final u = a.u;
  return Row(
    crossAxisAlignment: CrossAxisAlignment.end,
    children: [
      Expanded(
        child: Padding(
          padding: EdgeInsets.only(bottom: 1.4 * u),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (callToAction != null) ...[
                _text(callToAction, 3 * u, weight: FontWeight.w600),
                SizedBox(height: 1 * u),
              ],
              _text(data.displayUrl, 2.7 * u),
            ],
          ),
        ),
      ),
      SizedBox(width: 3 * u),
      SizedBox(width: qrWidth * u, child: ShareQr(value: data.qrUrl, unit: u)),
    ],
  );
}

// ---------------------------------------------------------------------------
// Photos and frames
// ---------------------------------------------------------------------------

/// Web `Photo`: the picture contained in its box; with "Image frame" on, a
/// mount sized to the photo's own proportions inside 96% of the box.
Widget _photo(_Art a, String? url,
    {bool scaleInside = false, Color? background, bool halal = false}) {
  final photo = _plainPhoto(a, url, scaleInside: scaleInside, background: background);
  final mark = halal ? a.image(kShareHalalAsset) : null;
  final img = a.image(url);
  if (mark == null || img == null) return photo;
  // Top-left of the PICTURE (not of its box, which is wider or taller than
  // a contained photo), like the product card and the product page.
  final size = 13 * a.u;
  return LayoutBuilder(builder: (context, box) {
    final boxSize = Size(box.maxWidth, box.maxHeight);
    var drawn = applyBoxFit(BoxFit.contain,
            Size(img.width.toDouble(), img.height.toDouble()), boxSize)
        .destination;
    if (scaleInside) drawn = drawn * a.scale;
    if (a.framed) drawn = drawn * 0.96;
    final w = math.min(drawn.width, boxSize.width);
    final h = math.min(drawn.height, boxSize.height);
    final left = (boxSize.width - w) / 2 + 2.5 * a.u;
    final top = (boxSize.height - h) / 2 + 2.5 * a.u;
    return Stack(children: [
    Positioned.fill(child: photo),
    Positioned(
      key: const ValueKey('share-halal-mark'),
      left: left,
      top: top,
      width: size,
      height: size,
      child: Container(
        padding: EdgeInsets.all(0.4 * a.u),
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: ShareArt.white,
          boxShadow: [
            BoxShadow(color: Color(0x33000000), blurRadius: 4, offset: Offset(0, 1)),
          ],
        ),
        child: RawImage(
            image: mark, fit: BoxFit.contain, filterQuality: FilterQuality.high),
      ),
    ),
  ]);
  });
}

Widget _plainPhoto(_Art a, String? url,
    {bool scaleInside = false, Color? background}) {
  final img = a.image(url);
  return ClipRect(
    child: ColoredBox(
      color: background ?? const Color(0x00000000),
      child: img == null
          ? const SizedBox.expand()
          : LayoutBuilder(builder: (context, box) {
              final pw = box.maxWidth;
              final ph = box.maxHeight;
              Widget picture = SizedBox.expand(
                  child: RawImage(
                      image: img,
                      fit: BoxFit.contain,
                      filterQuality: FilterQuality.high));
              if (scaleInside) {
                picture = Transform.scale(scale: a.scale, child: picture);
              }
              picture = ClipRect(child: picture);
              if (!a.framed) return picture;
              final aspect = img.width / img.height;
              final mw = math.min(0.96 * pw, 0.96 * ph * aspect);
              final mh = math.min(0.96 * ph, 0.96 * pw / aspect);
              return Center(
                child: SizedBox(
                    width: mw,
                    height: mh,
                    child: _frame(a, pw / 100, picture)),
              );
            }),
    ),
  );
}

Widget _frame(_Art a, double pu, Widget picture) {
  switch (a.frameStyle) {
    case ShareFrameStyle.blue:
    case ShareFrameStyle.orange:
      final orange = a.frameStyle == ShareFrameStyle.orange;
      final border = 0.6 * pu;
      final pictureBorder = 0.15 * pu;
      return Stack(clipBehavior: Clip.none, children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: orange ? ShareArt.orange : ShareArt.deepBlue,
              border: Border.all(
                  color: orange ? ShareArt.orangeLight : ShareArt.frameBlue,
                  width: border),
              borderRadius: BorderRadius.circular(2 * pu),
              boxShadow: a.studio
                  ? [
                      BoxShadow(
                          color: ShareArt.shadow,
                          offset: Offset(0, 1 * pu),
                          blurRadius: 2.8 * pu)
                    ]
                  : null,
            ),
          ),
        ),
        if (a.studio)
          Positioned.fill(
            child: Padding(
              padding: EdgeInsets.all(border),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.all(
                      color:
                          orange ? ShareArt.orangeSoft : ShareArt.frameBlueLight,
                      width: 0.22 * pu),
                  borderRadius: BorderRadius.circular(2 * pu - border),
                ),
              ),
            ),
          ),
        Positioned.fill(
          child: Padding(
            padding: EdgeInsets.all(border + 2.4 * pu),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: orange ? ShareArt.orange : ShareArt.deepBlue,
                border: Border.all(
                    color:
                        orange ? ShareArt.orangeDeep : ShareArt.frameBlueLight,
                    width: pictureBorder),
                borderRadius: BorderRadius.circular(0.6 * pu),
              ),
              child: Padding(
                padding: EdgeInsets.all(pictureBorder),
                child: ClipRRect(
                    borderRadius: BorderRadius.circular(0.45 * pu),
                    child: picture),
              ),
            ),
          ),
        ),
        Positioned(
          bottom: -border,
          right: 2 * pu,
          width: (orange ? 25 : 12) * pu,
          height: border,
          child: ColoredBox(
              color: orange ? ShareArt.deepBlue : ShareArt.orange),
        ),
      ]);
    case ShareFrameStyle.outline:
      final border = 0.45 * pu;
      final inner = 0.35 * pu;
      return DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: ShareArt.frameBlue, width: border),
          borderRadius: BorderRadius.circular(0.8 * pu),
        ),
        child: Padding(
          padding: EdgeInsets.all(border + 0.9 * pu),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: a.background,
              border: Border.all(color: ShareArt.orange, width: inner),
            ),
            child: Padding(padding: EdgeInsets.all(inner), child: picture),
          ),
        ),
      );
    case ShareFrameStyle.corners:
      final side = BorderSide(color: ShareArt.orange, width: 0.9 * pu);
      return Stack(children: [
        Positioned.fill(
          child: Padding(
            padding: EdgeInsets.all(1.4 * pu),
            child: ColoredBox(color: a.background, child: picture),
          ),
        ),
        Positioned(
          top: 0,
          left: 0,
          width: 12 * pu,
          height: 12 * pu,
          child: DecoratedBox(
              decoration: BoxDecoration(border: Border(top: side, left: side))),
        ),
        Positioned(
          bottom: 0,
          right: 0,
          width: 12 * pu,
          height: 12 * pu,
          child: DecoratedBox(
              decoration:
                  BoxDecoration(border: Border(bottom: side, right: side))),
        ),
      ]);
  }
}

// ---------------------------------------------------------------------------
// The designs
// ---------------------------------------------------------------------------

/// Story (9:16) and Portrait (4:5) product posters on the studio backdrop.
Widget _productPoster(_Art a, ShareCardData data, {required bool story}) {
  final u = a.u;
  final facts =
      [data.condition, data.area].where(_has).map((v) => v!.trim()).join(' / ');
  final side = math.max(3 * u, 50 * u - 43 * u * a.scale);
  final photoShare = a.studio
      ? (story ? math.min(0.36, 0.27 * a.scale) : math.min(0.44, 0.36 * a.scale))
      : (story ? math.min(0.36, 0.32 * a.scale) : math.min(0.44, 0.40 * a.scale));
  final headerWidth = a.width - 14 * u;
  final ruled = !a.studio;
  return Stack(children: [
    ..._backdrop(a, story ? ShareBackdrops.story : ShareBackdrops.portrait),
    Positioned(
      top: a.top(story ? 10 : 5),
      left: 7 * u,
      right: 7 * u,
      child: Row(children: [
        _brand(a, 3.4),
        SizedBox(width: 3 * u),
        const Spacer(),
        ConstrainedBox(
          constraints: BoxConstraints(maxWidth: headerWidth * 0.4),
          child:
              _text(data.seller.name, 2.8 * u, color: a.muted, maxLines: 1),
        ),
      ]),
    ),
    Positioned(
      top: a.top(story ? 17 : 12),
      left: 7 * u,
      right: 9 * u,
      child: _text(
        data.title,
        (a.minimal ? 7 : (story ? 8.4 : 7.8)) * u,
        weight: a.minimal ? FontWeight.w600 : FontWeight.w700,
        height: a.minimal ? 1.1 : 1.05,
        maxLines: 2,
      ),
    ),
    Positioned(
      top: a.top(story ? 31 : 28),
      left: side,
      right: side,
      height: a.height * photoShare,
      child: _photo(a, data.imageUrl, halal: data.halal),
    ),
    Positioned(
      top: a.top(story ? 70 : 73),
      left: 7 * u,
      right: (story ? 7 : 28) * u,
      child: Container(
        padding: ruled ? EdgeInsets.only(top: 1.5 * u) : EdgeInsets.zero,
        decoration: ruled
            ? BoxDecoration(
                border: Border(
                    top: BorderSide(
                        color: a.template == ShareTemplate.white
                            ? ShareArt.whiteRule
                            : ShareArt.rule,
                        width: 0.15 * u)))
            : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: _spaced(story ? 2 * u : 1.5 * u, [
            if (facts.isNotEmpty)
              _text(facts, 2.6 * u, color: a.muted, maxLines: 1),
            if (_has(data.price))
              _price(a, data.price!, size: story ? 7.4 : 6),
            if (_has(data.description))
              ConstrainedBox(
                constraints: BoxConstraints(
                    maxWidth: story ? 72 * u : double.infinity),
                child: _text(data.description!, (story ? 3.1 : 2.7) * u,
                    color: a.muted, height: 1.4, maxLines: 2),
              ),
          ]),
        ),
      ),
    ),
    Positioned(
      bottom: a.top(story ? 7 : 5),
      left: 7 * u,
      right: 7 * u,
      child: _studioLink(a, data,
          callToAction: story ? 'See the full listing' : null,
          qrWidth: story ? 17 : 18),
    ),
  ]);
}

/// Photo poster: the listing photo across the top, details below.
Widget _photoPoster(_Art a, ShareCardData data) {
  final u = a.u;
  final facts = [
    data.seller.name,
    data.condition,
    data.area,
  ].where(_has).map((v) => v!.trim()).join(' / ');
  return Stack(children: [
    ..._backdrop(a, ShareBackdrops.editorial),
    Positioned(
      top: 0,
      left: 0,
      right: 0,
      height: a.height * 0.58,
      child: _photo(a, data.imageUrl,
          scaleInside: true, background: a.photoBackground, halal: data.halal),
    ),
    Positioned(
      top: a.top(62),
      left: 6 * u,
      right: 6 * u,
      child: Stack(children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: _spaced(1.5 * u, [
            _brand(a, 2.7),
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: 70 * u),
              child: _text(data.title, 6 * u,
                  weight: FontWeight.w700, height: 1.05, maxLines: 2),
            ),
            if (_has(data.price)) _price(a, data.price!, size: 5.5),
            if (_has(data.description))
              ConstrainedBox(
                constraints: BoxConstraints(maxWidth: 66 * u),
                child: _text(data.description!, 2.7 * u,
                    color: a.muted, height: 1.4, maxLines: 2),
              ),
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: 66 * u),
              child: _text(facts, 2.4 * u, color: a.muted, maxLines: 1),
            ),
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: 66 * u),
              child: _text(data.displayUrl, 2.5 * u),
            ),
          ]),
        ),
        Positioned(
          right: 0,
          bottom: 0,
          width: 17 * u,
          child: ShareQr(value: data.qrUrl, unit: u),
        ),
      ]),
    ),
  ]);
}

/// The QR poster: a big code for print, the listing or shop underneath.
Widget _qrPoster(_Art a, ShareCardData data) {
  final u = a.u;
  final shop = data.kind == ShareCardKind.shop;
  final line = shop ? data.seller.city : data.title;
  return Stack(children: [
    ..._backdrop(a, ShareBackdrops.editorial),
    Positioned(
      top: a.top(6),
      left: 7 * u,
      right: 7 * u,
      child: Row(children: [
        _brand(a, 3.4),
        const Spacer(),
        _text(shop ? 'SELLER SHOP' : 'PRODUCT LISTING', 2.3 * u, maxLines: 1),
      ]),
    ),
    Positioned(
      top: a.top(15),
      left: 7 * u,
      right: 7 * u,
      child: _text(shop ? 'Your next find is here.' : 'Scan. Find. Connect.',
          7 * u,
          weight: FontWeight.w700, height: 1.05, maxLines: 2),
    ),
    Positioned(
      top: a.top(27),
      left: 23 * u,
      width: 54 * u,
      child: ShareQr(value: data.qrUrl, unit: u),
    ),
    Positioned(
      top: a.top(78),
      left: 7 * u,
      right: 7 * u,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: _spaced(1.3 * u, [
          _text(data.seller.name, 4.4 * u,
              weight: FontWeight.w700, maxLines: 2, align: TextAlign.center),
          _text(line ?? '', 3 * u, maxLines: 2, align: TextAlign.center),
          if (_has(data.price))
            _text(data.price!, 3.6 * u,
                weight: FontWeight.w700, maxLines: 1, align: TextAlign.center),
          _text(data.displayUrl, 2.7 * u, align: TextAlign.center),
        ]),
      ),
    ),
  ]);
}

/// Shop showcase (9:16): the shop's name and facts, then the catalogue in
/// the chosen layout — every photo cropped to fill its tile, prices on each,
/// and "+N more" when the catalogue is bigger than the picture.
Widget _shopCard(_Art a, ShareCardData data) {
  final u = a.u;
  final all = data.items.take(6).toList();
  final total = math.max(data.itemCount ?? all.length, all.length);
  final items = a.shopLayout == ShareShopLayout.spotlight
      ? all.take(4).toList()
      : all;
  final more = total - items.length;
  final facts = [
    data.seller.city,
    data.seller.statsText,
    if (total > 0) '$total ${total == 1 ? 'listing' : 'listings'}',
  ].where(_has).map((v) => v!.trim()).join('  ·  ');
  return Stack(children: [
    ..._backdrop(a, ShareBackdrops.story),
    Positioned(
      top: a.top(5),
      left: 7 * u,
      right: 7 * u,
      child: Row(children: [
        _brand(a, 3.4),
        const Spacer(),
        _text('SELLER SHOP', 2.3 * u, maxLines: 1),
      ]),
    ),
    Positioned(
      top: a.top(10.5),
      left: 7 * u,
      right: 7 * u,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _text(data.seller.name, 8.4 * u,
              weight: a.minimal ? FontWeight.w600 : FontWeight.w700,
              height: 1.05,
              maxLines: 2),
          if (facts.isNotEmpty) ...[
            SizedBox(height: 2 * u),
            _text(facts, 3 * u, color: a.muted, maxLines: 1),
          ],
        ],
      ),
    ),
    if (items.isNotEmpty)
      Positioned(
        top: a.top(26),
        left: 7 * u,
        right: 7 * u,
        height: a.height * 0.5,
        child: switch (a.shopLayout) {
          ShareShopLayout.collage => _collage(a, items, more),
          ShareShopLayout.grid => _grid(a, items, more),
          ShareShopLayout.spotlight => _spotlight(a, items, more),
        },
      ),
    Positioned(
      bottom: a.top(5),
      left: 7 * u,
      right: 7 * u,
      child: _studioLink(a, data,
          callToAction: 'Come browse the shop', qrWidth: 18),
    ),
  ]);
}

/// Up to six tiles arranged to fill the frame whatever the count.
Widget _collage(_Art a, List<ShareCardItem> items, int more) {
  final gap = 2 * a.u;
  Widget tile(int i, {int flex = 1}) => Expanded(
        flex: flex,
        child: _tile(a, items[i],
            more: i == items.length - 1 && more > 0 ? more : 0),
      );
  Widget row(List<Widget> tiles) => Expanded(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < tiles.length; i++) ...[
              if (i > 0) SizedBox(width: gap),
              tiles[i],
            ],
          ],
        ),
      );
  Widget column(List<Widget> rows) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) SizedBox(height: gap),
            rows[i],
          ],
        ],
      );
  switch (items.length) {
    case 1:
      return column([row([tile(0)])]);
    case 2:
      return column([row([tile(0), tile(1)])]);
    case 3:
      return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        tile(0, flex: 3),
        SizedBox(width: gap),
        Expanded(
          flex: 2,
          child: column([row([tile(1)]), row([tile(2)])]),
        ),
      ]);
    case 4:
      return column([row([tile(0), tile(1)]), row([tile(2), tile(3)])]);
    case 5:
      return column([
        row([tile(0), tile(1)]),
        row([tile(2), tile(3), tile(4)]),
      ]);
    default:
      return column([
        row([tile(0), tile(1)]),
        row([tile(2), tile(3)]),
        row([tile(4), tile(5)]),
      ]);
  }
}

/// Grid: equal tiles, two to a row, each price printed underneath.
Widget _grid(_Art a, List<ShareCardItem> items, int more) {
  final u = a.u;
  final gap = 2.4 * u;
  final cols = items.length == 1 ? 1 : 2;
  final rows = (items.length / cols).ceil();
  Widget cell(int i) {
    final last = i == items.length - 1 && more > 0;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
              child: _tile(a, items[i], more: last ? more : 0, tag: false)),
          SizedBox(height: 1.2 * u),
          _text(last ? ' ' : items[i].price, 3 * u,
              weight: FontWeight.w700, color: a.priceColor, maxLines: 1),
        ],
      ),
    );
  }

  return Column(children: [
    for (var r = 0; r < rows; r++) ...[
      if (r > 0) SizedBox(height: gap),
      Expanded(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // An odd last item spans the row rather than leaving a hole.
          for (var c = 0; c < cols && r * cols + c < items.length; c++) ...[
            if (c > 0) SizedBox(width: gap),
            cell(r * cols + c),
          ],
        ]),
      ),
    ],
  ]);
}

/// Spotlight: the newest listing large, up to three more in a strip below.
Widget _spotlight(_Art a, List<ShareCardItem> items, int more) {
  final gap = 2 * a.u;
  if (items.length == 1) return _tile(a, items.first, more: more);
  final thumbs = items.sublist(1);
  return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    Expanded(flex: 3, child: _tile(a, items.first)),
    SizedBox(height: gap),
    Expanded(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (var i = 0; i < thumbs.length; i++) ...[
          if (i > 0) SizedBox(width: gap),
          Expanded(
            child: _tile(a, thumbs[i],
                more: i == thumbs.length - 1 && more > 0 ? more : 0),
          ),
        ],
      ]),
    ),
  ]);
}

Widget _tile(_Art a, ShareCardItem item, {int more = 0, bool tag = true}) {
  final u = a.u;
  final img = a.image(item.imageUrl);
  return ClipRRect(
    borderRadius: BorderRadius.circular(2 * u),
    child: Stack(fit: StackFit.expand, children: [
      ColoredBox(color: a.photoBackground),
      if (img != null)
        RawImage(
            image: img, fit: BoxFit.cover, filterQuality: FilterQuality.high),
      if (more > 0)
        ColoredBox(
          color: ShareArt.collageShade,
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              _text('+$more', 7 * u,
                  weight: FontWeight.w700,
                  color: ShareArt.white,
                  height: 1,
                  maxLines: 1),
              SizedBox(height: 1 * u),
              _text('more in the shop', 2.6 * u,
                  color: ShareArt.white, maxLines: 1),
            ]),
          ),
        )
      else if (tag && item.price.isNotEmpty)
        Positioned(
          left: 1.6 * u,
          bottom: 1.6 * u,
          child: Container(
            padding: EdgeInsets.symmetric(horizontal: 1.8 * u, vertical: 0.9 * u),
            decoration: BoxDecoration(
              color: ShareArt.priceTag,
              borderRadius: BorderRadius.circular(1.2 * u),
            ),
            child: _text(item.price, 2.6 * u,
                weight: FontWeight.w700,
                color: ShareArt.white,
                height: 1.1,
                maxLines: 1),
          ),
        ),
    ]),
  );
}

Widget _qrOnly(_Art a, ShareCardData data) => Padding(
      padding: EdgeInsets.all(4 * a.u),
      child: ShareQr(value: data.qrUrl, unit: a.u, padded: false),
    );

List<Widget> _spaced(double gap, List<Widget> children) => [
      for (var i = 0; i < children.length; i++) ...[
        if (i > 0) SizedBox(height: gap),
        children[i],
      ],
    ];

// ---------------------------------------------------------------------------
// QR code and brand mark
// ---------------------------------------------------------------------------

/// The branded QR (web `ShareQr`): navy rounded modules, soft finder eyes
/// and the GE mark in the middle — error correction H, so the mark is safe.
class ShareQr extends StatelessWidget {
  const ShareQr(
      {super.key, required this.value, required this.unit, this.padded = true});
  final String value;

  /// 1% of the card width — the white tile's radius and padding scale with it.
  final double unit;
  final bool padded;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Scan to open on Globoexpats',
      image: true,
      child: Container(
        decoration: BoxDecoration(
          color: ShareArt.white,
          borderRadius: BorderRadius.circular(1.5 * unit),
        ),
        padding: EdgeInsets.all(padded ? 0.8 * unit : 0),
        child: AspectRatio(
          aspectRatio: 1,
          child: CustomPaint(painter: _QrPainter(value)),
        ),
      ),
    );
  }
}

class _QrPainter extends CustomPainter {
  _QrPainter(this.value);
  final String value;

  static final Map<String, QrImage> _cache = {};

  QrImage get _qr => _cache.putIfAbsent(value, () {
        if (_cache.length > 24) _cache.clear();
        return QrImage(QrCode.fromData(
            data: value.isEmpty ? 'https://globoexpats.com' : value,
            errorCorrectLevel: QrErrorCorrectLevel.H));
      });

  @override
  void paint(Canvas canvas, Size size) {
    final qr = _qr;
    const margin = 4;
    final count = qr.moduleCount;
    final total = count + margin * 2;
    final s = size.width / total;
    canvas.save();
    canvas.scale(s);
    canvas.drawRect(Rect.fromLTWH(0, 0, total.toDouble(), total.toDouble()),
        Paint()..color = ShareArt.white);
    final finders = [(0, 0), (count - 7, 0), (0, count - 7)];
    bool inFinder(int col, int row) => finders
        .any((f) => col >= f.$1 && col < f.$1 + 7 && row >= f.$2 && row < f.$2 + 7);
    // One path for every module: touching cells fill without seams.
    final modules = Path();
    for (var row = 0; row < count; row++) {
      for (var col = 0; col < count; col++) {
        if (inFinder(col, row) || !qr.isDark(row, col)) continue;
        final x = (col + margin).toDouble();
        final y = (row + margin).toDouble();
        modules.addRRect(RRect.fromLTRBR(
            x, y, x + 1, y + 1, const Radius.circular(0.16)));
      }
    }
    final ink = Paint()..color = ShareArt.navy;
    final paper = Paint()..color = ShareArt.white;
    canvas.drawPath(modules, ink);
    for (final f in finders) {
      final x = (f.$1 + margin).toDouble();
      final y = (f.$2 + margin).toDouble();
      canvas.drawRRect(
          RRect.fromLTRBR(x, y, x + 7, y + 7, const Radius.circular(1.15)), ink);
      canvas.drawRRect(
          RRect.fromLTRBR(x + 1, y + 1, x + 6, y + 6,
              const Radius.circular(0.55)),
          paper);
      canvas.drawRRect(
          RRect.fromLTRBR(x + 2, y + 2, x + 5, y + 5,
              const Radius.circular(0.5)),
          ink);
    }
    final logoW = total * 0.15;
    final logoH = logoW * 0.625;
    final lx = (total - logoW) / 2;
    final ly = (total - logoH) / 2;
    canvas.drawRRect(
        RRect.fromLTRBR(lx - 1, ly - 1, lx + logoW + 1, ly + logoH + 1,
            const Radius.circular(1)),
        paper);
    canvas.translate(lx, ly);
    canvas.scale(logoW / 64, logoH / 40);
    paintBrandMark(canvas);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_QrPainter old) => old.value != value;
}

/// The GE companion mark (web `BrandMark`, viewBox 64×40): the blue G and
/// the three orange bars of the E.
void paintBrandMark(Canvas canvas) {
  final g = Path()
    ..moveTo(20, 1)
    ..arcToPoint(const Offset(38.8, 22.7),
        radius: const Radius.circular(19), largeArc: true, clockwise: false)
    ..lineTo(38.8, 17)
    ..lineTo(20, 17)
    ..lineTo(20, 25)
    ..lineTo(29.9, 25)
    ..arcToPoint(const Offset(27.8, 12.2),
        radius: const Radius.circular(11), largeArc: true, clockwise: true)
    ..lineTo(33.5, 6.5)
    ..arcToPoint(const Offset(20, 1),
        radius: const Radius.circular(18.9), largeArc: false, clockwise: false)
    ..close();
  final e = Path()
    ..moveTo(39, 3)
    ..lineTo(63, 3)
    ..lineTo(63, 11)
    ..lineTo(45, 11)
    ..close()
    ..addRect(const Rect.fromLTRB(45, 16, 63, 24))
    ..moveTo(45, 29)
    ..lineTo(63, 29)
    ..lineTo(63, 37)
    ..lineTo(39, 37)
    ..close();
  canvas.drawPath(g, Paint()..color = ShareArt.blue);
  canvas.drawPath(e, Paint()..color = ShareArt.orange);
}
