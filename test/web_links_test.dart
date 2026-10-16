// Website links open in the app (Android App Links). The app has to read the
// web's own URLs, and must only claim the pages it can show itself: a
// payment provider sending a web shopper back to /checkout must stay in the
// browser.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/app_router.dart';

void main() {
  test('product and request pages read the id from the web slug', () {
    expect(slugRouteId('natural-cocoa-powder-1174'), 1174);
    expect(slugRouteId('1174'), 1174);
    expect(slugRouteId('2-seater-sofa-88'), 88,
        reason: 'the id is the last number, not the first');
    expect(slugRouteId('no-id-here'), 0);
    expect(slugRouteId(null), 0);
  });

  test('the app claims shop pages and leaves checkout, sign-in and admin '
      'to the browser', () {
    final manifest =
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(manifest, contains('android:autoVerify="true"'));
    expect(manifest, contains('android:pathPrefix="/product/"'));
    expect(manifest, contains(r'android:host="${webLinkHost}"'));
    for (final path in ['/checkout', '/admin', '/login', '/reset-password']) {
      expect(manifest, isNot(contains('"$path')), reason: path);
    }
  });
}
