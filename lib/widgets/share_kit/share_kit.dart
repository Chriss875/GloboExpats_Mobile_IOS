import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../domain/share_links.dart';
import '../../theme.dart';
import '../app_image.dart';
import 'share_cards.dart';
import '../../services/matomo_tracker.dart';

/// Loads one photo or backdrop, decoded and ready to paint.
typedef ShareImageLoader = Future<ui.Image?> Function(String key);

/// Decodes network photos (through the app's image cache) and bundled
/// backdrops. Big uploads are decoded at poster size, never larger.
Future<ui.Image?> defaultShareImageLoader(String key) async {
  try {
    final Uint8List bytes = key.startsWith('assets/')
        ? (await rootBundle.load(key)).buffer.asUint8List()
        : await loadAppImageBytes(key);
    final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    final descriptor = await ui.ImageDescriptor.encoded(buffer);
    final codec = await descriptor.instantiateCodec(
        targetWidth: descriptor.width > 1600 ? 1600 : null);
    final frame = await codec.getNextFrame();
    return frame.image;
  } catch (_) {
    return null;
  }
}

enum ShareImageOutcome { shared, cancelled }

/// The phone side of sharing: the system share sheet, the gallery and the
/// clipboard. Tests swap [instance] for a fake.
class ShareKitPlatform {
  const ShareKitPlatform();
  static ShareKitPlatform instance = const ShareKitPlatform();

  Future<ui.Image?> loadImage(String key) => defaultShareImageLoader(key);

  Future<ShareImageOutcome> shareImage(
      Uint8List png, String filename, String caption) async {
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/$filename');
    await file.writeAsBytes(png, flush: true);
    final result = await SharePlus.instance.share(ShareParams(
      files: [XFile(file.path, mimeType: 'image/png', name: filename)],
      text: caption,
    ));
    return result.status == ShareResultStatus.dismissed
        ? ShareImageOutcome.cancelled
        : ShareImageOutcome.shared;
  }

  Future<void> saveImage(Uint8List png, String name) async {
    if (!await Gal.hasAccess(toAlbum: true)) {
      await Gal.requestAccess(toAlbum: true);
    }
    await Gal.putImageBytes(png, name: name, album: 'GloboExpats');
  }

  Future<bool> shareText(String text) async {
    final result = await SharePlus.instance.share(ShareParams(text: text));
    return result.status != ShareResultStatus.dismissed;
  }

  Future<bool> copy(String text) async {
    try {
      await Clipboard.setData(ClipboardData(text: text));
      return true;
    } catch (_) {
      return false;
    }
  }
}

/// Web `pictureFilename`.
String sharePictureFilename(String base, ShareDesign design) {
  final format = switch (design) {
    ShareDesign.square => 'portrait',
    ShareDesign.sheet => 'photo-poster',
    ShareDesign.qr => 'qr-only',
    _ => design.name,
  };
  return '$base-$format.png';
}

enum _Busy { share, save, copy }

/// The Share Kit (web `components/share-kit/share-kit.tsx`): pick a format
/// and template, tune the photo, then share the picture, save it, or copy
/// the caption and tracked link.
class ShareKitView extends StatefulWidget {
  const ShareKitView({
    super.key,
    required this.data,
    required this.designs,
    required this.shareUrl,
    required this.buildCaption,
    required this.fileBase,
    this.sharerId,
    this.loadImage,
  });

  final ShareCardData data;
  final List<ShareDesign> designs;

  /// The page being shared (site-relative or absolute).
  final String shareUrl;
  final Object? sharerId;
  final String Function(String link, ShareDesign design) buildCaption;
  final String fileBase;

  /// Defaults to [ShareKitPlatform.loadImage].
  final ShareImageLoader? loadImage;

  @override
  State<ShareKitView> createState() => _ShareKitViewState();
}

class _ShareKitViewState extends State<ShareKitView> {
  late ShareDesign _design = widget.designs.first;
  ShareTemplate _template = ShareTemplate.studio;
  ShareFrameStyle _frameStyle = ShareFrameStyle.blue;
  ShareShopLayout _shopLayout = ShareShopLayout.collage;
  int _imageSize = 100;
  bool _imageFrame = false;
  _Busy? _busy;
  String _notice = '';
  bool _loading = true;
  final Map<String, ui.Image> _images = {};
  // One capture key per format: while the preview cross-fades between two
  // formats both are on screen, and a shared key would be a duplicate.
  final Map<ShareDesign, GlobalKey> _captureKeys = {};
  GlobalKey get _captureKey => _captureKeys.putIfAbsent(_design, GlobalKey.new);

  ShareCardData get _data => widget.data;

  @override
  void initState() {
    super.initState();
    _loadImages();
  }

  @override
  void dispose() {
    for (final image in _images.values) {
      image.dispose();
    }
    super.dispose();
  }

  Future<void> _loadImages() async {
    final full = widget.data;
    final keys = <String>{
      ...ShareBackdrops.all,
      if ((full.imageUrl ?? '').isNotEmpty) full.imageUrl!,
      if (full.halal) kShareHalalAsset,
      for (final item in full.items.take(6))
        if (item.imageUrl.isNotEmpty) item.imageUrl,
    };
    final loaded = await Future.wait(keys.map((key) async {
      final load = widget.loadImage ?? ShareKitPlatform.instance.loadImage;
      final image = await load(key);
      return MapEntry(key, image);
    }));
    if (!mounted) {
      for (final entry in loaded) {
        entry.value?.dispose();
      }
      return;
    }
    setState(() {
      for (final entry in loaded) {
        if (entry.value != null) _images[entry.key] = entry.value!;
      }
      _loading = false;
    });
  }

  String get _nativeLink =>
      buildTrackedShareUrl(widget.shareUrl, ShareChannel.native, widget.sharerId);
  String get _caption => widget.buildCaption(_nativeLink, _design);

  bool get _hasImages {
    final data = _data;
    return switch (_design) {
      ShareDesign.square ||
      ShareDesign.story ||
      ShareDesign.sheet =>
        (data.imageUrl ?? '').isNotEmpty,
      // The shop collage crops every photo to fill its tile: no size or
      // frame to tune.
      _ => false,
    };
  }

  /// The preview IS the picture: it is re-drawn at the design's full width
  /// (1080px) straight from the widget the user is looking at.
  Future<Uint8List> _renderPng() async {
    final boundary = _captureKey.currentContext!.findRenderObject()
        as RenderRepaintBoundary;
    final spec = shareDesigns[_design]!;
    final image =
        await boundary.toImage(pixelRatio: spec.width / boundary.size.width);
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) throw StateError('Could not create the share picture');
      return data.buffer.asUint8List();
    } finally {
      image.dispose();
    }
  }

  Future<void> _share() async {
    setState(() {
      _busy = _Busy.share;
      _notice = '';
    });
    final platform = ShareKitPlatform.instance;
    try {
      final caption = _caption;
      final png = await _renderPng();
      final outcome = await platform.shareImage(
          png, sharePictureFilename(widget.fileBase, _design), caption);
      if (outcome == ShareImageOutcome.shared) {
        _trackShare('native');
        final copied = await platform.copy(caption);
        _setNotice(copied
            ? 'Image shared. Caption and link copied in case your app needs them.'
            : 'Image shared. Use Copy link if your app omits the caption.');
      }
    } catch (_) {
      _setNotice('Could not share this image. Try Download or Copy link.');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _save() async {
    setState(() {
      _busy = _Busy.save;
      _notice = '';
    });
    try {
      final png = await _renderPng();
      final name = sharePictureFilename(widget.fileBase, _design)
          .replaceFirst(RegExp(r'\.png$'), '');
      await ShareKitPlatform.instance.saveImage(png, name);
      _trackShare('save');
      _setNotice('Picture saved to your gallery.');
    } catch (_) {
      _setNotice('Could not make the picture. Try again, or use Copy link '
          'to share the caption and link.');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _copy() async {
    setState(() => _busy = _Busy.copy);
    final link = buildTrackedShareUrl(
        widget.shareUrl, ShareChannel.copy, widget.sharerId);
    final copied =
        await ShareKitPlatform.instance.copy(widget.buildCaption(link, _design));
    if (copied) _trackShare('copy');
    _setNotice(copied
        ? 'Caption and link copied.'
        : 'Could not copy. Your caption and link are available below.');
    if (mounted) setState(() => _busy = null);
  }

  /// Web parity: share-kit.tsx calls trackShare(channel, design, target).
  void _trackShare(String channel) => MatomoTracking.instance
      .trackShare(channel, _design.name, widget.shareUrl);

  void _setNotice(String value) {
    if (mounted) setState(() => _notice = value);
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final locked = _busy != null;
    final data = _data;
    final spec = shareDesigns[_design]!;
    final previewWidth = _design == ShareDesign.qr
        ? 240.0
        : spec.height > spec.width * 1.5
            ? 190.0
            : 250.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.designs.length > 1) ...[
          const _Label('Format'),
          _FormatPicker(
            designs: widget.designs,
            selected: _design,
            enabled: !locked,
            onChanged: (d) => setState(() {
              _design = d;
              _notice = '';
            }),
          ),
          const SizedBox(height: 18),
        ],
        if (_design == ShareDesign.shop) ...[
          const _Label('Layout'),
          _LayoutPicker(
            selected: _shopLayout,
            enabled: !locked,
            onChanged: (l) => setState(() => _shopLayout = l),
          ),
          const SizedBox(height: 18),
        ],
        if (_design != ShareDesign.qr) ...[
          const _Label('Template'),
          _TemplatePicker(
            selected: _template,
            enabled: !locked,
            onChanged: (t) => setState(() => _template = t),
          ),
          const SizedBox(height: 18),
        ],
        Container(
          constraints: const BoxConstraints(minHeight: 290),
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: Theme.of(context).brightness == Brightness.dark
                ? palette.surfaceMuted
                : ShareArt.stage,
            borderRadius: BorderRadius.circular(12),
          ),
          alignment: Alignment.center,
          child: Stack(alignment: Alignment.center, children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 180),
              child: SizedBox(
                key: ValueKey(_design),
                width: previewWidth,
                child: DecoratedBox(
                  decoration: const BoxDecoration(boxShadow: [
                    BoxShadow(
                        color: ShareArt.shadow,
                        blurRadius: 10,
                        offset: Offset(0, 3)),
                  ]),
                  child: RepaintBoundary(
                    key: _captureKey,
                    child: ShareCard(
                      key: const ValueKey('share-kit-preview'),
                      design: _design,
                      data: data,
                      template: _template,
                      imageSize: _imageSize,
                      imageFrame: _imageFrame,
                      frameStyle: _frameStyle,
                      shopLayout: _shopLayout,
                      images: _images,
                    ),
                  ),
                ),
              ),
            ),
            if (_loading)
              const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.4)),
          ]),
        ),
        if (_hasImages) ...[
          const SizedBox(height: 14),
          Row(children: [
            const _Label('Image size', bottom: 0),
            const Spacer(),
            Text('$_imageSize%',
                style: TextStyle(
                    fontSize: 12,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: palette.textSecondary)),
            IconButton(
              tooltip: 'Reset image size',
              visualDensity: VisualDensity.compact,
              iconSize: 16,
              onPressed: locked || _imageSize == 100
                  ? null
                  : () => setState(() => _imageSize = 100),
              icon: const Icon(Icons.restart_alt_rounded),
            ),
          ]),
          Slider(
            key: const ValueKey('share-kit-image-size'),
            value: _imageSize.toDouble(),
            min: 70,
            max: 130,
            divisions: 12,
            label: '$_imageSize%',
            onChanged: locked
                ? null
                : (v) => setState(() => _imageSize = v.round()),
          ),
          SwitchListTile(
            key: const ValueKey('share-kit-image-frame'),
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: const _Label('Image frame', bottom: 0),
            value: _imageFrame,
            onChanged:
                locked ? null : (v) => setState(() => _imageFrame = v),
          ),
          if (_imageFrame)
            _FramePicker(
              selected: _frameStyle,
              enabled: !locked,
              onChanged: (f) => setState(() => _frameStyle = f),
            ),
          Divider(height: 28, color: palette.border),
        ] else
          const SizedBox(height: 16),
        Row(children: [
          Expanded(
            child: _ActionButton(
              key: const ValueKey('share-kit-share'),
              icon: Icons.share_rounded,
              label: 'Share image',
              primary: true,
              busy: _busy == _Busy.share,
              onPressed: locked || _loading ? null : _share,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _ActionButton(
              key: const ValueKey('share-kit-download'),
              icon: Icons.download_rounded,
              label: 'Download',
              busy: _busy == _Busy.save,
              onPressed: locked || _loading ? null : _save,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _ActionButton(
              key: const ValueKey('share-kit-copy'),
              icon: Icons.copy_rounded,
              label: 'Copy link',
              busy: _busy == _Busy.copy,
              onPressed: locked ? null : _copy,
            ),
          ),
        ]),
        if (_notice.isNotEmpty) ...[
          const SizedBox(height: 10),
          Semantics(
            liveRegion: true,
            child: Text(_notice,
                key: const ValueKey('share-kit-notice'),
                style: TextStyle(fontSize: 12.5, color: palette.textSecondary)),
          ),
        ],
        const SizedBox(height: 16),
        const _Label('Caption and link'),
        Container(
          key: const ValueKey('share-kit-caption'),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: palette.background,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: palette.border),
          ),
          child: SelectableText(_caption,
              style: TextStyle(
                  fontSize: 12.5, height: 1.5, color: palette.textSecondary)),
        ),
      ],
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text, {this.bottom = 8});
  final String text;
  final double bottom;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(bottom: bottom),
        child: Text(text,
            style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: AppPalette.of(context).textPrimary)),
      );
}

/// Web "Format": a segmented row of the available pictures.
class _FormatPicker extends StatelessWidget {
  const _FormatPicker({
    required this.designs,
    required this.selected,
    required this.enabled,
    required this.onChanged,
  });
  final List<ShareDesign> designs;
  final ShareDesign selected;
  final bool enabled;
  final ValueChanged<ShareDesign> onChanged;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: palette.surfaceMuted,
        borderRadius: BorderRadius.circular(10),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final design in designs)
            Semantics(
              button: true,
              selected: design == selected,
              label: shareDesigns[design]!.name,
              child: GestureDetector(
                key: ValueKey('share-kit-format-${design.name}'),
                behavior: HitTestBehavior.opaque,
                onTap: enabled ? () => onChanged(design) : null,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  constraints: const BoxConstraints(minHeight: 36),
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(
                    color: design == selected
                        ? palette.surface
                        : const Color(0x00000000),
                    borderRadius: BorderRadius.circular(7),
                    boxShadow: design == selected
                        ? const [
                            BoxShadow(
                                color: Color(0x14000000),
                                blurRadius: 3,
                                offset: Offset(0, 1)),
                          ]
                        : null,
                  ),
                  child: ExcludeSemantics(
                    child: Text(shareDesigns[design]!.short,
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: design == selected
                                ? palette.accentInk
                                : palette.textSecondary)),
                  ),
                ),
              ),
            ),
        ]),
      ),
    );
  }
}

class _PickerTile extends StatelessWidget {
  const _PickerTile({
    super.key,
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onTap,
    required this.swatch,
    this.minHeight = 76,
  });
  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;
  final Widget swatch;
  final double minHeight;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(8),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          constraints: BoxConstraints(minHeight: minHeight),
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? palette.infoFill : const Color(0x00000000),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
                color: selected ? AppColors.brandBlue : palette.border,
                width: selected ? 1.4 : 1),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              swatch,
              const SizedBox(height: 6),
              Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: selected
                          ? palette.accentInk
                          : palette.textSecondary)),
            ],
          ),
        ),
      ),
    );
  }
}

class _TemplatePicker extends StatelessWidget {
  const _TemplatePicker(
      {required this.selected, required this.enabled, required this.onChanged});
  final ShareTemplate selected;
  final bool enabled;
  final ValueChanged<ShareTemplate> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      for (final (i, template) in ShareTemplate.values.indexed) ...[
        if (i > 0) const SizedBox(width: 8),
        Expanded(
          child: _PickerTile(
            key: ValueKey('share-kit-template-${template.name}'),
            label: shareTemplates[template]!.$1,
            selected: template == selected,
            enabled: enabled,
            onTap: () => onChanged(template),
            swatch: _TemplateSwatch(template),
          ),
        ),
      ],
    ]);
  }
}

/// A thumbnail of a template: its ground, a title rule, a photo and the tab.
class _TemplateSwatch extends StatelessWidget {
  const _TemplateSwatch(this.template);
  final ShareTemplate template;

  @override
  Widget build(BuildContext context) {
    final white = template == ShareTemplate.white;
    return Container(
      width: 28,
      height: 36,
      decoration: BoxDecoration(
        color: shareTemplates[template]!.$2,
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: AppPalette.of(context).borderStrong),
        image: template == ShareTemplate.studio
            ? const DecorationImage(
                image: AssetImage(ShareBackdrops.portrait), fit: BoxFit.cover)
            : null,
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(children: [
        Positioned(
          left: 4,
          top: 4,
          width: 16,
          height: 2,
          child: ColoredBox(color: white ? ShareArt.navy : ShareArt.white),
        ),
        Positioned(
          left: 6,
          bottom: 8,
          width: 14,
          height: 14,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: ShareArt.swatchFill,
              border: Border.all(color: ShareArt.swatchLine),
            ),
          ),
        ),
        if (template != ShareTemplate.minimal)
          const Positioned(
            left: 0,
            bottom: 0,
            width: 12,
            height: 2,
            child: ColoredBox(color: ShareArt.orange),
          ),
      ]),
    );
  }
}

class _LayoutPicker extends StatelessWidget {
  const _LayoutPicker(
      {required this.selected, required this.enabled, required this.onChanged});
  final ShareShopLayout selected;
  final bool enabled;
  final ValueChanged<ShareShopLayout> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      for (final (i, layout) in ShareShopLayout.values.indexed) ...[
        if (i > 0) const SizedBox(width: 8),
        Expanded(
          child: _PickerTile(
            key: ValueKey('share-kit-layout-${layout.name}'),
            label: shareShopLayouts[layout]!,
            selected: layout == selected,
            enabled: enabled,
            onTap: () => onChanged(layout),
            swatch: _LayoutSwatch(layout),
          ),
        ),
      ],
    ]);
  }
}

/// A thumbnail of a shop layout: its tiles on the brand ground.
class _LayoutSwatch extends StatelessWidget {
  const _LayoutSwatch(this.layout);
  final ShareShopLayout layout;

  @override
  Widget build(BuildContext context) {
    Widget t() => const Expanded(
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: ShareArt.swatchLine,
              borderRadius: BorderRadius.all(Radius.circular(1.5)),
            ),
          ),
        );
    Widget row(List<Widget> c, {int flex = 1}) => Expanded(
          flex: flex,
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (var i = 0; i < c.length; i++) ...[
              if (i > 0) const SizedBox(width: 2),
              c[i],
            ],
          ]),
        );
    const gap = SizedBox(height: 2);
    final Widget body = switch (layout) {
      ShareShopLayout.collage =>
        Column(children: [row([t(), t()]), gap, row([t(), t(), t()])]),
      ShareShopLayout.grid => Column(children: [
          row([t(), t()]),
          gap,
          row([t(), t()]),
          gap,
          row([t(), t()]),
        ]),
      ShareShopLayout.spotlight =>
        Column(children: [row([t()], flex: 3), gap, row([t(), t(), t()])]),
    };
    return Container(
      width: 28,
      height: 36,
      padding: const EdgeInsets.fromLTRB(3, 8, 3, 5),
      decoration: BoxDecoration(
        color: ShareArt.blue,
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: AppPalette.of(context).borderStrong),
      ),
      child: body,
    );
  }
}

class _FramePicker extends StatelessWidget {
  const _FramePicker(
      {required this.selected, required this.enabled, required this.onChanged});
  final ShareFrameStyle selected;
  final bool enabled;
  final ValueChanged<ShareFrameStyle> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      for (final (i, style) in ShareFrameStyle.values.indexed) ...[
        if (i > 0) const SizedBox(width: 8),
        Expanded(
          child: _PickerTile(
            key: ValueKey('share-kit-frame-${style.name}'),
            label: shareFrames[style]!.$1,
            selected: style == selected,
            enabled: enabled,
            minHeight: 64,
            onTap: () => onChanged(style),
            swatch: _FrameSwatch(style),
          ),
        ),
      ],
    ]);
  }
}

class _FrameSwatch extends StatelessWidget {
  const _FrameSwatch(this.style);
  final ShareFrameStyle style;

  @override
  Widget build(BuildContext context) {
    final color = shareFrames[style]!.$2;
    const orangeSide = BorderSide(color: ShareArt.orange, width: 3);
    return SizedBox(
      width: 28,
      height: 24,
      child: Stack(clipBehavior: Clip.none, children: [
        if (style == ShareFrameStyle.corners) ...[
          const Positioned(
            left: 0,
            top: 0,
            width: 12,
            height: 12,
            child: DecoratedBox(
                decoration: BoxDecoration(
                    border: Border(top: orangeSide, left: orangeSide))),
          ),
          const Positioned(
            right: 0,
            bottom: 0,
            width: 12,
            height: 12,
            child: DecoratedBox(
                decoration: BoxDecoration(
                    border: Border(bottom: orangeSide, right: orangeSide))),
          ),
        ] else ...[
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                border: Border.all(
                    color: color,
                    width: style == ShareFrameStyle.outline ? 1.5 : 4),
                borderRadius: BorderRadius.circular(
                    style == ShareFrameStyle.outline ? 0 : 2),
              ),
            ),
          ),
          if (style == ShareFrameStyle.outline)
            Positioned.fill(
              child: Padding(
                padding: const EdgeInsets.all(3),
                child: DecoratedBox(
                    decoration: BoxDecoration(
                        border: Border.all(color: color, width: 1.5))),
              ),
            ),
          Positioned(
            right: 0,
            bottom: -4,
            width: 8,
            height: 4,
            child: ColoredBox(
                color: style == ShareFrameStyle.orange
                    ? ShareArt.deepBlue
                    : ShareArt.orange),
          ),
        ],
      ]),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.primary = false,
    this.busy = false,
  });
  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final bool primary;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final foreground = primary ? BrandStage.ink : palette.textPrimary;
    final child = Column(mainAxisSize: MainAxisSize.min, children: [
      busy
          ? SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: foreground))
          : Icon(icon, size: 18),
      const SizedBox(height: 5),
      Text(label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
    ]);
    final shape =
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(10));
    const padding = EdgeInsets.symmetric(horizontal: 6, vertical: 10);
    if (primary) {
      return FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brandBlue,
          foregroundColor: foreground,
          disabledBackgroundColor: AppColors.brandBlue.withValues(alpha: 0.55),
          disabledForegroundColor: foreground.withValues(alpha: 0.85),
          padding: padding,
          minimumSize: const Size.fromHeight(58),
          shape: shape,
        ),
        child: child,
      );
    }
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: foreground,
        side: BorderSide(color: palette.border),
        padding: padding,
        minimumSize: const Size.fromHeight(58),
        shape: shape,
      ),
      child: child,
    );
  }
}
