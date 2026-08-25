import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultResponder, startStubRcon, type StubRcon } from "../helpers/stub-rcon";

/**
 * `rcon-srcds` shares one socket, does no stream framing, and tags requests with
 * a random packet id. Overlapping `execute()` calls therefore cross their
 * responses; before serialisation was added, two concurrent commands would hang
 * forever and the status poll never completed a single tick.
 */

const ROSTER = [
  { userId: "2", name: "Neo", steamId: "[U:1:12345]", ping: 30 },
  { userId: "3", name: "Trinity", steamId: "[U:1:67890]", ping: 55 },
];

let stub: StubRcon;
let rconExec: (cmd: string) => Promise<string>;

before(async () => {
  stub = await startStubRcon({ password: "pw", respond: defaultResponder(ROSTER) });
  process.env.RCON_HOST = "127.0.0.1";
  process.env.RCON_PORT = String(stub.port);
  process.env.RCON_PASSWORD = "pw";
  process.env.RCON_COMMAND_TIMEOUT_MS = "3000";
  process.env.RCON_CONNECT_WAIT_MS = "3000";
  // Imported after the env is set — the module reads config at load time.
  ({ rconExec } = await import("@/lib/cs2/rcon"));
});

after(async () => {
  const { rconDisconnect } = await import("@/lib/cs2/rcon");
  rconDisconnect();
  await stub?.close();
});

describe("rconExec", () => {
  it("returns the full response for a single command", async () => {
    const out = await rconExec("status");
    assert.match(out, /hostname: sidearm test/);
    assert.match(out, /^# 2 "Neo"/m);
  });

  it("keeps concurrent commands from corrupting each other", async () => {
    const [status, gameMode] = await Promise.all([
      rconExec("status"),
      rconExec("game_type; game_mode"),
    ]);
    assert.match(status, /^# 2 "Neo"/m, "status response was corrupted");
    assert.match(gameMode, /game_mode/, "game_mode response was corrupted");
    assert.ok(!status.includes("game_mode"), "responses bled into each other");
  });

  it("handles a burst of concurrent commands", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        rconExec(i % 2 === 0 ? "status" : "game_type; game_mode"),
      ),
    );
    results.forEach((out, i) => {
      if (i % 2 === 0) assert.match(out, /^# 2 "Neo"/m, `status ${i} corrupted`);
      else assert.match(out, /game_mode/, `game_mode ${i} corrupted`);
    });
  });

  it("executes commands one at a time", async () => {
    stub.commands.length = 0;
    await Promise.all([
      rconExec("status"),
      rconExec("game_type; game_mode"),
      rconExec("status"),
    ]);
    // The stub records arrival order; serialisation means no interleaving.
    assert.deepEqual(stub.commands, ["status", "game_type; game_mode", "status"]);
  });
});

// Kept last: it takes the stub away, so nothing after it can talk to a server.
describe("rconExec when the server goes away", () => {
  it("rejects instead of hanging forever", async () => {
    await stub.close();

    const started = Date.now();
    await assert.rejects(
      () => rconExec("status"),
      "a command against a dead server must reject",
    );
    // Bounded by RCON_CONNECT_WAIT_MS / RCON_COMMAND_TIMEOUT_MS (3s each here).
    assert.ok(
      Date.now() - started < 15_000,
      `took ${Date.now() - started}ms — should fail fast, not hang`,
    );
  });

  it("does not grow the queue without bound while down", async () => {
    const { rconQueueDepth } = await import("@/lib/cs2/rcon");
    const attempts = Array.from({ length: 20 }, () =>
      rconExec("status").catch(() => "rejected"),
    );
    assert.ok(rconQueueDepth() <= 50, "queue exceeded its cap");
    const results = await Promise.all(attempts);
    assert.ok(results.every((r) => r === "rejected"));
    assert.equal(rconQueueDepth(), 0, "queue should drain back to empty");
  });
});
