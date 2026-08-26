import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  containerStateToServerState,
  envMaxPlayers,
  humanSlots,
  parseGameMode,
  parseStatusText,
  uptimeFrom,
} from "@/lib/cs2/status";
import {
  getMatchState,
  mergeRoster,
  updateCache,
  updateMatchState,
} from "@/lib/api/server/real";
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

/**
 * Verbatim from the live server (CS2 build 1.41.7.7, `CS2_MAXPLAYERS=10`,
 * `sv_visiblemaxplayers = -1`). Note `(0 max)`: this is exactly the output that
 * made the panel display "0/0 players" on a healthy server.
 */
const REAL_CS2 = `Server:  Running [0.0.0.0:27015]
Client:  Disconnected
----- Status -----
@ Current  :  game
source   : console
hostname : sidearm
spawn    : 1
version  : 1.41.7.7/14177 10896 secure  public
steamid  : [G:1:15633205] (85568392935672629)
udp/ip   : 0.0.0.0:27015 (public 76.226.161.203:27015)
os/type  : Linux dedicated
players  : 0 humans, 2 bots (0 max) (not hibernating) (unreserved)
---------spawngroups----
loaded spawngroup(  1)  : SV:  [1: de_mirage | main lump | mapload]
---------players--------
  id     time ping loss      state   rate adr name
   0      BOT    0    0     active      0 'Mangos'
   1      BOT    0    0     active      0 'Rezan'
#end
`;

describe("parseStatusText — real CS2 output", () => {
  const s = parseStatusText(REAL_CS2);

  it("reads hostname and falls back to the spawngroup line for the map", () => {
    assert.equal(s.hostname, "sidearm");
    assert.equal(s.map, "de_mirage");
  });

  it("reports the advertised max as 0 without mistaking it for the ceiling", () => {
    // Regression: this figure is sv_visiblemaxplayers, which defaults to -1 and
    // prints as 0. Treating it as maxPlayers is what showed "0/0" in the UI.
    assert.equal(s.visibleMaxPlayers, 0);
    assert.equal(s.humans, 0);
    assert.equal(s.bots, 2);
  });

  it("counts bots as bots, not as players", () => {
    assert.equal(s.players.length, 0);
  });

  it("reads the VAC flag", () => {
    assert.equal(s.vacSecure, true);
  });
});

describe("GOTV", () => {
  // Verbatim from the live server with TV_ENABLE=1. `tv_status` is the obvious
  // read-back and is useless: over RCON on CS2 it returns an empty string, so
  // this line is the only signal that GOTV is up.
  const WITH_TV = `hostname : sidearm
version  : 1.41.7.7/14177 10896 secure  public
sourcetv[0] : 0.0.0.0:27020 (public 76.226.161.203:27020) delay 30.0s
players  : 0 humans, 3 bots (0 max) (not hibernating) (unreserved)
`;

  it("reads the address and delay when GOTV is running", () => {
    const s = parseStatusText(WITH_TV);
    assert.equal(s.gotv?.address, "0.0.0.0:27020");
    assert.equal(s.gotv?.delaySec, 30);
  });

  it("is null when GOTV is off — the line is simply absent", () => {
    assert.equal(parseStatusText(REAL_CS2).gotv, null);
  });
});

describe("humanSlots", () => {
  it("subtracts the slot GOTV occupies", () => {
    // Verified live: with -maxplayers 10 and GOTV on, the server lists
    // 'sidearm CSTV' in slot 0 and only nine people can connect — enough to
    // break a 5v5 without anything in the launch line hinting at it.
    assert.equal(humanSlots(10, true), 9);
    assert.equal(humanSlots(10, false), 10);
  });

  it("stays null when the ceiling is unknown", () => {
    assert.equal(humanSlots(null, true), null);
    assert.equal(humanSlots(null, false), null);
  });

  it("never goes negative", () => {
    assert.equal(humanSlots(0, true), 0);
  });
});

describe("VAC flag", () => {
  const withVersion = (line: string) =>
    parseStatusText(`hostname : x\nversion  : ${line}\n`).vacSecure;

  it("matches `secure` on a word boundary, not inside `insecure`", () => {
    // The whole point: reporting a dead GSLT as healthy is the worst possible
    // failure for this field.
    assert.equal(withVersion("1.41.7.7/14177 10896 secure  public"), true);
    assert.equal(withVersion("1.41.7.7/14177 10896 insecure  public"), false);
  });

  it("is null when there is no version line at all", () => {
    assert.equal(parseStatusText("hostname : x\n").vacSecure, null);
  });
});

describe("envMaxPlayers", () => {
  it("reads the real ceiling off the container launch environment", () => {
    assert.equal(
      envMaxPlayers(["CS2_PORT=27015", "CS2_MAXPLAYERS=10", "PATH=/usr/bin"]),
      10,
    );
  });

  it("returns null rather than guessing when it is absent or junk", () => {
    assert.equal(envMaxPlayers(null), null);
    assert.equal(envMaxPlayers(["CS2_PORT=27015"]), null);
    assert.equal(envMaxPlayers(["CS2_MAXPLAYERS="]), null);
    assert.equal(envMaxPlayers(["CS2_MAXPLAYERS=0"]), null);
  });
});

describe("uptimeFrom", () => {
  it("derives seconds from the container StartedAt", () => {
    const started = new Date(Date.now() - 90_000).toISOString();
    const secs = uptimeFrom({ StartedAt: started });
    assert.ok(secs !== null && secs >= 89 && secs <= 92, `got ${secs}`);
  });

  it("is null when Docker did not answer or the stamp is unusable", () => {
    assert.equal(uptimeFrom(null), null);
    assert.equal(uptimeFrom({ StartedAt: undefined }), null);
    assert.equal(uptimeFrom({ StartedAt: "not-a-date" }), null);
  });
});

describe("parseStatusText — hash table layout", () => {
  const s = parseStatusText(HASH_TABLE);

  it("reads hostname and map", () => {
    assert.equal(s.hostname, "sidearm | 5v5 comp");
    assert.equal(s.map, "de_mirage");
  });

  it("reads human count and the advertised max from '(10/0 max)'", () => {
    assert.equal(s.humans, 2);
    // Advertised, not the ceiling: `(N max)` reports sv_visiblemaxplayers.
    assert.equal(s.visibleMaxPlayers, 10);
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

  it("reads the advertised max from '(16 max)'", () => {
    assert.equal(s.visibleMaxPlayers, 16);
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

  it("reads the unquoted echo format CS2 actually uses", () => {
    // Live CS2 answers `game_type = 0`, not Source's `"game_type" = "0"`.
    assert.equal(parseGameMode("game_type = 0\ngame_mode = 1\n"), "competitive");
    assert.equal(parseGameMode("game_type = 1\ngame_mode = 2\n"), "deathmatch");
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
    assert.equal(containerStateToServerState({ Running: true }, true), "running");
    assert.equal(containerStateToServerState({ Restarting: true }), "starting");
    assert.equal(containerStateToServerState({ Paused: true }), "stopping");
    assert.equal(containerStateToServerState({ Running: false }), "stopped");
    assert.equal(containerStateToServerState({ Dead: true }), "crashed");
  });

  it("reports 'crashed' when the healthcheck has given up and RCON is silent", () => {
    // compose gives the healthcheck retries: 6 at 30s, so "unhealthy" already
    // means three minutes of a closed game port — no extra debounce needed.
    assert.equal(
      containerStateToServerState(
        { Running: true, Health: { Status: "unhealthy" } },
        false,
      ),
      "crashed",
    );
  });

  it("stays 'running' on an unhealthy container that still answers RCON", () => {
    assert.equal(
      containerStateToServerState(
        { Running: true, Health: { Status: "unhealthy" } },
        true,
      ),
      "running",
    );
  });

  it("reports 'starting' while the healthcheck is still in its grace period", () => {
    assert.equal(
      containerStateToServerState(
        { Running: true, Health: { Status: "starting" } },
        false,
      ),
      "starting",
    );
  });

  it("reports 'starting' for a running container whose RCON is silent", () => {
    // This image runs steamcmd from its entrypoint, so the container is up for
    // the whole of a ~70 GB download while srcds is not listening. Reporting
    // "running" there showed a live server pill next to an "unknown" map.
    assert.equal(containerStateToServerState({ Running: true }, false), "starting");
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
    fps: null,
    tickrate: null,
    vacSecure: true,
    build: 14177,
    gotv: null,
    connectUrl: "connect 127.0.0.1:27015",
    ip: "127.0.0.1",
    port: 27015,
    control: { docker: true, rcon: true },
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

describe("updateCache — mp_maxrounds", () => {
  const status: ServerStatus = {
    state: "running",
    hostname: "test",
    map: "de_mirage",
    gameMode: "competitive",
    players: 0,
    maxPlayers: 10,
    uptimeSec: 0,
    cpuPct: 0,
    memMb: 0,
    memMaxMb: 8192,
    fps: null,
    tickrate: null,
    vacSecure: true,
    build: 14177,
    gotv: null,
    connectUrl: "connect 127.0.0.1:27015",
    ip: "127.0.0.1",
    port: 27015,
    control: { docker: true, rcon: true },
  };

  it("takes the match length from the server rather than a constant", () => {
    updateCache(status, [], { maxRounds: 16 });
    assert.equal(getMatchState().maxRounds, 16);
  });

  it("keeps the known length when a poll fails to read it", () => {
    // An RCON tick that drops must not reset a known match length to unknown;
    // the round counter would silently lose its denominator mid-match.
    updateCache(status, [], { maxRounds: 16 });
    updateCache(status, [], { maxRounds: null });
    assert.equal(getMatchState().maxRounds, 16);
  });
});

describe("updateCache — pause across a map change", () => {
  const at = (map: string): ServerStatus => ({
    state: "running",
    hostname: "test",
    map,
    gameMode: "competitive",
    players: 0,
    maxPlayers: 10,
    uptimeSec: 0,
    cpuPct: 0,
    memMb: 0,
    memMaxMb: 8192,
    fps: null,
    tickrate: null,
    vacSecure: true,
    build: 14177,
    gotv: null,
    connectUrl: "connect 127.0.0.1:27015",
    ip: "127.0.0.1",
    port: 27015,
    control: { docker: true, rcon: true },
  });

  it("clears a pause when the level changes", () => {
    updateCache(at("de_mirage"), []);
    updateMatchState({ pause: "paused" });
    updateCache(at("de_dust2"), []);
    assert.equal(getMatchState().pause, "running");
  });

  it("drops demo state to unknown rather than asserting it", () => {
    // GOTV stops recording at a level change, but whether it restarted is not
    // something the panel can see — so it says so instead of guessing.
    updateCache(at("de_dust2"), []);
    updateMatchState({ demo: { state: "recording", name: "x" } });
    updateCache(at("de_nuke"), []);
    assert.equal(getMatchState().demo.state, "unknown");
  });

  it("leaves state alone while the map is unchanged", () => {
    updateCache(at("de_nuke"), []);
    updateMatchState({ pause: "paused" });
    updateCache(at("de_nuke"), []);
    assert.equal(getMatchState().pause, "paused");
  });
});
