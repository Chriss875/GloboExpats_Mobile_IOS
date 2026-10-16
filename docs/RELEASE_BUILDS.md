# The two Android builds

One app, one bundle id, one Play listing. The two builds differ in two ways:
which backend they talk to (and therefore whether in-progress experiments are
on), and which Matomo instance they report analytics to — dev and live
analytics must never mix.

| | dev | prod |
|---|---|---|
| Backend | `https://apidev.globoexpats.com` | `https://api.globoexpats.com` |
| Matomo | `matomodev.globoexpats.com` · site 2 | `matomo.globoexpats.com` · site 2 |
| App screen domain | `app-dev.globoexpats.com` | `app.globoexpats.com` |
| Experiments (`AppConfig.isDevBuild`) | on | off |
| Play track | Internal testing | Open testing / Production |
| applicationId | `com.globoexpats.globoexpats_mobile` | same |

```bash
tool/build_release.sh dev                    # internal testing
tool/build_release.sh prod                   # the live track
tool/build_release.sh dev apk                # sideloadable APK
tool/build_release.sh prod appbundle --bump  # bump the build number first
```

Each build leaves a named copy next to the generic one —
`build/app/outputs/bundle/release/app-dev-15.aab` — because both write to the
same `app-release.aab` path and an unlabelled artifact is how the wrong
backend reaches the wrong track.

## Versions

Internal testing and Open testing are **tracks of one listing**, so a version
code can be used exactly once across both. Play only tells you it is a
duplicate after you have waited through the upload, so the script checks
`RELEASED_BUILDS.md` first and refuses to reuse one.

- move the number with `--bump`, never by hand-editing `pubspec.yaml`;
- a build for internal testing normally carries a *higher* code than what is
  live, since it is the newer thing.

## Build inputs

Everything the app needs at build time lives in `.env.release` (gitignored) —
see `.env.release.example` for the full key list and copy it as a starting
point. Required: `ANALYTICS_BASE_URL_DEV`, `ANALYTICS_BASE_URL_PROD`, `GOOGLE_SERVER_CLIENT_ID_DEV`,
`GOOGLE_SERVER_CLIENT_ID_PROD`, `GOOGLE_MAPS_API_KEY`, plus the per-flavour
`MATOMO_URL_*` / `MATOMO_SITE_ID_*` / `MATOMO_TOKEN_*`. `GOOGLE_PLACES_API_KEY`
is optional. The script selects the matching Google Web OAuth client for the
requested flavour and **refuses to build** if it is missing. A production app
built with the dev client can reach the live API, but Google login will fail
because ID tokens are audience-bound.

Two deliberate details:

- the file's own `API_BASE_URL` is **ignored**. It is one value, and honouring
  it would point both builds at the same backend — precisely what dev/prod
  exists to prevent. The flavour decides, unless you export `API_BASE_URL`
  yourself as an explicit override.
- `GOOGLE_SERVER_CLIENT_ID_DEV` is used only with `apidev`; the production
  build uses `GOOGLE_SERVER_CLIENT_ID_PROD` with `api.globoexpats.com`. The
  selected ID is printed before Flutter starts so the audience is explicit.
  A prod build that resolves to the dev audience is refused: an env file from
  before the split holds the dev value under the plain `GOOGLE_SERVER_CLIENT_ID`
  name, and the resulting bundle reaches the live backend but has every
  sign-in rejected — a failure invisible in the artifact.
- `MATOMO_URL`, `MATOMO_SITE_ID` and `MATOMO_TOKEN` are per-flavour the same
  way: `*_PROD` goes with `prod`, `*_DEV` with `dev` (unsuffixed values are a
  legacy fallback). Dev reports into the **dev** Matomo (`matomodev`, site 2)
  and prod into the **live** Matomo (`matomo`, site 2) — two separate
  instances, so the two apps' analytics cannot mix. A prod build that resolves
  to the dev Matomo URL is refused, mirroring the Google-audience guard.
- `GOOGLE_MAPS_API_KEY` is read twice by design: as a dart-define, and from
  the environment by `build.gradle` for the native manifest placeholder.

The selected `ANALYTICS_BASE_URL_*` must be `https://` — Android blocks cleartext from API 28,
so an `http://` endpoint is a silently dead one, and the script rejects it.

## Device support

Play works out which devices an app may install on from the manifest, and
reports a drop as "this release no longer supports N devices" *after* the
upload. Two things narrow it here:

- **`minSdk = 23`** — pinned by Firebase: `firebase_core` and
  `firebase_messaging` both publish `minSdkVersion 23`, every other plugin
  asks for 21 or less. Android 5.x can only come back by dropping push.
- **implied hardware features** — Play turns `ACCESS_FINE_LOCATION` into a
  *required* `android.hardware.location.gps` and `ACCESS_COARSE_LOCATION`
  into a required `android.hardware.location.network` unless the manifest
  says otherwise, which hides the app from every device without them. All
  three location features are therefore declared `required="false"`:
  location is only the "use my current location" shortcut in the address
  picker, and search / tapping the map work without it.
  `test/play_device_filter_test.dart` fails if that slips.

`glEsVersion 2.0` comes in from the Maps SDK as required and is left alone —
Maps genuinely needs it, and no device on API 23+ lacks it.

## Signing

Both builds use the same upload key (`android/key.properties`, gitignored —
see `key.properties.example`). A release bundle refuses to build with debug
keys rather than producing an artifact Play will reject on upload.

## `isDevBuild`

Gates the Matomo screen-view host: dev builds report screens under
`https://app-dev.globoexpats.com`, prod under `https://app.globoexpats.com`
(`matomo_tracker.dart`). Neither hostname needs to resolve — the app posts
hits straight to `matomo.php` — the "domains" are just labels that keep the
two apps visually distinct inside their respective Matomo instances. Add
anything else gated here, with why it is not in the live track yet.
