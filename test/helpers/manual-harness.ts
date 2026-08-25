/**
 * Dev helper: boots the stub RCON server plus the panel in real mode with all
 * child output forwarded, so the Tier 2 environment can be poked by hand.
 *
 *   npx tsx test/helpers/manual-harness.ts
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { defaultResponder, startStubRcon } from "./stub-rcon";

const PORT = Number(process.env.HARNESS_PORT ?? 31235);
const SECRET = "test-ingest-secret";

const ROSTER = [
  { userId: "2", name: "Neo", steamId: "[U:1:12345]", ping: 30 },
  { userId: "3", name: "Trinity", steamId: "[U:1:67890]", ping: 55 },
];

async function main() {
  const rcon = await startStubRcon({
    password: "test-password",
    respond: (cmd) => {
      const out = defaultResponder(ROSTER)(cmd);
      console.log(`[stub-rcon] <- ${JSON.stringify(cmd)} -> ${out.length} bytes`);
      return out;
    },
  });
  console.log(`[stub-rcon] listening on ${rcon.port}`);

  const panel = spawn(path.join(process.cwd(), "node_modules/.bin/tsx"), ["server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_MODE: "real",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      RCON_HOST: "127.0.0.1",
      RCON_PORT: String(rcon.port),
      RCON_PASSWORD: "test-password",
      LOG_INGEST_SECRET: SECRET,
      SQLITE_PATH: `/tmp/sidearm-harness-${process.pid}.db`,
      PANEL_URL: `http://127.0.0.1:${PORT}`,
      SERVER_IP: "127.0.0.1",
      DOCKER_HOST_ADDR: "127.0.0.1",
      DOCKER_PORT: "1",
    },
    stdio: "inherit",
  });

  const shutdown = () => {
    panel.kill("SIGKILL");
    void rcon.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`[harness] panel starting on http://127.0.0.1:${PORT}`);
}

void main();
