import 'dart:typed_data';

/// What the seller may hand us, and what we may hand the backend.
///
/// The two are deliberately different numbers. `ImageStorageService`
/// (backend) refuses any part over 10 MB and Spring's own
/// `spring.servlet.multipart.max-file-size` is set to the same, so the
/// UPLOADED bytes can never exceed that. The SOURCE photo is a different
/// matter: a modern phone camera writes 12-25 MB files, and compression
/// takes those to a few hundred KB long before they reach the wire. Refusing
/// them at the picker — as the app used to, at 10 MB — rejected photos that
/// would have uploaded comfortably.
const int kMaxSourceImageBytes = 30 * 1024 * 1024;

/// The backend's own per-file ceiling (`ImageStorageService.MAX_IMAGE_SIZE`).
/// Compression should always land far under it; this is the backstop for the
/// case where compression failed and we fell back to the original bytes.
const int kMaxUploadImageBytes = 10 * 1024 * 1024;

/// Exactly what `ImageStorageService.ALLOWED_IMAGE_TYPES` accepts. A part
/// whose Content-Type is outside this set is rejected before a single byte is
/// read, whatever the bytes actually are.
const Set<String> kAllowedUploadMimeTypes = {
  'image/webp',
  'image/jpeg',
  'image/png',
};

/// The Content-Type a multipart part must carry, read from the BYTES.
///
/// `http.MultipartFile.fromBytes` defaults to `application/octet-stream` when
/// no content type is given, which is precisely the string the backend quoted
/// back as "Invalid file format: application/octet-stream". Sniffing the
/// magic number rather than trusting the filename also covers the case that
/// caused it: the picker hands us `IMG_1234.jpg`, we re-encode to WebP, and
/// the extension no longer describes the bytes.
///
/// Returns null when the bytes are not one of the formats the backend takes,
/// so the caller can drop the file with a real explanation instead of letting
/// the server refuse it after the upload.
String? sniffImageMime(Uint8List bytes) {
  if (bytes.length < 12) return null;
  // JPEG: SOI + marker.
  if (bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) {
    return 'image/jpeg';
  }
  // PNG: \x89PNG\r\n\x1a\n
  if (bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47 &&
      bytes[4] == 0x0D &&
      bytes[5] == 0x0A &&
      bytes[6] == 0x1A &&
      bytes[7] == 0x0A) {
    return 'image/png';
  }
  // WebP: "RIFF" ... "WEBP".
  if (bytes[0] == 0x52 &&
      bytes[1] == 0x49 &&
      bytes[2] == 0x46 &&
      bytes[3] == 0x46 &&
      bytes[8] == 0x57 &&
      bytes[9] == 0x45 &&
      bytes[10] == 0x42 &&
      bytes[11] == 0x50) {
    return 'image/webp';
  }
  return null;
}

/// The filename's own claim about the format. Only consulted when the bytes
/// are unreadable (an empty or truncated buffer), never to override them.
String? imageMimeFromName(String filename) {
  final dot = filename.lastIndexOf('.');
  if (dot < 0 || dot == filename.length - 1) return null;
  switch (filename.substring(dot + 1).toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return null;
  }
}

/// The Content-Type for an upload part: the bytes first, the name as a
/// fallback, and `application/octet-stream` when neither says anything — the
/// old behaviour, kept for that last case so a caller sending something
/// genuinely unknown behaves no worse than before.
String imageUploadContentType(Uint8List bytes, String filename) =>
    sniffImageMime(bytes) ??
    imageMimeFromName(filename) ??
    'application/octet-stream';

/// Renames a file to match bytes we just re-encoded, the way the web's
/// compressor does (`lib/image-compressor.ts` builds `${baseName}.webp`).
/// Sending `photo.jpg` that holds WebP bytes leaves the stored file with a
/// name that lies about its contents.
String renameForMime(String filename, String mime) {
  const extensions = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  };
  final ext = extensions[mime];
  if (ext == null) return filename;
  final dot = filename.lastIndexOf('.');
  final base = dot <= 0 ? filename : filename.substring(0, dot);
  final safeBase = base.trim().isEmpty ? 'photo' : base.trim();
  return '$safeBase.$ext';
}

/// A file name the backend stores safely (web `addProductImages` does the
/// same: `name.replace(/[^\w\-_.]/g, '_')`). The stored photo's URL carries
/// the name, so spaces or other characters there broke the link, and the
/// backend refuses any name containing "..".
String safeUploadFilename(String filename) {
  var name = filename.replaceAll(RegExp(r'[^\w\-.]'), '_');
  while (name.contains('..')) {
    name = name.replaceAll('..', '.');
  }
  name = name.replaceAll(RegExp(r'^\.+'), '');
  return name.isEmpty || !name.contains(RegExp(r'[A-Za-z0-9]'))
      ? 'photo'
      : name;
}

/// Human-readable size for the picker's "that photo is too big" message.
String formatBytes(int bytes) {
  if (bytes >= 1024 * 1024) {
    final mb = bytes / (1024 * 1024);
    return '${mb.toStringAsFixed(mb >= 10 ? 0 : 1)}MB';
  }
  return '${(bytes / 1024).round()}KB';
}
