import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isFirstRun } from "@/components/first-run";
import type { ServerStatus } from "@/lib/api/types";

const status = (over: Partial<ServerStatus> = {}): ServerStatus => ({
  state: "starting",
  hostname: "CS2 Server",
  map: "unknown",
  gameMode: "competitive",
  players: 0,
  maxPlayers: 10,
  uptimeSec: 30,
  cpuPct: 40,
  memMb: 200,
  memMaxMb: 6144,
  fps: null,
  tickrate: null,
  vacSecure: null,
  build: null,
  gotv: null,
  connectUrl: "connect 127.0.0.1:27015",
  ip: "127.0.0.1",
  port: 27015,
  control: { docker: true, rcon: false },
  ...over,
});

describe("isFirstRun", () => {
  it("recognises a container that has never been reachable", () => {
    assert.equal(isFirstRun(status()), true);
    assert.equal(isFirstRun(status({ state: "updating" })), true);
  });

  it("is not a first run once RCON has answered", () => {
    assert.equal(isFirstRun(status({ control: { docker: true, rcon: true } })), false);
  });

  it("is not a first run for a server updating from a known build", () => {
    // A routine update keeps the map and build it had before; the top bar
    // already narrates that, and hiding the dashboard would be wrong.
    assert.equal(
      isFirstRun(status({ state: "updating", build: 14177, map: "de_mirage" })),
      false,
    );
  });

  it("is not a first run for a stopped or crashed server", () => {
    assert.equal(isFirstRun(status({ state: "stopped" })), false);
    assert.equal(isFirstRun(status({ state: "crashed" })), false);
  });
});
