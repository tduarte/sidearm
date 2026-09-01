/**
 * The role model, and the single table mapping every API route to the role it
 * needs.
 *
 * This module is deliberately **pure**: no `node:` imports, no database, no
 * environment. It is read by the proxy, by each route handler's guard, by the
 * WebSocket server and by the browser, and all four have to agree. A permission
 * check that disagrees with the UI is worse than no UI gating at all — the
 * button is there, the click fails, and the admin cannot tell whether the
 * server is broken or they are not allowed.
 */

export const ROLES = ["viewer", "moderator", "admin"] as const;

export type Role = (typeof ROLES)[number];

/**
 * Rank, ascending. `admin` implies `moderator` implies `viewer`; there is no
 * permission a lower role holds and a higher one does not.
 */
const RANK: Record<Role, number> = { viewer: 0, moderator: 1, admin: 2 };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** True when `role` is at least as privileged as `needed`. */
export function roleAtLeast(role: Role | null | undefined, needed: Role): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[needed];
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  moderator: "Moderator",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin:
    "Everything: start, stop and restart the server, apply updates, edit config, run RCON, and manage accounts.",
  moderator:
    "Run the match: kick and ban players, change the map, control rounds and demos. Cannot touch the container, config or accounts.",
  viewer:
    "Read-only: status, scoreboard and match history, and download demos. No actions.",
};

/**
 * Methods that only read. Several routes are viewer-readable and
 * moderator-or-admin-writable, so the rule table keys on method as well as path.
 */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isReadMethod(method: string): boolean {
  return READ_METHODS.has(method.toUpperCase());
}

/**
 * Routes that authenticate by other means and must stay reachable without a
 * session.
 *
 * The two `ingest`/`matchzy` paths are the machine boundary: CS2 itself calls
 * them, carrying a shared secret embedded in the URL it was handed over RCON,
 * because a game server cannot send headers or hold a cookie. Their own
 * handlers do a constant-time compare on that secret. The `auth` paths are the
 * bootstrap: a login endpoint that required a login could never be reached.
 */
const OPEN_PREFIXES = ["/api/ingest/logs/", "/api/matchzy/config/"];
const OPEN_PATHS = ["/api/auth", "/api/auth/login", "/api/auth/register"];

export function isOpenRoute(pathname: string): boolean {
  if (OPEN_PATHS.includes(pathname)) return true;
  return OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

type Rule = {
  /** Matched against the pathname. A string matches exactly or as a prefix when it ends in `/`. */
  path: string | RegExp;
  /** When set, the rule only applies to these methods. */
  methods?: string[];
  role: Role;
};

/**
 * Ordered rules; the **first** match wins, so narrower entries come first.
 *
 * The split follows what an action can do to people who are connected right
 * now, not the data model:
 *  - `viewer` sees what a spectator could see anyway — status, scoreboard,
 *    history, and the demos they played in.
 *  - `moderator` runs the match: the mid-match intervention set.
 *  - `admin` owns the machine and its configuration: lifecycle, updates, raw
 *    RCON, server content, and accounts.
 */
const RULES: Rule[] = [
  // --- Changing your own password needs only that you are signed in as
  // someone; it is the one account operation that is not an admin power.
  { path: "/api/auth/password", role: "viewer" },

  // --- Accounts. Admin only, including reads: the user list is sensitive.
  { path: "/api/users", role: "admin" },
  { path: /^\/api\/users\//, role: "admin" },

  // --- The container and its configuration.
  { path: "/api/status/state", role: "admin" },
  { path: "/api/status/restart", role: "admin" },
  { path: "/api/config", role: "admin" },
  // Raw RCON is an arbitrary-command escape hatch; it is not a moderator tool
  // however carefully `lib/cs2/sanitize.ts` filters it.
  { path: "/api/rcon", role: "admin" },
  { path: "/api/updates/check", role: "admin" },
  { path: "/api/updates/apply", role: "admin" },
  { path: "/api/updates", methods: ["GET"], role: "viewer" },

  // --- Server content. Subscribing a workshop map downloads gigabytes onto the
  // host and editing the rotation outlives the session, so both are admin;
  // switching to a map that already exists is ordinary match running.
  { path: "/api/maps/workshop", role: "admin" },
  { path: "/api/maps/rotation", methods: ["GET"], role: "moderator" },
  { path: "/api/maps/rotation", role: "admin" },
  { path: "/api/maps/current", role: "moderator" },
  { path: /^\/api\/maps\/thumb\//, role: "viewer" },
  { path: "/api/maps", methods: ["GET"], role: "viewer" },

  // --- Running the match.
  { path: "/api/players/kick", role: "moderator" },
  { path: "/api/players/ban", role: "moderator" },
  { path: "/api/players", methods: ["GET"], role: "viewer" },
  { path: "/api/match/rounds", methods: ["GET"], role: "viewer" },
  { path: "/api/match", methods: ["GET"], role: "viewer" },
  { path: /^\/api\/match\//, role: "moderator" },
  { path: /^\/api\/matches(\/|$)/, role: "moderator" },

  // --- Reads.
  // The console carries every RCON reply the panel has ever printed, so it is
  // not spectator material.
  { path: "/api/console", role: "moderator" },
  { path: "/api/status", methods: ["GET"], role: "viewer" },
  { path: "/api/history", methods: ["GET"], role: "viewer" },
  // Demo downloads are the reason the viewer role exists.
  { path: "/api/demos", methods: ["GET"], role: "viewer" },
  { path: /^\/api\/demos\//, methods: ["GET"], role: "viewer" },
  { path: "/api/chat", methods: ["GET"], role: "viewer" },
];

/**
 * The role required for `pathname` + `method`.
 *
 * Returns `null` for an open route. Anything unmatched falls through to
 * `admin`: a route added without a rule fails closed, which costs one obvious
 * 403 in development and prevents a new endpoint from silently shipping
 * world-writable.
 */
export function requiredRole(pathname: string, method: string): Role | null {
  if (isOpenRoute(pathname)) return null;

  const upper = method.toUpperCase();
  for (const rule of RULES) {
    if (rule.methods && !rule.methods.includes(upper)) continue;
    if (typeof rule.path === "string") {
      if (pathname === rule.path) return rule.role;
    } else if (rule.path.test(pathname)) {
      return rule.role;
    }
  }
  return "admin";
}

/** Whether a role may call this route at all. */
export function canAccess(role: Role | null, pathname: string, method: string): boolean {
  const needed = requiredRole(pathname, method);
  if (needed === null) return true;
  return roleAtLeast(role, needed);
}

/**
 * The minimum role for each WebSocket event.
 *
 * The socket carries status, chat, console and player events on one connection,
 * so authorising the *connection* is not enough — a viewer holding a valid
 * session would otherwise receive the console stream the HTTP route denies
 * them. Events are filtered per frame in `lib/ws/server.ts`.
 */
export function wsEventMinRole(type: string): Role {
  if (type === "console.line") return "moderator";
  return "viewer";
}

/** Header the proxy stamps with the caller's resolved role. */
export const ROLE_HEADER = "x-sidearm-role";

/** Header the proxy stamps with the caller's user id, when they have one. */
export const USER_HEADER = "x-sidearm-user";
