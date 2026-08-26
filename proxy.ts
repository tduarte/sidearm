import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, PEER_HEADER, isTrustedPeer, safeEqual } from "@/lib/auth";

/**
 * Bearer-token gate over `/api/*`, backed by `PANEL_ADMIN_TOKEN`.
 *
 * Next 16 renamed the `middleware` file convention to `proxy`; `middleware.ts`
 * still works but warns on every build.
 *
 * Opt-in by design: with no token configured the panel stays open, which is what
 * the README documents for first-run setup on a trusted network.
 *
 * Three exemptions:
 *  - `/api/ingest/logs/<secret>` — CS2 cannot send headers; it authenticates via
 *    the shared secret embedded in the URL it was given over RCON.
 *  - `/api/auth` — the endpoint used to exchange a token for a session cookie,
 *    which by definition has to be reachable unauthenticated.
 *  - peers inside `PANEL_TRUSTED_CIDRS` — a LAN convenience, off by default.
 */
export function proxy(req: NextRequest) {
  const token = process.env.PANEL_ADMIN_TOKEN ?? "";
  if (token === "") return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/ingest/logs/")) return NextResponse.next();
  if (pathname === "/api/auth") return NextResponse.next();

  if (isTrustedPeer(req.headers.get(PEER_HEADER))) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? "";

  if (safeEqual(bearer, token) || safeEqual(cookie, token)) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
