import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { defaultResponder, startStubRcon, type StubRcon } from "../helpers/stub-rcon";
import type { ChatMessage, Player, WsEvent } from "@/lib/api/types";

/**
 * Tier 2 — real-mode integration without CS2 or Docker.
 *
 * This is the only test that can catch the split-event-bus defect. `server.ts`
 * runs under `tsx` while `app/api/**` is bundled by Next, so they get separate
 * module registries; a module-level bus singleton produces distinct instances
 * (four, measured) and only the tsx-side one is wired to the WebSocket
 * broadcaster. Importing the modules directly in a unit test cannot reproduce
 * that — there is only one registry — so the whole panel has to boot.
 *
 * Docker is deliberately pointed at a closed port to prove the status path
 * degrades gracefully when the socket proxy is unreachable.
 */

const PORT = 31234;
const SECRET = "test-ingest-secret";
const BASE = `http://127.0.0.1:${PORT}`;

const ROSTER = [
  { userId: "2", name: "Neo", steamId: "[U:1:12345]", ping: 30 },
  { userId: "3", name: "Trinity", steamId: "[U:1:67890]", ping: 55 },
];

let rcon: StubRcon;
let panel: ChildProcess;
let dbDir: string;
const frames: WsEvent[] = [];
let ws: WebSocket;

function logLine(body: string) {
  return `L 10/05/2024 - 12:34:56.789 - ${body}`;
}

async function postLogs(lines: string[]): Promise<Response> {
  return fetch(`${BASE}/api/ingest/logs/${SECRET}`, {
    method: "POST",
    body: lines.join("\n"),
  });
}

/** Waits until `predicate` holds over the frames received so far. */
async function waitForFrame(
  predicate: (e: WsEvent) => boolean,
  timeoutMs = 10_000,
): Promise<WsEvent> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = frames.find(predicate);
    if (hit) return hit;
    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for frame; saw: ${JSON.stringify(frames.map((f) => f.type))}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Fails fast on a busy port: an orphaned panel would otherwise be served by the
 *  readiness probe and the suite would test the wrong process. */
async function assertPortFree(port: number) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      throw new Error(
        `port ${port} is already serving a panel — kill the stray process before running this suite`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("already serving")) throw err;
    // Connection refused / timeout is what we want.
  }
}

before(async () => {
  await assertPortFree(PORT);

  rcon = await startStubRcon({
    password: "test-password",
    respond: defaultResponder(ROSTER),
  });
  dbDir = await mkdtemp(path.join(tmpdir(), "sidearm-test-"));

  // Spawn the local tsx binary directly rather than through `npx`: npx forks a
  // grandchild, so signalling npx would leave the panel running with our stdio
  // pipes still open and the test runner would never exit. `detached` puts it in
  // its own process group so teardown can signal the whole group.
  panel = spawn(path.join(process.cwd(), "node_modules/.bin/tsx"), ["server.ts"], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      API_MODE: "real",
      PORT: String(PORT),
      BIND_HOST: "127.0.0.1",
      RCON_HOST: "127.0.0.1",
      RCON_PORT: String(rcon.port),
      RCON_PASSWORD: "test-password",
      LOG_INGEST_SECRET: SECRET,
      SQLITE_PATH: path.join(dbDir, "test.db"),
      PANEL_URL: BASE,
      // Pin the IP so the status poll never reaches out to api.ipify.org.
      SERVER_IP: "127.0.0.1",
      // Closed port: the Docker socket proxy is intentionally unreachable.
      DOCKER_HOST_ADDR: "127.0.0.1",
      DOCKER_PORT: "1",
    },
    stdio: "pipe",
  });

  // Set PANEL_DEBUG=1 to see everything the child prints; otherwise only
  // surface what explains a failure.
  const debug = process.env.PANEL_DEBUG === "1";
  panel.stdout?.on("data", (d) => {
    if (debug) process.stderr.write(`[panel:out] ${d}`);
  });
  panel.stderr?.on("data", (d) => {
    const s = String(d);
    if (debug || /Error|⨯|EADDRINUSE/.test(s)) process.stderr.write(`[panel:err] ${s}`);
  });
  panel.on("exit", (code, signal) => {
    if (signal !== "SIGKILL") {
      process.stderr.write(`[panel] exited early code=${code} signal=${signal}\n`);
    }
  });

  // Wait for the HTTP server, then for the first route compile.
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error("panel did not become ready");
    try {
      const res = await fetch(`${BASE}/api/status`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  ws.on("message", (d) => {
    try {
      frames.push(JSON.parse(String(d)) as WsEvent);
    } catch {
      /* ignore non-JSON */
    }
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  // Warm the ingest route so its first-request compile doesn't eat a timeout.
  await postLogs([logLine(`World triggered "Game_Commencing"`)]);

  // Wait for the first status poll to populate the roster. Log events that
  // reference a player who isn't in the roster yet are dropped, so posting
  // before this point would make the stat assertions racy.
  const rosterDeadline = Date.now() + 20_000;
  for (;;) {
    const players = (await (await fetch(`${BASE}/api/players`)).json()) as Player[];
    if (players.length === ROSTER.length) break;
    if (Date.now() > rosterDeadline) throw new Error("roster never populated");
    await new Promise((r) => setTimeout(r, 250));
  }
});

after(async () => {
  ws?.close();
  if (panel?.pid) {
    // Negative pid signals the whole process group.
    try {
      process.kill(-panel.pid, "SIGKILL");
    } catch {
      panel.kill("SIGKILL");
    }
  }
  panel?.stdout?.destroy();
  panel?.stderr?.destroy();
  await rcon?.close();
  if (dbDir) await rm(dbDir, { recursive: true, force: true });
});

describe("real mode over a stub CS2 server", () => {
  it("connects RCON and issues the poll commands", async () => {
    await waitForFrame((e) => e.type === "status.update");
    assert.ok(rcon.commands.includes("status"), "expected a `status` command");
    assert.ok(
      rcon.commands.some((c) => c.startsWith("logaddress_add_http")),
      "expected log ingest to be configured on first connect",
    );
  });

  it("reports the server as running even though Docker is unreachable", async () => {
    const res = await fetch(`${BASE}/api/status`);
    const status = (await res.json()) as { state: string; hostname: string; map: string };
    // Regression: any inspect failure used to report "stopped", which flips the
    // top bar to a Start button on a healthy server.
    assert.notEqual(status.state, "stopped");
    assert.equal(status.hostname, "sidearm test");
    assert.equal(status.map, "de_mirage");
  });

  it("parses the roster with real SteamIDs and userids", async () => {
    const players = (await (await fetch(`${BASE}/api/players`)).json()) as Player[];
    assert.equal(players.length, 2);
    assert.deepEqual(
      players.map((p) => p.steamId),
      ["[U:1:12345]", "[U:1:67890]"],
    );
    assert.deepEqual(
      players.map((p) => p.userId),
      ["2", "3"],
    );
  });

  // The load-bearing test: this event originates in a Next.js route handler and
  // must reach a WebSocket client attached by the tsx-side custom server.
  it("delivers a route-handler event to WebSocket clients", async () => {
    await postLogs([logLine(`"Neo<2><[U:1:12345]><CT>" say "hello from the log"`)]);
    const frame = await waitForFrame(
      (e) => e.type === "chat.message" && e.message.message === "hello from the log",
    );
    assert.equal(frame.type, "chat.message");
  });

  it("broadcasts team switches and match phase changes", async () => {
    await postLogs([
      logLine(`"Neo<2><[U:1:12345]><Unassigned>" switched from team <Unassigned> to <CT>`),
      logLine(`"Trinity<3><[U:1:67890]><Unassigned>" switched from team <Unassigned> to <TERRORIST>`),
      logLine(`World triggered "Match_Start" on "de_mirage"`),
    ]);
    await waitForFrame((e) => e.type === "match.phase" && e.phase === "live");
    const players = (await (await fetch(`${BASE}/api/players`)).json()) as Player[];
    assert.equal(players.find((p) => p.name === "Neo")?.team, "CT");
    assert.equal(players.find((p) => p.name === "Trinity")?.team, "T");
  });

  it("counts kills and keeps them across a status poll", async () => {
    await postLogs([
      logLine(
        `"Neo<2><[U:1:12345]><CT>" [1 2 3] killed "Trinity<3><[U:1:67890]><TERRORIST>" [4 5 6] with "ak47"`,
      ),
      logLine(
        `"Neo<2><[U:1:12345]><CT>" [1 2 3] killed "Trinity<3><[U:1:67890]><TERRORIST>" [4 5 6] with "awp" (headshot)`,
      ),
    ]);
    await waitForFrame((e) => e.type === "player.update" && e.player.k === 2);

    // The poll runs every 2s and reports k/d/a as 0. Before the roster merge,
    // stats were wiped within one tick.
    await new Promise((r) => setTimeout(r, 3000));
    const players = (await (await fetch(`${BASE}/api/players`)).json()) as Player[];
    assert.equal(players.find((p) => p.name === "Neo")?.k, 2, "kills wiped by poll");
    assert.equal(players.find((p) => p.name === "Trinity")?.d, 2, "deaths wiped by poll");
    assert.equal(
      players.find((p) => p.name === "Neo")?.team,
      "CT",
      "team wiped by poll",
    );
  });

  it("tracks the score from team round-win triggers", async () => {
    await postLogs([
      logLine(`Team "CT" triggered "SFUI_Notice_CTs_Win" (CT "9") (T "5")`),
    ]);
    const frame = await waitForFrame((e) => e.type === "match.score");
    assert.equal(frame.type, "match.score");
    assert.deepEqual(frame.score, { ct: 9, t: 5 });

    const match = (await (await fetch(`${BASE}/api/match`)).json()) as {
      score: { ct: number; t: number };
    };
    assert.deepEqual(match.score, { ct: 9, t: 5 });
  });

  it("persists chat to SQLite", async () => {
    await postLogs([logLine(`"Trinity<3><[U:1:67890]><TERRORIST>" say_team "rush B"`)]);
    await waitForFrame(
      (e) => e.type === "chat.message" && e.message.message === "rush B",
    );
    const chat = (await (await fetch(`${BASE}/api/chat`)).json()) as ChatMessage[];
    const row = chat.find((m) => m.message === "rush B");
    assert.ok(row, "expected the message to come back from the database");
    assert.equal(row.name, "Trinity");
    assert.equal(row.team, "T");
  });

  it("records a completed match in history on Game Over", async () => {
    await postLogs([
      logLine(`Game Over: competitive mg_active de_mirage score 16:5 after 45 min`),
    ]);
    await waitForFrame((e) => e.type === "match.phase" && e.phase === "ended");

    // The recorder in server.ts subscribes on the tsx-side bus; this only fires
    // if the phase event crossed the module boundary.
    const deadline = Date.now() + 5000;
    for (;;) {
      const history = (await (await fetch(`${BASE}/api/history`)).json()) as unknown[];
      if (history.length > 0) return;
      if (Date.now() > deadline) {
        assert.fail("no match was recorded in history");
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  });

  it("hosts a workshop map by id instead of changelevel", async () => {
    const id = "3070563536";
    const added = await fetch(`${BASE}/api/maps/workshop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workshopId: id, displayName: "aim botz" }),
    });
    assert.equal(added.status, 200);
    // Adding a map must not ask the server for anything — `host_workshop_map`
    // hosts as well as downloads, and would boot everyone off the current map.
    assert.ok(
      !rcon.commands.some((c) => c.includes("workshop")),
      `no RCON on subscribe; saw: ${rcon.commands.join(", ")}`,
    );

    const entry = (await added.json()) as { name: string };
    // The filename is unknown until the server has fetched the map, so the id
    // alone is the identifier — the old code guessed one from the display name.
    assert.equal(entry.name, `workshop/${id}`);

    const played = await fetch(`${BASE}/api/maps/current`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: entry.name }),
    });
    assert.equal(played.status, 200);
    assert.ok(
      rcon.commands.includes(`host_workshop_map ${id}`),
      `expected host_workshop_map; saw: ${rcon.commands.join(", ")}`,
    );
    // `changelevel workshop/<id>` cannot download and would fail outright.
    assert.ok(!rcon.commands.some((c) => c.startsWith("changelevel workshop/")));
  });

  it("changes to an official map with changelevel", async () => {
    const res = await fetch(`${BASE}/api/maps/current`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "de_nuke" }),
    });
    assert.equal(res.status, 200);
    assert.ok(rcon.commands.includes("changelevel de_nuke"));
  });

  it("rejects log posts with a bad secret", async () => {
    const res = await fetch(`${BASE}/api/ingest/logs/wrong-secret`, {
      method: "POST",
      body: logLine(`"X<9><[U:1:9]><CT>" say "should not appear"`),
    });
    assert.equal(res.status, 404);
    assert.ok(
      !frames.some(
        (e) => e.type === "chat.message" && e.message.message === "should not appear",
      ),
    );
  });
});
