import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

/**
 * Tier 2 — `PANEL_TRUSTED_CIDRS`, checked from the outside.
 *
 * The setting grants an implicit **viewer** identity rather than skipping auth,
 * so a LAN scoreboard needs no account while anything that touches the running
 * match still belongs to someone who signed in.
 *
 * Two panel configurations are exercised: one that trusts loopback (so the test
 * client counts as LAN) and one that does not (so the test client is a
 * stranger). The second is where the security-relevant assertions live — a
 * stranger must not be able to talk its way in by *claiming* a trusted address
 * in a header.
 *
 * They run one at a time, on the same port: two Next servers cannot share the
 * project's `.next` directory concurrently.
 */

const TOKEN = "test-admin-token-abcdef";
const SECRET = "test-ingest-secret";

const PORT = 31240;
const BASE = `http://127.0.0.1:${PORT}`;
/** Loopback trusted; loopback deliberately not trusted. */
const TRUSTS_LOOPBACK = "127.0.0.0/8";
const TRUSTS_ELSEWHERE = "10.99.0.0/16";

let panel: ChildProcess | null = null;
let dbDir: string;

async function startPanel(port: number, cidrs: string): Promise<ChildProcess> {
  const proc = spawn(path.join(process.cwd(), "node_modules/.bin/tsx"), ["server.ts"], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      API_MODE: "mock",
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      PANEL_ADMIN_TOKEN: TOKEN,
      PANEL_TRUSTED_CIDRS: cidrs,
      LOG_INGEST_SECRET: SECRET,
      SQLITE_PATH: path.join(dbDir, `cidr-${port}.db`),
    },
    stdio: "pipe",
  });
  proc.stderr?.on("data", (d) => {
    const s = String(d);
    if (/⨯|EADDRINUSE/.test(s)) process.stderr.write(`[panel:${port}] ${s}`);
  });

  const deadline = Date.now() + 90_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`panel ${port} did not become ready`);
    try {
      await fetch(`http://127.0.0.1:${port}/api/auth`);
      return proc;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function stopPanel() {
  const p = panel;
  panel = null;
  if (!p) return;
  if (p.pid) {
    try {
      process.kill(-p.pid, "SIGKILL");
    } catch {
      p.kill("SIGKILL");
    }
  }
  p.stdout?.destroy();
  p.stderr?.destroy();
  // Let the port clear before the next describe binds it.
  await new Promise((r) => setTimeout(r, 1000));
}

before(async () => {
  dbDir = await mkdtemp(path.join(tmpdir(), "sidearm-cidr-"));
});

after(async () => {
  await stopPanel();
  if (dbDir) await rm(dbDir, { recursive: true, force: true });
});

describe("a peer inside PANEL_TRUSTED_CIDRS", () => {
  before(async () => {
    panel = await startPanel(PORT, TRUSTS_LOOPBACK);
  });
  after(stopPanel);

  it("reads the spectator surface with no credentials at all", async () => {
    for (const route of ["/api/status", "/api/players", "/api/demos"]) {
      const res = await fetch(`${BASE}${route}`);
      assert.equal(res.status, 200, `${route} should be readable from the LAN`);
    }
  });

  it("gets a viewer's authority, not an admin's", async () => {
    // The deliberate narrowing: a trusted address used to skip auth entirely,
    // which made a wall display and a person with a keyboard indistinguishable.
    // It now grants exactly what a kiosk needs and nothing that touches the
    // running match.
    const config = await fetch(`${BASE}/api/config`);
    assert.equal(config.status, 403, "config is not spectator material");

    const kick = await fetch(`${BASE}/api/players/kick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ steamId: "76561100000000000" }),
    });
    assert.equal(kick.status, 403, "a LAN address must not be able to kick");
  });

  it("is told it is a viewer, so the UI shows no login prompt it cannot use", async () => {
    const res = await fetch(`${BASE}/api/auth`);
    const body = await res.json();
    assert.equal(body.role, "viewer");
    assert.equal(body.source, "trusted-peer");
    assert.equal(body.tokenConfigured, true);
    // No account is attached: the address is the credential.
    assert.equal(body.user, null);
  });

  it("may open the WebSocket without a token", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
      setTimeout(() => reject(new Error("ws upgrade timed out")), 10_000);
    });
    ws.close();
  });
});

describe("a peer outside PANEL_TRUSTED_CIDRS", () => {
  before(async () => {
    panel = await startPanel(PORT, TRUSTS_ELSEWHERE);
  });
  after(stopPanel);

  it("is still refused without a token", async () => {
    const res = await fetch(`${BASE}/api/status`);
    assert.equal(res.status, 401);
  });

  it("is still told to log in", async () => {
    const res = await fetch(`${BASE}/api/auth`);
    const body = await res.json();
    assert.equal(body.role, null);
    assert.equal(body.source, null);
    assert.equal(body.tokenConfigured, true);
  });

  it("cannot forge the peer header to fake a trusted address", async () => {
    // `server.ts` deletes any inbound copy before stamping the real socket
    // address. If that delete ever regresses, this is the request that walks in.
    for (const forged of ["10.99.0.5", "127.0.0.1", "::ffff:10.99.0.5"]) {
      const res = await fetch(`${BASE}/api/status`, {
        headers: { "x-sidearm-peer": forged },
      });
      assert.equal(res.status, 401, `x-sidearm-peer: ${forged} must not be believed`);
    }
  });

  it("cannot forge X-Forwarded-For either", async () => {
    for (const header of ["x-forwarded-for", "x-real-ip", "forwarded"]) {
      const res = await fetch(`${BASE}/api/status`, {
        headers: { [header]: "10.99.0.5" },
      });
      assert.equal(res.status, 401, `${header} must not be believed`);
    }
  });

  it("cannot forge its way onto the WebSocket", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
      headers: { "x-sidearm-peer": "10.99.0.5", "x-forwarded-for": "10.99.0.5" },
    });
    const outcome = await new Promise<string>((resolve) => {
      ws.once("open", () => resolve("opened"));
      ws.once("error", (err: Error) => resolve(err.message));
      setTimeout(() => resolve("timeout"), 10_000);
    });
    ws.close();
    assert.match(outcome, /401/, `expected a 401 rejection, got: ${outcome}`);
  });

  it("still gets in with the real token", async () => {
    const res = await fetch(`${BASE}/api/status`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(res.status, 200);
  });
});
