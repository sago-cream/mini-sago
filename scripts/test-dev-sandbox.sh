#!/bin/sh
set -eu
# The runtime stage pins the same Codex and Bun versions as production. No login,
# model call, GitHub access, or production mount is used by this smoke test.
docker build --target runtime -f Dockerfile.worker -t minisago-dev-runtime:test .
docker run --rm --init --user bun --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  --mount "type=bind,src=$PWD/worker/src,dst=/source/worker/src,readonly" \
  --entrypoint bun minisago-dev-runtime:test /source/worker/src/test-fixtures/dev-sandbox-smoke.ts
