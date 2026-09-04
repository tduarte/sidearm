import { isTrustedPeer, safeEqual } from "@/lib/auth";
import type { Role } from "@/lib/auth/permissions";
import { hasNoUsers } from "@/lib/db/users";
import { readCookie, SESSION_COOKIE, validateSession } from "./session";

/**
 * Who is calling, and with what authority.
 *
 * `source` exists so the UI can explain itself: a trusted-LAN caller sees "you
 * are signed in as a viewer because this device is on the trusted network"
 * instead of a login form it does not need and cannot use.
 */
export type Identity = {
  role: Role;
  source: "session" | "token" | "trusted-peer";
  user: { id: string; username: string; role: Role } | null;
};

/** The raw pieces of a request that carry identity, from any server surface. */
export type IdentityInput = {
  cookieHeader: string | null | undefined;
  authorization: string | null | undefined;
  /** The real TCP peer address, never `X-Forwarded-For`. */
  peer: string | null | undefined;
};

/**
 * Resolves an identity, or null when the caller has none.
 *
 * Three ways in, in descending specificity:
 *
 *  1. **A session cookie** — the normal path, and the only one that names a
 *     person.
 *  2. **`Authorization: Bearer <PANEL_ADMIN_TOKEN>`** — kept as a break-glass
 *     and API-automation credential. It is anonymous by nature, so it maps to
 *     `admin` and is never exchanged for a cookie.
 *  3. **A peer inside `PANEL_TRUSTED_CIDRS`** — maps to `viewer`, not admin.
 *     This is the deliberate change from the old model, where a trusted address
 *     skipped auth entirely: a LAN scoreboard or wall display keeps working
 *     without an account, while anything that touches the running match now
 *     belongs to a person who signed in.
 */
export function resolveIdentity(input: IdentityInput): Identity | null {
  const cookie = readCookie(input.cookieHeader, SESSION_COOKIE);
  if (cookie) {
    const user = validateSession(cookie);
    if (user) {
      return {
        role: user.role,
        source: "session",
        user: { id: user.id, username: user.username, role: user.role },
      };
    }
  }

  const token = process.env.PANEL_ADMIN_TOKEN ?? "";
  if (token !== "") {
    const header = input.authorization ?? "";
    if (header.startsWith("Bearer ") && safeEqual(header.slice(7), token)) {
      return { role: "admin", source: "token", user: null };
    }
  }

  if (isTrustedPeer(input.peer)) {
    return { role: "viewer", source: "trusted-peer", user: null };
  }

  return null;
}

/**
 * True while the panel has no accounts at all.
 *
 * Wrapped so callers do not have to care that it touches SQLite, and so a
 * database that cannot be opened fails closed: an unreadable database is not
 * evidence that the panel is unclaimed.
 */
export function isFirstRun(): boolean {
  try {
    return hasNoUsers();
  } catch {
    return false;
  }
}
