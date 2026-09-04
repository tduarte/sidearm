import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

/**
 * Tier 2 — accounts, roles and the two gates.
 *
 * Boots the real panel in mock mode against a throwaway database and drives it
 * from the outside, because that is the only place the whole chain is visible:
 * `proxy.ts` and the `route()` wrapper both enforce the table in
 * `lib/auth/permissions.ts`, and the custom server enforces it again on the
 * WebSocket upgrade, which the proxy never sees.
 *
 * `PANEL_ADMIN_TOKEN` is set, so this also covers the upgrade path: a panel
 * that already had a token must demand it before handing anyone the first
 * admin account.
 */

const PORT = 31236;
const TOKEN = "test-admin-token-abcdef";
const SECRET = "test-ingest-secret";
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "correct-horse-battery";

let panel: ChildProcess;
let dbDir: string;

/** Cookies per persona, so each request goes out as the intended role. */
const cookies: Record<string, string> = {};

function asRole(role: string): Record<string, string> {
  return cookies[role] ? { cookie: cookies[role] } : {};
}

function captureCookie(res: Response, role: string): void {
  const raw = res.headers.getSetCookie?.() ?? [];
  const session = raw.find((c) => c.startsWith("sidearm_session="));
  if (session) cookies[role] = session.split(";")[0];
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

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

describe("first run", () => {
  it("advertises that the panel is unclaimed", async () => {
    const res = await fetch(`${BASE}/api/auth`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.firstRun, true);
    assert.equal(body.tokenConfigured, true);
    assert.equal(body.user, null);
    assert.equal(body.role, null);
  });

  it("closes the API to anonymous callers, saying which screen to show", async () => {
    const res = await fetch(`${BASE}/api/status`);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, "first-run");
  });

  it("refuses to hand out the first admin account without the setup token", async () => {
    const res = await post("/api/auth/register", {
      username: "impostor",
      password: PASSWORD,
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, "setup-token-required");
  });

  it("rejects a password that is too short", async () => {
    const res = await post("/api/auth/register", {
      username: "admin",
      password: "short",
      setupToken: TOKEN,
    });
    assert.equal(res.status, 400);
  });

  it("creates the first account as an admin when the setup token matches", async () => {
    const res = await post("/api/auth/register", {
      username: "admin",
      password: PASSWORD,
      setupToken: TOKEN,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.username, "admin");
    assert.equal(body.user.role, "admin");
    captureCookie(res, "admin");
    assert.ok(cookies.admin, "registration should set a session cookie");
  });

  it("closes registration once an account exists", async () => {
    const res = await post("/api/auth/register", {
      username: "second",
      password: PASSWORD,
      setupToken: TOKEN,
    });
    assert.equal(res.status, 403);
  });

  it("now reports the panel as claimed", async () => {
    const res = await fetch(`${BASE}/api/auth`, { headers: asRole("admin") });
    const body = await res.json();
    assert.equal(body.firstRun, false);
    assert.equal(body.role, "admin");
    assert.equal(body.source, "session");
  });
});

describe("accounts", () => {
  it("lets an admin create a moderator and a viewer", async () => {
    for (const [username, role] of [
      ["mod", "moderator"],
      ["watcher", "viewer"],
    ]) {
      const res = await post(
        "/api/users",
        { username, password: PASSWORD, role },
        asRole("admin"),
      );
      assert.equal(res.status, 201, `creating ${username}`);
      assert.equal((await res.json()).user.role, role);
    }
  });

  it("signs each of them in", async () => {
    for (const [persona, username] of [
      ["moderator", "mod"],
      ["viewer", "watcher"],
    ]) {
      const res = await post("/api/auth/login", { username, password: PASSWORD });
      assert.equal(res.status, 200, `logging in ${username}`);
      captureCookie(res, persona);
      assert.ok(cookies[persona]);
    }
  });

  it("rejects a wrong password without saying which half was wrong", async () => {
    const res = await post("/api/auth/login", { username: "mod", password: "nope" });
    assert.equal(res.status, 401);
    const missing = await post("/api/auth/login", {
      username: "nobody-at-all",
      password: "nope",
    });
    assert.equal(missing.status, 401);
    assert.equal((await res.json()).error, (await missing.json()).error);
  });

  it("refuses to strand the panel by demoting its only admin", async () => {
    const list = await fetch(`${BASE}/api/users`, { headers: asRole("admin") });
    const { users } = await list.json();
    const me = users.find((u: { username: string }) => u.username === "admin");
    const res = await fetch(`${BASE}/api/users/${me.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...asRole("admin") },
      body: JSON.stringify({ role: "viewer" }),
    });
    assert.equal(res.status, 409);
  });

  it("hides the account list from non-admins", async () => {
    for (const persona of ["moderator", "viewer"]) {
      const res = await fetch(`${BASE}/api/users`, { headers: asRole(persona) });
      assert.equal(res.status, 403, `${persona} reading /api/users`);
    }
  });
});

describe("the role matrix", () => {
  /** [label, path, method, allowed personas] */
  const CASES: Array<[string, string, "GET" | "POST", string[]]> = [
    ["read status", "/api/status", "GET", ["viewer", "moderator", "admin"]],
    ["read players", "/api/players", "GET", ["viewer", "moderator", "admin"]],
    ["list demos", "/api/demos", "GET", ["viewer", "moderator", "admin"]],
    ["read history", "/api/history", "GET", ["viewer", "moderator", "admin"]],
    ["read the console", "/api/console", "GET", ["moderator", "admin"]],
    ["kick a player", "/api/players/kick", "POST", ["moderator", "admin"]],
    ["change the map", "/api/maps/current", "POST", ["moderator", "admin"]],
    ["run raw RCON", "/api/rcon", "POST", ["admin"]],
    ["read config", "/api/config", "GET", ["admin"]],
    ["stop the container", "/api/status/state", "POST", ["admin"]],
    ["subscribe a workshop map", "/api/maps/workshop", "POST", ["admin"]],
  ];

  for (const [label, route, method, allowed] of CASES) {
    for (const persona of ["viewer", "moderator", "admin"]) {
      const permitted = allowed.includes(persona);
      it(`${permitted ? "lets" : "stops"} a ${persona} ${label}`, async () => {
        const res = await fetch(`${BASE}${route}`, {
          method,
          headers: {
            "content-type": "application/json",
            ...asRole(persona),
          },
          // A deliberately empty body: a permitted caller may well get a 400,
          // which still proves the gate let them through. Only 403 is a denial.
          ...(method === "POST" ? { body: "{}" } : {}),
        });
        if (permitted) {
          assert.notEqual(res.status, 403, `${persona} should reach ${route}`);
          assert.notEqual(res.status, 401, `${persona} should be recognised at ${route}`);
        } else {
          assert.equal(res.status, 403, `${persona} must not reach ${route}`);
        }
      });
    }
  }

  it("still admits the break-glass bearer token as an admin", async () => {
    const res = await fetch(`${BASE}/api/config`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(res.status, 200);
  });

  it("rejects a wrong bearer token", async () => {
    const res = await fetch(`${BASE}/api/config`, {
      headers: { authorization: "Bearer not-the-token" },
    });
    assert.equal(res.status, 401);
  });

  it("keeps the log ingest route open, because CS2 cannot send headers", async () => {
    const res = await post(`/api/ingest/logs/${SECRET}`, { lines: [] });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });

  it("fails an unknown route closed rather than open", async () => {
    const res = await fetch(`${BASE}/api/definitely-not-a-route`, {
      headers: asRole("viewer"),
    });
    assert.equal(res.status, 403);
  });
});

describe("the WebSocket", () => {
  function open(headers: Record<string, string>) {
    return new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers });
  }

  it("refuses an unauthenticated upgrade", async () => {
    const ws = open({});
    const outcome = await new Promise<string>((resolve) => {
      ws.on("open", () => resolve("open"));
      ws.on("error", () => resolve("rejected"));
    });
    ws.close();
    assert.equal(outcome, "rejected");
  });

  it("accepts a signed-in viewer", async () => {
    const ws = open(asRole("viewer"));
    const outcome = await new Promise<string>((resolve) => {
      ws.on("open", () => resolve("open"));
      ws.on("error", () => resolve("rejected"));
    });
    ws.close();
    assert.equal(outcome, "open");
  });

  it("never sends console lines to a viewer, but does to a moderator", async () => {
    // The mock emitter produces both status and console traffic, so a window
    // long enough to see several status frames is long enough to prove the
    // console frames were filtered rather than merely slow.
    const seen = async (persona: string) => {
      const ws = open(asRole(persona));
      const types = new Set<string>();
      await new Promise<void>((resolve) => {
        ws.on("open", () => setTimeout(resolve, 4000));
        ws.on("error", () => resolve());
      });
      ws.on("message", () => {});
      await new Promise<void>((resolve) => {
        const done = setTimeout(() => resolve(), 6000);
        ws.on("message", (raw) => {
          try {
            types.add(JSON.parse(String(raw)).type);
          } catch {
            /* ignore */
          }
          if (types.has("console.line")) {
            clearTimeout(done);
            resolve();
          }
        });
      });
      ws.close();
      return types;
    };

    const modTypes = await seen("moderator");
    assert.ok(
      modTypes.has("console.line"),
      `moderator should receive console lines, saw: ${[...modTypes].join(", ")}`,
    );

    const viewerTypes = await seen("viewer");
    assert.ok(viewerTypes.size > 0, "viewer should receive some events");
    assert.ok(
      !viewerTypes.has("console.line"),
      `viewer must not receive console lines, saw: ${[...viewerTypes].join(", ")}`,
    );
  });
});

describe("signing out", () => {
  it("invalidates the cookie", async () => {
    const login = await post("/api/auth/login", { username: "watcher", password: PASSWORD });
    const raw = login.headers.getSetCookie?.() ?? [];
    const cookie = (raw.find((c) => c.startsWith("sidearm_session=")) ?? "").split(";")[0];
    assert.ok(cookie);

    const before = await fetch(`${BASE}/api/status`, { headers: { cookie } });
    assert.equal(before.status, 200);

    await fetch(`${BASE}/api/auth`, { method: "DELETE", headers: { cookie } });

    const after = await fetch(`${BASE}/api/status`, { headers: { cookie } });
    assert.equal(after.status, 401);
  });
});
