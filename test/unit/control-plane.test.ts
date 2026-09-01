import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUnprotected } from "@/components/control-plane-banner";
import type { ServerStatus } from "@/lib/api/types";

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
  build: 14178,
  gotv: null,
  plugins: null,
  connectUrl: "connect 127.0.0.1:27015",
  ip: "127.0.0.1",
  port: 27015,
  control: { docker: true, rcon: true },
  ...over,
});

describe("isUnprotected", () => {
  it("fires on a running server whose version line says insecure", () => {
    assert.equal(isUnprotected(status({ vacSecure: false })), true);
  });

  it("stays quiet while VAC is on", () => {
    assert.equal(isUnprotected(status()), false);
  });

  it("stays quiet before RCON has read a version line", () => {
    // `null` is "not known yet", and warning about anti-cheat on the strength
    // of a missing line would fire on every boot.
    assert.equal(isUnprotected(status({ vacSecure: null })), false);
  });

  it("stays quiet for a server that is not running", () => {
    // A stopped container keeps the last VAC value it reported; complaining
    // that a stopped server is unprotected is noise.
    for (const state of ["stopped", "starting", "updating", "crashed"] as const) {
      assert.equal(isUnprotected(status({ state, vacSecure: false })), false);
    }
  });
});
