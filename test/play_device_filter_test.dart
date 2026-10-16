import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Play derives *required hardware features* from the permissions a manifest
/// declares, and then hides the app from every device that lacks them. It is
/// silent: nothing in the artifact shows it, and the only symptom is a line in
/// the release dialog saying the upload "no longer supports N devices".
///
/// Location here is a convenience only — the address picker also takes a
/// search result or a tap on the map — so a phone without GPS must still be
/// able to install the app.
void main() {
  final manifest =
      File('android/app/src/main/AndroidManifest.xml').readAsStringSync();

  bool optional(String feature) => RegExp(
        '<uses-feature[^>]*android:name="$feature"[^>]*'
        'android:required="false"',
      ).hasMatch(manifest);

  bool declaresPermission(String permission) =>
      manifest.contains('android.permission.$permission');

  // permission -> the feature Play infers from it
  const implied = {
    'ACCESS_FINE_LOCATION': 'android.hardware.location.gps',
    'ACCESS_COARSE_LOCATION': 'android.hardware.location.network',
  };

  test('location permissions do not become required hardware', () {
    for (final entry in implied.entries) {
      if (!declaresPermission(entry.key)) continue;
      expect(optional(entry.value), isTrue,
          reason: '${entry.key} makes Play require ${entry.value}; declare '
              'that feature with android:required="false" or the app '
              'disappears from every device without it');
    }
  });

  test('the umbrella location feature is optional too', () {
    if (implied.keys.any(declaresPermission)) {
      expect(optional('android.hardware.location'), isTrue);
    }
  });

  test('minSdk stays where Firebase needs it', () {
    // firebase_core / firebase_messaging both publish minSdkVersion 23, so
    // this cannot be lowered while push notifications ship. It is recorded as
    // a test so a future "let's support older phones" change fails loudly
    // instead of failing at merge time with an unreadable AAPT error.
    final gradle = File('android/app/build.gradle').readAsStringSync();
    expect(RegExp(r'minSdk\s*=\s*23').hasMatch(gradle), isTrue,
        reason: 'Firebase requires API 23; changing this needs Firebase gone');
  });
}
