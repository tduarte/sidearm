import { getDb } from "./index";
import type { ConsoleEvent } from "@/lib/api/types";

/**
 * The console log, kept across panel restarts.
 *
 * It was a 500-entry in-memory ring, so restarting the panel — which is what
 * every deploy does — threw away exactly the history someone would be reading
 * while diagnosing why the server misbehaved.
 *
 * Bounded rather than unbounded: chat_messages and matches already grow
 * forever, and the console is by far the highest-volume table of the three.
 */
const MAX_ROWS = 20_000;
/** Trimming on every insert would be a delete-scan per log line. */
const TRIM_EVERY = 500;
let sinceTrim = 0;

export function insertConsoleEvent(event: ConsoleEvent): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO console_log (id, ts, level, source, message)
     VALUES (@id, @ts, @level, @source, @message)`,
  ).run({
    id: event.id,
    ts: event.ts,
    level: event.level,
    source: event.source,
    message: event.message,
  });

  if (++sinceTrim >= TRIM_EVERY) {
    sinceTrim = 0;
    db.prepare(
      `DELETE FROM console_log WHERE id NOT IN (
         SELECT id FROM console_log ORDER BY ts DESC LIMIT ?
       )`,
    ).run(MAX_ROWS);
  }
}

/** Most recent first in SQL, returned oldest-first for a natural log read. */
export function getConsoleEvents(limit = 500): ConsoleEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT id, ts, level, source, message FROM console_log
        ORDER BY ts DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    ts: string;
    level: string;
    source: string;
    message: string;
  }>;
  return rows
    .map((r) => ({
      id: r.id,
      ts: r.ts,
      level: r.level as ConsoleEvent["level"],
      source: r.source,
      message: r.message,
    }))
    .reverse();
}
