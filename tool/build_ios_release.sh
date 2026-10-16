#!/usr/bin/env bash
# Produce the iOS archive used by TestFlight/App Store Connect.
#
#   tool/build_ios_release.sh prod              signed IPA for upload
#   tool/build_ios_release.sh dev --no-codesign compile verification only
#
# Private service configuration comes from `.env.release` (gitignored). The
# script fails before compiling if an App Store build would silently ship with
# broken Maps, Google login, Firebase notifications, or analytics.
set -euo pipefail

cd "$(dirname "$0")/.."

FLAVOR="${1:-}"
SIGNING_MODE="${2:-}"
ENV_FILE="${ENV_FILE:-.env.release}"
FLUTTER_BIN="${FLUTTER_BIN:-/Users/apple/development/flutter/bin/flutter}"

if [[ "$FLAVOR" != "dev" && "$FLAVOR" != "prod" ]]; then
  echo "usage: $0 <dev|prod> [--no-codesign]" >&2
  exit 2
fi
if [[ -n "$SIGNING_MODE" && "$SIGNING_MODE" != "--no-codesign" ]]; then
  echo "error: second argument must be --no-codesign when provided" >&2
  exit 2
fi
if [[ ! -x "$FLUTTER_BIN" ]]; then
  echo "error: Flutter executable not found at $FLUTTER_BIN" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found; copy .env.release.example and fill it." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

if [[ "$FLAVOR" == "prod" ]]; then
  API_BASE_URL="https://api.globoexpats.com"
  GOOGLE_SERVER_CLIENT_ID="${GOOGLE_SERVER_CLIENT_ID_PROD:-${GOOGLE_SERVER_CLIENT_ID:-}}"
  if [[ -z "${MATOMO_URL_PROD:-}" && -n "${MATOMO_URL:-}" ]]; then
    echo "warning: MATOMO_URL_PROD is unset — falling back to the legacy MATOMO_URL." >&2
  fi
  MATOMO_URL="${MATOMO_URL_PROD:-${MATOMO_URL:-}}"
  MATOMO_SITE_ID="${MATOMO_SITE_ID_PROD:-${MATOMO_SITE_ID:-}}"
  MATOMO_TOKEN="${MATOMO_TOKEN_PROD:-${MATOMO_TOKEN:-}}"
  if [[ -n "${MATOMO_URL_DEV:-}" && "$MATOMO_URL" == "$MATOMO_URL_DEV" ]]; then
    echo "error: prod build resolved to the DEV Matomo URL." >&2
    echo "       Set MATOMO_URL_PROD in $ENV_FILE." >&2
    exit 1
  fi
  PROPERTY_RENTALS="${PROPERTY_RENTALS_PROD:-true}"
else
  API_BASE_URL="https://apidev.globoexpats.com"
  GOOGLE_SERVER_CLIENT_ID="${GOOGLE_SERVER_CLIENT_ID_DEV:-${GOOGLE_SERVER_CLIENT_ID:-}}"
  MATOMO_URL="${MATOMO_URL_DEV:-${MATOMO_URL:-}}"
  MATOMO_SITE_ID="${MATOMO_SITE_ID_DEV:-${MATOMO_SITE_ID:-}}"
  MATOMO_TOKEN="${MATOMO_TOKEN_DEV:-${MATOMO_TOKEN:-}}"
  PROPERTY_RENTALS="${PROPERTY_RENTALS_DEV:-true}"
fi

if [[ -z "$MATOMO_URL" ]]; then
  MATOMO_TRACKING=false
elif [[ "$FLAVOR" == "dev" ]]; then
  MATOMO_TRACKING="${MATOMO_TRACKING_DEV:-true}"
else
  MATOMO_TRACKING=true
fi

: "${GOOGLE_PLACES_API_KEY:=${GOOGLE_MAPS_API_KEY:-}}"

required=(
  ANALYTICS_BASE_URL
  GOOGLE_SERVER_CLIENT_ID
  GOOGLE_MAPS_API_KEY
  FIREBASE_IOS_PLIST_PATH
)
missing=()
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
if (( ${#missing[@]} )); then
  echo "error: missing iOS release inputs: ${missing[*]}" >&2
  exit 1
fi
if [[ "$ANALYTICS_BASE_URL" != https://* ]]; then
  echo "error: ANALYTICS_BASE_URL must use https://" >&2
  exit 1
fi
if [[ ! -f "$FIREBASE_IOS_PLIST_PATH" ]]; then
  echo "error: Firebase plist not found: $FIREBASE_IOS_PLIST_PATH" >&2
  exit 1
fi

PLIST_BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :BUNDLE_ID' "$FIREBASE_IOS_PLIST_PATH" 2>/dev/null || true)"
if [[ "$PLIST_BUNDLE_ID" != "com.globoexpats.marketplace" ]]; then
  echo "error: Firebase plist bundle ID is '$PLIST_BUNDLE_ID'; expected com.globoexpats.marketplace" >&2
  exit 1
fi

: "${GOOGLE_IOS_CLIENT_ID:=$(/usr/libexec/PlistBuddy -c 'Print :CLIENT_ID' "$FIREBASE_IOS_PLIST_PATH" 2>/dev/null || true)}"
: "${GOOGLE_IOS_REVERSED_CLIENT_ID:=$(/usr/libexec/PlistBuddy -c 'Print :REVERSED_CLIENT_ID' "$FIREBASE_IOS_PLIST_PATH" 2>/dev/null || true)}"
ios_oauth_missing=()
[[ -n "$GOOGLE_IOS_CLIENT_ID" ]] || ios_oauth_missing+=("CLIENT_ID")
[[ -n "$GOOGLE_IOS_REVERSED_CLIENT_ID" ]] || ios_oauth_missing+=("REVERSED_CLIENT_ID")
if (( ${#ios_oauth_missing[@]} )); then
  echo "error: Firebase plist is missing iOS OAuth values: ${ios_oauth_missing[*]}" >&2
  exit 1
fi

cp "$FIREBASE_IOS_PLIST_PATH" ios/Runner/GoogleService-Info.plist
cat > ios/Flutter/Secrets.xcconfig <<CONFIG
GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY
GOOGLE_IOS_CLIENT_ID=$GOOGLE_IOS_CLIENT_ID
GOOGLE_IOS_REVERSED_CLIENT_ID=$GOOGLE_IOS_REVERSED_CLIENT_ID
CONFIG

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
[[ -n "${MATOMO_URL:-}" ]] && DEFINES+=(--dart-define="MATOMO_URL=$MATOMO_URL")
[[ -n "${MATOMO_SITE_ID:-}" ]] && DEFINES+=(--dart-define="MATOMO_SITE_ID=$MATOMO_SITE_ID")
[[ -n "${MATOMO_TOKEN:-}" ]] && DEFINES+=(--dart-define="MATOMO_TOKEN=$MATOMO_TOKEN")

echo "==> Building GloboExpats iOS ($FLAVOR) for com.globoexpats.marketplace"
if [[ "$SIGNING_MODE" == "--no-codesign" ]]; then
  "$FLUTTER_BIN" build ios --release --no-codesign "${DEFINES[@]}"
  echo "==> Verified build/ios/iphoneos/Runner.app (unsigned)"
else
  "$FLUTTER_BIN" build ipa --release "${DEFINES[@]}"
  echo "==> Upload build/ios/ipa/*.ipa with Xcode Organizer or Transporter"
fi
