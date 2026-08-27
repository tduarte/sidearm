import { createServer } from "node:http";
import next from "next";
import { PEER_HEADER } from "./lib/auth";
import { attachWsServer } from "./lib/ws/server";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";
/**
 * `BIND_HOST`, deliberately NOT `HOSTNAME`.
 *
 * Linux shells export HOSTNAME (to the machine name) and Docker sets it to the
 * container id, so reading it binds the server to that single host instead of
 * all interfaces — locally that makes `http://localhost:3000` refuse
 * connections, which is exactly what happened before this change.
 */
const hostname = process.env.BIND_HOST ?? "0.0.0.0";
const POLL_INTERVAL_MS = Number.parseInt(process.env.STATUS_POLL_MS ?? "2000", 10);
/**
 * How often to ask Steam whether the running CS2 build is current. Set to 0 to
 * disable the check entirely. Fifteen minutes is far more often than Valve ships
 * builds, and the endpoint is a single unauthenticated GET.
 */
const UPDATE_CHECK_MS = Number.parseInt(
  process.env.CS2_UPDATE_CHECK_MS ?? "900000",
  10,
);
/** Wait for the container to finish booting before the first check. */
const UPDATE_FIRST_CHECK_MS = 60_000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer((req, res) => {
    // Hand the peer address to the Edge-runtime proxy, which cannot see the
    // socket itself. Deleting first is the security-relevant half: it means an
    // inbound copy of this header is always discarded, so a client can never
    // spoof its own address.
    delete req.headers[PEER_HEADER];
    const peer = req.socket.remoteAddress;
    if (peer) req.headers[PEER_HEADER] = peer;
    return handle(req, res);
  });
  attachWsServer(httpServer, { path: "/ws" });

  httpServer.listen(port, hostname, () => {
    const mode = process.env.API_MODE === "real" ? "real" : "mock";
    console.log(
      `> sidearm panel ready on http://${hostname}:${port} (${dev ? "dev" : process.env.NODE_ENV}, API_MODE=${mode})`,
    );
  });

  if (process.env.API_MODE !== "real") return;

  const { rconConnect, rconExec, rconDisconnect } = await import("./lib/cs2/rcon");
  const { fetchStatus, isServerReboot } = await import("./lib/cs2/status");
  const { updateCache, realAdapter } = await import("./lib/api/server/real");
  const { bus } = await import("./lib/ws/bus");
  const { getDb } = await import("./lib/db/index");
  const { beginMatch, endMatch, findOpenMatch, insertRound, reapStaleMatches } =
    await import("./lib/db/matches");
  const { advanceRotation, reapplyBans, reapplyConfig, sweepExpiredBans } =
    await import("./lib/api/server/real");

  // Ensure DB is open and migrated before anything else touches it
  getDb();

  // Match lifecycle tracking. This only works because `bus` is pinned to
  // globalThis — the phase events originate in a Next-bundled route handler,
  // which has its own module registry.
  // Recovered from the database rather than starting null: a panel restart
  // mid-match used to orphan the row, leaving ended_at NULL forever — invisible
  // to history and never reaped.
  const reaped = reapStaleMatches();
  if (reaped > 0) console.log(`[db] closed ${reaped} stale match record(s)`);
  /** Last container start we reconciled against; see `onServerBoot`. */
  let lastStartedAt: string | null = null;
  let activeMatchId: string | null = findOpenMatch()?.id ?? null;
  if (activeMatchId) console.log(`[db] resuming open match ${activeMatchId}`);
  bus.subscribe((ev) => {
    // Rounds are recorded against the open match, not the match lifecycle:
    // Round_End fires ~24 times a game and must not close the record.
    if (ev.type === "round.end") {
      if (activeMatchId) {
        try {
          insertRound(activeMatchId, {
            round: ev.round,
            winner: ev.winner,
            reason: ev.reason,
            score: ev.score,
          });
        } catch { /* non-critical */ }
      }
      return;
    }
    if (ev.type !== "match.phase") return;
    const cache = globalThis.__cs2Cache;
    if (ev.phase === "live" && !activeMatchId) {
      activeMatchId = beginMatch(
        cache?.status?.map ?? "unknown",
        cache?.status?.gameMode ?? "competitive",
      );
    } else if ((ev.phase === "ended" || ev.phase === "idle") && activeMatchId) {
      endMatch(
        activeMatchId,
        cache?.match?.score ?? { ct: 0, t: 0 },
        cache?.players ?? [],
      );
      activeMatchId = null;
      // Panel-driven rotation: the map only advances while the panel is
      // running, which is the trade for handling workshop maps at all.
      if (ev.phase === "ended") void advanceRotation();
    }
  });

  const secret = process.env.LOG_INGEST_SECRET ?? "";
  const panelUrl = process.env.PANEL_URL ?? `http://panel:${port}`;

  /**
   * Bans live in the game server's memory, so every container restart drops
   * them. Sweeping expiries and re-applying the rest is what makes the panel's
   * clock mean anything.
   */
  const BAN_SWEEP_MS = 60_000;
  setInterval(() => void sweepExpiredBans(), BAN_SWEEP_MS);

  /**
   * Everything that must be re-established on a game server that has just
   * started, because all of it is state the panel set on a process that no
   * longer exists.
   *
   * Runs on panel start AND on every detected server boot. It used to run only
   * on the panel's FIRST RCON connection — `rconConnect`'s callback is gated by
   * `didFirstConnect` — which meant a CS2 restart silently dropped the log sink
   * and left it dropped until someone restarted the panel. Since restarting the
   * container is exactly how a CS2 update is applied, applying an update
   * stopped chat, kills, scores and round records from ever arriving again.
   */
  async function onServerBoot(reason: string) {
    console.log(`[cs2] server boot detected (${reason}); reconciling`);
    try {
      // Clear first: on a panel restart with the server still running, the
      // sink may already be registered, and adding it twice would duplicate
      // every log line.
      await rconExec("logaddress_delall_http");
      await rconExec(`logaddress_add_http "${panelUrl}/api/ingest/logs/${secret}"`);
      // Answers `Unknown command` on current CS2 builds; harmless, and kept in
      // case an older or newer build wants it. `log on` is what matters.
      await rconExec("logaddress_enable_http 1");
      await rconExec("log on");
      console.log("[rcon] log ingest configured");
    } catch (err) {
      console.error("[rcon] failed to configure log ingest:", err);
    }

    // The server came up with default cvars and an empty ban list, whatever
    // the panel last applied and still considers banned.
    try {
      await reapplyConfig();
    } catch (err) {
      console.error("[rcon] failed to re-apply config:", err);
    }
    try {
      await reapplyBans();
    } catch (err) {
      console.error("[rcon] failed to re-apply bans:", err);
    }
  }

  rconConnect(() => void onServerBoot("panel start"));

  // Self-scheduling rather than setInterval: a tick that outlives the interval
  // would otherwise stack up behind the previous one.
  let stopped = false;
  let pollTimer: NodeJS.Timeout | null = null;

  const poll = async () => {
    try {
      const { status, players, cvars, startedAt } = await fetchStatus();
      updateCache(status, players, cvars);

      // A changed StartedAt means a different container process, so everything
      // the panel configured on the old one is gone. Only acted on once RCON
      // answers, since there is nothing to configure until it does.
      if (isServerReboot(lastStartedAt, startedAt, status.control.rcon)) {
        lastStartedAt = startedAt;
        void onServerBoot("container restarted");
      } else if (startedAt && !lastStartedAt) {
        lastStartedAt = startedAt;
      }
      bus.emit({ type: "status.update", status });
    } catch {
      // transient — rcon reconnect handles it
    } finally {
      if (!stopped) {
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        pollTimer.unref();
      }
    }
  };
  void poll();

  // CS2 updates: the image runs `steamcmd app_update 730` from its entrypoint,
  // so restarting the container *is* the update. All this loop does is notice
  // that one is pending and — when CS2_AUTO_UPDATE=1 and nobody is connected —
  // restart. See lib/cs2/updates.ts.
  let updateTimer: NodeJS.Timeout | null = null;
  if (UPDATE_CHECK_MS > 0) {
    const checkForUpdate = async () => {
      try {
        await realAdapter.checkForUpdate();
      } catch (err) {
        console.error("[update] check failed:", err);
      } finally {
        if (!stopped) {
          updateTimer = setTimeout(checkForUpdate, UPDATE_CHECK_MS);
          updateTimer.unref();
        }
      }
    };
    updateTimer = setTimeout(checkForUpdate, UPDATE_FIRST_CHECK_MS);
    updateTimer.unref();
  }

  const shutdown = (signal: string) => {
    if (stopped) return;
    stopped = true;
    console.log(`[sidearm] ${signal} received, shutting down`);
    if (pollTimer) clearTimeout(pollTimer);
    if (updateTimer) clearTimeout(updateTimer);
    rconDisconnect();
    httpServer.close(() => process.exit(0));
    // Don't let a lingering connection block exit indefinitely.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
