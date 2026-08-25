import type {
  GameMode,
  Player,
  ServerStatus,
  Team,
  UpdateProgress,
} from "@/lib/api/types";
import { rconExec } from "./rcon";
import { containerLogs, containerStats, inspectContainer } from "./docker";
import { parseUpdateProgress } from "./updates";

const PORT = parseInt(process.env.RCON_PORT ?? "27015", 10);

let cachedPublicIp: string | null = null;

/**
 * steamcmd progress, throttled independently of the 2s status poll.
 *
 * A first boot downloads ~70 GB over hours; fetching container logs on every
 * tick for all of that is a lot of Docker API traffic for a number that moves by
 * hundredths of a percent. Five seconds is well under the eye's threshold for a
 * progress bar.
 */
const PROGRESS_REFRESH_MS = 5000;
let lastProgressFetch = 0;
let lastProgress: UpdateProgress | null = null;

async function getPublicIp(): Promise<string> {
  if (cachedPublicIp !== null) return cachedPublicIp;
  const envIp = process.env.SERVER_IP;
  if (envIp) {
    cachedPublicIp = envIp;
    return envIp;
  }
  try {
    const res = await fetch("https://api.ipify.org?format=text", {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      cachedPublicIp = (await res.text()).trim();
      return cachedPublicIp;
    }
  } catch {
    /* fall through */
  }
  // Negative-cache: the status poll runs every 2s and we will not hammer a
  // third-party endpoint once per tick forever. Set SERVER_IP to skip lookup.
  cachedPublicIp = "";
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

// ---------------------------------------------------------------------------
// Pure parsing (unit-tested; see test/status-parser.test.ts)
// ---------------------------------------------------------------------------

/**
 * The `#`-prefixed player table used by CS2 / CS:GO:
 *
 *   # userid name uniqueid connected ping loss state rate adr
 *   # 2 "Neo" [U:1:12345] 01:23 30 0 active 786432 1.2.3.4:27005
 *
 * Some builds insert an extra numeric column between userid and name, hence the
 * optional `(?:\d+\s+)?`. Crucially this shape carries `uniqueid`, which is the
 * only place RCON exposes a real SteamID.
 */
const HASH_ROW_RE =
  /^#\s*(\d+)\s+(?:\d+\s+)?"(.+?)"\s+(\S+)\s+([\d:]+)\s+(\d+)\s+(\d+)\s+(\S+)/;

/**
 * Legacy table with the name quoted at the end and no uniqueid column:
 *
 *    2   12:34    0    0     active  786432 1.2.3.4:27005 'Neo'
 */
const LEGACY_ROW_RE =
  /^\s*(\d+)\s+([\d:]+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\S+)\s+'(.+?)'\s*$/;

export interface ParsedStatus {
  hostname: string;
  map: string;
  humans: number;
  maxPlayers: number;
  players: Player[];
}

/**
 * Parses RCON `status` output.
 *
 * Deliberately tolerant: CS2 has shipped several `status` layouts and the exact
 * one in play is confirmed against a live server (Tier 3). Fields that cannot be
 * found degrade to sensible defaults rather than throwing.
 *
 * Note: `status` carries no team column in any known layout — team membership
 * comes from the log stream (`player.team`) and is preserved across polls by the
 * roster merge in `lib/api/server/real.ts`.
 */
export function parseStatusText(text: string): ParsedStatus {
  const hostname =
    /^\s*hostname\s*:\s*(.+)$/im.exec(text)?.[1]?.trim() || "CS2 Server";

  // Prefer the explicit `map :` line; fall back to the spawngroup line that
  // some CS2 builds print instead.
  const map =
    /^\s*map\s*:\s*(\S+)/im.exec(text)?.[1] ??
    /SV:\s+\[1:\s*(\S+?)\s*\|/.exec(text)?.[1] ??
    "unknown";

  const humans = parseInt(/(\d+)\s+humans/i.exec(text)?.[1] ?? "0", 10);
  // Matches both "(10 max)" and "(10/0 max)".
  const maxPlayers = parseInt(
    /\((\d+)(?:\/\d+)?\s+max\)/i.exec(text)?.[1] ?? "0",
    10,
  );

  const players: Player[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    const hash = HASH_ROW_RE.exec(line);
    if (hash) {
      const [, userId, name, uniqueId, , ping] = hash;
      if (uniqueId === "BOT") continue;
      players.push(makePlayer(userId, name, uniqueId, ping));
      continue;
    }

    const legacy = LEGACY_ROW_RE.exec(line);
    if (legacy) {
      const [, userId, , ping, , state, , adr, name] = legacy;
      if (state !== "active" && state !== "spawning") continue;
      if (adr === "BOT" || adr === "0") continue;
      // This layout has no uniqueid; identity falls back to the name, which the
      // log stream also carries, so the roster merge can still line them up.
      players.push(makePlayer(userId, name, "", ping));
      continue;
    }
  }

  return { hostname, map, humans, maxPlayers, players };
}

function makePlayer(
  userId: string,
  name: string,
  steamId: string,
  ping: string,
): Player {
  return {
    steamId: steamId || name,
    userId,
    name,
    // Unknown from `status`; the roster merge keeps any team already learned
    // from the log stream.
    team: "SPEC" as Team,
    k: 0,
    d: 0,
    a: 0,
    ping: parseInt(ping, 10) || 0,
    connectedAt: new Date().toISOString(),
  };
}

/** Parses `game_type` / `game_mode` cvar echo output. */
export function parseGameMode(text: string): GameMode {
  const gt = /game_type[^=]*=\s*"?(\d+)/i.exec(text);
  const gm = /game_mode[^=]*=\s*"?(\d+)/i.exec(text);
  return gameModeFromCvars(
    gt ? parseInt(gt[1], 10) : 0,
    gm ? parseInt(gm[1], 10) : 1,
  );
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

export async function fetchStatus(): Promise<{
  status: ServerStatus;
  /**
   * `null` when RCON did not answer, meaning the roster is simply unknown for
   * this tick. That is NOT the same as "nobody is connected": treating a failed
   * poll as an empty roster wipes every player's accumulated k/d/a and team.
   * RCON drops are routine, so this distinction matters.
   */
  players: Player[] | null;
}> {
  // RCON commands are serialised by lib/cs2/rcon.ts, so these run one at a time
  // on the shared socket rather than racing each other's response packets.
  const [statusOut, gameModeOut, dockerStats, inspect, serverIp] =
    await Promise.allSettled([
      rconExec("status"),
      rconExec("game_type; game_mode"),
      containerStats("cs2"),
      inspectContainer("cs2"),
      getPublicIp(),
    ]);

  const statusText = statusOut.status === "fulfilled" ? statusOut.value : "";
  const docker =
    dockerStats.status === "fulfilled"
      ? dockerStats.value
      : { cpuPct: 0, memMb: 0, memLimitMb: 0 };
  const containerState =
    inspect.status === "fulfilled" ? inspect.value.State : null;
  const ip = serverIp.status === "fulfilled" ? serverIp.value : "";

  const gameMode: GameMode =
    gameModeOut.status === "fulfilled"
      ? parseGameMode(gameModeOut.value)
      : "competitive";

  const parsed = parseStatusText(statusText);
  // A `status` reply proves the game server is alive even if the Docker socket
  // is unreachable, so it disambiguates "proxy down" from "container stopped".
  let state = containerStateToServerState(containerState, statusText !== "");

  // A running container whose RCON is silent is usually mid-boot, and on this
  // image "mid-boot" most often means steamcmd is pulling ~70 GB of game files.
  // Only scrape the logs in that window: once srcds answers we never look.
  let updateProgress: UpdateProgress | null = null;
  // "crashed" is included deliberately: a container downloading 70 GB fails its
  // healthcheck, so an unhealthy-but-downloading container must resolve to
  // "updating", not to a red crash pill.
  if (
    (state === "starting" || state === "crashed") &&
    containerState?.Running
  ) {
    const now = Date.now();
    if (now - lastProgressFetch < PROGRESS_REFRESH_MS) {
      updateProgress = lastProgress;
    } else {
      lastProgressFetch = now;
      try {
        const startedAt = containerState.StartedAt;
        const since = startedAt
          ? Math.floor(new Date(startedAt).getTime() / 1000)
          : undefined;
        lastProgress = parseUpdateProgress(
          await containerLogs("cs2", 50, since),
        );
        updateProgress = lastProgress;
      } catch {
        // Logs unavailable (proxy denies it, container gone) — stay on "starting".
      }
    }
    if (updateProgress) state = "updating";
  }

  if (state === "running") lastProgress = null;

  const status: ServerStatus = {
    state,
    hostname: parsed.hostname,
    map: parsed.map,
    gameMode,
    players: parsed.humans,
    maxPlayers: parsed.maxPlayers,
    // TODO(phase-2.3): uptimeSec, fps and tickrate are still placeholders.
    // The previous `host_framerate` probe was removed: it is a client cvar that
    // reads 0 on a dedicated server, and it cost a serial RCON round-trip on
    // every 2s tick. Real values need `stats` / container StartedAt / the
    // tickrate launch arg.
    uptimeSec: 0,
    cpuPct: docker.cpuPct,
    memMb: docker.memMb,
    memMaxMb: docker.memLimitMb || 8192,
    fps: 0,
    tickrate: 64,
    connectUrl: `connect ${ip}:${PORT}`,
    ip,
    port: PORT,
    updateProgress,
  };

  return { status, players: statusText === "" ? null : parsed.players };
}

interface DockerState {
  Running?: boolean;
  StartedAt?: string;
  Health?: { Status?: string };
  Paused?: boolean;
  Restarting?: boolean;
  Dead?: boolean;
  ExitCode?: number;
}

/**
 * Maps Docker container state onto `ServerState`.
 *
 * A null state means the Docker socket was unreachable — that is NOT the same
 * as the container being stopped, and reporting "stopped" there flips the top
 * bar to a Start button on a perfectly healthy server. When RCON is still
 * answering we know the server is up regardless of what Docker says.
 *
 * `Running` alone is not enough to report "running" either: this image spends
 * its first boot running steamcmd, so the container is up long before srcds
 * listens. Without the RCON check the panel showed "Running" next to an
 * "unknown" map for the entire ~70 GB download — while Docker's own healthcheck
 * was already reporting the container unhealthy.
 *
 * That healthcheck is the tiebreaker for a container that is up but silent.
 * `unhealthy` is not a snapshot: compose gives it `retries: 6` at a 30s
 * interval, so Docker only says it after three minutes of a closed game port.
 * Treating that as a crash needs no timer of our own — but the caller must rule
 * out an in-progress steamcmd download first, because that fails the healthcheck
 * for entirely normal reasons.
 */
export function containerStateToServerState(
  s: DockerState | null,
  rconAlive = false,
): ServerStatus["state"] {
  if (!s) return rconAlive ? "running" : "crashed";
  if (s.Restarting) return "starting";
  if (s.Paused) return "stopping";
  if (s.Running) {
    if (rconAlive) return "running";
    return s.Health?.Status === "unhealthy" ? "crashed" : "starting";
  }
  if (s.Dead || (s.ExitCode ?? 0) !== 0) return "crashed";
  return "stopped";
}
