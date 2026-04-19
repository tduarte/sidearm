import type { Player, ServerStatus, Team } from "@/lib/api/types";
import { rconExec } from "./rcon";
import { containerStats, inspectContainer } from "./docker";

const PORT = parseInt(process.env.RCON_PORT ?? "27015", 10);
const SERVER_IP = process.env.SERVER_IP ?? "";

export async function fetchStatus(): Promise<{
  status: ServerStatus;
  players: Player[];
}> {
  const [statusOut, dockerStats, inspect] = await Promise.allSettled([
    rconExec("status"),
    containerStats("cs2"),
    inspectContainer("cs2"),
  ]);

  const statusText =
    statusOut.status === "fulfilled" ? statusOut.value : "";
  const docker =
    dockerStats.status === "fulfilled"
      ? dockerStats.value
      : { cpuPct: 0, memMb: 0 };

  const containerState =
    inspect.status === "fulfilled" ? inspect.value.State : null;

  const state =
    containerState?.Running
      ? "running"
      : containerState?.Paused
        ? "stopping"
        : "stopped";

  // CS2 `status` output format (v1.41+):
  //   hostname : sidearm
  //   players  : 0 humans, 2 bots (10 max) (not hibernating) (unreserved)
  //   loaded spawngroup(  1)  : SV:  [1: de_mirage | main lump | mapload]

  const hostname =
    /^\s*hostname\s*:\s*(.+)$/im.exec(statusText)?.[1]?.trim() ?? "CS2 Server";

  // Map name is in the first loaded spawngroup line
  const mapMatch = /SV:\s+\[1:\s*(\S+?)\s*\|/.exec(statusText);
  const map = mapMatch?.[1] ?? "unknown";

  // "0 humans, 2 bots (10 max)"
  const humans = parseInt(/(\d+)\s+humans/i.exec(statusText)?.[1] ?? "0", 10);
  const maxPlayers = parseInt(/\((\d+)\s+max\)/i.exec(statusText)?.[1] ?? "0", 10);

  // FPS from host_framerate cvar (stats command is empty in CS2 dedicated)
  let fps = 0;
  try {
    const fpsOut = await rconExec("host_framerate");
    const fpsMatch = /(\d+(?:\.\d+)?)/.exec(fpsOut);
    fps = fpsMatch ? Math.round(parseFloat(fpsMatch[1])) : 0;
  } catch {
    // non-critical
  }

  const playerList = parsePlayersFromStatus(statusText);

  const status: ServerStatus = {
    state: state as ServerStatus["state"],
    hostname,
    map,
    gameMode: "competitive",
    players: humans,
    maxPlayers,
    uptimeSec: 0,
    cpuPct: docker.cpuPct,
    memMb: docker.memMb,
    memMaxMb: 8192,
    fps,
    tickrate: 64,
    connectUrl: `connect ${SERVER_IP}:${PORT}`,
    ip: SERVER_IP,
    port: PORT,
  };

  return { status, players: playerList };
}

function parsePlayersFromStatus(text: string): Player[] {
  // CS2 player table (human players only — bots have no steamid):
  //   id     time ping loss      state   rate adr name
  //    2   12:34    0    0     active  786432 1.2.3.4:27005 'PlayerName'
  const players: Player[] = [];
  const lineRe =
    /^\s+(\d+)\s+[\d:]+\s+(\d+)\s+\d+\s+active\s+\d+\s+(\S+)\s+'(.+?)'$/gim;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    const [, id, pingStr, addr, name] = m;
    if (addr === "BOT" || addr === "0") continue;
    players.push({
      steamId: id,
      name,
      team: "SPEC" as Team,
      k: 0,
      d: 0,
      a: 0,
      ping: parseInt(pingStr, 10),
      connectedAt: new Date().toISOString(),
    });
  }
  return players;
}
