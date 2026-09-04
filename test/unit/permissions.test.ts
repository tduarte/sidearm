import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccess,
  isOpenRoute,
  requiredRole,
  roleAtLeast,
  wsEventMinRole,
} from "@/lib/auth/permissions";

/**
 * The route table is the one place the proxy, the handler guard, the WebSocket
 * and the browser all read from, so a mistake here is a mistake in four places
 * at once. These tests pin the decisions that are easy to regress by reordering
 * a rule.
 */

describe("roleAtLeast", () => {
  it("is a hierarchy, not a set of flags", () => {
    assert.equal(roleAtLeast("admin", "viewer"), true);
    assert.equal(roleAtLeast("admin", "moderator"), true);
    assert.equal(roleAtLeast("moderator", "viewer"), true);
    assert.equal(roleAtLeast("viewer", "moderator"), false);
    assert.equal(roleAtLeast("moderator", "admin"), false);
  });

  it("treats an absent role as no authority", () => {
    assert.equal(roleAtLeast(null, "viewer"), false);
    assert.equal(roleAtLeast(undefined, "viewer"), false);
  });
});

describe("open routes", () => {
  it("covers the machine callbacks CS2 makes, which carry a URL secret instead", () => {
    assert.equal(isOpenRoute("/api/ingest/logs/abc123"), true);
    assert.equal(isOpenRoute("/api/matchzy/config/abc123/7"), true);
  });

  it("covers the bootstrap endpoints a signed-out browser must reach", () => {
    for (const p of ["/api/auth", "/api/auth/login", "/api/auth/register"]) {
      assert.equal(isOpenRoute(p), true, p);
    }
  });

  it("does not accidentally open everything under /api/auth", () => {
    // `/api/auth/password` changes a credential and must stay behind the gate.
    assert.equal(isOpenRoute("/api/auth/password"), false);
    assert.equal(requiredRole("/api/auth/password", "POST"), "viewer");
  });
});

describe("the route table", () => {
  it("keeps the spectator surface readable", () => {
    for (const p of [
      "/api/status",
      "/api/players",
      "/api/history",
      "/api/demos",
      "/api/demos/pug-2026-08-30.dem",
      "/api/chat",
      "/api/match",
      "/api/match/rounds",
      "/api/maps",
      "/api/maps/thumb/3070273116",
    ]) {
      assert.equal(requiredRole(p, "GET"), "viewer", p);
    }
  });

  it("keeps the console out of the spectator surface", () => {
    // It carries every RCON reply the panel has printed.
    assert.equal(requiredRole("/api/console", "GET"), "moderator");
  });

  it("puts mid-match intervention at moderator", () => {
    assert.equal(requiredRole("/api/players/kick", "POST"), "moderator");
    assert.equal(requiredRole("/api/players/ban", "POST"), "moderator");
    assert.equal(requiredRole("/api/maps/current", "POST"), "moderator");
    assert.equal(requiredRole("/api/match/pause", "POST"), "moderator");
    assert.equal(requiredRole("/api/match/phase", "POST"), "moderator");
    assert.equal(requiredRole("/api/matches/end", "POST"), "moderator");
  });

  it("keeps the container, its config and raw RCON at admin", () => {
    assert.equal(requiredRole("/api/status/state", "POST"), "admin");
    assert.equal(requiredRole("/api/status/restart", "POST"), "admin");
    assert.equal(requiredRole("/api/config", "GET"), "admin");
    assert.equal(requiredRole("/api/config", "PUT"), "admin");
    assert.equal(requiredRole("/api/rcon", "POST"), "admin");
    assert.equal(requiredRole("/api/updates/apply", "POST"), "admin");
    assert.equal(requiredRole("/api/users", "GET"), "admin");
  });

  it("separates reading a route from writing it where the roles differ", () => {
    // Reading the rotation is match information; rewriting it outlives the
    // session and is server configuration.
    assert.equal(requiredRole("/api/maps/rotation", "GET"), "moderator");
    assert.equal(requiredRole("/api/maps/rotation", "PUT"), "admin");
    // The update *status* is a read anyone may make; applying one is a restart.
    assert.equal(requiredRole("/api/updates", "GET"), "viewer");
    assert.equal(requiredRole("/api/updates/check", "POST"), "admin");
  });

  it("fails an unknown route closed", () => {
    // A route added without a rule must not ship world-writable.
    assert.equal(requiredRole("/api/something-new", "POST"), "admin");
    assert.equal(canAccess("viewer", "/api/something-new", "POST"), false);
  });

  it("answers canAccess consistently with requiredRole", () => {
    assert.equal(canAccess("viewer", "/api/status", "GET"), true);
    assert.equal(canAccess("viewer", "/api/players/kick", "POST"), false);
    assert.equal(canAccess("moderator", "/api/players/kick", "POST"), true);
    assert.equal(canAccess("moderator", "/api/rcon", "POST"), false);
    assert.equal(canAccess("admin", "/api/rcon", "POST"), true);
    assert.equal(canAccess(null, "/api/status", "GET"), false);
    assert.equal(canAccess(null, "/api/auth/login", "POST"), true);
  });
});

describe("WebSocket event filtering", () => {
  it("holds console lines to the same bar as the console route", () => {
    assert.equal(wsEventMinRole("console.line"), "moderator");
    assert.equal(requiredRole("/api/console", "GET"), "moderator");
  });

  it("lets the live status and match events through to viewers", () => {
    for (const t of ["status.update", "match.update", "chat.message", "server.update"]) {
      assert.equal(wsEventMinRole(t), "viewer", t);
    }
  });
});
