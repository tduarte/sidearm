import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Upgrading an install that already has data.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that exists, so a column
 * added later never appears on a server that has been running. This is not
 * theoretical: `match_configs` shipped one build before MatchZy turned out to
 * require an integer `matchid`, and the live server answered
 * `no such column: match_number` on the very next deploy.
 */
let dir: string;

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sidearm-upgrade-"));
  const file = path.join(dir, "old.db");

  // The schema exactly as the previous build wrote it.
  const seed = new Database(file);
  seed.exec(`
    CREATE TABLE match_configs (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      loaded_at  TEXT,
      definition TEXT NOT NULL
    );
  `);
  seed
    .prepare(`INSERT INTO match_configs (id, definition) VALUES (?, ?)`)
    .run("legacy", JSON.stringify({ id: "legacy", team1: {}, team2: {} }));
  seed.close();

  process.env.SQLITE_PATH = file;
});

after(() => rmSync(dir, { recursive: true, force: true }));

describe("match_configs on an existing install", () => {
  it("gains match_number without losing the rows already there", async () => {
    const { getDb } = await import("@/lib/db/index");
    const cols = (
      getDb().prepare("PRAGMA table_info(match_configs)").all() as { name: string }[]
    ).map((c) => c.name);

    assert.ok(cols.includes("match_number"), "expected the column to be added");
    const row = getDb()
      .prepare("SELECT id, match_number AS n FROM match_configs WHERE id = 'legacy'")
      .get() as { id: string; n: number };
    assert.equal(row.id, "legacy", "the existing row must survive");
    // Backfilled rather than left NULL, so nextMatchNumber can do arithmetic
    // on it and buildMatchConfig does not reject the row outright.
    assert.equal(row.n, 1);
  });

  it("hands out a match number above what is already stored", async () => {
    const { nextMatchNumber, saveMatchConfig } = await import("@/lib/db/match-configs");
    assert.equal(nextMatchNumber(), 2);

    saveMatchConfig({
      id: "next",
      matchNumber: nextMatchNumber(),
      team1: { name: "A", players: [{ steamId: "[U:1:1]", name: "a" }] },
      team2: { name: "B", players: [{ steamId: "[U:1:2]", name: "b" }] },
      maps: ["de_mirage"],
      numMaps: 1,
      playersPerTeam: 1,
      minPlayersToReady: 1,
      skipVeto: true,
      clinchSeries: true,
      wingman: false,
    });
    assert.equal(nextMatchNumber(), 3);
  });
});
