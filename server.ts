import { createServer } from "node:http";
import next from "next";
import { attachWsServer } from "./lib/ws/server";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  attachWsServer(httpServer, { path: "/ws" });

  httpServer.listen(port, hostname, () => {
    const mode = process.env.API_MODE === "real" ? "real" : "mock";
    // eslint-disable-next-line no-console
    console.log(
      `> sidearm panel ready on http://${hostname}:${port} (${dev ? "dev" : process.env.NODE_ENV}, API_MODE=${mode})`,
    );
  });
});
