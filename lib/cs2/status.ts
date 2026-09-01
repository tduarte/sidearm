import type {
  GameMode,
  PluginStatus,
  Player,
  ServerStatus,
  Team,
  UpdateProgress,
} from "@/lib/api/types";
import { rconExec } from "./rcon";
import { containerLogs, containerStats, inspectContainer } from "./docker";
import {
  createRateTracker,
  parseServerVersion,
  parseUpdateProgress,
} from "./updates";
import { asInt, parseCvarEcho } from "./cvars";
import {
  CSSHARP_PROBE,
  METAMOD_PROBE,
  MATCHZY_PROBE,
  isUnknownCommand,
  parseGet5Status,
  type Get5Status,
} from "./plugins";

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

/**
 * Turns successive byte counts into a rate and an ETA. Fed only on real log
 * reads, so its sample interval is `PROGRESS_REFRESH_MS`, not the status poll.
 */
const rateTracker = createRateTracker();

/**
 * How often to ask whether the plugin stack is loaded.
 *
 * Far slower than the 2s status poll, because the answer only changes when the
 * server restarts — and when it does, the restart itself is what the panel is
 * already watching. Thirty seconds is well inside the window that matters: the
 * failure this catches sits unnoticed for weeks otherwise.
 */
const PLUGIN_PROBE_MS = 30_000;

/**
 * How often to re-read `get5_status` once a match config IS loaded.
 *
 * At that point the same command stops being a health check and becomes the
 * only honest source of pause state and gamestate — CS2 exposes neither — so it
 * is worth a round trip every few seconds rather than every thirty.
 */
const MATCH_POLL_MS = 5_000;

let lastPluginProbe = 0;
let lastPluginResult: Omit<PluginStatus, "regressed"> | null = null;
let lastGet5: Get5Status | null = null;

/**
 * Probes the plugin stack, at most once per `PLUGIN_PROBE_MS`.
 *
 * `meta list` and `css_plugins list` are only sent when MatchZy did NOT answer.
 * On a working server that is two RCON round-trips saved every probe; on a
 * broken one they are what separates "CounterStrikeSharp did not load" from
 * "CounterStrikeSharp loaded and MatchZy did not", which is the difference
 * between two entirely different fixes.
 */
async function probePlugins(
  rconAlive: boolean,
): Promise<Omit<PluginStatus, "regressed"> | null> {
  // RCON silent: keep the last answer rather than reporting absence. A dropped
  // poll is not evidence that the plugins are gone.
  if (!rconAlive) return lastPluginResult;

  // Two cadences off one command. While a match is loaded this is the panel's
  // only window onto pause and gamestate, so it runs often; the rest of the
  // time it is just a liveness check and thirty seconds is plenty.
  const loaded = lastGet5 !== null && lastGet5.gamestate !== "none";
  const interval = loaded ? MATCH_POLL_MS : PLUGIN_PROBE_MS;

  const now = Date.now();
  if (now - lastPluginProbe < interval) return lastPluginResult;
  lastPluginProbe = now;

  let matchzy: boolean | null = null;
  try {
    const probe = parseGet5Status(await rconExec(MATCHZY_PROBE));
    matchzy = probe?.loaded ?? null;
    // Only overwrite on a definite answer; an unreadable reply leaves the last
    // known match state alone rather than blanking a live match.
    if (probe) lastGet5 = probe.status;
  } catch {
    return lastPluginResult;
  }

  if (matchzy !== false) {
    // Nothing to attribute. Both lower layers must be up for MatchZy to answer,
    // so claiming them as `true` is a deduction, not a guess.
    lastPluginResult = {
      matchzy,
      metamod: matchzy === true ? true : null,
      cssharp: matchzy === true ? true : null,
    };
    return lastPluginResult;
  }

  let metamod: boolean | null = null;
  let cssharp: boolean | null = null;
  try {
    const out = await rconExec(`${METAMOD_PROBE}; ${CSSHARP_PROBE}`);
    if (out.trim() !== "") {
      metamod = !isUnknownCommand(out, METAMOD_PROBE);
      cssharp = !isUnknownCommand(out, CSSHARP_PROBE);
    }
  } catch {
    // Leave both unknown; the banner then names MatchZy itself, which is the
    // conservative answer.
  }

  lastPluginResult = { matchzy, metamod, cssharp };
  return lastPluginResult;
}

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
  /**
   * The `(N max)` figure, which is the *advertised* slot count
   * (`sv_visiblemaxplayers`) and reads `0` at its -1 default. Never use it as
   * the real ceiling; see `ServerStatus.maxPlayers`.
   */
  visibleMaxPlayers: number;
  bots: number;
  /** VAC state from the `version :` line; `null` when the line is absent. */
  vacSecure: boolean | null;
  /** Present only while GOTV is actually running. */
  gotv: { address: string; delaySec: number | null } | null;
  /**
   * The demo GOTV is writing right now, from `status`'s own line, or `null`
   * when it is not recording.
   *
   * This is a real read-back and the panel spent a long time not using it: the
   * match card reported `demo: "unknown"` while `status` was printing the
   * filename, which is how a recording ran for twenty-six hours after its match
   * ended without anything noticing.
   */
  recordingTo: string | null;
  players: Player[];
}

/**
 * The `version :` line, which carries both the Steam build and the VAC flag:
 *
 *   version  : 1.41.7.7/14177 10896 secure  public
 *
 * `secure` must be matched on a word boundary — it is a substring of
 * `insecure`, and getting that backwards would report a dead GSLT as healthy.
 */
const VAC_RE = /^\s*version\s*:.*?\b(in)?secure\b/im;

/**
 * GOTV's recording line, printed inside the SourceTV block only while a demo
 * is actually being written:
 *
 *   Now recording to "MatchZy/2026-08-31_04-10-31_3_de_dust2_a_vs_b.dem",
 *   recorded length so far is 25:47:38.
 *
 * The name may carry a subdirectory, because MatchZy writes into
 * `matchzy_demo_path` while the panel's own `tv_record` writes to the game
 * directory. Both are kept whole; `lib/cs2/demos.ts` already understands the
 * one-level prefix.
 */
const RECORDING_RE = /^\s*Now recording to\s+"([^"]+)"/im;

/**
 * GOTV's own line in `status`, present only when it is running:
 *
 *   sourcetv[0] : 0.0.0.0:27020 (public 76.226.161.203:27020) delay 30.0s
 *
 * This is the only usable read-back for GOTV. `tv_status` looks like the
 * obvious source and is not: over RCON on CS2 it returns an empty string.
 */
const SOURCETV_RE =
  /^\s*sourcetv\[\d+\]\s*:\s*(\S+)(?:.*?delay\s+([\d.]+)s)?/im;

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
  const bots = parseInt(/(\d+)\s+bots/i.exec(text)?.[1] ?? "0", 10);
  // Matches both "(10 max)" and "(10/0 max)". This is the advertised count, not
  // the ceiling: a live CS2 server with -maxplayers 10 prints "(0 max)".
  const visibleMaxPlayers = parseInt(
    /\((\d+)(?:\/\d+)?\s+max\)/i.exec(text)?.[1] ?? "0",
    10,
  );

  const vacMatch = VAC_RE.exec(text);
  const vacSecure = vacMatch ? vacMatch[1] === undefined : null;

  const recordingTo = RECORDING_RE.exec(text)?.[1]?.trim() ?? null;

  const tvMatch = SOURCETV_RE.exec(text);
  const gotv = tvMatch
    ? {
        address: tvMatch[1],
        delaySec: tvMatch[2] ? Number.parseFloat(tvMatch[2]) : null,
      }
    : null;

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

  return {
    hostname,
    map,
    humans,
    bots,
    visibleMaxPlayers,
    vacSecure,
    gotv,
    recordingTo,
    players,
  };
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
  /** Cvars read alongside the status poll; see `lib/cs2/cvars.ts`. */
  cvars: { maxRounds: number | null };
  /**
   * The container's `StartedAt`. A change means the game server is a NEW
   * process, which has lost every piece of state the panel set on it.
   */
  startedAt: string | null;
  /**
   * The demo GOTV reports it is writing, or `null` when it is not recording —
   * and also `null` when RCON did not answer, since there is nothing to read.
   */
  recordingTo: string | null;
  /**
   * `null` when RCON did not answer, meaning the roster is simply unknown for
   * this tick. That is NOT the same as "nobody is connected": treating a failed
   * poll as an empty roster wipes every player's accumulated k/d/a and team.
   * RCON drops are routine, so this distinction matters.
   */
  players: Player[] | null;
  /**
   * MatchZy's own view of the match, when a config is loaded. `null` when it is
   * absent, nothing is loaded, or the probe has not run yet.
   */
  get5: Get5Status | null;
}> {
  // RCON commands are serialised by lib/cs2/rcon.ts, so these run one at a time
  // on the shared socket rather than racing each other's response packets.
  const [statusOut, gameModeOut, dockerStats, inspect, serverIp] =
    await Promise.allSettled([
      rconExec("status"),
      // Batched into the round-trip the poll already spends on game mode, so
      // reading mp_maxrounds costs nothing. It was previously the hardcoded
      // constant 24 in the match cache.
      rconExec("game_type; game_mode; mp_maxrounds"),
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
  // The launch line is right here in the inspect payload we already fetch every
  // tick, so the real slot ceiling costs nothing extra to read.
  const containerEnv =
    inspect.status === "fulfilled" ? inspect.value.Config?.Env ?? null : null;
  const ip = serverIp.status === "fulfilled" ? serverIp.value : "";

  const gameMode: GameMode =
    gameModeOut.status === "fulfilled"
      ? parseGameMode(gameModeOut.value)
      : "competitive";

  const parsed = parseStatusText(statusText);
  // After `status` has answered, so the probe knows whether RCON is alive at
  // all — and serialised behind it on the shared socket rather than racing it.
  const pluginProbe = await probePlugins(statusText !== "");
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
        const parsedProgress = parseUpdateProgress(
          await containerLogs("cs2", 50, since),
        );
        if (parsedProgress) {
          lastProgress = {
            ...parsedProgress,
            ...rateTracker.observe(parsedProgress, now),
          };
        } else {
          // Between phases, or the download is over. Either way the next rate
          // has to be measured afresh rather than across the gap.
          lastProgress = null;
          rateTracker.reset();
        }
        updateProgress = lastProgress;
      } catch {
        // Logs unavailable (proxy denies it, container gone) — stay on "starting".
      }
    }
    if (updateProgress) state = "updating";
  }

  if (state === "running") {
    lastProgress = null;
    rateTracker.reset();
  }

  const status: ServerStatus = {
    state,
    hostname: parsed.hostname,
    map: parsed.map,
    gameMode,
    players: parsed.humans,
    // The launch argument, not `status`'s advertised `(N max)` — see
    // `envMaxPlayers` — minus the slot GOTV holds. Falls back to the advertised
    // figure only when Docker is unreachable and it is meaningful (> 0).
    maxPlayers: humanSlots(
      envMaxPlayers(containerEnv) ??
        (parsed.visibleMaxPlayers > 0 ? parsed.visibleMaxPlayers : null),
      parsed.gotv !== null,
    ),
    gotv: parsed.gotv,
    visibleMaxPlayers: parsed.visibleMaxPlayers > 0 ? parsed.visibleMaxPlayers : null,
    uptimeSec: uptimeFrom(containerState),
    cpuPct: docker.cpuPct,
    memMb: docker.memMb,
    memMaxMb: docker.memLimitMb || 8192,
    // Both null on purpose. CS2 dropped the `stats` table that reported server
    // FPS (it answers with an empty string), and there is no tickrate to read:
    // `-tickrate` was a CS:GO launch argument and CS2 is 64-tick with sub-tick.
    // Showing 0 and 64 was fabrication; showing nothing is the truth.
    fps: null,
    tickrate: null,
    vacSecure: parsed.vacSecure,
    build: parseServerVersion(statusText),
    connectUrl: `connect ${ip}:${PORT}`,
    ip,
    port: PORT,
    control: {
      docker: inspect.status === "fulfilled",
      rcon: statusText !== "",
    },
    // `regressed` is not knowable here: it needs the panel's memory of what it
    // has seen before, which lives in SQLite, and lib/cs2 deliberately does not
    // reach into the database. `updateCache` fills it in.
    plugins: pluginProbe ? { ...pluginProbe, regressed: false } : null,
    updateProgress,
  };

  const cvarText = gameModeOut.status === "fulfilled" ? gameModeOut.value : "";
  const maxRounds = asInt(parseCvarEcho(cvarText).values.get("mp_maxrounds"));

  return {
    status,
    cvars: { maxRounds },
    startedAt: containerState?.StartedAt ?? null,
    // `null` when RCON did not answer at all, so callers can tell "not
    // recording" from "did not ask".
    recordingTo: statusText === "" ? null : parsed.recordingTo,
    players: statusText === "" ? null : parsed.players,
    get5: pluginProbe?.matchzy === true ? lastGet5 : null,
  };
}

/**
 * The real slot ceiling, read from the CS2 container's own environment.
 *
 * `CS2_MAXPLAYERS` becomes `-maxplayers` on the launch line, so it is the
 * engine's slot allocation and no cvar can change it at runtime. This is the
 * only trustworthy source: `status`'s `(N max)` reports the *advertised* count
 * and reads 0 whenever `sv_visiblemaxplayers` is at its -1 default.
 */
export function envMaxPlayers(env: string[] | null): number | null {
  if (!env) return null;
  for (const entry of env) {
    if (!entry.startsWith("CS2_MAXPLAYERS=")) continue;
    const n = Number.parseInt(entry.slice("CS2_MAXPLAYERS=".length), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/**
 * Slots a human can actually take.
 *
 * GOTV joins as a player: with `-maxplayers 10` and GOTV on, the server lists
 * `'sidearm CSTV'` in slot 0 and only nine people can connect — enough to break
 * a 5v5. Verified on a live server; the launch line still says 10, so nothing
 * but the player table gives this away.
 */
export function humanSlots(ceiling: number | null, gotvRunning: boolean): number | null {
  if (ceiling === null) return null;
  return gotvRunning ? Math.max(0, ceiling - 1) : ceiling;
}

/**
 * Whether the game server is a new process that needs reconciling.
 *
 * A changed `StartedAt` means a different container, which has lost the log
 * sink, the applied cvars and the ban list. Two things it deliberately does not
 * do: fire on the very first observation (there is nothing to compare against,
 * and panel start is handled by the RCON connect callback), and fire while RCON
 * is silent (there is nothing to configure until the server answers, and the
 * attempt would just fill the command queue).
 */
export function isServerReboot(
  lastStartedAt: string | null,
  startedAt: string | null,
  rconAlive: boolean,
): boolean {
  if (!startedAt || !lastStartedAt) return false;
  if (startedAt === lastStartedAt) return false;
  return rconAlive;
}

/** Seconds since the container started; `null` when Docker is unreachable. */
export function uptimeFrom(s: Pick<DockerState, "StartedAt"> | null): number | null {
  if (!s?.StartedAt) return null;
  const started = new Date(s.StartedAt).getTime();
  if (!Number.isFinite(started)) return null;
  const secs = Math.floor((Date.now() - started) / 1000);
  return secs >= 0 ? secs : null;
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
  // No Docker answer at all. If RCON is alive the server is plainly running and
  // only the socket proxy is down. If neither answers we know nothing: saying
  // "crashed" here reported a diagnosis the panel had not made.
  if (!s) return rconAlive ? "running" : "unknown";
  if (s.Restarting) return "starting";
  if (s.Paused) return "stopping";
  if (s.Running) {
    if (rconAlive) return "running";
    return s.Health?.Status === "unhealthy" ? "crashed" : "starting";
  }
  if (s.Dead || (s.ExitCode ?? 0) !== 0) return "crashed";
  return "stopped";
}
