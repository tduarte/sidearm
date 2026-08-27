import { getDb } from "./index";
import type { BanRecord } from "@/lib/cs2/bans";

/**
 * The panel's ban list.
 *
 * This is the authority on *when a ban ends*, because the game server has no
 * usable notion of it — see lib/cs2/bans.ts. The server holds the ban itself,
 * in memory, until the panel lifts it or the container restarts.
 */
export function listBans(): BanRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT steam_id, name, reason, banned_at, expires_at
         FROM bans ORDER BY banned_at DESC`,
    )
    .all() as Array<{
    steam_id: string;
    name: string;
    reason: string | null;
    banned_at: string;
    expires_at: string | null;
  }>;
  return rows.map((r) => ({
    steamId: r.steam_id,
    name: r.name,
    reason: r.reason,
    bannedAt: r.banned_at,
    expiresAt: r.expires_at,
  }));
}

export function insertBan(ban: BanRecord): void {
  getDb()
    .prepare(
      `INSERT INTO bans (steam_id, name, reason, banned_at, expires_at)
       VALUES (@steamId, @name, @reason, @bannedAt, @expiresAt)
       ON CONFLICT(steam_id) DO UPDATE SET
         name = excluded.name,
         reason = excluded.reason,
         banned_at = excluded.banned_at,
         expires_at = excluded.expires_at`,
    )
    .run(ban);
}

export function deleteBan(steamId: string): void {
  getDb().prepare(`DELETE FROM bans WHERE steam_id = ?`).run(steamId);
}
