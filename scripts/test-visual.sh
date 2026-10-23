#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
docker build --platform linux/amd64 -f e2e/Dockerfile.visual -t sigil-visual:local .
mkdir -p e2e/visual.spec.ts-snapshots test-results/visual playwright-report/visual

# Baselines are read-only unless the caller explicitly requests an update.
snapshot_mode=ro
for arg in "$@"; do
  case "$arg" in
    --update-snapshots|--update-snapshots=*) snapshot_mode=rw ;;
  esac
done

docker run --rm --init --platform linux/amd64 --shm-size=1g \
  -v "$PWD/e2e/visual.spec.ts-snapshots:/work/e2e/visual.spec.ts-snapshots:$snapshot_mode" \
  -v "$PWD/test-results/visual:/work/test-results/visual" \
  -v "$PWD/playwright-report/visual:/work/playwright-report/visual" \
  sigil-visual:local "$@"
