import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), "sidearm.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         TEXT PRIMARY KEY,
      ts         TEXT NOT NULL,
      steam_id   TEXT NOT NULL,
      name       TEXT NOT NULL,
      team       TEXT NOT NULL,
      message    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id           TEXT PRIMARY KEY,
      started_at   TEXT NOT NULL,
      ended_at     TEXT,
      map          TEXT NOT NULL,
      game_mode    TEXT NOT NULL,
      ct_score     INTEGER NOT NULL DEFAULT 0,
      t_score      INTEGER NOT NULL DEFAULT 0,
      winner       TEXT,
      player_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS match_players (
      match_id  TEXT NOT NULL REFERENCES matches(id),
      steam_id  TEXT NOT NULL,
      name      TEXT NOT NULL,
      team      TEXT NOT NULL,
      k         INTEGER NOT NULL DEFAULT 0,
      d         INTEGER NOT NULL DEFAULT 0,
      a         INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (match_id, steam_id)
    );

    CREATE TABLE IF NOT EXISTS match_rounds (
      match_id   TEXT NOT NULL REFERENCES matches(id),
      round      INTEGER NOT NULL,
      winner     TEXT NOT NULL,
      reason     TEXT NOT NULL,
      ct_score   INTEGER NOT NULL,
      t_score    INTEGER NOT NULL,
      ended_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (match_id, round)
    );

    CREATE TABLE IF NOT EXISTS console_log (
      id       TEXT PRIMARY KEY,
      ts       TEXT NOT NULL,
      level    TEXT NOT NULL,
      source   TEXT NOT NULL,
      message  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS console_log_ts ON console_log (ts);

    CREATE TABLE IF NOT EXISTS bans (
      steam_id   TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      reason     TEXT,
      banned_at  TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT
    );

    -- Match definitions the panel has set up, for MatchZy to fetch. The panel's
    -- intent; the results live in MatchZy's own database and are never copied
    -- here. Stored whole as JSON because nothing ever queries it by its parts.
    CREATE TABLE IF NOT EXISTS match_configs (
      id           TEXT PRIMARY KEY,
      -- MatchZy rejects a non-integer matchid, so the panel keeps a numeric
      -- handle alongside the human-readable one it uses everywhere else.
      match_number INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      loaded_at    TEXT,
      definition   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workshop_maps (
      workshop_id  TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      display_name TEXT NOT NULL,
      added_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Columns added after the initial schema. `CREATE TABLE IF NOT EXISTS` above
  // does nothing to a table that already exists, so an existing install needs
  // these added explicitly. Guarded, so it is safe to run on every boot.
  addColumn(db, "workshop_maps", "title", "TEXT");
  addColumn(db, "workshop_maps", "preview_url", "TEXT");
  addColumn(db, "workshop_maps", "file_size", "INTEGER");
  addColumn(db, "workshop_maps", "time_updated", "INTEGER");
  addColumn(db, "workshop_maps", "thumb_file", "TEXT");
  addColumn(db, "chat_messages", "team_only", "INTEGER");
  // match_configs shipped one build before MatchZy turned out to require an
  // integer matchid, so an install that saved a setup in between has the table
  // without this column.
  addColumn(db, "match_configs", "match_number", "INTEGER NOT NULL DEFAULT 1");
}

/** Adds a column when it is missing. SQLite has no `ADD COLUMN IF NOT EXISTS`. */
function addColumn(
  db: Database.Database,
  table: string,
  column: string,
  type: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
