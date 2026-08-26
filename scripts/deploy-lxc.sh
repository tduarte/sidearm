#!/usr/bin/env bash
# Deploy the working branch to the sidearm LXC and rebuild just the panel.
#
# The CS2 container is left running, so nothing re-downloads and no match is
# interrupted — only `panel` is recreated.
#
#   ./scripts/deploy-lxc.sh              # deploy the current branch
#   ./scripts/deploy-lxc.sh some-branch  # deploy a specific branch
#   SIDEARM_HOST=root@10.0.0.5 ./scripts/deploy-lxc.sh
set -euo pipefail

HOST="${SIDEARM_HOST:-root@192.168.4.26}"
DIR="${SIDEARM_DIR:-/opt/sidearm}"
BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

echo "==> pushing $BRANCH"
git push -u origin "$BRANCH"

echo "==> deploying $BRANCH to $HOST:$DIR"
# Never `docker compose pull` here: `build panel` tags the local image as
# ghcr.io/tduarte/sidearm:latest, and a pull would replace it with CI's.
ssh "$HOST" "cd '$DIR' \
  && git fetch --all --prune \
  && git checkout '$BRANCH' \
  && git pull --ff-only \
  && docker compose build panel \
  && docker compose up -d panel \
  && docker compose ps"

echo "==> done — panel at http://${HOST#*@}:3000"
