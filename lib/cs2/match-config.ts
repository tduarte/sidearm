import { toSteam64 } from "./steamid";

/**
 * Builds the JSON MatchZy fetches from `matchzy_loadmatch_url`.
 *
 * This is the panel's *intent*, translated into the plugin's schema. Keeping it
 * pure and separate from the route matters more than usual here: MatchZy loads
 * the config by blocking the game thread on an HTTP `.Result`, so the endpoint
 * has to do no work, and a config that fails the plugin's own validator is
 * rejected silently in the server console where nobody is looking.
 */

/** A player as the panel knows them, before conversion. */
export interface MatchPlayerInput {
  /** Whatever the roster holds — `[U:1:x]`, `STEAM_0:y:z` or a Steam64. */
  steamId: string;
  name: string;
}

export interface MatchTeamInput {
  name: string;
  players: MatchPlayerInput[];
}

/** What the panel stores and the form collects. */
export interface MatchDefinition {
  /** The panel's own handle: human-readable, used in storage and the URL. */
  id: string;
  /**
   * The id MatchZy is given, which **must be an integer**.
   *
   * Not a stylistic choice: the plugin rejects a match config outright with
   * `[LoadMatchDataCommand] matchid should be an integer!` and carries on as if
   * nothing was asked. The Get5 spec this schema follows describes `matchid` as
   * a string, so this is one place documentation and implementation disagree —
   * found by watching the server console, not by reading.
   *
   * Assigned by the panel on save, so the operator never has to think about it.
   */
  matchNumber: number;
  team1: MatchTeamInput;
  team2: MatchTeamInput;
  maps: string[];
  /** 1, 3 or 5. */
  numMaps: number;
  playersPerTeam: number;
  /** How many must `.ready` before the match starts. */
  minPlayersToReady: number;
  /** Skip the veto and use `maps` in order. */
  skipVeto: boolean;
  /** Stop the series as soon as it is mathematically decided. */
  clinchSeries: boolean;
  wingman: boolean;
  /** Extra cvars MatchZy execs after loading. */
  cvars?: Record<string, string>;
}

/** The shape MatchZy actually consumes. */
export interface MatchZyConfig {
  /** An integer. See `MatchDefinition.matchNumber`. */
  matchid: number;
  num_maps: number;
  maplist: string[];
  skip_veto: boolean;
  players_per_team: number;
  min_players_to_ready: number;
  clinch_series: boolean;
  wingman: boolean;
  team1: { name: string; players: Record<string, string> };
  team2: { name: string; players: Record<string, string> };
  cvars?: Record<string, string>;
}

export interface BuildResult {
  config: MatchZyConfig | null;
  /** Fatal — the config was not built. */
  errors: string[];
  /**
   * Built, but something the operator asked for will not happen. Surfaced in
   * the UI before loading rather than discovered mid-match.
   */
  warnings: string[];
}

/** Roster entries the panel cannot turn into a Steam64 — bots, mostly. */
export function unconvertiblePlayers(team: MatchTeamInput): MatchPlayerInput[] {
  return team.players.filter((p) => toSteam64(p.steamId) === null);
}

function toRoster(team: MatchTeamInput): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of team.players) {
    const id = toSteam64(p.steamId);
    // Silently dropping is safe here only because `validate` refuses to build a
    // config with any unconvertible player in it.
    if (id) out[id] = p.name;
  }
  return out;
}

/**
 * Validates and builds. Returns errors instead of throwing, because every one
 * of these is something the operator can see and fix in the form.
 */
export function buildMatchConfig(def: MatchDefinition): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!def.id.trim()) errors.push("The match needs an id.");
  if (!Number.isInteger(def.matchNumber) || def.matchNumber < 1) {
    // MatchZy refuses a non-integer matchid and says so only in the server
    // console, so catching it here is the difference between an error the
    // operator sees and a match that simply never loads.
    errors.push("The match number must be a positive whole number.");
  }
  if (!def.team1.name.trim()) errors.push("Team 1 needs a name.");
  if (!def.team2.name.trim()) errors.push("Team 2 needs a name.");

  const maps = def.maps.map((m) => m.trim()).filter(Boolean);
  if (maps.length === 0) errors.push("Pick at least one map.");

  if (![1, 3, 5].includes(def.numMaps)) {
    errors.push("A series is best-of 1, 3 or 5.");
  } else if (maps.length < def.numMaps) {
    errors.push(
      `A best-of-${def.numMaps} needs at least ${def.numMaps} maps; ${maps.length} picked.`,
    );
  }

  for (const [label, team] of [["Team 1", def.team1], ["Team 2", def.team2]] as const) {
    const bad = unconvertiblePlayers(team);
    if (bad.length > 0) {
      // Bots have no Steam identity. Putting them in a roster does not fail
      // loudly — MatchZy just never recognises them and the match never readies.
      errors.push(
        `${label} has ${bad.length} player(s) with no Steam ID: ${bad
          .map((p) => p.name || p.steamId)
          .join(", ")}. Bots cannot be in a match roster.`,
      );
    }
    if (team.players.length === 0) errors.push(`${label} has no players.`);
  }

  const overlap = new Set(def.team1.players.map((p) => toSteam64(p.steamId)));
  const duplicated = def.team2.players.filter((p) => overlap.has(toSteam64(p.steamId)));
  if (duplicated.length > 0) {
    errors.push(
      `${duplicated.map((p) => p.name).join(", ")} is on both teams.`,
    );
  }

  // MatchZy forces skip_veto whenever the map list is exactly the series
  // length: with three maps in a BO3 there is nothing left to veto. Asking for
  // a veto there does not error, it just never happens — so say so up front.
  let skipVeto = def.skipVeto;
  if (!skipVeto && maps.length === def.numMaps) {
    skipVeto = true;
    warnings.push(
      `A best-of-${def.numMaps} with exactly ${maps.length} map(s) has nothing to veto, so MatchZy will skip it. Add more maps to hold a veto.`,
    );
  }

  if (def.playersPerTeam < 1) errors.push("Players per team must be at least 1.");
  if (def.minPlayersToReady < 1) {
    errors.push("At least one player must be required to ready up.");
  } else if (def.minPlayersToReady > def.playersPerTeam) {
    // Nobody can ever start the match: it waits for more players than a team
    // is allowed to hold.
    errors.push(
      `Requiring ${def.minPlayersToReady} ready players on teams of ${def.playersPerTeam} means the match can never start.`,
    );
  }

  if (errors.length > 0) return { config: null, errors, warnings };

  return {
    config: {
      matchid: def.matchNumber,
      num_maps: def.numMaps,
      maplist: maps,
      skip_veto: skipVeto,
      players_per_team: def.playersPerTeam,
      min_players_to_ready: def.minPlayersToReady,
      clinch_series: def.clinchSeries,
      wingman: def.wingman,
      team1: { name: def.team1.name.trim(), players: toRoster(def.team1) },
      team2: { name: def.team2.name.trim(), players: toRoster(def.team2) },
      ...(def.cvars && Object.keys(def.cvars).length > 0
        ? { cvars: def.cvars }
        : {}),
    },
    errors,
    warnings,
  };
}
