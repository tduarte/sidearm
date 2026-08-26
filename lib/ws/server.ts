import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { WsEvent } from "@/lib/api/types";
import { AUTH_COOKIE, isTrustedPeer, safeEqual } from "@/lib/auth";
import { bus } from "./bus";
import { startMockEmitter } from "./mock-emitter";

const HEARTBEAT_MS = 30_000;

/** Reads one cookie out of a raw `Cookie:` header. */
function readCookie(header: string | undefined, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

/**
 * The WS stream carries the same data as `/api/*` (status, chat, players), so it
 * has to honour the same token. Middleware does not cover it — the upgrade is
 * handled by the custom server, not by Next.
 */
function isAuthorized(req: IncomingMessage): boolean {
  const token = process.env.PANEL_ADMIN_TOKEN ?? "";
  if (token === "") return true;
  // Straight off the socket here — no need for the `server.ts` header hop.
  if (isTrustedPeer(req.socket.remoteAddress)) return true;
  const cookie = readCookie(req.headers.cookie, AUTH_COOKIE);
  if (safeEqual(cookie, token)) return true;
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") && safeEqual(header.slice(7), token);
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

  wss.on("connection", (ws) => {
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
      alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        clients.delete(ws);
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  // Broadcast every bus event to all live WS connections.
  bus.subscribe((event: WsEvent) => {
    const frame = JSON.stringify(event);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(frame);
    }
  });

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const { pathname } = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (pathname !== path) return; // let Next handle HMR / other upgrades
      if (!isAuthorized(req)) {
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
