import type { ServerStatus } from "@/lib/api/types";

/** A plain healthy status, for tests that only care about one field of it. */
export default function status(over: Partial<ServerStatus> = {}): ServerStatus {
  return {
    state: "running",
    hostname: "sidearm",
    map: "de_mirage",
    gameMode: "competitive",
    players: 0,
    maxPlayers: 32,
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
  };
}
