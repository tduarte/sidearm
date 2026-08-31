#!/bin/bash
# Rewrites the base image's steamcmd retry so a failed update repairs the
# install instead of throwing it away.
#
# Upstream's retry deletes the appmanifest before every attempt:
#
#     echo "Removing steamapps (appmanifest data)..."
#     rm -rf "${STEAMAPPDIR}/steamapps"
#
# and `STEAMAPPVALIDATE` defaults to 0, so `VALIDATE` is empty. Together those
# are the worst possible pair: steamcmd loses its record of what is installed
# *and* is given no way to check the ~70 GB already on disk, so it treats the
# install as absent and downloads all of it again. Observed doing exactly that
# on 2026-08-30 — a routine patch became a three-hour outage.
#
# So retry with `validate` first, which checksums what is there and refetches
# only the parts that are wrong. The wipe is kept for the final attempt: it was
# added upstream for a real failure (HTTP 401 from SteamPipe on stale manifest
# data) and this must not remove that escape hatch.
#
# Run at build time, from the Dockerfile. Asserts before it edits: if upstream
# reworks this block the build fails rather than quietly shipping an image that
# lost the fix.
set -euo pipefail

ENTRY="${1:?usage: patch-entry-retry.sh /path/to/entry.sh}"

WIPE='rm -rf "${STEAMAPPDIR}/steamapps"'
NOTE='echo "Removing steamapps (appmanifest data)..."'

for needle in "${WIPE}" "${NOTE}" 'MAX_ATTEMPTS=' 'VALIDATE'; do
  if ! grep -qF -- "${needle}" "${ENTRY}"; then
    echo "patch-entry-retry: ${ENTRY} has no '${needle}'; upstream retry logic changed" >&2
    exit 1
  fi
done

# The two lines are replaced as a unit, so the "Removing steamapps" message is
# only printed on the attempt that actually removes them.
awk '
  index($0, "echo \"Removing steamapps (appmanifest data)...\"") { next }
  index($0, "rm -rf \"${STEAMAPPDIR}/steamapps\"") {
    print "        # sidearm: repair before discarding — see docker/cs2/Dockerfile"
    print "        if [[ ${attempt} -lt ${MAX_ATTEMPTS} ]]; then"
    print "            echo \"[sidearm] retry ${attempt}: validating the existing install\""
    print "            VALIDATE=\"validate\""
    print "        else"
    print "            echo \"Removing steamapps (appmanifest data)...\""
    print "            rm -rf \"${STEAMAPPDIR}/steamapps\""
    print "        fi"
    patched = 1
    next
  }
  { print }
  END { if (!patched) exit 1 }
' "${ENTRY}" > "${ENTRY}.sidearm"

# Only now replace the original, so a failed awk leaves the image buildable but
# visibly unpatched rather than truncating entry.sh.
mv "${ENTRY}.sidearm" "${ENTRY}"

# The rewritten file has to be valid bash and has to still contain both paths.
bash -n "${ENTRY}"
grep -qF 'VALIDATE="validate"' "${ENTRY}"
grep -qF -- "${WIPE}" "${ENTRY}"

echo "[sidearm] patched steamcmd retry in ${ENTRY}"
