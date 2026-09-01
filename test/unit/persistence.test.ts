import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ServerStatus } from "@/lib/api/types";

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

/**
 * The live timeline reads rounds out of the *open* match, which is the one
 * thing history never had to do: `getMatches` filters `ended_at IS NULL` out
 * entirely, so nothing exercised the path until now.
 */
describe("rounds of the match in progress", () => {
  it("reads back the open match's rounds, and has none once it ends", async () => {
    const { beginMatch, insertRound, getRounds, findOpenMatch, endMatch } =
      await import("@/lib/db/matches");

    assert.equal(findOpenMatch(), null, "nothing should be open yet");
    const id = beginMatch("de_ancient", "competitive");
    insertRound(id, {
      round: 1,
      winner: "CT",
      reason: "ct_win_elimination",
      score: { ct: 1, t: 0 },
    });
    insertRound(id, {
      round: 2,
      winner: "T",
      reason: "target_bombed",
      score: { ct: 1, t: 1 },
    });

    const open = findOpenMatch();
    assert.equal(open?.id, id);
    assert.deepEqual(
      getRounds(open!.id).map((r) => r.round),
      [1, 2],
    );

    endMatch(id, { ct: 1, t: 1 }, []);
    // The timeline follows the open match, so a finished one leaves the live
    // view empty rather than showing the last game under the next one's score.
    assert.equal(findOpenMatch(), null);
  });

  it("replaces a replayed round instead of listing it twice", async () => {
    const { beginMatch, insertRound, getRounds, endMatch } = await import(
      "@/lib/db/matches"
    );
    const id = beginMatch("de_dust2", "competitive");
    insertRound(id, {
      round: 5,
      winner: "T",
      reason: "target_bombed",
      score: { ct: 2, t: 3 },
    });
    // `mp_restartgame` and a MatchZy round restore both replay a round number
    // that is already recorded.
    insertRound(id, {
      round: 5,
      winner: "CT",
      reason: "bomb_defused",
      score: { ct: 3, t: 2 },
    });

    const rounds = getRounds(id);
    assert.equal(rounds.length, 1);
    assert.equal(rounds[0].winner, "CT");
    endMatch(id, { ct: 3, t: 2 }, []);
  });
});

describe("plugin regression memory", () => {
  /**
   * The alarming transition is *was loaded, now is not* — and the panel
   * restarts to apply CS2 updates, which is exactly when the plugins break. So
   * the "was" has to outlive the process, or the alarm is erased at the one
   * moment it should fire.
   */
  const statusWith = (matchzy: boolean | null): ServerStatus => ({
    state: "running",
    hostname: "sidearm",
    map: "de_mirage",
    gameMode: "competitive",
    players: 0,
    maxPlayers: 10,
    uptimeSec: 3600,
    cpuPct: 10,
    memMb: 500,
    memMaxMb: 6144,
    fps: null,
    tickrate: null,
    vacSecure: true,
    build: 14177,
    gotv: null,
    plugins: { matchzy, metamod: null, cssharp: null, regressed: false },
    connectUrl: "connect 127.0.0.1:27015",
    ip: "127.0.0.1",
    port: 27015,
    control: { docker: true, rcon: true },
  });

  it("does not cry regression on a server that never had plugins", async () => {
    const { updateCache } = await import("@/lib/api/server/real");
    const s = statusWith(false);
    updateCache(s, null);
    assert.equal(s.plugins!.regressed, false);
  });

  it("remembers MatchZy across a restart and then flags its absence", async () => {
    const { updateCache } = await import("@/lib/api/server/real");

    const loaded = statusWith(true);
    updateCache(loaded, null);
    assert.equal(loaded.plugins!.regressed, false);

    // A CS2 update lands, gameinfo.gi is rewritten, the container restarts —
    // and the panel restarts with it. The memory is on disk, so it survives.
    const gone = statusWith(false);
    updateCache(gone, null);
    assert.equal(gone.plugins!.regressed, true);
  });

  it("treats an unreadable probe as unknown, not as a regression", async () => {
    // RCON drops are routine. A dropped probe firing the banner would make it
    // noise, and a banner people learn to ignore is worse than none.
    const { updateCache } = await import("@/lib/api/server/real");
    const unknown = statusWith(null);
    updateCache(unknown, null);
    assert.equal(unknown.plugins!.regressed, false);
  });

  it("clears once the plugins come back", async () => {
    const { updateCache } = await import("@/lib/api/server/real");
    const back = statusWith(true);
    updateCache(back, null);
    assert.equal(back.plugins!.regressed, false);
  });
});
