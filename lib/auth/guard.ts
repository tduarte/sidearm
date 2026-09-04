import { NextResponse } from "next/server";
import { PEER_HEADER } from "@/lib/auth";
import { resolveIdentity, isFirstRun, type Identity } from "./identity";
import { canAccess, requiredRole, ROLE_LABEL, roleAtLeast, type Role } from "./permissions";

/**
 * Resolves the caller from a route handler's `Request`.
 *
 * The proxy has already checked this same thing and stamped the result on the
 * request. This re-derives it from scratch anyway, because Next's own proxy
 * documentation says not to treat the proxy as the only gate: anything that
 * reaches a handler by another path — a rewrite, a direct call in a test, a
 * future route the matcher misses — would otherwise arrive unauthenticated.
 * Reading the stamped header instead of re-checking would make the header the
 * security boundary, and headers are cheap to forge if the delete in
 * `proxy.ts` ever regresses.
 */
export function identityFrom(req: Request): Identity | null {
  return resolveIdentity({
    cookieHeader: req.headers.get("cookie"),
    authorization: req.headers.get("authorization"),
    peer: req.headers.get(PEER_HEADER),
  });
}

export type Denial = NextResponse;

function unauthenticated(): Denial {
  return NextResponse.json(
    {
      error: isFirstRun()
        ? "This panel has no accounts yet. Create the first one to get started."
        : "Sign in to do that.",
      code: isFirstRun() ? "first-run" : "unauthenticated",
    },
    { status: 401 },
  );
}

function forbidden(needed: Role, actual: Role): Denial {
  return NextResponse.json(
    {
      error: `That needs the ${ROLE_LABEL[needed]} role. You are signed in as ${ROLE_LABEL[actual]}.`,
      code: "forbidden",
    },
    { status: 403 },
  );
}

/**
 * Guards a handler by role. Returns a response to send back, or `null` to
 * proceed.
 *
 * Usage inside a handler, before anything else:
 *
 *   const denied = requireRole(req, "moderator");
 *   if (denied) return denied;
 */
export function requireRole(req: Request, needed: Role): Denial | null {
  const identity = identityFrom(req);
  if (!identity) return unauthenticated();
  if (!roleAtLeast(identity.role, needed)) return forbidden(needed, identity.role);
  return null;
}

/**
 * Guards using the route table rather than a hardcoded role, so the handler and
 * the proxy cannot drift apart.
 */
export function requireRouteAccess(req: Request): Denial | null {
  const { pathname } = new URL(req.url);
  const identity = identityFrom(req);
  if (!identity) {
    return requiredRole(pathname, req.method) === null ? null : unauthenticated();
  }
  if (!canAccess(identity.role, pathname, req.method)) {
    const needed = requiredRole(pathname, req.method);
    return needed ? forbidden(needed, identity.role) : null;
  }
  return null;
}

/** The caller's role, or null when unauthenticated. For handlers that vary output by role. */
export function roleOf(req: Request): Role | null {
  return identityFrom(req)?.role ?? null;
}
