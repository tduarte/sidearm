import type { GameMode, Player, ServerStatus, Team } from "@/lib/api/types";
import { rconExec } from "./rcon";
import { containerStats, inspectContainer } from "./docker";

const PORT = parseInt(process.env.RCON_PORT ?? "27015", 10);

let cachedPublicIp: string | null = null;

async function getPublicIp(): Promise<string> {
  if (cachedPublicIp) return cachedPublicIp;
  const envIp = process.env.SERVER_IP;
  if (envIp) { cachedPublicIp = envIp; return envIp; }
  try {
    const res = await fetch("https://api.ipify.org?format=text", { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      cachedPublicIp = (await res.text()).trim();
      return cachedPublicIp;
    }
  } catch { /* fall through */ }
  return "";
}

function gameModeFromCvars(gameType: number, gameMode: number): GameMode {
  if (gameType === 1 && gameMode === 2) return "deathmatch";
  if (gameType === 0 && gameMode === 0) return "casual";
  if (gameType === 0 && gameMode === 1) return "competitive";
  if (gameType === 0 && gameMode === 2) return "wingman";
  if (gameType === 1 && gameMode === 0) return "deathmatch"; // arms race variant
  if (gameType === 3 && gameMode === 0) return "custom";
  return "competitive";
}

export async function fetchStatus(): Promise<{
  status: ServerStatus;
  players: Player[];
}> {
  const [statusOut, dockerStats, inspect, serverIp, gameModeOut] = await Promise.allSettled([
    rconExec("status"),
    containerStats("cs2"),
    inspectContainer("cs2"),
    getPublicIp(),
    rconExec("game_type; game_mode"),
  ]);

  const statusText =
    statusOut.status === "fulfilled" ? statusOut.value : "";
  const docker =
    dockerStats.status === "fulfilled"
      ? dockerStats.value
      : { cpuPct: 0, memMb: 0, memLimitMb: 0 };
  const containerState =
    inspect.status === "fulfilled" ? inspect.value.State : null;
  const ip = serverIp.status === "fulfilled" ? serverIp.value : "";

  // Parse game_type and game_mode from cvar output: "game_type" = "0"
  let gameType = 0;
  let gameModeNum = 1;
  if (gameModeOut.status === "fulfilled") {
    const gtMatch = /game_type[^=]*=\s*"?(\d+)/i.exec(gameModeOut.value);
    const gmMatch = /game_mode[^=]*=\s*"?(\d+)/i.exec(gameModeOut.value);
    if (gtMatch) gameType = parseInt(gtMatch[1], 10);
    if (gmMatch) gameModeNum = parseInt(gmMatch[1], 10);
  }
  const gameMode: GameMode = gameModeFromCvars(gameType, gameModeNum);

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
    gameMode,
    players: humans,
    maxPlayers,
    uptimeSec: 0,
    cpuPct: docker.cpuPct,
    memMb: docker.memMb,
    memMaxMb: docker.memLimitMb || 8192,
    fps,
    tickrate: 64,
    connectUrl: `connect ${ip}:${PORT}`,
    ip,
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
