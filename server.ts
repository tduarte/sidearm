import { createServer } from "node:http";
import next from "next";
import { attachWsServer } from "./lib/ws/server";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer((req, res) => handle(req, res));
  attachWsServer(httpServer, { path: "/ws" });

  httpServer.listen(port, hostname, () => {
    const mode = process.env.API_MODE === "real" ? "real" : "mock";
    // eslint-disable-next-line no-console
    console.log(
      `> sidearm panel ready on http://${hostname}:${port} (${dev ? "dev" : process.env.NODE_ENV}, API_MODE=${mode})`,
    );
  });

  if (process.env.API_MODE === "real") {
    const { rconConnect } = await import("./lib/cs2/rcon");
    const { fetchStatus } = await import("./lib/cs2/status");
    const { updateCache } = await import("./lib/api/server/real");
    const { bus } = await import("./lib/ws/bus");

    rconConnect();

    setInterval(async () => {
      try {
        const { status, players } = await fetchStatus();
        updateCache(status, players);
        bus.emit({ type: "status.update", status });
      } catch {
        // transient — rcon reconnect handles it
      }
    }, 2000);
  }
});
