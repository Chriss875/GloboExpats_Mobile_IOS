import 'package:flutter/material.dart';

import 'app_image.dart';

/// Fullscreen, pageable image preview (A-19). Tapping a product or seller
/// photo opens a black overlay the user can swipe through and dismiss. The
/// requirement is deliberately minimal — a close affordance and a small
/// "i / n" counter, NO pinch-zoom.
Future<void> showFullscreenImagePreview(
  BuildContext context, {
  required List<String> urls,
  int initialIndex = 0,
}) {
  if (urls.isEmpty) return Future.value();
  final index = initialIndex.clamp(0, urls.length - 1);
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (_) => FullscreenImageViewer(urls: urls, initialIndex: index),
    ),
  );
}

class FullscreenImageViewer extends StatefulWidget {
  const FullscreenImageViewer({
    super.key,
    required this.urls,
    this.initialIndex = 0,
  });

  final List<String> urls;
  final int initialIndex;

  @override
  State<FullscreenImageViewer> createState() => _FullscreenImageViewerState();
}

class _FullscreenImageViewerState extends State<FullscreenImageViewer> {
  late int _index = widget.initialIndex;

  @override
  Widget build(BuildContext context) {
    final urls = widget.urls;
    return Scaffold(
      key: const ValueKey('fullscreen-image-preview'),
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            key: const ValueKey('fullscreen-preview-close'),
            tooltip: 'Close preview',
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
      body: urls.isEmpty
          ? const SizedBox.shrink()
          : Stack(
              children: [
                PageView.builder(
                  controller: PageController(initialPage: _index),
                  itemCount: urls.length,
                  onPageChanged: (i) => setState(() => _index = i),
                  itemBuilder: (_, i) => Center(
                    child: AppImage(urls[i], fit: BoxFit.contain),
                  ),
                ),
                if (urls.length > 1)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 28,
                    child: Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          '${_index + 1} / ${urls.length}',
                          key: const ValueKey('fullscreen-image-counter'),
                          style: const TextStyle(
                              color: Colors.white, fontSize: 13),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
