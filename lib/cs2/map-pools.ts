/**
 * Valve's Active Duty pool — the seven maps a normal competitive veto runs on.
 *
 * This is a **dated snapshot, not a derivation**. Nothing the server reports
 * says which maps are in the pool: `maps *` lists everything installed, which
 * includes Office, Baggage and a decade of leftovers. Valve rotates Active
 * Duty every few major updates, so this array is the one place to correct when
 * it moves, and the UI prints `ACTIVE_DUTY_AS_OF` beside the preset — a pool
 * that has gone stale should be visible rather than quietly wrong.
 *
 * The preset only *fills* the picker. Every map stays togglable afterwards, so
 * being one map out of date costs a tap, not a broken match.
 */
export const ACTIVE_DUTY_AS_OF = "Premier Season 5 (July 2026)";

export const ACTIVE_DUTY = [
  "de_ancient",
  "de_anubis",
  "de_cache",
  "de_dust2",
  "de_inferno",
  "de_mirage",
  "de_nuke",
] as const;

/**
 * The Active Duty maps this server actually has, and the ones it does not.
 *
 * Split rather than silently filtered: a server missing `de_train` because it
 * has not taken a CS2 update produces a six-map pool, and the operator needs
 * to know that before the veto rather than during it.
 */
export function activeDutyPool(available: string[]): {
  present: string[];
  missing: string[];
} {
  const have = new Set(available);
  const present: string[] = [];
  const missing: string[] = [];
  for (const map of ACTIVE_DUTY) {
    if (have.has(map)) present.push(map);
    else missing.push(map);
  }
  return { present, missing };
}

/**
 * The Reserve pool: official maps in competitive rotation but out of Active
 * Duty. Same dated-snapshot caveat as {@link ACTIVE_DUTY}.
 *
 * Train and Overpass are here because they were *displaced* from Active Duty
 * (Train in 2025, Overpass by Cache in July 2026) and are the two most likely
 * to be picked deliberately for a scrim. Valve also lists community maps —
 * Warden, Stronghold, Alpine — in the reserve rotation; they are not included
 * because they are subscriptions whose installed names vary per server, and
 * naming one a server does not have would be a preset that silently picks
 * nothing.
 */
export const RESERVE = [
  "de_overpass",
  "de_train",
  "de_vertigo",
  "cs_office",
  "cs_italy",
] as const;

/**
 * Groups an installed map list the way someone picking a competitive pool
 * thinks about it.
 *
 * `maps *` reports everything in the search path as one flat, alphabetical
 * list, so a real server puts `lake test`, `Pool Day 3d Skybox` and an
 * arms-race map between Inferno and Mirage. Every entry also comes back typed
 * `official`, so the API's own `type` cannot separate them — this can.
 *
 * Order within each group is the pool's own order, not alphabetical, because
 * it is the order MatchZy plays when the veto is skipped.
 */
export function groupMapsForPool(
  entries: { name: string; type: "official" | "workshop" }[],
): {
  activeDuty: string[];
  reserve: string[];
  other: string[];
  workshop: string[];
} {
  const byName = new Map(entries.map((e) => [e.name, e]));
  const activeDuty = ACTIVE_DUTY.filter((m) => byName.has(m));
  const reserve = RESERVE.filter((m) => byName.has(m));
  const claimed = new Set<string>([...activeDuty, ...reserve]);

  const other: string[] = [];
  const workshop: string[] = [];
  for (const e of entries) {
    if (claimed.has(e.name)) continue;
    (e.type === "workshop" ? workshop : other).push(e.name);
  }
  return { activeDuty, reserve, other, workshop };
}
