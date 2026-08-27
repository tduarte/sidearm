import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  mergeHistory,
  readMatchZyMaps,
  roundsPlayed,
  toHistoryEntry,
  toIso,
  toPlayerStats,
  type MatchZyMap,
} from "@/lib/cs2/matchzy-db";
import type { MatchHistoryDetail } from "@/lib/api/types";

/**
 * Built with MatchZy's real schema, taken verbatim from a live server running
 * MatchZy 0.8.15 — `pragma table_info` on the file the plugin created itself.
 */
let dir: string;
let dbFile: string;

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sidearm-mzdb-"));
  dbFile = path.join(dir, "matchzy.db");
  const db = new Database(dbFile);
  db.exec(`
    CREATE TABLE matchzy_stats_matches (
      matchid INTEGER, start_time DATETIME, end_time DATETIME, winner TEXT,
      series_type TEXT, team1_name TEXT, team1_score INTEGER,
      team2_name TEXT, team2_score INTEGER, server_ip TEXT);
    CREATE TABLE matchzy_stats_maps (
      matchid INTEGER, mapnumber INTEGER, start_time DATETIME, end_time DATETIME,
      winner TEXT, mapname TEXT, team1_score INTEGER, team2_score INTEGER);
    CREATE TABLE matchzy_stats_players (
      matchid INTEGER, mapnumber INTEGER, steamid64 INTEGER, team TEXT, name TEXT,
      kills INTEGER, deaths INTEGER, damage INTEGER, assists INTEGER,
      enemy5ks INTEGER, enemy4ks INTEGER, enemy3ks INTEGER, enemy2ks INTEGER,
      utility_count INTEGER, utility_damage INTEGER, utility_successes INTEGER,
      utility_enemies INTEGER, flash_count INTEGER, flash_successes INTEGER,
      health_points_removed_total INTEGER, health_points_dealt_total INTEGER,
      shots_fired_total INTEGER, shots_on_target_total INTEGER,
      v1_count INTEGER, v1_wins INTEGER, v2_count INTEGER, v2_wins INTEGER,
      entry_count INTEGER, entry_wins INTEGER, equipment_value INTEGER,
      money_saved INTEGER, kill_reward INTEGER, live_time INTEGER,
      head_shot_kills INTEGER, cash_earned INTEGER, enemies_flashed INTEGER);

    INSERT INTO matchzy_stats_matches VALUES
      (1,'2026-08-27 20:10:35','2026-08-27 20:52:00','Astra','BO1','Astra',13,'Nova',9,'-');
    INSERT INTO matchzy_stats_maps VALUES
      (1,0,'2026-08-27 20:10:35','2026-08-27 20:52:00','Astra','de_mirage',13,9);
    INSERT INTO matchzy_stats_players
      (matchid,mapnumber,steamid64,team,name,kills,deaths,assists,damage,
       head_shot_kills,enemies_flashed,utility_damage,
       entry_count,entry_wins,v1_count,v1_wins,v2_count,v2_wins)
      VALUES
      (1,0,CAST('76561197960265728' AS INTEGER),'Astra','ace',25,14,4,2200,10,7,120,8,5,3,2,1,0),
      (1,0,CAST('76561199000000001' AS INTEGER),'Nova','bob',11,20,6,1400,2,3,60,4,1,1,0,2,1);
  `);
  db.close();
  process.env.MATCHZY_DB_PATH = dbFile;
});

after(() => {
  delete process.env.MATCHZY_DB_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe("toIso", () => {
  it("reads MatchZy timestamps as UTC", () => {
    // MatchZy writes `YYYY-MM-DD HH:MM:SS` with no zone. `new Date()` on that
    // parses it as LOCAL time, silently shifting every match by the host's
    // offset — which would break the overlap matching in mergeHistory.
    assert.equal(toIso("2026-08-27 20:10:35"), "2026-08-27T20:10:35.000Z");
  });

  it("passes null through and refuses nonsense", () => {
    assert.equal(toIso(null), null);
    assert.equal(toIso("not a date"), null);
  });
});

describe("roundsPlayed", () => {
  it("is null rather than zero when there is no map", () => {
    // So callers divide by nothing instead of by zero.
    assert.equal(roundsPlayed(0, 0), null);
    assert.equal(roundsPlayed(13, 9), 22);
  });
});

describe("readMatchZyMaps", () => {
  it("reads the plugin's own record of a match", () => {
    const maps = readMatchZyMaps();
    assert.equal(maps.length, 1);
    const m = maps[0];
    assert.equal(m.map, "de_mirage");
    assert.deepEqual(m.team1, { name: "Astra", score: 13 });
    assert.deepEqual(m.team2, { name: "Nova", score: 9 });
    assert.equal(m.startedAt, "2026-08-27T20:10:35.000Z");
    assert.equal(m.players.length, 2);
  });

  it("sorts the scoreboard by kills", () => {
    assert.equal(readMatchZyMaps()[0].players[0].name, "ace");
  });

  it("computes ADR against the rounds actually played", () => {
    const ace = readMatchZyMaps()[0].players[0];
    assert.equal(ace.adr, Math.round(2200 / 22));
    assert.equal(ace.headshotPct, 40);
  });

  it("reads Steam ids back exactly", () => {
    // The end-to-end version of the mapper test: through better-sqlite3, off
    // a real INTEGER column. Without safeIntegers this comes back as ...730.
    const ids = readMatchZyMaps()[0].players.map((p) => p.steamId64).sort();
    assert.deepEqual(ids, ["76561197960265728", "76561199000000001"]);
  });

  it("returns nothing when the plugin was never installed", () => {
    // Most installs of this panel. Must not throw, and must not create a file
    // where MatchZy expects its own.
    process.env.MATCHZY_DB_PATH = path.join(dir, "absent.db");
    assert.deepEqual(readMatchZyMaps(), []);
    assert.equal(
      existsSync(path.join(dir, "absent.db")),
      false,
      "must not have created a database",
    );
    process.env.MATCHZY_DB_PATH = dbFile;
  });
});

describe("toPlayerStats", () => {
  const row = {
    matchid: 1, mapnumber: 0, steamid64: BigInt("76561197960265728"), team: "A", name: "x",
    kills: 0, deaths: 5, assists: 0, damage: 0, head_shot_kills: 0,
    enemies_flashed: 0, utility_damage: 0, entry_count: 0, entry_wins: 0,
    v1_count: 0, v1_wins: 0, v2_count: 0, v2_wins: 0,
  };

  it("keeps the Steam id exact", () => {
    // Every Steam64 is ~7.6e16, past 2^53. Through a JS number,
    // 76561197960265728 becomes ...730 and the scoreboard names a different
    // account. This assertion fails if the reader ever drops safeIntegers.
    assert.equal(toPlayerStats(row, 22).steamId64, "76561197960265728");
    assert.equal(
      toPlayerStats({ ...row, steamid64: BigInt("76561199000000001") }, 22).steamId64,
      "76561199000000001",
    );
  });

  it("reports unknown averages as null, not zero", () => {
    // "No data" and "did nothing" are different answers.
    assert.equal(toPlayerStats(row, null).adr, null);
    assert.equal(toPlayerStats(row, 22).headshotPct, null, "no kills, no percentage");
  });

  it("adds 1v1 and 1v2 into one clutch figure", () => {
    const s = toPlayerStats(
      { ...row, v1_count: 3, v1_wins: 2, v2_count: 1, v2_wins: 1 },
      22,
    );
    assert.deepEqual(s.clutches, { played: 4, won: 3 });
  });
});

describe("mergeHistory", () => {
  const panelMatch = (over: Partial<MatchHistoryDetail> = {}): MatchHistoryDetail => ({
    id: "p1",
    startedAt: "2026-08-27T20:12:00.000Z",
    endedAt: "2026-08-27T20:50:00.000Z",
    map: "de_mirage",
    gameMode: "competitive",
    finalScore: { ct: 13, t: 9 },
    winner: "CT",
    playerCount: 10,
    players: [],
    ...over,
  });

  const mzMap = (over: Partial<MatchZyMap> = {}): MatchZyMap => ({
    matchId: 1,
    mapNumber: 0,
    map: "de_mirage",
    startedAt: "2026-08-27T20:10:35.000Z",
    endedAt: "2026-08-27T20:52:00.000Z",
    seriesType: "BO1",
    team1: { name: "Astra", score: 13 },
    team2: { name: "Nova", score: 9 },
    winner: "Astra",
    players: [],
    ...over,
  });

  it("drops the panel's copy of a match MatchZy also recorded", () => {
    // The log parser keeps running with the plugin installed, so both describe
    // the same game. Listing both shows every match twice.
    const out = mergeHistory([panelMatch()], [mzMap()]);
    assert.equal(out.length, 1);
    assert.equal(out[0].source, "matchzy");
    assert.deepEqual(out[0].teams?.map((t) => t.name), ["Astra", "Nova"]);
  });

  it("keeps panel matches played before the plugin existed", () => {
    // Deciding this at read time is what makes that possible.
    const old = panelMatch({
      id: "old",
      startedAt: "2026-08-01T10:00:00.000Z",
      endedAt: "2026-08-01T10:40:00.000Z",
    });
    const out = mergeHistory([old, panelMatch()], [mzMap()]);
    assert.deepEqual(out.map((m) => m.id), ["matchzy:1:0", "old"]);
  });

  it("suppresses the duplicate of a match still in progress", () => {
    // An unfinished MatchZy map is live state, not history — but the panel's
    // copy of it must not sneak into the list either.
    const out = mergeHistory([panelMatch()], [mzMap({ endedAt: null })]);
    assert.deepEqual(out, []);
  });

  it("stops an abandoned match suppressing the future forever", () => {
    // MatchZy writes end_time on a clean finish and never revisits the row
    // otherwise, so an abandoned pug or a container restart mid-match leaves it
    // open permanently. Treated as unbounded, that ONE row hides every match
    // played afterwards for the rest of time — which is exactly what happened
    // on the live server after a test pug was abandoned.
    const abandoned = mzMap({ endedAt: null });
    const nextWeek = panelMatch({
      id: "later",
      startedAt: "2026-09-03T18:00:00.000Z",
      endedAt: "2026-09-03T18:40:00.000Z",
    });
    assert.deepEqual(
      mergeHistory([nextWeek], [abandoned]).map((m) => m.id),
      ["later"],
    );
  });

  it("still suppresses a genuine duplicate of a match in progress right now", () => {
    // The bound must not be so tight that it stops doing its actual job.
    const abandoned = mzMap({ endedAt: null });
    const concurrent = panelMatch({
      id: "same-game",
      startedAt: "2026-08-27T20:12:00.000Z",
      endedAt: "2026-08-27T20:50:00.000Z",
    });
    assert.deepEqual(mergeHistory([concurrent], [abandoned]), []);
  });

  it("returns the panel's history untouched when there is no plugin", () => {
    const out = mergeHistory([panelMatch()], []);
    assert.equal(out.length, 1);
    assert.equal(out[0].source, undefined);
  });

  it("sorts everything newest first", () => {
    const out = mergeHistory(
      [panelMatch({ id: "a", startedAt: "2026-08-01T10:00:00.000Z", endedAt: "2026-08-01T10:40:00.000Z" })],
      [mzMap(), mzMap({ matchId: 2, startedAt: "2026-08-26T10:00:00.000Z", endedAt: "2026-08-26T10:40:00.000Z" })],
    );
    assert.deepEqual(out.map((m) => m.id), ["matchzy:1:0", "matchzy:2:0", "a"]);
  });
});

describe("toHistoryEntry", () => {
  it("names the winning team rather than a side", () => {
    // MatchZy teams swap sides at half-time, so "CT won" is not something its
    // record can express.
    const e = toHistoryEntry({
      matchId: 1, mapNumber: 0, map: "de_mirage",
      startedAt: "2026-08-27T20:10:35.000Z", endedAt: "2026-08-27T20:52:00.000Z",
      seriesType: "BO1",
      team1: { name: "Astra", score: 13 },
      team2: { name: "Nova", score: 9 },
      winner: "Astra", players: [],
    });
    assert.equal(e.winnerLabel, "Astra");
    assert.equal(e.source, "matchzy");
  });

  it("calls a tie a draw", () => {
    const e = toHistoryEntry({
      matchId: 1, mapNumber: 0, map: "de_mirage",
      startedAt: "2026-08-27T20:10:35.000Z", endedAt: "2026-08-27T20:52:00.000Z",
      seriesType: "BO1",
      team1: { name: "Astra", score: 12 },
      team2: { name: "Nova", score: 12 },
      winner: "", players: [],
    });
    assert.equal(e.winnerLabel, "");
    assert.equal(e.winner, "DRAW");
  });
});
