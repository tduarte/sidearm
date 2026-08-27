#!/bin/bash
# SIDEARM_PLUGIN_HOOK — installs Metamod, CounterStrikeSharp and MatchZy.
#
# Runs from the base image's `pre.sh` hook, which `entry.sh` sources AFTER
# steamcmd has finished and BEFORE the server starts. That timing is the whole
# point: a CS2 update rewrites `gameinfo.gi`, so the Metamod search path has to
# be re-applied on the far side of the update, every boot, unattended.
#
# It cannot live in a Docker layer: `cs2-data` is mounted over the game
# directory, and Docker only seeds a named volume from the image when the volume
# is empty. The image carries the pinned artifacts; this puts them in place.
#
# Sourced, not executed — so it must never call `exit`, and must not enable
# `set -e`, or a failure here takes the whole server down with it. A server
# running without plugins is bad; a server that will not boot is worse.

SIDEARM_SRC="${SIDEARM_SRC:-/opt/sidearm/plugins}"
SIDEARM_CSGO="${STEAMAPPDIR:-/home/steam/cs2-dedicated}/game/csgo"
SIDEARM_STAMP="${SIDEARM_CSGO}/addons/.sidearm-plugins"

sidearm_log() { echo "[sidearm] $*"; }

# Adds Metamod's search path to gameinfo.gi.
#
# Idempotent, and re-run on every boot on purpose: CS2 updates replace this file
# and silently disable every plugin. That failure is invisible from outside —
# the server starts, accepts players, and simply has no MatchZy.
#
# awk rather than sed because **the shipped file is CRLF**. Verified against a
# live server: every line ends `\r\n`, so a `$` anchor in sed never matches
# `Game\tcsgo` and the patch silently does nothing. Each line's own terminator
# is stripped, matched against, and put back, so a future LF-only build works
# too and the rest of the file is untouched byte for byte.
sidearm_patch_gameinfo() {
  local gameinfo="${SIDEARM_CSGO}/gameinfo.gi"
  local tmp="${gameinfo}.sidearm-tmp"

  if [[ ! -f "${gameinfo}" ]]; then
    sidearm_log "gameinfo.gi not found at ${gameinfo}; skipping"
    return 1
  fi

  if grep -qF 'csgo/addons/metamod' "${gameinfo}"; then
    return 0
  fi

  # Inserted above the FIRST bare `Game csgo` inside SearchPaths, which is where
  # Metamod's own CS2 instructions put it. `Game csgo_imported` and
  # `Game_LowViolence` do not match: the first fails the end anchor, the second
  # has no whitespace after `Game`.
  if ! awk '
    {
      line = $0
      cr = ""
      if (substr(line, length(line), 1) == "\r") {
        cr = "\r"
        line = substr(line, 1, length(line) - 1)
      }
      if (!done && line ~ /^[ \t]*Game[ \t]+csgo$/) {
        indent = line
        sub(/Game.*/, "", indent)
        printf "%sGame\tcsgo/addons/metamod%s\n", indent, cr
        done = 1
      }
      printf "%s%s\n", line, cr
    }
    END { exit !done }
  ' "${gameinfo}" > "${tmp}"; then
    sidearm_log "WARNING: no 'Game csgo' line in gameinfo.gi — plugins will not load"
    rm -f "${tmp}"
    return 1
  fi

  # `cat >` rather than `mv`, to keep the original file's ownership and mode —
  # this runs as steam over a file steamcmd owns.
  if cat "${tmp}" > "${gameinfo}" && grep -qF 'csgo/addons/metamod' "${gameinfo}"; then
    rm -f "${tmp}"
    sidearm_log "re-applied the Metamod search path to gameinfo.gi"
    return 0
  fi

  rm -f "${tmp}"
  sidearm_log "WARNING: could not patch gameinfo.gi — plugins will not load"
  return 1
}

# Copies the addons and cfg trees in.
#
# Skipped when the stamp matches, because this is ~165 MB (CounterStrikeSharp
# bundles a .NET runtime) and runs on every boot.
#
# `cp -r` merges into an existing tree rather than nesting, so addons are
# overwritten in place -- they are ours to own. `cp -rn` for cfg, so a server
# owner's edits to MatchZy's live.cfg survive an image upgrade while genuinely
# new config files still arrive.
sidearm_install_addons() {
  local want
  want="$(cat "${SIDEARM_SRC}/.version" 2>/dev/null || echo unknown)"

  if [[ -f "${SIDEARM_STAMP}" ]] && [[ "$(cat "${SIDEARM_STAMP}")" == "${want}" ]]; then
    return 0
  fi

  sidearm_log "installing plugins (${want})"
  mkdir -p "${SIDEARM_CSGO}"

  if ! cp -r "${SIDEARM_SRC}/addons" "${SIDEARM_CSGO}/"; then
    sidearm_log "WARNING: failed to copy addons"
    return 1
  fi

  # Config defaults only; never clobber a config the owner has edited.
  if [[ -d "${SIDEARM_SRC}/cfg" ]]; then
    cp -rn "${SIDEARM_SRC}/cfg" "${SIDEARM_CSGO}/" 2>/dev/null || true
  fi

  echo "${want}" > "${SIDEARM_STAMP}"
  sidearm_log "plugins installed"
  return 0
}

sidearm_install_addons || sidearm_log "plugin install incomplete; continuing boot"
sidearm_patch_gameinfo || sidearm_log "gameinfo patch incomplete; continuing boot"
