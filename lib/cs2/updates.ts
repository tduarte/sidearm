import type { MatchPhase, UpdateStatus } from "@/lib/api/types";

/**
 * CS2 update detection.
 *
 * The game itself cannot be patched in place: `joedwards32/cs2` runs
 * `steamcmd app_update 730` from its entrypoint, so a restart *is* the update.
 * There is no periodic check inside the image, and there could not usefully be
 * one — srcds holds its binaries open and a build change needs a new process.
 *
 * So the job here is only to decide *when* restarting is worth it, and to avoid
 * doing it while anyone is connected.
 */

const APP_ID = 730;
const STEAM_UP_TO_DATE_URL = "https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/";

/**
 * Pulls the Steam build number out of RCON `status` output.
 *
 * Note there is no `version` command on CS2 — it answers
 * `Unknown command 'version'!` — which is why the build has to come off the
 * `version :` line inside `status`:
 *
 *   version  : 1.41.7.7/14177 10896 secure  public
 *
 * Like the log and status parsers, this is deliberately tolerant: CS2 has
 * shipped more than one layout and the exact one is only confirmed against a
 * live server. Returning `null` is a safe answer — callers treat an
 * undeterminable version as "unknown" and never auto-restart on it.
 *
 * Handled shapes, in priority order:
 *   ServerVersion=14177                     (steam.inf)
 *   version : 1.41.7.7/14177 1417 secure    (status composite — the live one)
 *   Protocol version 14177                  (Source convention)
 *   Server Version: 14177                   (plain)
 */
export function parseServerVersion(text: string): number | null {
  const patterns = [
    /ServerVersion\s*[=:]\s*(\d{3,8})/i,
    /\d+\.\d+\.\d+\.\d+\s*\/\s*(\d{3,8})/,
    /Protocol\s+version\s*[:=]?\s*(\d{3,8})/i,
    /version\s*[:=]\s*(\d{3,8})\b/i,
  ];

  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

export interface SteamVersionCheck {
  upToDate: boolean;
  requiredVersion: number | null;
  message: string;
}

interface SteamResponse {
  response?: {
    success?: boolean;
    up_to_date?: boolean;
    version_is_listable?: boolean;
    required_version?: number;
    message?: string;
  };
}

/**
 * Asks Steam whether `installed` is the current build for CS2.
 *
 * Public and unauthenticated — no API key, no GSLT. `fetchImpl` is injectable so
 * tests never touch the network.
 */
export async function checkSteamVersion(
  installed: number,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamVersionCheck> {
  const url = `${STEAM_UP_TO_DATE_URL}?appid=${APP_ID}&version=${installed}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Steam returned ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as SteamResponse;
  const r = body.response;
  if (!r || r.success !== true) {
    throw new Error("Steam reported the version check as unsuccessful");
  }

  // `required_version` is omitted when the build is already current, so fall
  // back to the installed build rather than reporting null on the happy path.
  const upToDate = r.up_to_date === true;
  return {
    upToDate,
    requiredVersion: r.required_version ?? (upToDate ? installed : null),
    message: r.message ?? (upToDate ? "Server is up to date" : "A CS2 update is available"),
  };
}

export interface UpdateCheckDeps {
  /** Runs an RCON command; the watcher only ever issues `status`. */
  rconExec: (command: string) => Promise<string>;
  /**
   * The installed build, read from `steam.inf` in the game files, tried before
   * RCON.
   *
   * RCON was the only source, and reading it means matching a version line
   * whose layout CS2 has changed more than once. When that match failed the
   * check returned "unknown" and — because an unknown build never triggers a
   * restart — auto-update quietly stopped happening, with nothing in the log to
   * say so. `steam.inf` is a `KEY=value` file steamcmd writes itself, so it does
   * not depend on that regex, and unlike RCON it can still be read while the
   * server is down. Optional: falls back to RCON when absent.
   */
  installedBuild?: () => Promise<number | null>;
  /** Restarts the CS2 container, which re-runs steamcmd on boot. */
  restartContainer: () => Promise<void>;
  /**
   * Connected humans right now; bots do not count. `null` means the roster is
   * not known yet, which defers the restart rather than assuming an empty
   * server — guessing wrong here drops real players.
   */
  playerCount: () => number | null;
  /** Current match phase, used only to log why a restart was deferred. */
  matchPhase: () => MatchPhase;
  /** Whether the panel may restart on its own. */
  autoRestart: boolean;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

export interface UpdateCheckResult {
  update: UpdateStatus;
  restarted: boolean;
  /** Why a pending update was not applied, when it was not. */
  deferredReason?: string;
}

/**
 * One full check: ask the server its build, ask Steam if that build is current,
 * and restart the container if an update is pending and nobody is connected.
 *
 * Fails safe at every step — an unreachable server, an unparseable version, or
 * an unreachable Steam all produce `upToDate: null` and never trigger a restart.
 */
export async function runUpdateCheck(
  deps: UpdateCheckDeps,
): Promise<UpdateCheckResult> {
  const now = deps.now ?? (() => new Date());
  const base: UpdateStatus = {
    installedVersion: null,
    requiredVersion: null,
    upToDate: null,
    checkedAt: now().toISOString(),
    autoRestart: deps.autoRestart,
    message: "",
  };

  // The game files first, because they answer even when the server does not.
  let installedVersion: number | null = null;
  if (deps.installedBuild) {
    try {
      installedVersion = await deps.installedBuild();
    } catch {
      // Not mounted, mid-download, unreadable — fall through to RCON.
    }
  }

  if (installedVersion === null) {
    // `status`, not `version`: CS2 has no `version` command, and asking for one
    // returns `Unknown command 'version'!`, which parses to null and pins
    // `upToDate` at "unknown" forever — the update check silently never fires.
    let versionOut: string;
    try {
      versionOut = await deps.rconExec("status");
    } catch {
      return {
        update: { ...base, message: "RCON did not answer; cannot read server build" },
        restarted: false,
      };
    }

    installedVersion = parseServerVersion(versionOut);
  }

  if (installedVersion === null) {
    return {
      update: {
        ...base,
        message:
          "Could not read a build number from steam.inf or the `status` version line",
      },
      restarted: false,
    };
  }

  let check: SteamVersionCheck;
  try {
    check = await checkSteamVersion(installedVersion, deps.fetchImpl);
  } catch (err) {
    return {
      update: {
        ...base,
        installedVersion,
        message: `Steam version check failed: ${(err as Error).message}`,
      },
      restarted: false,
    };
  }

  const update: UpdateStatus = {
    ...base,
    installedVersion,
    requiredVersion: check.requiredVersion,
    upToDate: check.upToDate,
    message: check.message,
  };

  if (check.upToDate) return { update, restarted: false };
  if (!deps.autoRestart) {
    return { update, restarted: false, deferredReason: "auto-restart is disabled" };
  }

  // The whole point of doing this in the panel rather than with a cron job:
  // never drop a server full of people to apply a patch.
  const connected = deps.playerCount();
  if (connected === null) {
    return { update, restarted: false, deferredReason: "player count unknown" };
  }
  if (connected > 0) {
    return {
      update,
      restarted: false,
      deferredReason: `${connected} player(s) connected (match phase: ${deps.matchPhase()})`,
    };
  }

  try {
    await deps.restartContainer();
    return { update, restarted: true };
  } catch (err) {
    return {
      update,
      restarted: false,
      deferredReason: `restart failed: ${(err as Error).message}`,
    };
  }
}

/** steamcmd's download progress, scraped from the container's boot logs. */
export interface UpdateProgress {
  /** steamcmd phase verb, e.g. `downloading`, `verifying update`. */
  phase: string;
  /** 0–100. */
  pct: number;
  bytesDone: number;
  bytesTotal: number;
}

/**
 * Reads steamcmd progress out of `docker logs cs2`.
 *
 * The image prints one line per tick while `app_update 730` runs:
 *
 *   Update state (0x61) downloading, progress: 68.09 (48404306198 / 71089555502)
 *
 * Only the most recent line matters. If steamcmd has since reported the app
 * fully installed, the download is over — the container is booting srcds, not
 * updating — so return null rather than a stale 100%.
 */
export function parseUpdateProgress(logText: string): UpdateProgress | null {
  const PROGRESS_RE =
    /Update state \(0x[0-9a-f]+\)\s*([^,]+?),\s*progress:\s*([\d.]+)\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/gi;

  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = PROGRESS_RE.exec(logText)) !== null) last = match;
  if (!last) return null;

  const doneAt = logText.lastIndexOf("fully installed");
  if (doneAt !== -1 && doneAt > last.index) return null;

  const bytesTotal = Number.parseInt(last[4], 10);
  return {
    phase: last[1].trim(),
    pct: Number.parseFloat(last[2]),
    bytesDone: Number.parseInt(last[3], 10),
    bytesTotal,
  };
}

/** A transfer rate and what it implies for time remaining. */
export interface RateEstimate {
  bytesPerSec: number | null;
  etaSec: number | null;
}

const NO_ESTIMATE: RateEstimate = { bytesPerSec: null, etaSec: null };

/**
 * Weight given to the newest sample in the rate EWMA.
 *
 * Measured on the live server, steamcmd swings between roughly 60 and 120
 * Mbit/s minute to minute. An unsmoothed rate makes the remaining time jump by
 * an hour between ticks, which reads as broken rather than as precise.
 */
const RATE_SMOOTHING = 0.3;

/**
 * Shortest gap worth differentiating over. The caller samples every few
 * seconds; anything much tighter divides a small byte delta by a small
 * interval and produces noise.
 */
const MIN_SAMPLE_MS = 1_000;

/**
 * Derives a download rate, and from it an ETA, out of successive progress
 * readings.
 *
 * Stateful because steamcmd reports no rate — only a running byte count — so
 * the only way to a "time remaining" is to remember the last reading.
 *
 * The case this is built around is a download that *restarts*. steamcmd counts
 * each phase from zero, and a failed `app_update` drops the appmanifest and
 * begins the whole 70 GB again (see AGENTS.md). Both show up here as a byte
 * count that went backwards, which would otherwise yield a negative rate and a
 * nonsense ETA. Either one resets the baseline instead.
 */
export function createRateTracker() {
  let last: { bytesDone: number; phase: string; atMs: number } | null = null;
  let rate: number | null = null;

  function estimate(bytesTotal: number, bytesDone: number): RateEstimate {
    if (rate === null || rate <= 0) return { bytesPerSec: rate, etaSec: null };
    const remaining = Math.max(0, bytesTotal - bytesDone);
    return {
      bytesPerSec: Math.round(rate),
      etaSec: Math.round(remaining / rate),
    };
  }

  return {
    /** Feeds in one reading and returns the estimate it supports. */
    observe(p: UpdateProgress, atMs: number): RateEstimate {
      const prev = last;
      const restarted =
        prev !== null && (p.phase !== prev.phase || p.bytesDone < prev.bytesDone);

      if (prev === null || restarted) {
        last = { bytesDone: p.bytesDone, phase: p.phase, atMs };
        rate = null;
        return NO_ESTIMATE;
      }

      const elapsedMs = atMs - prev.atMs;
      // Too soon to re-measure: keep the previous reading as the baseline so
      // the next real interval is measured from it, and answer with what the
      // existing rate implies for the byte count we were just handed.
      if (elapsedMs < MIN_SAMPLE_MS) return estimate(p.bytesTotal, p.bytesDone);

      const sample = (p.bytesDone - prev.bytesDone) / (elapsedMs / 1000);
      rate = rate === null ? sample : rate + RATE_SMOOTHING * (sample - rate);
      last = { bytesDone: p.bytesDone, phase: p.phase, atMs };
      return estimate(p.bytesTotal, p.bytesDone);
    },

    /** Forgets everything; for when the download ends or the container dies. */
    reset() {
      last = null;
      rate = null;
    },
  };
}
