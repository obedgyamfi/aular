#!/usr/bin/env bash
# Build the Go backend as a Tauri sidecar.
#
# Tauri resolves external binaries by target triple — the file MUST be named
# aular-core-<triple> or the bundler fails with "resource path doesn't exist".
#
#   scripts/build-sidecar.sh            # free shell backend (engine.Noop)
#   AULAR_ENGINE=../aular-engine \
#     scripts/build-sidecar.sh          # licensed backend (org engine)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO/apps/desktop/src-tauri/binaries"
TRIPLE="$(rustc -vV | awk '/^host:/{print $2}')"

mkdir -p "$OUT"

if [ -n "${AULAR_ENGINE:-}" ]; then
  echo "==> building licensed backend from $AULAR_ENGINE"
  (cd "$AULAR_ENGINE" && go build -o "$OUT/aular-core-$TRIPLE" ./cmd/aular-pro)
else
  echo "==> building free shell backend"
  (cd "$REPO/core" && go build -o "$OUT/aular-core-$TRIPLE" ./cmd/aular-core)
fi

echo "==> $OUT/aular-core-$TRIPLE"
