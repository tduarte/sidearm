import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { findUserById, type User } from "@/lib/db/users";

/**
 * Session cookie name.
 *
 * Deliberately not the old `sidearm_token`: that cookie held the shared admin
 * token verbatim, and an install upgrading from it should have its stale
 * cookies ignored rather than reinterpreted.
 */
export const SESSION_COOKIE = "sidearm_session";

/** Sliding window. Every validated request pushes the expiry back out. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Only extend the expiry when it has moved meaningfully, to avoid a write per request. */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Issues a session and returns the raw token; only its hash is stored. */
export function createSession(userId: string): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = iso(now + SESSION_TTL_MS);
  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(hashToken(token), userId, iso(now), expiresAt, iso(now));
  return { token, expiresAt };
}

/**
 * Resolves a raw token to its user, or null.
 *
 * Expired rows are deleted on sight rather than swept on a timer: the table is
 * tiny, and a session table that only grows is how a self-hosted panel ends up
 * with a database full of dead cookies.
 */
export function validateSession(token: string): User | null {
  if (!token) return null;
  const db = getDb();
  const tokenHash = hashToken(token);
  const row = db
    .prepare(`SELECT user_id, expires_at, last_seen_at FROM sessions WHERE token_hash = ?`)
    .get(tokenHash) as
    | { user_id: string; expires_at: string; last_seen_at: string }
    | undefined;
  if (!row) return null;

  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    return null;
  }

  const user = findUserById(row.user_id);
  // A disabled account keeps its rows so it can be re-enabled, but must not
  // authenticate in the meantime.
  if (!user || user.disabled) return null;

  if (now - Date.parse(row.last_seen_at) > REFRESH_AFTER_MS) {
    db.prepare(
      `UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?`,
    ).run(iso(now), iso(now + SESSION_TTL_MS), tokenHash);
  }

  return user;
}

export function destroySession(token: string): void {
  if (!token) return;
  getDb().prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
}

/**
 * Drops every session a user holds.
 *
 * Called whenever their authority changes — role edit, password change, disable,
 * delete — so a demoted moderator does not keep an admin cookie until it
 * expires.
 */
export function destroyUserSessions(userId: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
}

/** Reads one cookie out of a raw `Cookie:` header. */
export function readCookie(header: string | undefined | null, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

/** Cookie attributes, shared by every path that sets or clears the session. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    // The panel is commonly served over plain HTTP on a LAN, where `secure`
    // would silently drop the cookie. Opt in when running behind TLS.
    secure: process.env.PANEL_HTTPS === "1",
    maxAge,
  };
}

export const SESSION_MAX_AGE = Math.floor(SESSION_TTL_MS / 1000);
