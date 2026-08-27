/**
 * The maps the server actually has, from RCON `maps *`.
 *
 * The panel used to show a hardcoded 13-entry array imported from
 * `lib/api/mock.ts` — mock data serving the real adapter, and wrong in both
 * directions: it listed maps a server might not have, and hid ten it did.
 *
 * `maps *` answers with everything in the search path, which is far more than
 * playable maps. Filtering is exclusion-based rather than an allowlist of
 * `de_`/`cs_` prefixes, so a community map installed by hand still shows up.
 */

/** Not maps: engine scenes and menu fixtures that sit at the top level. */
const NOT_MAPS = new Set([
  "error",
  "graphics_settings",
  "lobby_mapveto",
]);

/**
 * Decides whether one `maps *` entry is something you could host.
 *
 * Every exclusion below was observed in the real listing from a live CS2
 * server; nothing here is speculative.
 */
export function isPlayableMapName(raw: string): boolean {
  const name = raw.trim();
  if (name === "") return false;

  // `prefabs/…`, `ui/…`, `templates/…`, `editor/…` — everything nested is a
  // scene fragment, not a map.
  if (name.includes("/")) return false;

  // `de_mirage_vanity`, `warehouse_vanity` — main-menu backdrops.
  if (name.endsWith("_vanity")) return false;

  // `workshop_preview_dust2` — the Workshop item preview scenes.
  if (name.startsWith("workshop_preview_")) return false;

  if (NOT_MAPS.has(name)) return false;

  return /^[a-z0-9_]+$/i.test(name);
}

/** Playable map names from a `maps *` reply, de-duplicated and sorted. */
export function parseMapList(text: string): string[] {
  const names = new Set<string>();
  for (const line of text.split("\n")) {
    const name = line.trim();
    if (isPlayableMapName(name)) names.add(name);
  }
  return [...names].sort();
}

/**
 * Display names for the maps whose pretty form is not derivable.
 *
 * Everything else is prettified from the internal name, so a map added in a
 * future CS2 update shows up with a reasonable label instead of being missing.
 */
const KNOWN_NAMES: Record<string, string> = {
  de_dust2: "Dust II",
  cs_italy: "Italy",
  cs_office: "Office",
  cs_shelter: "Shelter",
  ar_baggage: "Baggage",
  ar_shoots: "Shoots",
  ar_shoots_night: "Shoots (Night)",
  ar_pool_day: "Pool Day",
  de_ancient_night: "Ancient (Night)",
  de_eldorado: "El Dorado",
};

export function mapDisplayName(name: string): string {
  const known = KNOWN_NAMES[name];
  if (known) return known;

  return name
    // Drop the gamemode prefix: de_, cs_, ar_, dz_, gd_, aim_, …
    .replace(/^[a-z]{2,6}_/i, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
