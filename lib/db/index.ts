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

    CREATE TABLE IF NOT EXISTS saved_config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
