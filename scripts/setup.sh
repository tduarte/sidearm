#!/usr/bin/env bash
# Writes a .env you can actually boot with.
#
# Three of the required values are secrets that have to be different on every
# install, and asking people to run `openssl rand` three times is how you end up
# with servers sharing an RCON password. This generates them.
#
#   ./scripts/setup.sh
#
# Safe to re-run: an existing .env is never overwritten without asking, and
# values already set in it are kept.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env"
say() { printf '%s\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn(){ printf '  \033[33m!\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Preflight. Each of these is a failure that otherwise shows up much later, as
# a container that will not start or a 40 GB download onto a full disk.
# ---------------------------------------------------------------------------
say "Checking prerequisites"

if ! command -v docker >/dev/null 2>&1; then
  warn "docker not found — install Docker Engine first: https://docs.docker.com/engine/install/"
  exit 1
fi
ok "docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"

if ! docker compose version >/dev/null 2>&1; then
  warn "the 'docker compose' plugin is missing (v1 'docker-compose' will not work)"
  exit 1
fi
ok "docker compose"

if ! docker info >/dev/null 2>&1; then
  warn "cannot talk to the Docker daemon — is it running, and is your user in the docker group?"
  exit 1
fi

# The CS2 dedicated server is x86-64 only. On arm64 the container starts and
# then fails in ways that look like anything but the real cause.
arch="$(uname -m)"
if [ "$arch" != "x86_64" ] && [ "$arch" != "amd64" ]; then
  warn "this machine is $arch; the CS2 dedicated server is x86-64 only and will not run here"
  exit 1
fi
ok "x86-64"

# Docker's own storage driver, not the host filesystem: `vfs` means every layer
# is a full copy, which turns a build into tens of minutes and fills the disk.
driver="$(docker info --format '{{.Driver}}' 2>/dev/null || echo unknown)"
case "$driver" in
  overlay2|overlayfs) ok "storage driver: $driver" ;;
  *) warn "storage driver is '$driver' — expected overlay2. Builds will be very slow and use far more disk." ;;
esac

# The game files are ~70 GB and land in Docker's data root, which is often on a
# different filesystem from this checkout.
data_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
avail_kb="$(df -Pk "$data_root" 2>/dev/null | awk 'NR==2 {print $4}' || echo 0)"
avail_gb=$(( avail_kb / 1024 / 1024 ))
if [ "$avail_gb" -lt 90 ]; then
  warn "only ${avail_gb} GB free on $data_root — CS2 needs about 70 GB, plus room to update"
else
  ok "${avail_gb} GB free on $data_root"
fi

# ---------------------------------------------------------------------------
# Secrets.
# ---------------------------------------------------------------------------
random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    # Every Linux has this; openssl is not guaranteed.
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# Reads a value out of an existing .env, so re-running keeps what is there.
existing() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^$1=\(.*\)$/\1/p" "$ENV_FILE" | head -1
}

say
if [ -f "$ENV_FILE" ]; then
  say "$ENV_FILE already exists. Values already set in it are kept; only blanks are filled."
  printf 'Continue? [y/N] '
  read -r reply
  case "$reply" in y|Y) ;; *) say "Nothing changed."; exit 0 ;; esac
  cp "$ENV_FILE" "$ENV_FILE.bak"
  ok "backed up to $ENV_FILE.bak"
fi

RCON_PASSWORD="$(existing RCON_PASSWORD)"
LOG_INGEST_SECRET="$(existing LOG_INGEST_SECRET)"
PANEL_ADMIN_TOKEN="$(existing PANEL_ADMIN_TOKEN)"
GSLT="$(existing GSLT)"
SERVER_NAME="$(existing SERVER_NAME)"
CS2_MAXPLAYERS="$(existing CS2_MAXPLAYERS)"

[ -n "$RCON_PASSWORD" ]     || RCON_PASSWORD="$(random_hex)"
[ -n "$LOG_INGEST_SECRET" ] || LOG_INGEST_SECRET="$(random_hex)"

say
say "A few questions. Press enter to take the default."
say

printf 'Server name in the browser [%s]: ' "${SERVER_NAME:-sidearm}"
read -r reply; SERVER_NAME="${reply:-${SERVER_NAME:-sidearm}}"

say
say "A GSLT lets the server appear on the internet and run VAC-secure."
say "Get one at https://steamcommunity.com/dev/managegameservers (app id 730)."
say "Leave blank for LAN-only play."
printf 'GSLT [%s]: ' "${GSLT:-none}"
read -r reply; GSLT="${reply:-$GSLT}"

say
say "Slot ceiling. GOTV takes one, so budget an extra: 11 fits a 5v5, 33 fits 32"
say "players. It is a launch argument, so changing it later needs a container"
say "recreate — set it to the largest roster you will ever want."
printf 'CS2_MAXPLAYERS [%s]: ' "${CS2_MAXPLAYERS:-11}"
read -r reply; CS2_MAXPLAYERS="${reply:-${CS2_MAXPLAYERS:-11}}"

say
say "The panel has no login by default, which is fine on a trusted LAN."
say "A token requires it on every request; the UI asks once and remembers."
printf 'Require a token to open the panel? [y/N] '
read -r reply
case "$reply" in
  y|Y) [ -n "$PANEL_ADMIN_TOKEN" ] || PANEL_ADMIN_TOKEN="$(random_hex)" ;;
  *)   PANEL_ADMIN_TOKEN="" ;;
esac

# ---------------------------------------------------------------------------
# Write it.
# ---------------------------------------------------------------------------
# Built from .env.example so every comment and every optional variable stays,
# rather than writing a stripped file that loses the documentation.
if [ ! -f .env.example ]; then
  warn ".env.example is missing; run this from a checkout of the repository"
  exit 1
fi

set_var() {
  # Replaces `NAME=` (with or without a value) in place, keeping the comments
  # above it. `|` as the delimiter so values containing `/` are fine.
  local name="$1" value="$2"
  python3 - "$name" "$value" <<'PY'
import re, sys, pathlib
name, value = sys.argv[1], sys.argv[2]
p = pathlib.Path(".env")
text = p.read_text()
pattern = re.compile(rf"^{re.escape(name)}=.*$", re.M)
if pattern.search(text):
    text = pattern.sub(f"{name}={value}", text, count=1)
else:
    text = text.rstrip("\n") + f"\n{name}={value}\n"
p.write_text(text)
PY
}

cp .env.example "$ENV_FILE"
set_var RCON_PASSWORD     "$RCON_PASSWORD"
set_var LOG_INGEST_SECRET "$LOG_INGEST_SECRET"
set_var PANEL_ADMIN_TOKEN "$PANEL_ADMIN_TOKEN"
set_var GSLT              "$GSLT"
set_var SERVER_NAME       "$SERVER_NAME"
set_var CS2_MAXPLAYERS    "$CS2_MAXPLAYERS"
chmod 600 "$ENV_FILE"

say
ok "wrote $ENV_FILE (chmod 600 — it holds your RCON password)"
[ -n "$GSLT" ] || warn "no GSLT: the server will be LAN-only and VAC-insecure"

say
say "Next:"
say "  docker compose up -d          # builds the CS2 image, then starts everything"
say "  docker compose logs -f cs2    # ~70 GB of game files download on first boot"
say
say "The panel is at http://localhost:3000 straight away — the CS2 tile stays"
say "'starting' until the download finishes, which is normal and takes a while."
if [ -n "$PANEL_ADMIN_TOKEN" ]; then
  say
  say "Panel token (also in $ENV_FILE):"
  say "  $PANEL_ADMIN_TOKEN"
fi
say
say "To play over the internet, forward these to this machine:"
say "  27015/udp   game traffic"
say "  27020/udp   GOTV"
say "Leave RCON (27015/tcp) closed — it is not published outside the compose network."
