import { createServer } from "node:http";
import next from "next";
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

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer((req, res) => handle(req, res));
  attachWsServer(httpServer, { path: "/ws" });

  httpServer.listen(port, hostname, () => {
    const mode = process.env.API_MODE === "real" ? "real" : "mock";
    console.log(
      `> sidearm panel ready on http://${hostname}:${port} (${dev ? "dev" : process.env.NODE_ENV}, API_MODE=${mode})`,
    );
  });

  if (process.env.API_MODE !== "real") return;

  const { rconConnect, rconExec, rconDisconnect } = await import("./lib/cs2/rcon");
  const { fetchStatus } = await import("./lib/cs2/status");
  const { updateCache } = await import("./lib/api/server/real");
  const { bus } = await import("./lib/ws/bus");
  const { getDb } = await import("./lib/db/index");
  const { beginMatch, endMatch } = await import("./lib/db/matches");

  // Ensure DB is open and migrated before anything else touches it
  getDb();

  // Match lifecycle tracking. This only works because `bus` is pinned to
  // globalThis — the phase events originate in a Next-bundled route handler,
  // which has its own module registry.
  let activeMatchId: string | null = null;
  bus.subscribe((ev) => {
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
    }
  });

  const secret = process.env.LOG_INGEST_SECRET ?? "";
  const panelUrl = process.env.PANEL_URL ?? `http://panel:${port}`;

  rconConnect(async () => {
    try {
      await rconExec(`logaddress_add_http "${panelUrl}/api/ingest/logs/${secret}"`);
      await rconExec("logaddress_enable_http 1");
      await rconExec("log on");
      console.log("[rcon] log ingest configured");
    } catch (err) {
      console.error("[rcon] failed to configure log ingest:", err);
    }
  });

  // Self-scheduling rather than setInterval: a tick that outlives the interval
  // would otherwise stack up behind the previous one.
  let stopped = false;
  let pollTimer: NodeJS.Timeout | null = null;

  const poll = async () => {
    try {
      const { status, players } = await fetchStatus();
      updateCache(status, players);
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

  const shutdown = (signal: string) => {
    if (stopped) return;
    stopped = true;
    console.log(`[sidearm] ${signal} received, shutting down`);
    if (pollTimer) clearTimeout(pollTimer);
    rconDisconnect();
    httpServer.close(() => process.exit(0));
    // Don't let a lingering connection block exit indefinitely.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
