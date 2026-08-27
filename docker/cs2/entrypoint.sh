#!/bin/bash
# Puts the plugin hook in place, then hands over to the base image's entry.sh.
#
# The base image copies `/etc/pre.sh` into the game volume only when no pre.sh
# is already there, so on any existing install its stock no-op wins and ours
# would never run. This forces the question once per boot, before entry.sh gets
# to it.
set -uo pipefail

STEAMAPPDIR="${STEAMAPPDIR:-/home/steam/cs2-dedicated}"
HOOK="${STEAMAPPDIR}/pre.sh"
MARKER='SIDEARM_PLUGIN_HOOK'

install_hook() {
  mkdir -p "${STEAMAPPDIR}" || return 1

  if [[ -f "${HOOK}" ]] && ! grep -qF "${MARKER}" "${HOOK}"; then
    # Someone has written their own pre-hook. Do not overwrite it — but do not
    # pretend the plugins are installed either.
    if ! diff -q "${HOOK}" /opt/sidearm/pre.sh.stock >/dev/null 2>&1; then
      echo "[sidearm] ${HOOK} is customised and is not ours — leaving it alone."
      echo "[sidearm] Plugins will NOT be installed. To enable them, add this line:"
      echo "[sidearm]     source /opt/sidearm/install-plugins.sh"
      return 0
    fi
  fi

  cat > "${HOOK}" <<'HOOKEOF'
#!/bin/bash
# SIDEARM_PLUGIN_HOOK — managed by the sidearm CS2 image; edits will be replaced.
# Runs after steamcmd, before the server starts.
source /opt/sidearm/install-plugins.sh
HOOKEOF
  chmod +x "${HOOK}" 2>/dev/null || true
}

install_hook || echo "[sidearm] could not install the plugin hook; continuing"

exec "$@"
