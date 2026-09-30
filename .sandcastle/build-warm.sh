#!/usr/bin/env bash
# Builds (or reuses) the warm sandcastle image.
# Fingerprinted by package-lock.json + .beads/issues.jsonl — only rebuilds
# when project deps or issue data change.
#
# Usage:
#   IMAGE=$(bash .sandcastle/build-warm.sh)
#   docker run "$IMAGE" ...

set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

# ── Resolve base image name ───────────────────────────────────
BASE_IMAGE=$(npx -q sandcastle docker image-name 2>/dev/null) && : || BASE_IMAGE=""
# Validate: a docker image name is lowercase alnum with colons/hyphens/dots — reject error text
if ! echo "$BASE_IMAGE" | grep -qE '^[a-z0-9][a-z0-9._:/-]*$'; then
  BASE_IMAGE="sandcastle:shelf-proving-ground"
fi

# ── Fingerprint: hash the inputs that affect the warm layer ───
HASH=$(cat package-lock.json .beads/issues.jsonl 2>/dev/null | shasum -a 256 | cut -c1-12)
IMAGE="sandcastle:warm-${HASH}"

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "$IMAGE"
  exit 0
fi

echo "building warm image: $IMAGE (base: $BASE_IMAGE)" >&2
docker build \
  -t "$IMAGE" \
  -f .sandcastle/Dockerfile.warm \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  .

echo "$IMAGE"
