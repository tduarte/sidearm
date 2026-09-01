/**
 * The veto, held in the panel instead of in chat.
 *
 * MatchZy can run its own veto, but only in its own chat flow: captains type
 * `.ban`/`.pick` in-game while everyone else watches a scrolling console. That
 * works and it is also the part of the evening that most often goes wrong —
 * someone bans out of turn, someone bans a map already banned, and the only
 * record of what happened is chat history.
 *
 * Doing it here instead means the panel hands MatchZy a finished, ordered map
 * list with `skip_veto`. The plugin then plays exactly those maps in exactly
 * that order, which is the same outcome with one authority instead of two.
 *
 * The sequence generalises the standard one rather than hardcoding it:
 *
 *   1. Ban down to `numMaps * 2 - 1` maps, or to `numMaps` when the pool is
 *      too small for that.
 *   2. Pick `numMaps - 1` maps, alternating.
 *   3. Ban down to one.
 *   4. Whatever survives is the decider.
 *
 * Out of the usual seven that reproduces the conventional sequences exactly:
 * BO1 is six bans, BO3 is ban ban pick pick ban ban, BO5 is ban ban then four
 * picks. It also stays coherent for a five-map pool or one with a workshop map
 * in it, which is where a hardcoded table would simply be wrong.
 */

import type { Side } from "./draft";

export type { Side };

export interface VetoAction {
  kind: "ban" | "pick";
  side: Side;
}

/** One decision, in the order it was made. */
export interface VetoStep {
  map: string;
  kind: "ban" | "pick";
  side: Side;
}

export interface VetoState {
  /** The full pool, in the order it was picked. Never mutated by a veto. */
  pool: string[];
  numMaps: number;
  /** Which captain acts first. */
  firstSide: Side;
  steps: VetoStep[];
}

export function startVeto(
  pool: string[],
  numMaps: number,
  firstSide: Side = "team1",
): VetoState {
  return { pool, numMaps, firstSide, steps: [] };
}

const other = (s: Side): Side => (s === "team1" ? "team2" : "team1");

/**
 * The whole sequence, up front.
 *
 * Returned as a list rather than computed one step at a time so the UI can show
 * what is coming — "you ban, they ban, you pick" — which is the thing captains
 * ask about and the thing chat-based vetoes never tell them.
 */
export function vetoSequence(
  poolSize: number,
  numMaps: number,
  firstSide: Side = "team1",
): VetoAction[] {
  const actions: VetoAction[] = [];
  if (poolSize <= numMaps) return actions;

  let side = firstSide;
  const push = (kind: "ban" | "pick") => {
    actions.push({ kind, side });
    side = other(side);
  };

  /*
   * Phase 1 bans down to `2 * numMaps - 1` — enough maps left that the picks
   * still leave two candidates for a final ban phase to decide between. A pool
   * too small for that (a best-of-five out of seven, the common case) instead
   * bans down to exactly the series length, and the picks then order maps that
   * are all going to be played anyway. That second branch is not a fallback:
   * it *is* the conventional best-of-five sequence.
   */
  let left = poolSize;
  const beforePicks = poolSize >= numMaps * 2 - 1 ? numMaps * 2 - 1 : numMaps;
  while (left > beforePicks) {
    push("ban");
    left--;
  }
  // Phase 2: the maps that will actually be played, bar the last one.
  for (let i = 0; i < numMaps - 1 && left > 1; i++) {
    push("pick");
    left--;
  }
  // Phase 3: ban the rest away; whatever survives is the decider.
  while (left > 1) {
    push("ban");
    left--;
  }
  return actions;
}

/** What has to happen next, or `null` when the veto is finished. */
export function nextAction(state: VetoState): VetoAction | null {
  const seq = vetoSequence(state.pool.length, state.numMaps, state.firstSide);
  return seq[state.steps.length] ?? null;
}

/** Maps nobody has banned or picked yet, in pool order. */
export function remainingMaps(state: VetoState): string[] {
  const used = new Set(state.steps.map((s) => s.map));
  return state.pool.filter((m) => !used.has(m));
}

export function actOn(state: VetoState, map: string): VetoState {
  const action = nextAction(state);
  if (!action) return state;
  if (!remainingMaps(state).includes(map)) return state;
  return { ...state, steps: [...state.steps, { map, ...action }] };
}

export function undoVeto(state: VetoState): VetoState {
  if (state.steps.length === 0) return state;
  return { ...state, steps: state.steps.slice(0, -1) };
}

export function vetoComplete(state: VetoState): boolean {
  return nextAction(state) === null;
}

/**
 * The map list to hand MatchZy, or `null` while the veto is unfinished.
 *
 * Order is load-bearing — with `skip_veto` the plugin plays the list top to
 * bottom — so it is picks in the order they were made, then the survivor as
 * the decider. Getting this backwards would silently play map three first.
 */
export function vetoResult(state: VetoState): string[] | null {
  if (!vetoComplete(state)) return null;
  const picked = state.steps.filter((s) => s.kind === "pick").map((s) => s.map);
  return [...picked, ...remainingMaps(state)].slice(0, state.numMaps);
}
