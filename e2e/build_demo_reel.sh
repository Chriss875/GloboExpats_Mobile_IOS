#!/usr/bin/env bash
# build_demo_reel.sh — assemble the campaign-end demonstration reel (AU-009 deliverable).
#
# Concatenates per-unit verification recordings into docs/demo/globoexpats-demo.mp4
# with a chapter manifest. Per-unit clips are normalized to 375x667@15fps and capped
# at 20MB each (disk rule); raw webm captures stay in e2e/videos/ until the reel is
# verified, then get pruned by the orchestrator.
#
# Usage: e2e/build_demo_reel.sh            # assemble from clips listed in the manifest
set -euo pipefail

REPO="$HOME/GloboExpats_Mobile"
FFMPEG="${FFMPEG:-$HOME/bin/ffmpeg}"
OUT="$REPO/docs/demo"
mkdir -p "$OUT"

# chapter = label|clip path (relative to repo). Order == narrative order.
CHAPTERS=$(cat <<'EOF'
01-guest-discovery|e2e/videos/AU-000.webm
02-buyer-purchase-payment|PLACEHOLDER-AU-029..033
03-selling-end-to-end|PLACEHOLDER-AU-040..041
04-seller-management|PLACEHOLDER-AU-054..055
05-requests|PLACEHOLDER-AU-056
06-delivery|PLACEHOLDER-AU-039
07-insights|PLACEHOLDER-AU-063
08-admin-escrow|PLACEHOLDER-AU-042..043
09-bugs-found-and-fixed|PLACEHOLDER-fixes
EOF
)

echo "Chapter plan:"
echo "$CHAPTERS"
echo
echo "NOTE: PLACEHOLDER chapters resolve as units complete; re-run to rebuild."
echo "Ready clips are normalized with: $FFMPEG -i <clip> -vf scale=720:-2,fps=15 -c:v libx264 ..."
