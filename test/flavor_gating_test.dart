import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/config.dart';

/// One app, one bundle id, two builds: the only difference is which backend
/// they talk to. That makes the default load-bearing — a build that forgot its
/// `--dart-define` and silently pointed the live track at the dev backend
/// would look completely normal until someone noticed their orders were
/// missing.
void main() {
  test('an unflavoured build defaults to dev, never to production', () {
    // `flutter run` and `flutter test` pass no APP_FLAVOR. Defaulting the
    // other way would mean a stray local build writing to real orders.
    expect(AppConfig.flavor, 'dev');
    expect(AppConfig.isDevBuild, isTrue);
    expect(AppConfig.apiBaseUrl, 'https://apidev.globoexpats.com');
  });

  test('the backend is the only thing the flavour decides', () {
    // Both builds ship the same applicationId and the same Firebase app, so
    // there is nothing else to assert — and that is the point. If a second
    // difference ever appears it belongs here, with its reason.
    expect(AppConfig.flavor, isIn(const ['dev', 'prod']));
  });
}
