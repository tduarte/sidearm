import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * These exercise real SQLite rather than a stub: the bugs being fixed here are
 * about what survives a process restart, which a mock cannot demonstrate.
 */
let dir: string;

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sidearm-test-"));
  process.env.SQLITE_PATH = path.join(dir, "test.db");
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("console log persistence", () => {
  it("survives the in-memory ring being lost", async () => {
    const { insertConsoleEvent, getConsoleEvents } = await import(
      "@/lib/db/console"
    );
    for (let i = 0; i < 5; i++) {
      insertConsoleEvent({
        id: `e${i}`,
        ts: `2026-08-26T10:0${i}:00.000Z`,
        level: "info",
        source: "test",
        message: `line ${i}`,
      });
    }
    const rows = getConsoleEvents(10);
    assert.equal(rows.length, 5);
    // Oldest first, which is how a log reads.
    assert.equal(rows[0].message, "line 0");
    assert.equal(rows[4].message, "line 4");
  });

  it("ignores a duplicate id rather than throwing", async () => {
    const { insertConsoleEvent } = await import("@/lib/db/console");
    const ev = {
      id: "dupe",
      ts: "2026-08-26T11:00:00.000Z",
      level: "info" as const,
      source: "test",
      message: "once",
    };
    insertConsoleEvent(ev);
    assert.doesNotThrow(() => insertConsoleEvent(ev));
  });
});

describe("orphaned matches", () => {
  it("recovers a match left open by a previous panel process", async () => {
    const { beginMatch, findOpenMatch } = await import("@/lib/db/matches");
    const id = beginMatch("de_mirage", "competitive");
    // Simulates the panel restarting mid-match: the id was a closure variable
    // in server.ts, so the row was orphaned with ended_at NULL forever.
    assert.equal(findOpenMatch()?.id, id);
  });

  it("closes one that is far too old to still be running", async () => {
    const { reapStaleMatches, findOpenMatch } = await import(
      "@/lib/db/matches"
    );
    const { getDb } = await import("@/lib/db/index");
    getDb()
      .prepare(
        `UPDATE matches SET started_at = ? WHERE ended_at IS NULL`,
      )
      .run("2020-01-01T00:00:00.000Z");

    assert.equal(reapStaleMatches(), 1);
    assert.equal(findOpenMatch(), null);
  });

  it("keeps the score the rounds recorded rather than deleting the match", async () => {
    const { beginMatch, insertRound, reapStaleMatches, getMatches } =
      await import("@/lib/db/matches");
    const { getDb } = await import("@/lib/db/index");

    const id = beginMatch("de_nuke", "competitive");
    insertRound(id, {
      round: 7,
      winner: "CT",
      reason: "bomb_defused",
      score: { ct: 4, t: 3 },
    });
    getDb()
      .prepare(`UPDATE matches SET started_at = ? WHERE id = ?`)
      .run("2020-01-01T00:00:00.000Z", id);

    reapStaleMatches();
    const match = getMatches().find((m) => m.id === id);
    assert.ok(match, "a partially recorded match should still appear");
    assert.deepEqual(match.finalScore, { ct: 4, t: 3 });
    assert.equal(match.winner, "CT");
  });
});
