# GloboExpats iOS release checklist

## 1. Apple and service configuration

- App ID and App Store Connect record use bundle ID
  `com.globoexpats.marketplace`.
- Enable **Sign in with Apple** and **Push Notifications** for that App ID.
- In Firebase, add an iOS app with exactly the same bundle ID, upload the APNs
  authentication key, and download its `GoogleService-Info.plist`.
- Create an iOS Google OAuth client for the same bundle ID.
- Restrict the iOS Google Maps key to this bundle ID and only the APIs used by
  GloboExpats.
- Complete agreements, tax, and banking in App Store Connect.

## 2. Local release inputs

Copy `.env.release.example` to `.env.release` and set every required value.
Never commit `.env.release`, `Secrets.xcconfig`, an APNs key, or
`GoogleService-Info.plist`.

The production build always points to the existing GloboExpats backend at
`https://api.globoexpats.com`. The development build points to
`https://apidev.globoexpats.com`.

## 3. Verification

Before uploading:

- Run `dart analyze` and `flutter test`.
- Run `tool/build_ios_release.sh dev --no-codesign` once for compile
  verification.
- Test email, Google, and Apple sign-in on a physical iPhone.
- Verify listings, checkout, payment confirmation, seller orders, uploads,
  refunds, maps/location, deep links, and push notifications against dev.
- Confirm account deletion is reachable in-app if account creation is offered.
- Confirm support and privacy-policy links are live without authentication.
- Confirm the App Privacy answers match `ios/Runner/PrivacyInfo.xcprivacy` and
  actual backend/analytics behavior.

## 4. Build and upload

1. Increment `version:` in `pubspec.yaml` for every upload.
2. Run `tool/build_ios_release.sh prod`.
3. Upload the generated IPA from `build/ios/ipa/` with Xcode Organizer or
   Transporter.
4. Add the build to TestFlight and complete internal testing first.

## 5. App Store Connect submission

Provide the app name, subtitle, description, keywords, support URL, privacy
policy URL, category, age rating, review contact, review notes, and screenshots
for every required device size. Give App Review a working test account and
clear instructions for any seller/admin-dependent flow.

Attach the tested build, answer export-compliance and content-rights questions,
complete App Privacy, then submit for review. Do not promote a TestFlight build
to production until the backend migration containing Apple identities has been
deployed to the same production backend.
