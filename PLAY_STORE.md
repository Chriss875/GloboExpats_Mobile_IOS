# Google Play release checklist — GloboExpats Mobile

Everything below was verified against this repo, the backend source, and Play's
current (Sept 2026) requirements. Items marked **BLOCKER** stop a submission.

---

## 1. Build configuration — done in-repo

| Requirement | State |
|---|---|
| Target API 36 (Android 16) — mandatory for new apps and updates since **31 Aug 2026** | `compileSdk`/`targetSdk` pinned to `36` in `android/app/build.gradle` |
| Toolchain able to build API 36 | AGP `8.9.1`, Gradle `8.11.1` (API 36 needs AGP ≥ 8.9.1) |
| Upload format `.aab` | `flutter build appbundle` |
| Release signed with an upload key, never debug keys | `signingConfigs.release` reads `android/key.properties` or `ANDROID_KEYSTORE_*` env vars; `bundleRelease` **fails loudly** if neither is present |
| Code shrinking | R8 `minifyEnabled` + `shrinkResources`, rules in `android/app/proguard-rules.pro` |

### Generating the upload keystore — **BLOCKER, needs you**

```bash
keytool -genkey -v -keystore globoexpats-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Then copy `android/key.properties.example` → `android/key.properties` and fill in
the four values. Both the `.jks` and `key.properties` are gitignored — **keep a
backup**. Losing the upload key means Google has to reset it for you; losing it
without Play App Signing enrolment means you can never update the app.

### Build command

Use the release script — do **not** hand-run a raw `flutter build`, because the
script also injects the Matomo `--dart-define`s that a raw command omits (a
build without them reports into the wrong Matomo site — `matomodev` site 1, the
*website*, instead of the app site):

```bash
tool/build_release.sh prod    # live: api.globoexpats.com + matomo site 2
tool/build_release.sh dev     # internal testing: apidev.globoexpats.com + matomodev site 2
```

The full input list lives in `.env.release.example` and the two-build mapping in
`docs/RELEASE_BUILDS.md`. The Google and Maps defines are required: without them
Google sign-in and the map picker degrade to disabled states in the shipped
build.

`<web-client-id>` is **not** a free choice — read §6b and the rule in §6a before
filling it in. The real values live in `.env.release` (gitignored). Note that
`GOOGLE_MAPS_API_KEY` is read **twice** by design: as this dart-define, and as
an environment variable that `android/app/build.gradle` puts into the manifest's
`com.google.android.geo.API_KEY` meta-data. Setting only one leaves either the
native tiles or the Dart fallback broken. `GOOGLE_PLACES_API_KEY` is optional —
see §8.

---

## 2. Data Safety form — answers grounded in this codebase

Declare **collected and shared with the backend, linked to the user's identity**:

| Data type | Where it comes from | Purpose |
|---|---|---|
| Name (first, last) | Profile, checkout `buyDetails` | Account management, order fulfilment |
| Email address | Registration, checkout | Account management, order fulfilment |
| Phone / WhatsApp number | Profile, checkout, listings | Buyer–seller contact, order fulfilment |
| Approximate & precise location | `ACCESS_COARSE/FINE_LOCATION` via the address map picker (`map_location_picker.dart`); `latitude`/`longitude` on addresses, listings and `buyDetails` | Delivery quoting and routing |
| Photos | `image_picker` — listing photos, profile avatar, payment receipts | Listing content, payment verification |
| Purchase history | Orders, proforma invoices | Order management |
| Payment info | Payment receipts / transaction references uploaded as proof | Manual payment verification |

Notes for the form:
- Data **is** transmitted off-device (to the GloboExpats API over HTTPS).
- Location is **optional** — the picker degrades gracefully if permission is
  refused, and the seller can pin an address manually.
- The app does **not** use advertising IDs and has no third-party analytics SDK.

---

## 3. Account deletion — done in code, needs deployment

Play's User Data policy requires *both* an in-app path and a publicly reachable
web URL for account deletion, for any app that lets users create an account.
This app does (`/register`).

- **In-app path:** Account -> Profile Information -> Delete account. It now
  calls `DELETE /api/v1/userManagement/account`, then signs the user out.
- **Web account deletion URL for Play Console:**
  `https://www.globoexpats.com/account/delete`
- **Backend behavior:** the endpoint removes removable personal account data,
  saved addresses, saved items, notifications, active cart items, payout
  details, verification document links, and archives public listings. It
  anonymizes the login identity and blocks future login while keeping records
  that may be needed for legal, accounting, payment, fraud, dispute, or support
  reasons.
- **Still required from you:** deploy the backend and frontend before entering
  the URL in Play Console, otherwise Google will open a page or app build that
  does not match the declaration.

---

## 4. Store listing assets — needs you

| Asset | Requirement |
|---|---|
| App icon | 512×512 PNG — generated from `assets/branding/app_icon.png` (the real GE mark). The stock Flutter logo has been replaced. |
| Feature graphic | 1024×500 PNG/JPG |
| Phone screenshots | 2–8, min 320px shortest side |
| Short description | ≤ 80 chars |
| Full description | ≤ 4000 chars |
| Privacy policy URL | Mandatory — the app handles location and photos |

---

## 5. Items to decide before the first upload

- **`applicationId` is `com.globoexpats.globoexpats_mobile`** — the Flutter
  template's doubled name. It is **permanent** once uploaded and appears in the
  Play URL. `com.globoexpats.app` would be cleaner. Change it now or never.
- **`version:`** in `pubspec.yaml` — currently `1.0.10+13`, live on Play. Bump
  `+N` (versionCode) on every upload; Play rejects a reused versionCode.
- **Release keystore vs Play App Signing** — enrol in Play App Signing so a lost
  upload key is recoverable.
- **Content rating questionnaire**, target audience, and data-deletion questions
  must all be completed in Play Console.

---

## 6. Known gaps that are not Play blockers but affect first impressions

- The app has never been run against the production backend from a release
  build; all verification to date is unit/widget tests plus the analyzer.
- **Google Sign-In depends on Google Cloud OAuth clients matching the signing
  certificate *and* living in the same project as the server client id.** It
  took the Play build down on 2026-09-11. It is fixed, and the fix is verified
  on the **Play-signed** build itself (2026-09-12, `versionCode` 13) — see §6a.
  Any future change of signing key or of `GOOGLE_SERVER_CLIENT_ID` breaks it
  again, with no test to catch it.
- The release build must pass the same `GOOGLE_SERVER_CLIENT_ID` as the web
  OAuth client id that the backend verifies. If this is blank, the mobile
  "Continue with Google" button is hidden; if the Android package/signing
  fingerprint is missing in Google Cloud, the button fails with
  `DEVELOPER_ERROR`.

---

## 6a. Google Sign-In: the signing certificates that must be registered

**Status: RESOLVED and confirmed on the shipped Play build** — 2026-09-12,
`versionCode` 13 / `1.0.10`, installed from Play (`installerPackageName=
com.android.vending`), sign-in completed. The cause was *not* a missing
fingerprint — every certificate was registered. It was a **client id taken from
the wrong Google project**, described below. Two earlier revisions of this
section were wrong (one claimed a same-day fix, one named the wrong project);
both are corrected here, and the rule that prevents a repeat is at the
end.

**Symptom.** Tapping **Continue with Google** fails with `ApiException: 10`
(`DEVELOPER_ERROR`), surfaced in-app by `googleFailureMessage` in
`lib/auth/google_sign_in_service.dart`. Both timings were observed on the same
broken build: sometimes the error appears immediately with no picker,
sometimes the picker opens and the error lands after an account is chosen.
**The picker opening proves nothing** — see the note at the end of this
section.

**Cause.** An Android OAuth client is identified by the pair *package name +
signing-certificate fingerprint*. At sign-in, Google looks in the project that
owns the server client id for an Android client matching the **calling app's**
package and cert. Three different certificates have signed builds of this app:

| Signer | SHA-1 | Android OAuth client |
|---|---|---|
| Debug key (`flutter run`; all builds before 2026-09-09) | `09:35:AE:1D:97:B8:C9:D1:8B:D6:BB:32:C1:71:D6:7A:EC:6B:CE:D9` | registered; owning project not re-verified |
| Upload key (`globoexpats-upload.jks`, alias `upload`) | `68:19:65:79:45:83:1A:39:68:0C:58:23:7C:5F:31:4E:15:0F:7A:47` | registered 2026-09-11 |
| Play app signing key (whatever reaches users) | `10:4E:4D:E9:53:42:D5:7E:1A:5C:24:21:F3:D4:F9:14:01:31:D5:9A` | created 2026-09-10 in project **`1065229089387`**; **confirmed working** on the Play-signed build, 2026-09-12 |

Two signing-key changes happened in that window, each silently. Until 2026-09-09
no keystore was configured, so `build.gradle`'s `canSignRelease ? release : debug`
fallback signed every APK — including `--release` ones — with the debug key,
which *is* registered. Adding the upload keystore moved release builds to an
unregistered cert, and enrolling in Play App Signing then moved the shipped build
to a third. Those were resolved on 2026-09-10 by registering both fingerprints.

**That was not the whole story, and it was not what broke the 2026-09-11 build.**
Every fingerprint was registered by then and sign-in still failed — because the
client id had been switched to one from a different Google project.

### The real cause of the 2026-09-11 regression: web client and Android client in different projects

Registering the right fingerprint is only half of it. Google looks up the
Android client **in the project that owns the server client id**, so a Web
client id from a different project than the Android client fails with the same
`ApiException: 10`.

The number before the dash in a Google OAuth client id **is** the project
number — the same value as `project_number` in `google-services.json`. Three
projects are in play:

| Project number | Name | What lives there |
|---|---|---|
| `1065229089387` | GLOBO EXPATS | the Android client for this package (including the Play signing SHA-1) and the prod/dev **Web** clients |
| `103435409408` | backend's project | the Web client the backend is configured with (`GOOGLE_CLIENT_ID`) |
| `622048715530` | globoexpats-mobile | Firebase / FCM only — no OAuth clients at all |

**What the working Play builds did.** Every bundle that reached Play on
2026-09-09/10 (`versionCode` 2–6) was built with:

```
GOOGLE_SERVER_CLIENT_ID=1065229089387-jpctpokqmp0ol0f3bdg9jlrddsdu6heq.apps.googleusercontent.com
```

— the **dev Web client of the GLOBO EXPATS project**, i.e. the *same* project
as the Android client carrying the Play SHA-1. Sign-in worked on those builds
because the two matched.

**Current release configuration.** Google tokens are audience-bound, so the
release file now stores two explicit values and the build script selects one
from the requested flavour:

```text
GOOGLE_SERVER_CLIENT_ID_DEV=1065229089387-jpctpokqmp0ol0f3bdg9jlrddsdu6heq.apps.googleusercontent.com
GOOGLE_SERVER_CLIENT_ID_PROD=1065229089387-uqeoc6bneaoh0rru9m5h3hl35bs30rko.apps.googleusercontent.com
```

`tool/build_release.sh dev` pairs the DEV audience with
`apidev.globoexpats.com`; `tool/build_release.sh prod` pairs the PROD audience
with `api.globoexpats.com`. The selected audience is printed before the build.

**The fix, and the proof.** `.env.release` was set back to the GLOBO EXPATS dev
Web client and verified in **two stages**, because the two carry different
certificates:

*Stage 1 — upload key (sideload).* A release APK was cut, signed with the
**upload** key, and installed on the Pixel 6 Pro (the Play build had to be
uninstalled first — it carries a different signature). Sign-in completed and the
Account page showed the signed-in user with the app's own "Signed in with
Google." confirmation.

*Stage 2 — Play app signing key (what users actually get).* The corrected
`.aab` was uploaded as `versionCode` 13 / `1.0.10`, installed **from Play**
(`installerPackageName=com.android.vending`), and sign-in completed there too.
This is the stage that matters: Play strips the upload signature and re-signs
with its own key, so stage 1 exercised a *different* OAuth client and could not
have proven this one.

In both stages the confirmation is reachable only via
`AuthStore.signInWithGoogle` → `ApiClient.signInWithGoogleIdToken` →
`_setSession`, so it proves **both** legs at once:

1. Google minted an ID token — an Android client for this package, matching the
   certificate that signed the installed build (upload key, then Play key),
   exists in project `1065229089387`.
2. The backend accepted the token — the deployed dev backend's `GOOGLE_CLIENT_ID`
   is that same Web client, so the audience check in `GoogleIdTokenVerifier`
   passed.

Step 2 is the part that used to be guesswork: **the app's server client id and
the backend's `GOOGLE_CLIENT_ID` must be the same client id.**

### The rule that prevents a repeat

**The selected `GOOGLE_SERVER_CLIENT_ID` must be the Web client for the same
environment and project as the app's Android OAuth client — `1065229089387`
(GLOBO EXPATS).** DEV uses `jpct...`; PROD uses `uqe...`.

Do **not** substitute the `GOOGLE_CLIENT_ID` value found in
`GloboExpats_Backend/.env` (`103435409408-…`). It looks like the right value, it
is the client id the backend source references, and it is from a different
project with no Android client for this package — so it fails with
`DEVELOPER_ERROR` before any token is minted. That substitution is exactly what
broke the 2026-09-11 build, and it is worth restating because both values read as
"the Google client id for this app" and nothing in either file distinguishes
them.

`.env.release` carries this rule as a comment, with the dev and prod values
side by side. The generic `GOOGLE_SERVER_CLIENT_ID` remains only as a legacy
fallback for older private environment files.

Google also enforces that a package name + SHA-1 pair may back **one** OAuth
client across all projects — if a client needs to move, delete it from the old
project first.

**A new signing key means this breaks again.** There is no automatic check and
no test that catches it — only tapping the button. Re-read this section before
shipping after any change of key.

**Registering the upload key alone does not cover the Play build.** Play strips
the upload signature and re-signs with its own app signing key, so the cert on
the device never exists locally — read it from Play Console →
**Test and release → Setup → App signing**, do not derive it from a device.

**How to register.** Google Cloud console → project **`1065229089387`
(GLOBO EXPATS)** → Credentials → Create credentials → OAuth client ID →
**Android** (not Web), package `com.globoexpats.globoexpats_mobile`, fingerprint
in the **SHA-1** field. Add SHA-256 as well; Google surfaces it now and it saves
a second trip. Allow a few minutes to propagate before concluding it failed.

Get the local fingerprints with:

```bash
keytool -list -v -keystore globoexpats-upload.jks -alias upload
```

**A fix is not confirmed by the picker.** An earlier revision of this section
claimed that seeing `AccountPickerActivity` in `adb shell dumpsys window | grep
mCurrentFocus` proved Google had accepted the certificate. **It does not.** The
picker opens *before* Google mints the ID token, and the token is where the
package / certificate / project check happens — so the picker can open on a
build that goes on to fail with `ApiException: 10` once an account is chosen.
This false positive is what produced the retracted "fixed" claim above.

The only confirmation is a completed sign-in. To see the raw error, build a
**debug** APK and run it on the device: the exception is written to logcat in
debug builds and gated out of release builds by `kDebugMode`.

**Firebase is not the authority here.** The app uses Firebase only for FCM
(`firebase_messaging`); there is no `firebase_auth` dependency. The shipped APK
carries

```
google_app_id = 1:622048715530:android:567d0c0e77aad6cf6490f3
```

and **no `default_web_client_id`** — `google-services.json` has zero
`oauth_client` entries and zero `certificate_hash` entries, so the Firebase
project holds no Google Sign-In configuration at all and cannot be the thing
that mints or rejects this token. The rejection comes from the OAuth client /
server client id split described above.

Consolidating is still worth doing: FCM in one project and OAuth in another is
the shape that produced this bug, and Google's own `DEVELOPER_ERROR` guidance
is to confirm the OAuth client belongs to the same underlying project as
everything else.

---

## 6b. Release checklist for Google Sign-In

Run this before **every** upload. No test in this repo covers it — the analyzer
is clean and 508 tests pass on a build whose sign-in is broken, which is exactly
how 2026-09-11 shipped. The only check is a completed sign-in.

1. The flavour-specific ID is a **Web** client from project `1065229089387`
   (GLOBO EXPATS): `GOOGLE_SERVER_CLIENT_ID_DEV=jpct...` for dev and
   `GOOGLE_SERVER_CLIENT_ID_PROD=uqe...` for production. Do not use the Android
   client ID or the historical `103435409408-…` Web client.
2. The certificate that will sign **the build users install** is registered as
   an **Android** OAuth client in that same project. For a Play upload that is
   the *Play app signing* key, which is not the upload key and does not exist
   locally — read it from Play Console → Test and release → Setup → App signing.
3. The backend that build talks to verifies that same client id: its
   `GOOGLE_CLIENT_ID` must equal the app's `GOOGLE_SERVER_CLIENT_ID`, or
   `GoogleIdTokenVerifier`'s audience check rejects a perfectly good token.
   Step 2 alone is not enough; both legs are required.
4. After the upload is live, install **from Play** and complete a sign-in.
   A sideloaded APK carries the upload key's certificate, so it exercises a
   different OAuth client and says nothing about the Play build.

If sign-in fails, the evidence is in the raw platform exception, which is gated
out of release builds by `kDebugMode` — reproduce with a **debug** build and
read logcat.

---

## 7. Verified in this pass

A signed release bundle was built end-to-end with a throwaway key (since
deleted, never in the repo) to prove the pipeline actually works:

```
√ Built build\app\outputs\bundle\release\app-release.aab (27.6MB)
META-INF/VERIFY.RSA          <- signed
```

Also confirmed:
- Building with **no** keystore fails at `bundleRelease` with the explicit
  refusal message, so a debug-signed AAB cannot be produced by accident.
- R8 needed Play Core keep rules (`FlutterPlayStoreSplitApplication`
  references a Play Core class that is absent without dynamic features) —
  added, build clean.
- `ndkVersion` pinned to `27.0.12077973`; several plugins asked for it and
  Gradle warned on every build until it was set.
- Launcher icon is now the real GE mark at all five densities plus an adaptive
  icon on brand navy. It was the **stock Flutter logo** before this pass.
- 508 tests pass, `flutter analyze` clean at the project's 6-info baseline.

### The bundle currently on Play

`versionCode` 13 / `versionName` 1.0.10, built 2026-09-12, live.

| | |
|---|---|
| Path | `build/app/outputs/bundle/release/app-release.aab` |
| Size | 30.8 MB |
| SHA-256 | `32FDB267960B348F0F1FE59D35ACD90C7E59428FA0C61D899918BECE5343DBB1` |
| Signed by | upload key — `META-INF/UPLOAD.RSA`, SHA-1 `68:19:65:79:…` |
| Re-signed by Play | Play app signing key, SHA-1 `10:4E:4D:E9:…` |
| Backend | **dev** — `apidev.globoexpats.com` |

Verified inside the bundle's `base/lib/arm64-v8a/libapp.so`: the client id is
`1065229089387-jpctpokq…`, the Maps key is present, and the API base is
`apidev.globoexpats.com`. (`apksigner verify` prints nothing on an `.aab` — a
bundle is JAR-signed, not APK-signed, so read the cert with
`keytool -printcert -jarfile app-release.aab`.)

**Note the backend.** This is a dev-targeted build, shipped deliberately so that
what reaches users matches what was verified on the device. A production bundle
needs `API_BASE_URL=https://api.globoexpats.com` plus the prod Web client
`1065229089387-uqeoc6bneaoh0rru9m5h3hl35bs30rko…` (both sit commented, side by
side, in `.env.release`) — **and** a production backend whose `GOOGLE_CLIENT_ID`
is that same prod client id. That pairing is unverified; check the deployed prod
backend before cutting a production bundle.

## 8. Smaller notes

- `AppConfig.analyticsBaseUrl` defaults to `http://localhost:8084`. Analytics
  failures are swallowed by design (cards render blank), so a store build
  degrades gracefully — but the default is a dev address and cleartext HTTP is
  blocked at API 28+. Pass a real HTTPS `--dart-define=ANALYTICS_BASE_URL=…`
  for release, or accept that admin analytics cards stay blank.
- Google sign-in's raw platform exception is no longer written to logcat in
  release builds (`kDebugMode` gated).
- `GOOGLE_PLACES_API_KEY` is **optional** — `GeocodingService` falls back to
  `googleMapsApiKey` — and the bundle on Play omits it. That is safe today: the
  Maps key shipped in `versionCode` 13 does authenticate the Places API (New)
  REST endpoints despite its "Android-app-restricted" label in `.env.release`
  (checked 2026-09-12 — autocomplete returned 200 with suggestions, from a
  client with no app signature). It matters if that key is ever *actually*
  restricted to the Android app: the REST calls would start returning 403, and
  `geocoding_service.dart` swallows every non-200 into an empty result, so
  search-as-you-type would silently find nothing with no error shown. Pass a
  dedicated API-restricted `--dart-define=GOOGLE_PLACES_API_KEY=…` **before**
  applying that restriction.
