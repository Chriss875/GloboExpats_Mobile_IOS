#!/usr/bin/env bash
# freeze_verify_bundle.sh — snapshot the current build/web into an immutable verify bundle
# and serve it on port ${PORT:-9103}. Verifiers test THIS; builders keep iterating on :9100.
# Usage: e2e/freeze_verify_bundle.sh <git-sha>
set -euo pipefail
SHA="${1:?usage: freeze_verify_bundle.sh <git-sha>}"
REPO="$HOME/GloboExpats_Mobile"
BUNDLE_ROOT="$HOME/.verify_bundles"
DEST="$BUNDLE_ROOT/$SHA"
PORT="${PORT:-9103}"

cd "$REPO"
mkdir -p "$BUNDLE_ROOT"
rm -rf "$DEST.tmp"
cp -r build/web "$DEST.tmp"
mv "$DEST.tmp" "$DEST"

# stop any previous server on this port
pkill -f "http.server $PORT" 2>/dev/null || true
sleep 1
nohup python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$DEST" \
  > "/tmp/spa$PORT.log" 2>&1 &
sleep 1
LM=$(curl -sI "http://localhost:$PORT/main.dart.js" | grep -i last-modified || true)
echo "FROZEN BUNDLE sha=$SHA port=$PORT $LM"
echo "$SHA" > "/tmp/verify_bundle_sha_$PORT.txt"
