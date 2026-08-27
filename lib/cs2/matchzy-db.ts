import Database from "better-sqlite3";
import type { MatchHistoryDetail, MatchZyPlayerStats } from "@/lib/api/types";

/**
 * MatchZy's own match database, read over the shoulder.
 *
 * MatchZy records every match it runs — including pug and scrim matches started
 * with `.start`, which is what a casual server actually plays — into its own
 * SQLite file. That makes it a far better history than anything the panel can
 * assemble, and it is the reason this file exists rather than a webhook
 * receiver or a `get5_status` poller:
 *
 *  - **The webhook** emits eight events, fire-and-forget, with no retry and no
 *    ordering guarantee. It also needs an inbound endpoint and its own auth.
 *  - **`get5_status`** reports `gamestate: "none"` with every field null unless
 *    a Get5-style match config has been loaded. Verified on a live server: a
 *    complete pug knife round ran, MatchZy wrote a row to this database, and
 *    `get5_status` stayed empty throughout. Polling it would have shown nothing.
 *
 * This is read-only, through the `cs2-data` volume the panel already mounts at
 * `/cs2:ro` for demos. The panel never writes here — these are MatchZy's
 * records, not ours.
 *
 * Everything degrades to "no matches" rather than throwing: most installs of
 * this panel have no plugins, so the file simply will not exist.
 */

/**
 * Resolved per call rather than at module load, matching `lib/cs2/demos.ts` —
 * a module-level constant freezes whatever the environment was at first import
 * and makes the module untestable.
 */
function dbPath(): string {
  return (
    process.env.MATCHZY_DB_PATH ??
    "/cs2/game/csgo/addons/counterstrikesharp/plugins/MatchZy/matchzy.db"
  );
}

/** One completed map, which is the unit MatchZy actually scores. */
export interface MatchZyMap {
  matchId: number;
  mapNumber: number;
  map: string;
  startedAt: string;
  /** `null` while the match is still running. */
  endedAt: string | null;
  seriesType: string;
  team1: { name: string; score: number };
  team2: { name: string; score: number };
  /** MatchZy's raw winner value: a team name, `"team1"`/`"team2"`, or empty. */
  winner: string;
  players: MatchZyPlayerStats[];
}

/**
 * MatchZy stores `DATETIME` as `YYYY-MM-DD HH:MM:SS` in **UTC**, with no zone
 * marker. `new Date()` on that string is parsed as LOCAL time by every engine,
 * which silently shifts every match by the server's offset — enough to break
 * the overlap matching below and to show matches at the wrong time of day.
 */
export function toIso(sqliteDatetime: string | null): string | null {
  if (!sqliteDatetime) return null;
  const t = Date.parse(`${sqliteDatetime.trim().replace(" ", "T")}Z`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Rounds played on a map, for per-round averages like ADR.
 *
 * Returns `null` rather than 0 when the scores do not describe a real map, so
 * callers divide by nothing rather than by zero.
 */
export function roundsPlayed(team1Score: number, team2Score: number): number | null {
  const n = (team1Score || 0) + (team2Score || 0);
  return n > 0 ? n : null;
}

/**
 * Every INTEGER column arrives as a BigInt, because the player rows are read
 * with `safeIntegers` — see `readMatchZyMaps` for why that is not optional.
 */
type Int = number | bigint;

interface PlayerRow {
  matchid: Int;
  mapnumber: Int;
  steamid64: Int;
  team: string | null;
  name: string | null;
  kills: Int;
  deaths: Int;
  assists: Int;
  damage: Int;
  head_shot_kills: Int;
  enemies_flashed: Int;
  utility_damage: Int;
  entry_count: Int;
  entry_wins: Int;
  v1_count: Int;
  v1_wins: Int;
  v2_count: Int;
  v2_wins: Int;
}

/** BigInt or number to a plain number. Counters are all far below 2^53. */
const n = (v: Int | null | undefined): number => Number(v ?? 0);

/** Shapes one stats row, given how many rounds the map lasted. */
export function toPlayerStats(
  row: PlayerRow,
  rounds: number | null,
): MatchZyPlayerStats {
  const kills = n(row.kills);
  const damage = n(row.damage);
  return {
    // A Steam64 is ~7.6e16, comfortably past 2^53, so it must never pass
    // through a JS number: `76561197960265728` becomes `76561197960265730`
    // and the scoreboard names the wrong person. Read as a BigInt and
    // stringified — it is an identifier, not a quantity.
    steamId64: String(row.steamid64),
    name: row.name ?? "",
    team: row.team ?? "",
    kills,
    deaths: n(row.deaths),
    assists: n(row.assists),
    damage,
    // Averages are null, not 0, when the round count is unknown: "no data" and
    // "did nothing" are different answers.
    adr: rounds ? Math.round(damage / rounds) : null,
    headshotPct: kills > 0 ? Math.round((n(row.head_shot_kills) / kills) * 100) : null,
    enemiesFlashed: n(row.enemies_flashed),
    utilityDamage: n(row.utility_damage),
    entries: { played: n(row.entry_count), won: n(row.entry_wins) },
    clutches: {
      played: n(row.v1_count) + n(row.v2_count),
      won: n(row.v1_wins) + n(row.v2_wins),
    },
  };
}

/**
 * Every map MatchZy has recorded, newest first.
 *
 * Opened read-only on every call rather than held open: the file lives on a
 * read-only mount that MatchZy is writing to underneath us, and a long-lived
 * handle would pin a snapshot and hold locks against the plugin. Reads are
 * infrequent (a history page load) and the database is tiny.
 */
export function readMatchZyMaps(): MatchZyMap[] {
  let db: Database.Database;
  try {
    // `fileMustExist` so a missing file is an immediate throw rather than
    // better-sqlite3 trying to CREATE one — which on a read-only mount would
    // fail confusingly, and on a writable one would leave an empty database
    // where the plugin expects its own.
    db = new Database(dbPath(), { readonly: true, fileMustExist: true });
  } catch {
    // No plugin, no mount, or MatchZy has never run. All the same to a caller.
    return [];
  }

  try {
    const maps = db
      .prepare(
        `SELECT p.matchid, p.mapnumber, p.mapname, p.start_time, p.end_time,
                p.team1_score, p.team2_score, p.winner,
                m.series_type, m.team1_name, m.team2_name
           FROM matchzy_stats_maps p
           JOIN matchzy_stats_matches m ON m.matchid = p.matchid
          ORDER BY p.start_time DESC, p.mapnumber DESC`,
      )
      .all() as Array<Record<string, string | number | null>>;

    // `safeIntegers` is load-bearing, not caution: steamid64 is stored as a
    // SQLite INTEGER and is around 7.6e16. Read as a JS number it silently
    // rounds to the nearest even value and identifies a different account.
    const playerRows = db
      .prepare(`SELECT * FROM matchzy_stats_players`)
      .safeIntegers(true)
      .all() as PlayerRow[];

    const byMap = new Map<string, PlayerRow[]>();
    for (const r of playerRows) {
      // Template interpolation stringifies a BigInt without the `n` suffix, so
      // these keys match the ones built from the (numeric) map rows.
      const key = `${r.matchid}:${r.mapnumber}`;
      const list = byMap.get(key);
      if (list) list.push(r);
      else byMap.set(key, [r]);
    }

    const out: MatchZyMap[] = [];
    for (const row of maps) {
      const startedAt = toIso(row.start_time as string | null);
      // A map with no start time is not something we can place on a timeline,
      // and the overlap matching below depends on it. Skip rather than invent.
      if (!startedAt) continue;

      const t1 = Number(row.team1_score ?? 0);
      const t2 = Number(row.team2_score ?? 0);
      const rounds = roundsPlayed(t1, t2);
      const key = `${row.matchid}:${row.mapnumber}`;

      out.push({
        matchId: Number(row.matchid),
        mapNumber: Number(row.mapnumber),
        map: String(row.mapname ?? "unknown"),
        startedAt,
        endedAt: toIso(row.end_time as string | null),
        seriesType: String(row.series_type ?? ""),
        team1: { name: String(row.team1_name ?? "Team 1"), score: t1 },
        team2: { name: String(row.team2_name ?? "Team 2"), score: t2 },
        winner: String(row.winner ?? ""),
        players: (byMap.get(key) ?? [])
          .map((r) => toPlayerStats(r, rounds))
          .sort((a, b) => b.kills - a.kills),
      });
    }
    return out;
  } catch {
    // MatchZy writes with a rollback journal, so a read can collide with a
    // write in progress and come back SQLITE_BUSY. A history page that is
    // briefly short of the newest match beats one that errors.
    return [];
  } finally {
    try { db.close(); } catch { /* already gone */ }
  }
}

/**
 * How long an unfinished MatchZy match can go on suppressing the panel's own
 * records before we stop believing in it.
 *
 * MatchZy writes `end_time` when a match finishes properly and simply never
 * comes back to it otherwise — abandon a pug, restart the container mid-match,
 * and the row stays open forever. Treating that as "runs until the end of time"
 * means one abandoned row silently hides **every future match** from the
 * history, which is far worse than briefly showing a duplicate.
 *
 * Six hours, matching `reapStaleMatches` in `lib/db/matches.ts`, which draws
 * exactly the same line for the panel's own orphaned rows.
 */
const OPEN_MATCH_MAX_MS = 6 * 60 * 60 * 1000;

/** Overlap test for two time ranges. */
function overlaps(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const a0 = Date.parse(aStart);
  const b0 = Date.parse(bStart);
  if (Number.isNaN(a0) || Number.isNaN(b0)) return false;
  // An absent end is bounded rather than infinite -- see OPEN_MATCH_MAX_MS.
  const a1 = aEnd ? Date.parse(aEnd) : a0 + OPEN_MATCH_MAX_MS;
  const b1 = bEnd ? Date.parse(bEnd) : b0 + OPEN_MATCH_MAX_MS;
  return a0 <= b1 && b0 <= a1;
}

/** Shapes one MatchZy map as a history row. */
export function toHistoryEntry(m: MatchZyMap): MatchHistoryDetail {
  const { team1, team2 } = m;
  const winnerLabel =
    team1.score > team2.score
      ? team1.name
      : team2.score > team1.score
        ? team2.name
        : "";

  return {
    id: `matchzy:${m.matchId}:${m.mapNumber}`,
    startedAt: m.startedAt,
    // Only ended maps become history rows, so this is always set by the time
    // it is read; the fallback keeps the type honest rather than asserting.
    endedAt: m.endedAt ?? m.startedAt,
    map: m.map,
    // MatchZy does not record a game mode, and it is a competitive match
    // plugin — that is what it runs. Stated rather than derived, deliberately:
    // there is nothing in its schema to derive it from.
    gameMode: "competitive",
    // A fallback only. MatchZy teams swap sides at half-time, so a "CT score"
    // is not a thing it can express; renderers must prefer `teams`.
    finalScore: { ct: team1.score, t: team2.score },
    winner: team1.score > team2.score ? "CT" : team2.score > team1.score ? "T" : "DRAW",
    playerCount: m.players.length,
    source: "matchzy",
    teams: [
      { name: team1.name, score: team1.score },
      { name: team2.name, score: team2.score },
    ],
    winnerLabel,
    players: [],
    matchzyPlayers: m.players,
  };
}

/**
 * Combines the panel's log-derived history with MatchZy's own, newest first.
 *
 * When both describe the same game — which they do whenever MatchZy is
 * installed, since the log parser keeps running regardless — **MatchZy wins and
 * the panel's copy is dropped**. Its record has real team names, real scores
 * and a full scoreboard; ours has whatever could be scraped out of the log
 * stream. Showing both would list every match twice.
 *
 * Matched on overlapping time ranges rather than on an id, because the two
 * systems share no identifier and never will. Deciding this at read time rather
 * than at ingest means nothing is thrown away: uninstall MatchZy and the
 * panel's own records are still there, and a match played before the plugin
 * was installed still shows up.
 *
 * An unfinished MatchZy match suppresses for a bounded window, not forever —
 * see `OPEN_MATCH_MAX_MS`.
 */
export function mergeHistory(
  panel: MatchHistoryDetail[],
  matchzy: MatchZyMap[],
): MatchHistoryDetail[] {
  const supersedes = matchzy.filter((m) => m.startedAt);

  const kept = panel.filter(
    (p) =>
      !supersedes.some((m) =>
        overlaps(p.startedAt, p.endedAt, m.startedAt, m.endedAt),
      ),
  );

  // Only finished maps are history. One still running is live state, and it is
  // still used above to suppress the panel's duplicate of it.
  const fromPlugin = matchzy.filter((m) => m.endedAt).map(toHistoryEntry);

  return [...kept, ...fromPlugin].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}
