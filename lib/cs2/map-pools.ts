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
