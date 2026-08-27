import type { GameMode } from "@/lib/api/types";

/**
 * How many players each game mode actually wants.
 *
 * CS2 has two separate numbers and conflating them is the usual confusion:
 *
 *  - **The ceiling** is `-maxplayers` on the launch line (`CS2_MAXPLAYERS`).
 *    The engine allocates its slots from this at boot, so no cvar moves it and
 *    the panel cannot change it at any price. Set it to the largest roster the
 *    server will ever host, once.
 *  - **The advertised count** is `sv_visiblemaxplayers`, which is what the
 *    server browser shows and what "server full" is measured against. It IS a
 *    cvar, so it can change per game mode, live, over RCON.
 *
 * A 32-player server is therefore a high ceiling plus a per-mode advertised
 * count — not a single number. Running deathmatch at 16 out of a 32 ceiling is
 * normal and correct; the other 16 slots simply are not offered.
 */
export const MODE_SLOTS: Record<GameMode, number> = {
  competitive: 10,
  wingman: 4,
  casual: 20,
  deathmatch: 16,
  practice: 10,
  // Whatever the operator is doing, we do not know better than they do.
  custom: 0,
};

/**
 * The advertised slot count to suggest for a mode, given the boot-time ceiling.
 *
 * Clamped, because suggesting 20 on a 10-slot server advertises capacity that
 * does not exist — players connect, get refused, and blame the server. `custom`
 * returns null: it means "the operator is doing something bespoke", and
 * overwriting their number would be exactly wrong.
 *
 * `ceiling` is `ServerStatus.maxPlayers`, which is already the human capacity
 * (GOTV's slot subtracted). `null` there means Docker is unreachable and the
 * real ceiling is unknown — suggest the mode's natural size rather than
 * pretending to know better.
 */
export function suggestedSlots(
  mode: GameMode,
  ceiling: number | null,
): number | null {
  const want = MODE_SLOTS[mode];
  if (!want) return null;
  if (ceiling == null) return want;
  return Math.max(1, Math.min(want, ceiling));
}
