import { getDb } from "./index";
import type {
  GameMode,
  MatchHistoryDetail,
  MatchHistoryEntry,
  Player,
  RoundRecord,
  Team,
} from "@/lib/api/types";

export function beginMatch(map: string, gameMode: GameMode): string {
  const id = crypto.randomUUID();
  getDb().prepare(`
    INSERT INTO matches (id, started_at, map, game_mode)
    VALUES (?, ?, ?, ?)
  `).run(id, new Date().toISOString(), map, gameMode);
  return id;
}

/**
 * The match left open by a previous panel process, if any.
 *
 * `activeMatchId` used to be a closure variable in server.ts, so a panel
 * restart mid-match orphaned the row: `ended_at` stayed NULL forever, which
 * `getMatches` filters out, so it was invisible and never reaped. Recovering it
 * on boot means the match keeps recording instead of silently vanishing.
 */
export function findOpenMatch(): { id: string; startedAt: string } | null {
  const row = getDb()
    .prepare(
      `SELECT id, started_at FROM matches
        WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as { id: string; started_at: string } | undefined;
  return row ? { id: row.id, startedAt: row.started_at } : null;
}

/**
 * Closes matches left open longer than any real game could run.
 *
 * Without this an orphan is permanent: invisible to history and blocking
 * nothing, but accumulating. The score is whatever the rounds recorded, so a
 * partially-recorded match still shows up rather than being deleted.
 */
export function reapStaleMatches(maxAgeMs = 6 * 60 * 60 * 1000): number {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const db = getDb();
  const stale = db
    .prepare(`SELECT id FROM matches WHERE ended_at IS NULL AND started_at < ?`)
    .all(cutoff) as Array<{ id: string }>;

  for (const { id } of stale) {
    const last = db
      .prepare(
        `SELECT ct_score, t_score FROM match_rounds
          WHERE match_id = ? ORDER BY round DESC LIMIT 1`,
      )
      .get(id) as { ct_score: number; t_score: number } | undefined;
    const ct = last?.ct_score ?? 0;
    const t = last?.t_score ?? 0;
    db.prepare(
      `UPDATE matches
          SET ended_at = ?, ct_score = ?, t_score = ?, winner = ?
        WHERE id = ?`,
    ).run(
      new Date().toISOString(),
      ct,
      t,
      ct > t ? "CT" : t > ct ? "T" : "DRAW",
      id,
    );
  }
  return stale.length;
}

export function endMatch(
  matchId: string,
  score: { ct: number; t: number },
  players: Player[],
): void {
  const winner = score.ct > score.t ? "CT" : score.t > score.ct ? "T" : "DRAW";
  const db = getDb();
  db.prepare(`
    UPDATE matches
    SET ended_at = ?, ct_score = ?, t_score = ?, winner = ?, player_count = ?
    WHERE id = ?
  `).run(new Date().toISOString(), score.ct, score.t, winner, players.length, matchId);

  const insertPlayer = db.prepare(`
    INSERT OR REPLACE INTO match_players (match_id, steam_id, name, team, k, d, a)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of players) {
    insertPlayer.run(matchId, p.steamId, p.name, p.team, p.k, p.d, p.a);
  }
}

export function getMatches(): MatchHistoryEntry[] {
  const rows = getDb().prepare(`
    SELECT id, started_at, ended_at, map, game_mode, ct_score, t_score, winner, player_count
    FROM matches
    WHERE ended_at IS NOT NULL
    ORDER BY started_at DESC
    LIMIT 100
  `).all() as Array<{
    id: string; started_at: string; ended_at: string; map: string;
    game_mode: string; ct_score: number; t_score: number; winner: string; player_count: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    map: r.map,
    gameMode: r.game_mode as GameMode,
    finalScore: { ct: r.ct_score, t: r.t_score },
    winner: r.winner as "CT" | "T" | "DRAW",
    playerCount: r.player_count,
  }));
}

export function getMatchDetail(id: string): MatchHistoryDetail | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, started_at, ended_at, map, game_mode, ct_score, t_score, winner, player_count
    FROM matches WHERE id = ?
  `).get(id) as {
    id: string; started_at: string; ended_at: string; map: string;
    game_mode: string; ct_score: number; t_score: number; winner: string; player_count: number;
  } | undefined;
  if (!row) return null;

  const players = db.prepare(`
    SELECT steam_id, name, team, k, d, a FROM match_players WHERE match_id = ?
  `).all(id) as Array<{ steam_id: string; name: string; team: string; k: number; d: number; a: number }>;

  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    map: row.map,
    gameMode: row.game_mode as GameMode,
    finalScore: { ct: row.ct_score, t: row.t_score },
    winner: row.winner as "CT" | "T" | "DRAW",
    playerCount: row.player_count,
    rounds: getRounds(id),
    players: players.map((p) => ({
      steamId: p.steam_id,
      name: p.name,
      team: p.team as Team,
      k: p.k,
      d: p.d,
      a: p.a,
    })),
  };
}

/**
 * Records one completed round.
 *
 * `Round_End` is not a phase change (see PHASE_TRIGGERS in the log parser), so
 * rounds are stored separately from the match lifecycle. `INSERT OR REPLACE`
 * because a round number can legitimately repeat after `mp_restartgame`.
 */
export function insertRound(matchId: string, round: RoundRecord): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO match_rounds
         (match_id, round, winner, reason, ct_score, t_score)
       VALUES (@matchId, @round, @winner, @reason, @ct, @t)`,
    )
    .run({
      matchId,
      round: round.round,
      winner: round.winner,
      reason: round.reason,
      ct: round.score.ct,
      t: round.score.t,
    });
}

export function getRounds(matchId: string): RoundRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT round, winner, reason, ct_score, t_score
         FROM match_rounds WHERE match_id = ? ORDER BY round ASC`,
    )
    .all(matchId) as Array<{
    round: number;
    winner: string;
    reason: string;
    ct_score: number;
    t_score: number;
  }>;
  return rows.map((r) => ({
    round: r.round,
    winner: r.winner as RoundRecord["winner"],
    reason: r.reason,
    score: { ct: r.ct_score, t: r.t_score },
  }));
}
