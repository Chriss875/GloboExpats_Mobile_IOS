import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/domain/image_upload.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// "in uploading it tells me invalid format".
///
/// The backend rejects an image part on its Content-Type alone
/// (`ImageStorageService.validateFile`), and `MultipartFile.fromBytes`
/// labels a part `application/octet-stream` unless it is told otherwise —
/// which is the exact string the seller was shown. Every image part must
/// therefore carry a type read off the bytes.
void main() {
  Uint8List webp() {
    final b = Uint8List(32);
    b.setRange(0, 4, 'RIFF'.codeUnits);
    b.setRange(8, 12, 'WEBP'.codeUnits);
    return b;
  }

  Uint8List jpeg() {
    final b = Uint8List(32);
    b.setRange(0, 3, const [0xFF, 0xD8, 0xFF]);
    return b;
  }

  Uint8List png() {
    final b = Uint8List(32);
    b.setRange(0, 8, const [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    return b;
  }

  group('sniffing the bytes', () {
    test('names every format the backend accepts', () {
      expect(sniffImageMime(webp()), 'image/webp');
      expect(sniffImageMime(jpeg()), 'image/jpeg');
      expect(sniffImageMime(png()), 'image/png');
    });

    test('refuses to guess at anything else', () {
      // A HEIC original that slipped through: better skipped at the picker
      // with a reason than uploaded and refused at the last step.
      final heic = Uint8List.fromList(
          [0, 0, 0, 24, ...'ftypheic'.codeUnits, 0, 0, 0, 0]);
      expect(sniffImageMime(heic), isNull);
      expect(sniffImageMime(Uint8List(0)), isNull);
    });

    test('beats the filename, which the wizard makes stale', () {
      // The picker hands us IMG_1234.jpg; we re-encode it to WebP. The bytes
      // are the only honest source.
      expect(imageUploadContentType(webp(), 'IMG_1234.jpg'), 'image/webp');
      expect(renameForMime('IMG_1234.jpg', 'image/webp'), 'IMG_1234.webp');
      expect(renameForMime('no-extension', 'image/webp'), 'no-extension.webp');
    });

    test('falls back to the name only when the bytes say nothing', () {
      expect(imageUploadContentType(Uint8List(0), 'a.png'), 'image/png');
      expect(imageUploadContentType(Uint8List(0), 'a.bin'),
          'application/octet-stream');
    });
  });

  group('the size caps', () {
    test('let a phone-camera original through and keep the wire small', () {
      // The picker used to refuse anything over the backend's own 10MB, so a
      // 20MB camera photo was rejected before compression could take it to a
      // few hundred KB.
      expect(kMaxSourceImageBytes, greaterThan(kMaxUploadImageBytes));
      expect(kMaxSourceImageBytes, 30 * 1024 * 1024);
      expect(formatBytes(kMaxSourceImageBytes), '30MB');
    });
  });

  group('the publish request', () {
    /// Pulls the `Content-Type` line out of each multipart part.
    List<String> partTypes(String body) => RegExp(
            r'content-type:\s*([^\r\n]+)', caseSensitive: false)
        .allMatches(body)
        .map((m) => m.group(1)!.trim())
        .toList();

    test('labels the listing image with the type the backend allows',
        () async {
      late String body;
      final api = ApiClient(client: MockClient((req) async {
        body = utf8.decode(req.bodyBytes, allowMalformed: true);
        return http.Response(jsonEncode({'productId': 7}), 200,
            headers: {'content-type': 'application/json'});
      }));

      await api.createListingMultipart('t', const {'title': 'x'},
          mainImage: PendingImageRef(bytes: webp(), filename: 'cover.webp'));

      expect(partTypes(body), contains('image/webp'),
          reason: 'the backend validates on this header and nothing else');
      expect(partTypes(body), isNot(contains('application/octet-stream')));
    });

    test('labels the follow-up image batch too', () async {
      late String body;
      final api = ApiClient(client: MockClient((req) async {
        body = utf8.decode(req.bodyBytes, allowMalformed: true);
        return http.Response('', 200);
      }));

      await api.addProductImages('t', 7, [
        PendingImageRef(bytes: jpeg(), filename: 'a.jpg'),
        PendingImageRef(bytes: png(), filename: 'b.png'),
      ]);

      expect(partTypes(body), containsAll(['image/jpeg', 'image/png']));
      expect(partTypes(body), isNot(contains('application/octet-stream')));
    });
  });
}
