#!/usr/bin/env bash
# build_demo_reel_v2.sh — assemble the campaign-end demonstration reel (AU-009).
# Chapters map to major flows; missing clips are skipped with a warning so the reel
# can be rebuilt as later units land. Output: docs/demo/globoexpats-demo.mp4 + manifest.
set -uo pipefail
REPO="$HOME/GloboExpats_Mobile"
FFMPEG="${FFMPEG:-$HOME/bin/ffmpeg}"
OUT="$REPO/docs/demo"
TMP=$(mktemp -d)
mkdir -p "$OUT"

pick() { # first existing video for a unit pattern
  ls "$REPO"/e2e/videos/$1 2>/dev/null | head -1
}
chapter() { # label|pattern|fallback-pattern...
  local label="$1"; shift
  for pat in "$@"; do
    local f; f=$(pick "$pat")
    if [ -n "$f" ]; then echo "$label|$f"; return; fi
  done
  echo "$label|MISSING"
}

CHAPTERS=$(cat <<EOC
$(chapter "01-guest-discovery" "AU-044-r9*.webm" "AU-000.webm")
$(chapter "02-buyer-purchase-payment" "AU-030-r9*.webm" "AU-029-mobile.webm")
$(chapter "03-selling-end-to-end" "AU-041-r9*.webm" "AU-040*.webm")
$(chapter "04-seller-management" "AU-054-r9*.webm" "AU-054*.webm")
$(chapter "05-requests" "AU-056-r10*.webm" "AU-056*.webm")
$(chapter "06-delivery-handoff" "AU-039-r9*.webm" "AU-039*.webm")
$(chapter "07-insights" "AU-063*.webm" "AU-064*.webm" "AU-035*.webm")
$(chapter "08-admin-escrow" "AU-042-r9*.webm" "AU-043*.webm" "AU-042*.webm")
$(chapter "09-bugs-found-and-fixed" "AU-055-r9*.webm" "AU-047*.webm")
EOC
)

echo "$CHAPTERS" | tee "$OUT/chapters.txt"
echo

CONCAT="$TMP/list.txt"
: > "$CONCAT"
n=0
while IFS='|' read -r label clip; do
  if [ "$clip" = "MISSING" ] || [ ! -f "$clip" ]; then
    echo "WARN: no clip for $label — skipped" >&2
    continue
  fi
  n=$((n+1))
  seg="$TMP/seg_$n.mp4"
  echo "Normalizing $label <- $clip"
  "$FFMPEG" -nostdin -loglevel error -i "$clip" -vf "scale=720:-2,fps=15" \
    -c:v libx264 -preset veryfast -crf 28 -an -y "$seg" || { echo "WARN: normalize failed for $clip" >&2; continue; }
  printf "file '%s'\n" "$seg" >> "$CONCAT"
done <<< "$CHAPTERS"

if [ ! -s "$CONCAT" ]; then echo "ERROR: no segments built" >&2; exit 1; fi
"$FFMPEG" -nostdin -loglevel error -f concat -safe 0 -i "$CONCAT" -c copy -y "$OUT/globoexpats-demo.mp4"
ls -la "$OUT/globoexpats-demo.mp4"
echo "Reel written. Segments used: $(grep -c file "$CONCAT")"
rm -rf "$TMP"
