import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pendingOpSettled } from "@/lib/api/server/real";
import type { PendingOp, ServerStatus } from "@/lib/api/types";

const status = (over: Partial<ServerStatus> = {}): ServerStatus => ({
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
  plugins: null,
  connectUrl: "connect 127.0.0.1:27015",
  ip: "127.0.0.1",
  port: 27015,
  control: { docker: true, rcon: true },
  ...over,
});

const op = (over: Partial<PendingOp> = {}): PendingOp => ({
  kind: "map",
  since: new Date().toISOString(),
  ...over,
});

describe("pendingOpSettled — map change", () => {
  it("stays pending until the server reports the map it was asked for", () => {
    const o = op({ kind: "map", target: "de_dust2" });
    assert.equal(pendingOpSettled(o, status({ map: "de_mirage" })), false);
    assert.equal(pendingOpSettled(o, status({ map: "de_dust2" })), true);
  });

  it("recognises a workshop map by id once it loads under its short name", () => {
    // The panel asks for `workshop/3070602404`; the server reports the map's
    // filename once it has finished downloading and loading it.
    const o = op({ kind: "map", target: "workshop/3070602404" });
    assert.equal(pendingOpSettled(o, status({ map: "de_mirage" })), false);
    assert.equal(
      pendingOpSettled(o, status({ map: "workshop/3070602404/aim_botz" })),
      true,
    );
  });
});

describe("pendingOpSettled — lifecycle", () => {
  it("settles a stop only once the container is actually stopped", () => {
    const o = op({ kind: "stop" });
    assert.equal(pendingOpSettled(o, status({ state: "stopping" })), false);
    assert.equal(pendingOpSettled(o, status({ state: "stopped" })), true);
  });

  it("settles a start only once the container is running", () => {
    const o = op({ kind: "start" });
    assert.equal(pendingOpSettled(o, status({ state: "starting" })), false);
    assert.equal(pendingOpSettled(o, status({ state: "running" })), true);
  });

  it("does not call a restart done on the container it asked to replace", () => {
    // The bug this guards: `state === "running"` is true a millisecond after
    // the request, before Docker has torn the old process down, so the restart
    // would report success without anything having happened.
    const o = op({ kind: "restart", since: new Date().toISOString() });
    const stillOld = status({ state: "running", uptimeSec: 3600 });
    assert.equal(pendingOpSettled(o, stillOld), false);
  });

  it("settles a restart once the container is newer than the request", () => {
    const o = op({
      kind: "restart",
      since: new Date(Date.now() - 60_000).toISOString(),
    });
    const restarted = status({ state: "running", uptimeSec: 20 });
    assert.equal(pendingOpSettled(o, restarted), true);
  });

  it("stays pending while uptime is unknown", () => {
    // Docker unreachable: we cannot tell whether the restart happened, and
    // unknown must never resolve to "done".
    const o = op({ kind: "restart" });
    assert.equal(
      pendingOpSettled(o, status({ state: "running", uptimeSec: null })),
      false,
    );
  });

  it("treats applying an update like the restart it is", () => {
    const o = op({
      kind: "update",
      since: new Date(Date.now() - 60_000).toISOString(),
    });
    assert.equal(pendingOpSettled(o, status({ uptimeSec: 3600 })), false);
    assert.equal(pendingOpSettled(o, status({ uptimeSec: 5 })), true);
  });
});
