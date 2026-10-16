#!/usr/bin/env bash
# Build a shippable Android artifact.
#
#   tool/build_release.sh dev      -> apidev.globoexpats.com, experiments ON
#                                     (upload to the Internal testing track)
#   tool/build_release.sh prod     -> api.globoexpats.com,    experiments OFF
#                                     (upload to Open testing / Production)
#
#   tool/build_release.sh prod apk           sideloadable APK instead of an AAB
#   tool/build_release.sh dev appbundle --bump   bump the build number first
#
# ONE app, one bundle id, one Play listing. dev and prod differ only in which
# backend they talk to (and therefore whether in-progress experiments are on).
# Internal testing and Open testing are TRACKS of that single listing, so the
# same `com.globoexpats.globoexpats_mobile` serves both — no second Firebase
# app, no second listing, no second upload key.
#
# Build inputs come from .env.release (gitignored). A release build REFUSES to
# run without them rather than quietly shipping an app with no analytics, no
# map tiles and no native Google sign-in — the failure is invisible in the
# artifact and only shows up on a tester's phone.
set -euo pipefail

cd "$(dirname "$0")/.."

FLAVOR="${1:-}"
ARTIFACT="${2:-appbundle}"
BUMP="${3:-}"
LEDGER="docs/RELEASED_BUILDS.md"
ENV_FILE="${ENV_FILE:-.env.release}"

if [[ "$FLAVOR" != "dev" && "$FLAVOR" != "prod" ]]; then
  echo "usage: $0 <dev|prod> [appbundle|apk] [--bump]" >&2
  exit 2
fi

# An API_BASE_URL exported by the caller is an intentional override and wins;
# the one inside the env file must NOT, because it is a single value and would
# silently point both builds at the same backend — exactly what the dev/prod
# split exists to prevent.
CALLER_API="${API_BASE_URL:-}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
  echo "==> loaded $ENV_FILE"
else
  echo "error: $ENV_FILE not found." >&2
  echo "It holds the build inputs (analytics URL, Google client id, Maps key)." >&2
  echo "Ask the lead for it, or set ENV_FILE=… to point somewhere else." >&2
  exit 1
fi

if [[ -n "$CALLER_API" ]]; then
  API_BASE_URL="$CALLER_API"
elif [[ "$FLAVOR" == "prod" ]]; then
  API_BASE_URL="https://api.globoexpats.com"
else
  API_BASE_URL="https://apidev.globoexpats.com"
fi

# Google ID tokens are audience-bound. Dev and production use different Web
# OAuth clients, so selecting only the backend URL is not enough: a prod app
# built with the dev audience reaches the live endpoint but is rejected as an
# invalid token. Keep the legacy single value as a fallback for older private
# env files, while preferring the explicit per-environment values.
if [[ "$FLAVOR" == "prod" ]]; then
  if [[ -z "${GOOGLE_SERVER_CLIENT_ID_PROD:-}" && -n "${GOOGLE_SERVER_CLIENT_ID:-}" ]]; then
    # An env file predating the split holds the DEV audience under the generic
    # name, so this fallback is exactly how a prod bundle ends up rejecting
    # every Google sign-in. Say so loudly rather than building it silently.
    echo "warning: GOOGLE_SERVER_CLIENT_ID_PROD is unset — falling back to the" >&2
    echo "         legacy GOOGLE_SERVER_CLIENT_ID. If that is the dev audience," >&2
    echo "         this bundle's Google sign-in will fail against api.globoexpats.com." >&2
  fi
  GOOGLE_SERVER_CLIENT_ID="${GOOGLE_SERVER_CLIENT_ID_PROD:-${GOOGLE_SERVER_CLIENT_ID:-}}"
  if [[ -n "${GOOGLE_SERVER_CLIENT_ID_DEV:-}" && "$GOOGLE_SERVER_CLIENT_ID" == "$GOOGLE_SERVER_CLIENT_ID_DEV" ]]; then
    echo "error: prod build resolved to the DEV google audience." >&2
    echo "       Set GOOGLE_SERVER_CLIENT_ID_PROD in $ENV_FILE — see PLAY_STORE.md 6a." >&2
    exit 1
  fi
else
  GOOGLE_SERVER_CLIENT_ID="${GOOGLE_SERVER_CLIENT_ID_DEV:-${GOOGLE_SERVER_CLIENT_ID:-}}"
fi

# A separate web-service key. For iOS, restrict it to the registered bundle
# and to Places API (New), Geocoding API, and Routes API; the app supplies the
# required bundle-identifier request header.
# Documented to fall back to the Maps key for a team with a single key.
: "${GOOGLE_PLACES_API_KEY:=${GOOGLE_MAPS_API_KEY:-}}"
# Matomo is per-environment, for the same reason API_BASE_URL is: the dev app
# must report into the dev Matomo and the live app into the live one, and a
# single MATOMO_URL/MATOMO_SITE_ID pair would silently point both builds at the
# same instance. Site ids differ too (dev website=1/app=2 on the dev instance;
# live website=1/app=2 on the live instance), and each instance has its OWN
# token, so a mismatched pair reports into the wrong place or not at all.
if [[ "$FLAVOR" == "prod" ]]; then
  if [[ -z "${MATOMO_URL_PROD:-}" && -n "${MATOMO_URL:-}" ]]; then
    echo "warning: MATOMO_URL_PROD is unset — falling back to the legacy" >&2
    echo "         MATOMO_URL. If that points at the dev instance, this build" >&2
    echo "         reports live traffic into dev analytics." >&2
  fi
  MATOMO_URL="${MATOMO_URL_PROD:-${MATOMO_URL:-}}"
  MATOMO_SITE_ID="${MATOMO_SITE_ID_PROD:-${MATOMO_SITE_ID:-}}"
  MATOMO_TOKEN="${MATOMO_TOKEN_PROD:-${MATOMO_TOKEN:-}}"
  if [[ -n "${MATOMO_URL_DEV:-}" && "$MATOMO_URL" == "$MATOMO_URL_DEV" ]]; then
    echo "error: prod build resolved to the DEV Matomo URL." >&2
    echo "       Set MATOMO_URL_PROD in $ENV_FILE." >&2
    exit 1
  fi
else
  MATOMO_URL="${MATOMO_URL_DEV:-${MATOMO_URL:-}}"
  MATOMO_SITE_ID="${MATOMO_SITE_ID_DEV:-${MATOMO_SITE_ID:-}}"
  MATOMO_TOKEN="${MATOMO_TOKEN_DEV:-${MATOMO_TOKEN:-}}"
fi

# Each flavour tracks into its own Matomo (dev → matomodev, prod → live).
# A build whose Matomo is not configured tracks nothing rather than fall back
# to the app's built-in default (the DEV instance). Switch a dev build off
# for a one-off with MATOMO_TRACKING_DEV=false. (Only the tracker stops —
# screens that READ Matomo stats still use the URL/token above.)
if [[ -z "$MATOMO_URL" ]]; then
  MATOMO_TRACKING=false
elif [[ "$FLAVOR" == "dev" ]]; then
  MATOMO_TRACKING="${MATOMO_TRACKING_DEV:-true}"
else
  MATOMO_TRACKING=true
fi

missing=()
[[ -n "${ANALYTICS_BASE_URL:-}" ]]      || missing+=("ANALYTICS_BASE_URL")
[[ -n "${GOOGLE_SERVER_CLIENT_ID:-}" ]] || missing+=("GOOGLE_SERVER_CLIENT_ID_${FLAVOR^^}")
[[ -n "${GOOGLE_MAPS_API_KEY:-}" ]]     || missing+=("GOOGLE_MAPS_API_KEY")
if (( ${#missing[@]} )); then
  echo "error: missing build inputs: ${missing[*]}" >&2
  echo "Add them to $ENV_FILE. Shipping without them means no analytics," >&2
  echo "no map tiles and no native Google sign-in, with nothing in the" >&2
  echo "artifact to show it." >&2
  exit 1
fi

# Android blocks cleartext from API 28, so an http:// analytics endpoint is a
# silently dead one.
if [[ "$ANALYTICS_BASE_URL" != https://* ]]; then
  echo "error: ANALYTICS_BASE_URL must be https:// — cleartext is blocked on" >&2
  echo "       Android 9+, so analytics would fail silently." >&2
  exit 1
fi

# build.gradle reads this from the ENVIRONMENT for the manifest placeholder
# (the Maps SDK needs it natively); it is ALSO passed as a dart-define below,
# which is the deliberate double-read PLAY_STORE.md describes.
export GOOGLE_MAPS_API_KEY

# build.gradle reads these for the App Links intent filter: the website whose
# links this build opens. Prod opens the live site, dev the dev site, so a
# tester's dev build never swallows a live link.
if [[ "$FLAVOR" == "prod" ]]; then
  export WEB_LINK_HOST=www.globoexpats.com WEB_LINK_HOST_ALT=globoexpats.com
else
  export WEB_LINK_HOST=dev.globoexpats.com WEB_LINK_HOST_ALT=dev.globoexpats.com
fi

read_version() { sed -n 's/^version: *//p' pubspec.yaml | head -1; }

if [[ "$BUMP" == "--bump" ]]; then
  current="$(read_version)"
  name="${current%%+*}"
  code="${current##*+}"
  sed -i "s/^version: .*/version: ${name}+$((code + 1))/" pubspec.yaml
  echo "==> version ${current} -> ${name}+$((code + 1))"
fi

VERSION="$(read_version)"
VERSION_NAME="${VERSION%%+*}"
VERSION_CODE="${VERSION##*+}"

# Play rejects a reused version code only AFTER you have waited through the
# upload, so catch it here instead.
if [[ -f "$LEDGER" ]] && grep -q "| ${VERSION_CODE} |" "$LEDGER"; then
  echo "error: version code ${VERSION_CODE} has already been built:" >&2
  grep "| ${VERSION_CODE} |" "$LEDGER" >&2
  echo "Both tracks share one listing, so every upload needs its own code." >&2
  echo "Re-run with --bump." >&2
  exit 1
fi

echo "==> $ARTIFACT | $FLAVOR | version $VERSION_NAME (code $VERSION_CODE)"
echo "==> api=$API_BASE_URL"
echo "==> analytics=$ANALYTICS_BASE_URL"
echo "==> google auth audience=$GOOGLE_SERVER_CLIENT_ID ($FLAVOR)"
# Property rentals (minimum stays, Short Stays dates, photo groups) need the
# backend from 2026-10-09. On unless .env.release turns a track off with
# PROPERTY_RENTALS_DEV / PROPERTY_RENTALS_PROD=false (an older backend refuses
# listings that carry the new rental fields).
if [[ "$FLAVOR" == "prod" ]]; then
  PROPERTY_RENTALS="${PROPERTY_RENTALS_PROD:-true}"
else
  PROPERTY_RENTALS="${PROPERTY_RENTALS_DEV:-true}"
fi
echo "==> app links: https://$WEB_LINK_HOST ($FLAVOR)"
echo "==> property rentals: $PROPERTY_RENTALS ($FLAVOR)"
echo "==> maps/places keys: present"
if [[ "$MATOMO_TRACKING" != "true" ]]; then
  echo "==> matomo tracking: OFF ($FLAVOR build)"
elif [[ -n "$MATOMO_URL" ]]; then
  echo "==> matomo=$MATOMO_URL site=$MATOMO_SITE_ID ($FLAVOR)"
else
  echo "==> matomo: not configured — this build reports no app analytics"
fi
[[ -n "$MATOMO_TOKEN" ]] && echo "==> matomo: token present" \
                        || echo "==> matomo: no token (site stats only)"

DEFINES=(
  --dart-define="APP_FLAVOR=$FLAVOR"
  --dart-define="PROPERTY_RENTALS=$PROPERTY_RENTALS"
  --dart-define="API_BASE_URL=$API_BASE_URL"
  --dart-define="ANALYTICS_BASE_URL=$ANALYTICS_BASE_URL"
  --dart-define="GOOGLE_SERVER_CLIENT_ID=$GOOGLE_SERVER_CLIENT_ID"
  --dart-define="GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY"
  --dart-define="GOOGLE_PLACES_API_KEY=$GOOGLE_PLACES_API_KEY"
  --dart-define="MATOMO_TRACKING=$MATOMO_TRACKING"
)
[[ -n "$MATOMO_URL" ]]     && DEFINES+=(--dart-define="MATOMO_URL=$MATOMO_URL")
[[ -n "$MATOMO_SITE_ID" ]] && DEFINES+=(--dart-define="MATOMO_SITE_ID=$MATOMO_SITE_ID")
[[ -n "$MATOMO_TOKEN" ]]   && DEFINES+=(--dart-define="MATOMO_TOKEN=$MATOMO_TOKEN")

flutter build "$ARTIFACT" --release "${DEFINES[@]}"

if [[ "$ARTIFACT" == "appbundle" ]]; then
  OUT="build/app/outputs/bundle/release/app-release.aab"
  KEEP="build/app/outputs/bundle/release/app-${FLAVOR}-${VERSION_CODE}.aab"
else
  OUT="build/app/outputs/flutter-apk/app-release.apk"
  KEEP="build/app/outputs/flutter-apk/app-${FLAVOR}-${VERSION_CODE}.apk"
fi
# Named copy: both builds write to the same path, and an unlabelled artifact
# is how the wrong backend reaches the wrong track.
cp "$OUT" "$KEEP"

if [[ ! -f "$LEDGER" ]]; then
  mkdir -p "$(dirname "$LEDGER")"
  cat > "$LEDGER" <<'HEADER'
# Build ledger

Every artifact `tool/build_release.sh` produces, newest last.

One bundle id serves both tracks, so a version code can be used exactly once
across the whole table. The script refuses to reuse one — move it with
`--bump`, never by hand-editing `pubspec.yaml`.

| Built (UTC) | Backend | Version | Code | Artifact |
|---|---|---|---|---|
HEADER
fi
printf '| %s | %s | %s | %s | %s |\n' \
  "$(date -u '+%Y-%m-%d %H:%M')" "$FLAVOR" "$VERSION_NAME" "$VERSION_CODE" \
  "$KEEP" >> "$LEDGER"

echo "==> $KEEP"
echo "==> recorded in $LEDGER"
