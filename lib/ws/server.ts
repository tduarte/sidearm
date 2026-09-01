import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { WsEvent } from "@/lib/api/types";
import { resolveIdentity } from "@/lib/auth/identity";
import { roleAtLeast, wsEventMinRole, type Role } from "@/lib/auth/permissions";
import { readCookie, SESSION_COOKIE, validateSession } from "@/lib/auth/session";
import { bus } from "./bus";
import { startMockEmitter } from "./mock-emitter";

const HEARTBEAT_MS = 30_000;

/**
 * The WS stream carries the same data as `/api/*` (status, chat, players,
 * console), so it honours the same identities. The proxy does not cover it —
 * the upgrade is handled by the custom server, not by Next.
 *
 * Returns the caller's role, or null to refuse the upgrade. The peer address
 * comes straight off the socket here, with no need for the `server.ts` header
 * hop that HTTP requests take.
 */
function resolveConnectionRole(req: IncomingMessage): Role | null {
  const identity = resolveIdentity({
    cookieHeader: req.headers.cookie,
    authorization: req.headers.authorization,
    peer: req.socket.remoteAddress,
  });
  return identity?.role ?? null;
}

/**
 * Attaches a WebSocketServer to the custom Next.js HTTP server and pipes every
 * `bus` event (mock emitter in dev, real CS2 adapter in prod) out to every
 * connected client.
 *
 * Returns a handle so tests can close the wss.
 */
export function attachWsServer(httpServer: HttpServer, opts: { path?: string } = {}) {
  const path = opts.path ?? "/ws";
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();
  /** Sockets that have not answered our last ping. */
  const alive = new WeakMap<WebSocket, boolean>();
  /**
   * What each connection is allowed to see, and the session it proved it with.
   *
   * The role is held per connection because a socket outlives the request that
   * opened it: authorising the upgrade and then broadcasting everything to
   * everyone would hand a viewer the console stream that `/api/console` denies
   * them.
   */
  const connections = new WeakMap<WebSocket, { role: Role; sessionToken: string }>();

  wss.on("connection", (ws, req: IncomingMessage) => {
    const role = resolveConnectionRole(req) ?? "viewer";
    connections.set(ws, {
      role,
      sessionToken: readCookie(req.headers.cookie, SESSION_COOKIE),
    });
    clients.add(ws);
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  // Without a heartbeat, peers that vanish (laptop lid, proxy timeout) linger in
  // `clients` forever and every broadcast writes into a dead socket.
  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (alive.get(ws) === false) {
        clients.delete(ws);
        ws.terminate();
        continue;
      }
      // Re-check the session on the beat we already have. A socket opened
      // before a role change or a sign-out would otherwise keep streaming for
      // as long as it stayed connected, which is indefinitely.
      const conn = connections.get(ws);
      if (conn?.sessionToken) {
        const user = validateSession(conn.sessionToken);
        if (!user) {
          clients.delete(ws);
          ws.close(4401, "session ended");
          continue;
        }
        conn.role = user.role;
      }
      alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        clients.delete(ws);
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  // Broadcast every bus event to the connections allowed to see it.
  bus.subscribe((event: WsEvent) => {
    const frame = JSON.stringify(event);
    const needed = wsEventMinRole(event.type);
    for (const ws of clients) {
      if (ws.readyState !== ws.OPEN) continue;
      if (!roleAtLeast(connections.get(ws)?.role ?? null, needed)) continue;
      ws.send(frame);
    }
  });

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const { pathname } = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (pathname !== path) return; // let Next handle HMR / other upgrades
      if (resolveConnectionRole(req) === null) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  // Kick off the backing event source.
  if (process.env.API_MODE !== "real") {
    startMockEmitter();
  }

  return {
    close: () => {
      clearInterval(heartbeat);
      for (const ws of clients) ws.terminate();
      clients.clear();
      wss.close();
    },
  };
}
