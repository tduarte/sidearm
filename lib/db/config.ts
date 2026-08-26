import { getDb } from "./index";

/**
 * The panel's own durable notes, in the `saved_config` table that the schema
 * has always created and nothing ever read or wrote.
 *
 * The rule: **this stores the panel's intent and history, never server state.**
 * If a value has a cvar, read the cvar (see `lib/cs2/cvars.ts`); trusting a
 * remembered copy is how the pause and demo toggles ended up sending the wrong
 * command after a restart.
 *
 * What legitimately belongs here is what the server cannot tell us later: what
 * the settings looked like *before* the panel changed them, so a change can be
 * undone. A knife round rewrites sixteen cvars; without the baseline on disk, a
 * panel restart mid-knife leaves a mangled server and no way back.
 */
export function getSavedConfig<T>(key: string): T | null {
  const row = getDb()
    .prepare(`SELECT value FROM saved_config WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    // A corrupt row must not take the panel down; treat it as absent.
    return null;
  }
}

export function setSavedConfig(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO saved_config (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run({ key, value: JSON.stringify(value) });
}

export function deleteSavedConfig(key: string): void {
  getDb().prepare(`DELETE FROM saved_config WHERE key = ?`).run(key);
}
