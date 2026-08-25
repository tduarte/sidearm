import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

/**
 * Tier 2 — API auth. Boots the panel in mock mode with `PANEL_ADMIN_TOKEN` set
 * and checks the gate from the outside: middleware covers `/api/*`, the custom
 * server covers the WebSocket upgrade (middleware cannot see it), and the log
 * ingest route stays reachable because CS2 cannot send headers.
 */

const PORT = 31236;
const TOKEN = "test-admin-token-abcdef";
const SECRET = "test-ingest-secret";
const BASE = `http://127.0.0.1:${PORT}`;

let panel: ChildProcess;
let dbDir: string;

before(async () => {
  dbDir = await mkdtemp(path.join(tmpdir(), "sidearm-auth-"));
  panel = spawn(path.join(process.cwd(), "node_modules/.bin/tsx"), ["server.ts"], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      API_MODE: "mock",
      PORT: String(PORT),
      BIND_HOST: "127.0.0.1",
      PANEL_ADMIN_TOKEN: TOKEN,
      LOG_INGEST_SECRET: SECRET,
      SQLITE_PATH: path.join(dbDir, "auth.db"),
    },
    stdio: "pipe",
  });
  panel.stderr?.on("data", (d) => {
    const s = String(d);
    if (/⨯|EADDRINUSE/.test(s)) process.stderr.write(`[panel:err] ${s}`);
  });

  const deadline = Date.now() + 90_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error("panel did not become ready");
    try {
      // Any response at all means the server is listening; 401 is expected here.
      await fetch(`${BASE}/api/auth`);
      break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
});

after(async () => {
  if (panel?.pid) {
    try {
      process.kill(-panel.pid, "SIGKILL");
    } catch {
      panel.kill("SIGKILL");
    }
  }
  panel?.stdout?.destroy();
  panel?.stderr?.destroy();
  if (dbDir) await rm(dbDir, { recursive: true, force: true });
});

describe("API auth", () => {
  it("advertises that a token is required", async () => {
    const res = await fetch(`${BASE}/api/auth`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { authRequired: true });
  });

  it("rejects unauthenticated API calls", async () => {
    for (const route of ["/api/status", "/api/players", "/api/config", "/api/console"]) {
      const res = await fetch(`${BASE}${route}`);
      assert.equal(res.status, 401, `${route} should be gated`);
    }
  });

  it("rejects mutations too", async () => {
    const res = await fetch(`${BASE}/api/rcon`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "status" }),
    });
    assert.equal(res.status, 401);
  });

  it("accepts a valid bearer token", async () => {
    const res = await fetch(`${BASE}/api/status`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(res.status, 200);
  });

  it("rejects a wrong bearer token", async () => {
    const res = await fetch(`${BASE}/api/status`, {
      headers: { authorization: "Bearer not-the-token" },
    });
    assert.equal(res.status, 401);
  });

  it("exchanges the token for a session cookie", async () => {
    const bad = await fetch(`${BASE}/api/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "wrong" }),
    });
    assert.equal(bad.status, 401);

    const good = await fetch(`${BASE}/api/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN }),
    });
    assert.equal(good.status, 200);

    const cookie = good.headers.get("set-cookie") ?? "";
    assert.match(cookie, /sidearm_token=/);
    assert.match(cookie, /HttpOnly/i);

    const withCookie = await fetch(`${BASE}/api/status`, {
      headers: { cookie: cookie.split(";")[0] },
    });
    assert.equal(withCookie.status, 200, "session cookie should authenticate");
  });

  it("keeps the log ingest route reachable without a token", async () => {
    // CS2 cannot send an Authorization header; it authenticates with the secret
    // embedded in the URL it was handed over RCON.
    const res = await fetch(`${BASE}/api/ingest/logs/${SECRET}`, {
      method: "POST",
      body: `L 10/05/2024 - 12:34:56.789 - World triggered "Round_Start"`,
    });
    assert.equal(res.status, 200);
  });

  it("still rejects log ingest with a wrong secret", async () => {
    const res = await fetch(`${BASE}/api/ingest/logs/nope`, {
      method: "POST",
      body: "x",
    });
    assert.equal(res.status, 404);
  });

  it("rejects an unauthenticated WebSocket upgrade", async () => {
    // Middleware does not cover /ws — the custom server handles the upgrade, so
    // without its own check the whole event stream would be readable by anyone.
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const outcome = await new Promise<string>((resolve) => {
      ws.once("open", () => resolve("open"));
      ws.once("error", () => resolve("rejected"));
    });
    ws.close();
    assert.equal(outcome, "rejected");
  });

  it("accepts a WebSocket upgrade carrying the session cookie", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
      headers: { cookie: `sidearm_token=${TOKEN}` },
    });
    const outcome = await new Promise<string>((resolve) => {
      ws.once("open", () => resolve("open"));
      ws.once("error", () => resolve("rejected"));
    });
    ws.close();
    assert.equal(outcome, "open");
  });
});
