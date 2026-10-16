# GloboExpats Mobile

The Flutter mobile client for the GloboExpats marketplace. The iOS and Android
apps use the same GloboExpats Spring Boot backend, accounts, catalog, orders,
payments, and JWT sessions as the web application.

## Environments

- Development API: `https://apidev.globoexpats.com`
- Production API: `https://api.globoexpats.com`
- iOS bundle ID: `com.globoexpats.marketplace`

The API URL is selected by the release helper and is not read from a developer's
local shell by accident.

## iOS setup

1. Install Flutter, Xcode, and CocoaPods.
2. Run `flutter pub get`.
3. In Firebase, register the iOS bundle ID and download
   `GoogleService-Info.plist`.
4. Copy `.env.release.example` to `.env.release` and fill the real Firebase,
   Google OAuth, Google Maps, analytics, and Matomo values. Both files that
   contain service configuration are gitignored.
5. Build a verification app with
   `tool/build_ios_release.sh dev --no-codesign`.
6. Build the App Store IPA with `tool/build_ios_release.sh prod`.

The release script refuses to build when required iOS service configuration is
missing or when Firebase was created for a different bundle ID.

## Authentication

Sign in with Apple uses Apple's native authorization sheet. The Apple identity
token and a one-time nonce are verified by the existing GloboExpats backend at
`POST /api/v1/oauth2/apple/mobile`; the backend then issues the same platform
JWT used by email and Google sign-in.

## Tests

```bash
flutter test
dart analyze
```

See [APP_STORE_RELEASE.md](APP_STORE_RELEASE.md) for the TestFlight and App Store
submission checklist.
