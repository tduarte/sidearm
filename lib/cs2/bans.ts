/**
 * Bans, with the expiry tracked by the panel.
 *
 * The shape here is dictated by how Source bans actually behave, which is not
 * how they look:
 *
 *  - `banid <minutes> <id>` with a non-zero duration is **deleted at the next
 *    map change**. A timed ban is therefore useless on a rotating server.
 *  - `banid 0 <id>` never expires and survives map changes, but lives only in
 *    the server's memory — a container restart clears it.
 *  - Persisting to `banned_user.cfg` needs `writeid`, and the cs2-data mount
 *    is read-only.
 *
 * So the panel issues a permanent in-memory ban and owns the clock itself:
 * expiry is stored in SQLite and `removeid` is issued when it lapses. Bans are
 * re-applied when RCON reconnects, which is what makes them survive the
 * container restart that would otherwise silently drop them.
 */

/** Minutes; `null` means no expiry. */
export type BanDuration = number | null;

export interface BanRecord {
  steamId: string;
  name: string;
  reason: string | null;
  bannedAt: string;
  /** ISO timestamp, or null for a ban with no expiry. */
  expiresAt: string | null;
}

/**
 * `banid 0` always — never the minutes form.
 *
 * Passing the duration to CS2 would look right and quietly stop working at the
 * next `changelevel`.
 */
export function banCommands(target: string): string[] {
  return [`banid 0 ${target}`, `kickid ${target}`];
}

export function unbanCommand(steamId: string): string {
  return `removeid ${steamId}`;
}

/** Bans whose clock has run out, so the panel can lift them. */
export function expiredBans(bans: BanRecord[], now = new Date()): BanRecord[] {
  return bans.filter(
    (b) => b.expiresAt !== null && new Date(b.expiresAt).getTime() <= now.getTime(),
  );
}

export function expiryFrom(minutes: BanDuration, now = new Date()): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/** `90` → `1h 30m`, for stating the length before it is applied. */
export function formatDuration(minutes: BanDuration): string {
  if (minutes === null) return "no expiry";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${d}d` : `${d}d ${h % 24}h`;
}
