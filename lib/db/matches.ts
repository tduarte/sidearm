import { getDb } from "./index";
import type { GameMode, MatchHistoryDetail, MatchHistoryEntry, Player, Team } from "@/lib/api/types";

export function beginMatch(map: string, gameMode: GameMode): string {
  const id = crypto.randomUUID();
  getDb().prepare(`
    INSERT INTO matches (id, started_at, map, game_mode)
    VALUES (?, ?, ?, ?)
  `).run(id, new Date().toISOString(), map, gameMode);
  return id;
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
