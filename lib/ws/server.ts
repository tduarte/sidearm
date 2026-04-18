import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { WsEvent } from "@/lib/api/types";
import { bus } from "./bus";
import { startMockEmitter } from "./mock-emitter";

/**
 * Attaches a WebSocketServer to the custom Next.js HTTP server and pipes every
 * `bus` event (from mock emitter today; real adapters later) out to every
 * connected client.
 *
 * Returns a handle so tests can close the wss.
 */
export function attachWsServer(httpServer: HttpServer, opts: { path?: string } = {}) {
  const path = opts.path ?? "/ws";
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

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
      for (const ws of clients) ws.terminate();
      clients.clear();
      wss.close();
    },
  };
}
