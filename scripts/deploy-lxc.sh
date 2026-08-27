#!/usr/bin/env bash
# Deploy the working branch to the sidearm LXC and rebuild just the panel.
#
# The CS2 container is left running, so nothing re-downloads and no match is
# interrupted — only `panel` is recreated.
#
# Point it at your server with SIDEARM_HOST; there is deliberately no default,
# so nobody's address ends up committed here.
#
#   export SIDEARM_HOST=root@your-server
#   ./scripts/deploy-lxc.sh                    # deploy the current branch
#   ./scripts/deploy-lxc.sh some-branch        # deploy a specific branch
#   ./scripts/deploy-lxc.sh --with-cs2         # ...and rebuild CS2 too
set -euo pipefail

WITH_CS2=0
BRANCH=""
for arg in "$@"; do
  case "$arg" in
    --with-cs2) WITH_CS2=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) BRANCH="$arg" ;;
  esac
done

if [[ -z "${SIDEARM_HOST:-}" ]]; then
  echo "SIDEARM_HOST is not set (e.g. export SIDEARM_HOST=root@your-server)" >&2
  exit 2
fi
HOST="$SIDEARM_HOST"
DIR="${SIDEARM_DIR:-/opt/sidearm}"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

echo "==> pushing $BRANCH"
git push -u origin "$BRANCH"

# The CS2 image carries the pinned Metamod / CounterStrikeSharp / MatchZy
# artifacts, and rebuilding it recreates the container: every connected player is
# dropped and the map reloads. That is never something a routine panel deploy
# should do by surprise, so it is opt-in and asks first with a live headcount.
#
# `build`, not `pull`: the compose file tags this `sidearm/cs2:latest`, an
# unqualified name with no registry behind it. CI builds the same context to
# prove the plugin URLs still resolve, but deliberately never publishes it.
if [[ "$WITH_CS2" == "1" ]]; then
  # A2S_INFO to the public game port, the same packet a client sends — it
  # traverses the network exactly like a real join and needs no RCON (which is
  # unpublished) and no auth. Best-effort: if it does not answer, say so rather
  # than claiming the server is empty.
  a2s_py=$(cat <<'A2S'
import socket, sys
QUERY = b"\xff\xff\xff\xff\x54Source Engine Query\x00"
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(3)
try:
    sock.sendto(QUERY, (sys.argv[1], 27015))
    d, _ = sock.recvfrom(4096)
    # 'A' is a challenge: re-send with the four-byte token appended.
    if d[4:5] == b"A":
        sock.sendto(QUERY + d[5:9], (sys.argv[1], 27015))
        d, _ = sock.recvfrom(4096)
    i = 6  # 4 magic bytes + the 'I' header + the protocol byte
    for _ in range(4):  # name, map, folder, game — each null-terminated
        i = d.index(b"\x00", i) + 1
    i += 2  # the two-byte app id, then: players, max players, bots
    # Bots are counted as players here and nobody minds losing them, so the
    # number that decides whether this is disruptive is the difference.
    print(d[i] - d[i + 2])
except Exception:
    print("unknown")
A2S
)
  echo "==> asking cs2 how many people are connected"
  players=$(python3 -c "$a2s_py" "${HOST#*@}" 2>/dev/null || echo "unknown")
  echo "    connected players (excluding bots): $players"
  read -r -p "    rebuilding cs2 drops everyone connected and reloads the map. Continue? [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || { echo "aborted"; exit 1; }
fi

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

if [[ "$WITH_CS2" == "1" ]]; then
  echo "==> rebuilding cs2 (this recreates the container)"
  ssh "$HOST" "cd '$DIR' \
    && docker compose build cs2 \
    && docker compose up -d cs2 \
    && docker compose ps"
  echo "==> cs2 recreated; plugins install on boot, so give it a minute"
  echo "    verify with:"
  echo "      ssh $HOST 'cd $DIR && docker compose logs --tail=50 cs2 | grep sidearm'"
fi

echo "==> done — panel at http://${HOST#*@}:3000"
