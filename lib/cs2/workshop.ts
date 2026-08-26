/**
 * Workshop map identity and loading.
 *
 * `joedwards32/cs2` only wires workshop content in at boot: its entrypoint
 * turns `CS2_HOST_WORKSHOP_COLLECTION` / `CS2_HOST_WORKSHOP_MAP` into
 * `+host_workshop_collection` / `+host_workshop_map` launch arguments. Changing
 * either means recreating the container, which the panel cannot do, so at
 * runtime we drive the equivalent console commands over RCON instead.
 *
 * The one that matters is `host_workshop_map <id>`: it downloads the map when
 * the server does not already have it, then hosts it. `changelevel
 * workshop/<id>/<name>` — what the panel used to send — needs the map to be
 * installed *and* needs its real filename, and a map added through the panel
 * has neither.
 *
 * Which is also why a workshop map is identified here by id alone. Steam hands
 * out an id; the filename inside the .vpk is not knowable until the server has
 * fetched it (see `resolveWorkshopMapName` in the real adapter). Any name we
 * synthesised before then — the old code used the user-typed display name —
 * would just be a guess that fails to load.
 */

/** `workshop/<id>`, optionally with the real map filename appended. */
const WORKSHOP_PATH_RE = /^workshop\/(\d{1,20})(?:\/([A-Za-z0-9_-]+))?$/;

/** The workshop id behind a map identifier, or null for an official map. */
export function workshopIdFromMapName(name: string): string | null {
  return WORKSHOP_PATH_RE.exec(name.trim())?.[1] ?? null;
}

/**
 * The panel's identifier for a workshop map. The trailing segment is included
 * only once the real filename is known — never invented.
 */
export function workshopMapPath(workshopId: string, mapName?: string | null): string {
  return mapName ? `workshop/${workshopId}/${mapName}` : `workshop/${workshopId}`;
}

/** A map's short filename, with any `workshop/<id>/` prefix stripped. */
export function shortMapName(name: string): string {
  const trimmed = name.trim();
  return WORKSHOP_PATH_RE.exec(trimmed)?.[2] ?? trimmed;
}

/**
 * Whether two map identifiers refer to the same map.
 *
 * `status` reports the loaded map by its short filename (`de_cache`) and never
 * as a workshop path, so a stored `workshop/123/de_cache` would otherwise never
 * compare equal to the current map and the UI could not mark it as playing.
 */
export function isSameMap(a: string, b: string): boolean {
  if (a === b) return true;

  const idA = workshopIdFromMapName(a);
  const idB = workshopIdFromMapName(b);
  // Two workshop paths are the same map iff the ids match; the trailing
  // filename may be resolved on one side and not the other.
  if (idA && idB) return idA === idB;

  const shortA = shortMapName(a);
  const shortB = shortMapName(b);
  return shortA !== "" && shortA === shortB;
}
