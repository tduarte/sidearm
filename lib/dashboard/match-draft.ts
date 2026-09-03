import type { MatchDefinition } from "@/lib/cs2/match-config";
import type { MatchState, Player } from "@/lib/api/types";

/**
 * The second staging tier on the dashboard: a MatchZy match config, as an edit
 * to the match already on screen.
 *
 * `lib/dashboard/panel.ts` owns the first tier — cvars and the server config,
 * applied over RCON. Everything it could not express was written off as
 * impossible, including team names and rosters, and that was too narrow: those
 * are a `MatchDefinition`, saved and loaded through `/api/matches`, which is a
 * moderator route the panel has had all along.
 *
 * The organising idea is that the server is **always running something**, so
 * there is no "start from scratch" — picking teams, naming them and choosing a
 * series length are edits to what is already live. This module is the diff that
 * makes that safe: it says what the config would change, so the dock can name
 * it before anything is sent.
 *
 * Three things about this tier that the first one does not have to deal with:
 *
 *  1. **It is all-or-nothing.** MatchZy loads a whole config; there is no
 *     patching one field. So the diff exists to *describe* the change, not to
 *     drive a per-field apply.
 *  2. **Half of it cannot be read back.** `get5_status` reports nothing at all
 *     for a pug (verified on the live server), and even for a loaded match it
 *     carries no captains, no veto setting and no clinch setting. Those fields
 *     are therefore drafting state with stated defaults, not readings — see
 *     `currentSetup`.
 *  3. **It needs MatchZy.** Vanilla CS2 has no named teams. Without the plugin
 *     none of this has an apply path, and the controls must be absent with a
 *     reason rather than present and broken.
 */

export type SetupSide = "team1" | "team2" | "bench";

/** Everything a match config decides that the dashboard lets you edit. */
export interface SetupValues {
  team1Name: string;
  team2Name: string;
  /** `steamId` → side, for connected players only. */
  sides: Record<string, SetupSide>;
  /**
   * Who leads each side.
   *
   * **MatchZy has no captain field.** This is a drafting device: it survives
   * into the config as list position, because `lib/match/draft.ts` encodes a
   * roster as "everyone on a side, captain first". So the badge is real and it
   * does something — it is just not a thing the server tracks or reports, which
   * is why `currentSetup` always reads it back as nobody.
   */
  captains: { team1: string | null; team2: string | null };
  /** 1, 3 or 5. */
  numMaps: number;
  /** The series map list, in order. */
  maps: string[];
  /** Play `maps` in order instead of holding a veto. */
  skipVeto: boolean;
  /** Stop the series as soon as it is mathematically decided. */
  clinchSeries: boolean;
}

/** Only the fields someone actually touched. */
export interface SetupDraft {
  team1Name?: string;
  team2Name?: string;
  /** Only the players who were moved; everyone else follows the server. */
  sides?: Record<string, SetupSide>;
  captains?: { team1?: string | null; team2?: string | null };
  numMaps?: number;
  maps?: string[];
  skipVeto?: boolean;
  clinchSeries?: boolean;
}

/**
 * What the server says right now, plus stated defaults for what it will not
 * say at all.
 *
 * The CT column is not always team 1: MatchZy's team1 starts on CT and swaps at
 * the half, and `series.team1.side` is how `get5_status` reports which side it
 * is on *now*. Assuming team1 is CT puts both team names on the wrong halves of
 * the scoreboard for the entire second half.
 */
export function currentSetup(
  match: MatchState | undefined,
  players: Player[],
  currentMap: string,
): SetupValues {
  const series = match?.series ?? null;
  const team1IsCt = series?.team1.side !== "T";

  const sides: Record<string, SetupSide> = {};
  for (const p of players) {
    sides[p.steamId] =
      p.team === "SPEC"
        ? "bench"
        : (p.team === "CT") === team1IsCt
          ? "team1"
          : "team2";
  }

  return {
    team1Name: series?.team1.name ?? "Counter-Terrorists",
    team2Name: series?.team2.name ?? "Terrorists",
    sides,
    // Never readable. See `SetupValues.captains`.
    captains: { team1: null, team2: null },
    numMaps: series && series.maps.length > 0 ? series.maps.length : 1,
    maps: series && series.maps.length > 0 ? [...series.maps] : [currentMap],
    // Defaults, not readings. The panel picks the maps itself, so playing them
    // in order is the behaviour that matches what the operator just did; and a
    // series that keeps playing decided maps is nobody's intent.
    skipVeto: true,
    clinchSeries: true,
  };
}

/** The draft laid over the current values — what the config would say. */
export function resolveSetup(
  current: SetupValues,
  draft: SetupDraft,
): SetupValues {
  return {
    team1Name: draft.team1Name ?? current.team1Name,
    team2Name: draft.team2Name ?? current.team2Name,
    sides: { ...current.sides, ...(draft.sides ?? {}) },
    captains: {
      team1: draft.captains?.team1 !== undefined
        ? draft.captains.team1
        : current.captains.team1,
      team2: draft.captains?.team2 !== undefined
        ? draft.captains.team2
        : current.captains.team2,
    },
    numMaps: draft.numMaps ?? current.numMaps,
    maps: draft.maps ?? current.maps,
    skipVeto: draft.skipVeto ?? current.skipVeto,
    clinchSeries: draft.clinchSeries ?? current.clinchSeries,
  };
}

export type SetupChangeKey =
  | "team1Name"
  | "team2Name"
  | "roster"
  | "captains"
  | "numMaps"
  | "maps"
  | "skipVeto"
  | "clinchSeries";

export interface SetupChange {
  key: SetupChangeKey;
  label: string;
  /** What it becomes, in the operator's words. */
  to: string;
  /** Anything the chip owes them beyond the value. */
  note?: string;
}

/** Steam ids whose staged side differs from the one they are on now. */
export function movedPlayers(
  current: SetupValues,
  draft: SetupDraft,
): string[] {
  const moved: string[] = [];
  for (const [id, side] of Object.entries(draft.sides ?? {})) {
    if (current.sides[id] !== side) moved.push(id);
  }
  return moved;
}

/**
 * The staged match config in the dock's words.
 *
 * Derived from the two objects rather than from a dirty flag per control, so it
 * cannot claim a change that is not there or miss one that is — the same rule
 * `changedKeys` follows in the RCON tier.
 */
export function setupChanges(
  current: SetupValues,
  draft: SetupDraft,
  nameOf: (steamId: string) => string,
  mapLabel: (name: string) => string = (n) => n,
): SetupChange[] {
  const next = resolveSetup(current, draft);
  const out: SetupChange[] = [];

  if (next.team1Name !== current.team1Name) {
    out.push({ key: "team1Name", label: "Team 1", to: next.team1Name || "—" });
  }
  if (next.team2Name !== current.team2Name) {
    out.push({ key: "team2Name", label: "Team 2", to: next.team2Name || "—" });
  }

  const moved = movedPlayers(current, draft);
  if (moved.length > 0) {
    out.push({
      key: "roster",
      label: "Roster",
      to: `${moved.length} move${moved.length === 1 ? "" : "s"}`,
      note: moved.map(nameOf).join(", "),
    });
  }

  const captains = (["team1", "team2"] as const).filter(
    (side) => next.captains[side] !== current.captains[side],
  );
  if (captains.length > 0) {
    out.push({
      key: "captains",
      label: captains.length === 2 ? "Captains" : "Captain",
      to: captains
        .map((side) => {
          const id = next.captains[side];
          return id ? nameOf(id) : "nobody";
        })
        .join(", "),
      // Said out loud because the badge otherwise implies the server knows.
      note: "listed first in the roster — MatchZy has no captain of its own",
    });
  }

  if (next.numMaps !== current.numMaps) {
    out.push({ key: "numMaps", label: "Series", to: `best of ${next.numMaps}` });
  }
  if (
    next.maps.length !== current.maps.length ||
    next.maps.some((m, i) => m !== current.maps[i])
  ) {
    out.push({
      key: "maps",
      label: "Map pool",
      to: next.maps.map(mapLabel).join(", ") || "—",
    });
  }
  if (next.skipVeto !== current.skipVeto) {
    out.push({
      key: "skipVeto",
      label: "Veto",
      to: next.skipVeto ? "skipped" : "held",
    });
  }
  if (next.clinchSeries !== current.clinchSeries) {
    out.push({
      key: "clinchSeries",
      label: "Clinch",
      to: next.clinchSeries ? "on" : "off",
    });
  }

  return out;
}

/**
 * Everyone on a side, captain first — the order MatchZy is handed, and the only
 * place the captain badge survives to.
 *
 * `order` fixes the rest, so the roster is stable between renders rather than
 * following whatever order an object happened to enumerate in.
 */
export function teamRoster(
  values: SetupValues,
  side: "team1" | "team2",
  order: string[],
): string[] {
  const captain = values.captains[side];
  const leads = captain !== null && values.sides[captain] === side;
  const rest = order.filter(
    (id) => values.sides[id] === side && !(leads && id === captain),
  );
  return leads ? [captain, ...rest] : rest;
}

/**
 * Whose pick it is, or `null` before both captains are named.
 *
 * Size, not a counter — the rule `lib/match/draft.ts` arrived at and the reason
 * it keeps no turn pointer: someone leaves, someone joins late, someone is
 * moved by hand, and a stored counter goes on pointing at the side that is
 * already a player up. Derived from the rosters, the turn is right again the
 * moment the rosters are.
 */
export function pickTurn(
  values: SetupValues,
  order: string[],
): "team1" | "team2" | null {
  if (values.captains.team1 === null || values.captains.team2 === null) {
    return null;
  }
  return teamRoster(values, "team1", order).length <=
    teamRoster(values, "team2", order).length
    ? "team1"
    : "team2";
}

/**
 * Names a captain, and puts them on the side they are captain of.
 *
 * Both halves, always, because a captain who is not on their own team is not a
 * state anyone means: `teamRoster` would leave them out of the roster MatchZy
 * is handed, and `undrafted` would offer them again as an unpicked player. It
 * also clears them from the other side, since the same Steam64 twice is a
 * config `buildMatchConfig` rejects several screens later.
 *
 * Pass `null` to unname the captain; that leaves them on the side, because
 * demoting someone is not the same as benching them.
 */
export function withCaptain(
  draft: SetupDraft,
  side: "team1" | "team2",
  id: string | null,
): SetupDraft {
  const other = side === "team1" ? "team2" : "team1";
  const captains = { ...draft.captains, [side]: id };
  if (id !== null && draft.captains?.[other] === id) captains[other] = null;
  return {
    ...draft,
    captains,
    sides: id === null ? draft.sides : { ...draft.sides, [id]: side },
  };
}

/** Connected players nobody has taken yet, in roster order. */
export function undrafted(values: SetupValues, order: string[]): string[] {
  return order.filter((id) => values.sides[id] === "bench");
}

/**
 * What would go wrong if this were loaded, in advance.
 *
 * `buildMatchConfig` validates again server-side and is the real gate; this
 * exists so the dock can refuse to offer Apply rather than letting someone
 * press it and read the failure afterwards.
 */
export function setupProblems(
  values: SetupValues,
  order: string[],
): string[] {
  const out: string[] = [];
  if (!values.team1Name.trim() || !values.team2Name.trim()) {
    out.push("A team name is empty.");
  }
  if (values.team1Name.trim() === values.team2Name.trim()) {
    out.push("Both teams have the same name.");
  }
  for (const side of ["team1", "team2"] as const) {
    if (teamRoster(values, side, order).length === 0) {
      const name = side === "team1" ? values.team1Name : values.team2Name;
      out.push(`${name || side} has nobody on it.`);
    }
  }
  if (![1, 3, 5].includes(values.numMaps)) {
    out.push("A series is best-of 1, 3 or 5.");
  } else if (values.maps.length < values.numMaps) {
    out.push(
      `A best-of-${values.numMaps} needs at least ${values.numMaps} maps; ${values.maps.length} picked.`,
    );
  }
  return out;
}

/**
 * The staged setup as the thing `/api/matches` stores and MatchZy loads.
 *
 * `matchNumber` is 0 because the server assigns it: MatchZy refuses a
 * non-integer `matchid` and says so only in its own console, so the panel keeps
 * a numeric id beside the human-readable one and the operator never sees it.
 */
export function buildDefinition(
  values: SetupValues,
  opts: {
    id: string;
    order: string[];
    nameOf: (steamId: string) => string;
    /** 2v2. MatchZy runs a different ruleset for it. */
    wingman: boolean;
  },
): MatchDefinition {
  const roster1 = teamRoster(values, "team1", opts.order);
  const roster2 = teamRoster(values, "team2", opts.order);
  return {
    id: opts.id,
    matchNumber: 0,
    team1: {
      name: values.team1Name.trim(),
      players: roster1.map((steamId) => ({ steamId, name: opts.nameOf(steamId) })),
    },
    team2: {
      name: values.team2Name.trim(),
      players: roster2.map((steamId) => ({ steamId, name: opts.nameOf(steamId) })),
    },
    maps: values.maps,
    numMaps: values.numMaps,
    playersPerTeam: Math.max(1, roster1.length, roster2.length),
    minPlayersToReady: 1,
    skipVeto: values.skipVeto,
    clinchSeries: values.clinchSeries,
    wingman: opts.wingman,
  };
}

/**
 * A name for the saved setup, from the teams playing.
 *
 * Every load is also a save — that is what makes a Friday re-runnable — so it
 * needs an id without asking anyone to invent one. Dated, because "Reds vs
 * Blues" happens most weeks and overwriting last week's is not what anyone
 * meant.
 */
export function setupId(values: SetupValues, now = new Date()): string {
  const slug = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "team";
  const date = now.toISOString().slice(0, 10);
  return `${slug(values.team1Name)}-vs-${slug(values.team2Name)}-${date}`;
}
