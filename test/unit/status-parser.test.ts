import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  containerStateToServerState,
  parseGameMode,
  parseStatusText,
} from "@/lib/cs2/status";
import { mergeRoster, updateCache } from "@/lib/api/server/real";
import type { Player, ServerStatus } from "@/lib/api/types";

/**
 * `status` layouts vary between CS2 builds; the parser accepts every shape we
 * know of. Tier 3 of the test plan captures the real output from a live server
 * and pins these fixtures to it.
 */

const HASH_TABLE = `
hostname: sidearm | 5v5 comp
version : 1.40.7.3/14073 9945 secure
os      : Linux
type    : community dedicated
map     : de_mirage
players : 2 humans, 1 bots (10/0 max) (not hibernating)

# userid name uniqueid connected ping loss state rate adr
# 2 "Neo" [U:1:12345] 01:23 30 0 active 786432 1.2.3.4:27005
# 3 "Trinity" [U:1:67890] 00:42 55 0 active 786432 5.6.7.8:27005
# 4 "Bot Kyle" BOT 00:10 0 0 active 0
`;

const LEGACY_TABLE = `
hostname : sidearm
loaded spawngroup(  1)  : SV:  [1: de_dust2 | main lump | mapload]
players  : 1 humans, 2 bots (16 max) (not hibernating) (unreserved)

  2   12:34    0    0     active  786432 1.2.3.4:27005 'Neo'
  3   00:05   12    0     active  786432 BOT 'Bot Kyle'
`;

describe("parseStatusText — hash table layout", () => {
  const s = parseStatusText(HASH_TABLE);

  it("reads hostname and map", () => {
    assert.equal(s.hostname, "sidearm | 5v5 comp");
    assert.equal(s.map, "de_mirage");
  });

  it("reads human count and max players from '(10/0 max)'", () => {
    assert.equal(s.humans, 2);
    assert.equal(s.maxPlayers, 10);
  });

  it("extracts real SteamIDs, not slot numbers", () => {
    assert.deepEqual(
      s.players.map((p) => p.steamId),
      ["[U:1:12345]", "[U:1:67890]"],
    );
  });

  it("keeps the RCON userid separately for kickid", () => {
    assert.deepEqual(
      s.players.map((p) => p.userId),
      ["2", "3"],
    );
  });

  it("excludes bots", () => {
    assert.equal(s.players.length, 2);
    assert.ok(!s.players.some((p) => p.name.includes("Bot")));
  });

  it("reads ping", () => {
    assert.deepEqual(
      s.players.map((p) => p.ping),
      [30, 55],
    );
  });
});

describe("parseStatusText — legacy layout", () => {
  const s = parseStatusText(LEGACY_TABLE);

  it("falls back to the spawngroup line for the map", () => {
    assert.equal(s.map, "de_dust2");
  });

  it("reads max players from '(16 max)'", () => {
    assert.equal(s.maxPlayers, 16);
  });

  it("excludes bots and keeps humans", () => {
    assert.equal(s.players.length, 1);
    assert.equal(s.players[0].name, "Neo");
    assert.equal(s.players[0].userId, "2");
  });
});

describe("parseStatusText — degenerate input", () => {
  it("does not throw on empty or garbage input", () => {
    for (const t of ["", "   ", "garbage\nlines\n"]) {
      assert.doesNotThrow(() => parseStatusText(t));
    }
  });

  it("returns safe defaults when nothing matches", () => {
    const s = parseStatusText("");
    assert.equal(s.hostname, "CS2 Server");
    assert.equal(s.map, "unknown");
    assert.deepEqual(s.players, []);
  });
});

describe("parseGameMode", () => {
  it("maps game_type/game_mode pairs", () => {
    assert.equal(parseGameMode(`"game_type" = "0"\n"game_mode" = "1"`), "competitive");
    assert.equal(parseGameMode(`"game_type" = "0"\n"game_mode" = "2"`), "wingman");
    assert.equal(parseGameMode(`"game_type" = "1"\n"game_mode" = "2"`), "deathmatch");
  });

  it("defaults to competitive on unparseable output", () => {
    assert.equal(parseGameMode("nonsense"), "competitive");
  });
});

describe("containerStateToServerState", () => {
  it("does not report 'stopped' when the Docker socket is unreachable", () => {
    // Reporting "stopped" here flips the top bar to a Start button on a
    // perfectly healthy server.
    assert.notEqual(containerStateToServerState(null, true), "stopped");
    assert.equal(containerStateToServerState(null, true), "running");
  });

  it("maps the ordinary states", () => {
    assert.equal(containerStateToServerState({ Running: true }), "running");
    assert.equal(containerStateToServerState({ Restarting: true }), "starting");
    assert.equal(containerStateToServerState({ Paused: true }), "stopping");
    assert.equal(containerStateToServerState({ Running: false }), "stopped");
    assert.equal(containerStateToServerState({ Dead: true }), "crashed");
  });
});

describe("mergeRoster", () => {
  const base = (over: Partial<Player> = {}): Player => ({
    steamId: "[U:1:1]",
    userId: "2",
    name: "Neo",
    team: "CT",
    k: 5,
    d: 3,
    a: 2,
    ping: 30,
    connectedAt: "2024-10-05T12:00:00.000Z",
    ...over,
  });

  it("preserves k/d/a across a poll that reports zeros", () => {
    const merged = mergeRoster(
      [base()],
      [base({ k: 0, d: 0, a: 0, ping: 44, connectedAt: "2024-10-05T13:00:00.000Z" })],
    );
    assert.equal(merged[0].k, 5);
    assert.equal(merged[0].d, 3);
    assert.equal(merged[0].a, 2);
  });

  it("preserves team, which status cannot report", () => {
    const merged = mergeRoster([base({ team: "T" })], [base({ team: "SPEC" })]);
    assert.equal(merged[0].team, "T");
  });

  it("preserves the original connectedAt", () => {
    const merged = mergeRoster(
      [base()],
      [base({ connectedAt: "2024-10-05T13:00:00.000Z" })],
    );
    assert.equal(merged[0].connectedAt, "2024-10-05T12:00:00.000Z");
  });

  it("takes the live ping from the poll", () => {
    const merged = mergeRoster([base()], [base({ ping: 99 })]);
    assert.equal(merged[0].ping, 99);
  });

  it("matches on name when status has no uniqueid column", () => {
    const polled = base({ steamId: "Neo", userId: "7", k: 0, d: 0, a: 0 });
    const merged = mergeRoster([base()], [polled]);
    assert.equal(merged[0].k, 5, "stats should survive a name-keyed match");
    assert.equal(
      merged[0].steamId,
      "[U:1:1]",
      "should keep the real SteamID rather than downgrade to the name",
    );
    assert.equal(merged[0].userId, "7", "userid should follow the live poll");
  });

  it("adopts a real SteamID once status starts reporting one", () => {
    const merged = mergeRoster(
      [base({ steamId: "Neo" })],
      [base({ steamId: "[U:1:1]", k: 0 })],
    );
    assert.equal(merged[0].steamId, "[U:1:1]");
    assert.equal(merged[0].k, 5);
  });

  it("drops players no longer present and adds new ones", () => {
    const merged = mergeRoster(
      [base(), base({ steamId: "[U:1:2]", name: "Trinity" })],
      [base({ steamId: "[U:1:3]", name: "Morpheus", k: 0, d: 0, a: 0 })],
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].name, "Morpheus");
  });
});

describe("updateCache roster handling", () => {
  const player = (over: Partial<Player> = {}): Player => ({
    steamId: "[U:1:1]",
    userId: "2",
    name: "Neo",
    team: "CT",
    k: 5,
    d: 3,
    a: 2,
    ping: 30,
    connectedAt: "2024-10-05T12:00:00.000Z",
    ...over,
  });

  const status: ServerStatus = {
    state: "running",
    hostname: "test",
    map: "de_mirage",
    gameMode: "competitive",
    players: 1,
    maxPlayers: 10,
    uptimeSec: 0,
    cpuPct: 0,
    memMb: 0,
    memMaxMb: 8192,
    fps: 0,
    tickrate: 64,
    connectUrl: "connect 127.0.0.1:27015",
    ip: "127.0.0.1",
    port: 27015,
  };

  it("keeps the last known roster when the poll could not read one", () => {
    // RCON drops are routine (the README documents it). Treating a failed poll
    // as "nobody is connected" blanks the players page and destroys every
    // accumulated stat.
    globalThis.__cs2Cache.players = [player()];
    updateCache(status, null);
    assert.equal(globalThis.__cs2Cache.players.length, 1);
    assert.equal(globalThis.__cs2Cache.players[0].k, 5);
  });

  it("merges when the poll did read a roster", () => {
    globalThis.__cs2Cache.players = [player()];
    updateCache(status, [player({ k: 0, d: 0, a: 0, ping: 99 })]);
    assert.equal(globalThis.__cs2Cache.players[0].k, 5, "stats survive");
    assert.equal(globalThis.__cs2Cache.players[0].ping, 99, "ping is live");
  });

  it("empties the roster when the poll genuinely reports nobody", () => {
    globalThis.__cs2Cache.players = [player()];
    updateCache(status, []);
    assert.deepEqual(globalThis.__cs2Cache.players, []);
  });
});
