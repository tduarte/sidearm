import { NextResponse, type NextRequest } from "next/server";
import { PEER_HEADER } from "@/lib/auth";
import { isFirstRun, resolveIdentity } from "@/lib/auth/identity";
import {
  canAccess,
  isOpenRoute,
  requiredRole,
  ROLE_HEADER,
  ROLE_LABEL,
  USER_HEADER,
} from "@/lib/auth/permissions";

/**
 * Role-aware auth gate over `/api/*`, backed by panel accounts in SQLite.
 *
 * Next 16 renamed the `middleware` file convention to `proxy`; `middleware.ts`
 * still works but warns on every build. Unlike the old middleware runtime, this
 * runs on **Node.js**, so it can open the database and validate a session
 * directly instead of deferring every check to the handlers.
 *
 * The panel is no longer "open by default when no token is set". It is closed
 * until someone registers, and the first person to register becomes the admin —
 * which is both easier to explain and safer than an unauthenticated panel that
 * can restart a container.
 *
 * Exemptions, all of which authenticate by other means, live in
 * `lib/auth/permissions.ts` next to the role table they are the exception to.
 *
 * This is the first of two gates. Each handler re-checks independently
 * (`lib/auth/guard.ts`); Next's docs are explicit that proxy checks are an
 * optimisation and not the boundary.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Strip any inbound copy of the headers we are about to stamp. Same
  // discipline as `PEER_HEADER` in `server.ts`: without this delete a client
  // could simply send `x-sidearm-role: admin` and be believed by anything
  // downstream that trusts it.
  const headers = new Headers(req.headers);
  headers.delete(ROLE_HEADER);
  headers.delete(USER_HEADER);

  const pass = () => NextResponse.next({ request: { headers } });

  if (isOpenRoute(pathname)) return pass();

  const identity = resolveIdentity({
    cookieHeader: req.headers.get("cookie"),
    authorization: req.headers.get("authorization"),
    peer: req.headers.get(PEER_HEADER),
  });

  if (!identity) {
    // Distinguishing "nobody has set this panel up" from "you are signed out"
    // is what lets the UI show a registration form instead of a login form it
    // could never satisfy.
    const first = isFirstRun();
    return NextResponse.json(
      {
        error: first
          ? "This panel has no accounts yet. Create the first one to get started."
          : "Sign in to do that.",
        code: first ? "first-run" : "unauthenticated",
      },
      { status: 401 },
    );
  }

  if (!canAccess(identity.role, pathname, req.method)) {
    const needed = requiredRole(pathname, req.method);
    return NextResponse.json(
      {
        error: needed
          ? `That needs the ${ROLE_LABEL[needed]} role. You are signed in as ${ROLE_LABEL[identity.role]}.`
          : "You are not allowed to do that.",
        code: "forbidden",
      },
      { status: 403 },
    );
  }

  headers.set(ROLE_HEADER, identity.role);
  if (identity.user) headers.set(USER_HEADER, identity.user.id);
  return pass();
}

export const config = {
  matcher: ["/api/:path*"],
};
