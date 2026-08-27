import { getDb } from "./index";
import type { MatchDefinition } from "@/lib/cs2/match-config";

/**
 * Match definitions the panel has set up.
 *
 * These are the panel's **intent** — who is playing, on what, in what format —
 * which is exactly what `lib/db/config.ts` says belongs on this side. The
 * *results* are MatchZy's and are read from its own database
 * (`lib/cs2/matchzy-db.ts`); nothing here duplicates them.
 *
 * Stored whole as JSON rather than normalised into tables. A definition is
 * written once, read back verbatim by one HTTP handler, and never queried by
 * its parts — columns would buy nothing and cost a migration every time
 * MatchZy's schema gains a field.
 */
export interface StoredMatchConfig {
  id: string;
  createdAt: string;
  /** When the panel last told CS2 to load it. Null means never. */
  loadedAt: string | null;
  definition: MatchDefinition;
}

interface Row {
  id: string;
  created_at: string;
  loaded_at: string | null;
  definition: string;
}

function toStored(row: Row): StoredMatchConfig | null {
  try {
    return {
      id: row.id,
      createdAt: row.created_at,
      loadedAt: row.loaded_at,
      definition: JSON.parse(row.definition) as MatchDefinition,
    };
  } catch {
    // A corrupt row must not take the list down with it.
    return null;
  }
}

/**
 * The next integer to hand MatchZy as `matchid`.
 *
 * Derived from what is stored rather than kept in a counter row, so deleting
 * every setup does not start handing out numbers MatchZy has already recorded
 * against a finished match in its own database.
 */
export function nextMatchNumber(): number {
  const row = getDb()
    .prepare(`SELECT COALESCE(MAX(match_number), 0) AS n FROM match_configs`)
    .get() as { n: number };
  return (row?.n ?? 0) + 1;
}

export function saveMatchConfig(def: MatchDefinition): void {
  getDb()
    .prepare(
      `INSERT INTO match_configs (id, match_number, definition)
       VALUES (@id, @matchNumber, @definition)
       ON CONFLICT(id) DO UPDATE SET
         definition   = excluded.definition,
         match_number = excluded.match_number`,
    )
    .run({
      id: def.id,
      matchNumber: def.matchNumber,
      definition: JSON.stringify(def),
    });
}

export function getMatchConfig(id: string): StoredMatchConfig | null {
  const row = getDb()
    .prepare(`SELECT * FROM match_configs WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? toStored(row) : null;
}

export function listMatchConfigs(limit = 25): StoredMatchConfig[] {
  const rows = getDb()
    .prepare(`SELECT * FROM match_configs ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as Row[];
  return rows.map(toStored).filter((r): r is StoredMatchConfig => r !== null);
}

/** Stamped when CS2 is told to load it, not when it is saved. */
export function markMatchConfigLoaded(id: string): void {
  getDb()
    .prepare(`UPDATE match_configs SET loaded_at = datetime('now') WHERE id = ?`)
    .run(id);
}

export function deleteMatchConfig(id: string): void {
  getDb().prepare(`DELETE FROM match_configs WHERE id = ?`).run(id);
}
