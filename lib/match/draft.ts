/**
 * Captains picking teams, one player at a time.
 *
 * The team builder lets you drag ten names into two columns, which is the
 * right tool when you already know the teams. It is the wrong tool for the way
 * these evenings actually start: two captains, alternating picks, everyone
 * watching. Doing that by hand means remembering whose turn it is while also
 * clicking arrows, and the first thing anyone loses track of is the turn.
 *
 * So the turn is derived, never stored. `draftTurn` reads it off the team
 * sizes, which means a player moved by hand afterwards — someone had to leave,
 * someone joined late — puts the draft back on the correct side instead of
 * leaving a stale pointer behind.
 */

export type Side = "team1" | "team2";

export interface DraftState {
  /** Steam64s. Both must be set before anyone can be picked. */
  captains: { team1: string | null; team2: string | null };
  /** In pick order, which is what the UI replays. */
  picks: { id: string; side: Side }[];
}

export const emptyDraft = (): DraftState => ({
  captains: { team1: null, team2: null },
  picks: [],
});

/** Everyone on a side, captain first — the order MatchZy is handed. */
export function teamMembers(state: DraftState, side: Side): string[] {
  const captain = state.captains[side];
  return [
    ...(captain ? [captain] : []),
    ...state.picks.filter((p) => p.side === side).map((p) => p.id),
  ];
}

export function isDrafted(state: DraftState, id: string): boolean {
  return (
    state.captains.team1 === id ||
    state.captains.team2 === id ||
    state.picks.some((p) => p.id === id)
  );
}

/** Who picks next, or `null` while the captains are still being chosen. */
export function draftTurn(state: DraftState): Side | null {
  if (!state.captains.team1 || !state.captains.team2) return null;
  // Size, not a counter. A captain who leaves and is replaced, or a player
  // moved by hand afterwards, changes whose turn it fairly is — and a stored
  // counter would keep pointing at the side that is already a player up.
  return teamMembers(state, "team1").length <= teamMembers(state, "team2").length
    ? "team1"
    : "team2";
}

/**
 * Assigns a captain.
 *
 * Naming someone captain of one side when they are already on the other moves
 * them rather than cloning them: the alternative is a roster with the same
 * Steam64 twice, which `buildMatchConfig` rejects several screens later.
 */
export function setCaptain(state: DraftState, side: Side, id: string | null): DraftState {
  const captains = { ...state.captains };
  const other: Side = side === "team1" ? "team2" : "team1";
  if (id !== null && captains[other] === id) captains[other] = null;
  captains[side] = id;
  return {
    captains,
    picks: id === null ? state.picks : state.picks.filter((p) => p.id !== id),
  };
}

/** Picks a player for whoever's turn it is. A no-op before both captains exist. */
export function pickPlayer(state: DraftState, id: string): DraftState {
  const side = draftTurn(state);
  if (!side || isDrafted(state, id)) return state;
  return { ...state, picks: [...state.picks, { id, side }] };
}

/**
 * Puts a player on a named side regardless of whose turn it is.
 *
 * The manual arrows in the team builder run through here, so both ways of
 * filling a roster write to the same state. Without that there would be two
 * rosters to keep in step, and the one that lost would be the one MatchZy got.
 */
export function assignPlayer(state: DraftState, id: string, side: Side): DraftState {
  const cleared = releasePlayer(state, id);
  if (!cleared.captains[side]) return setCaptain(cleared, side, id);
  return { ...cleared, picks: [...cleared.picks, { id, side }] };
}

export function undoPick(state: DraftState): DraftState {
  if (state.picks.length === 0) return state;
  return { ...state, picks: state.picks.slice(0, -1) };
}

/** Puts one player back in the pool, wherever they are. */
export function releasePlayer(state: DraftState, id: string): DraftState {
  return {
    captains: {
      team1: state.captains.team1 === id ? null : state.captains.team1,
      team2: state.captains.team2 === id ? null : state.captains.team2,
    },
    picks: state.picks.filter((p) => p.id !== id),
  };
}

/** Connected, eligible players nobody has taken yet, in the order given. */
export function undrafted(state: DraftState, pool: string[]): string[] {
  return pool.filter((id) => !isDrafted(state, id));
}

export function draftComplete(state: DraftState, pool: string[]): boolean {
  return (
    state.captains.team1 !== null &&
    state.captains.team2 !== null &&
    undrafted(state, pool).length === 0
  );
}
