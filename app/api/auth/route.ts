import { NextResponse } from "next/server";
import { breakGlassTokenConfigured, PEER_HEADER } from "@/lib/auth";
import { isFirstRun, resolveIdentity } from "@/lib/auth/identity";
import {
  readCookie,
  SESSION_COOKIE,
  destroySession,
  sessionCookieOptions,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Tells the UI which of three screens to show: register, sign in, or nothing.
 *
 * This is the only route the browser can reach before it has an identity, so it
 * carries everything the gate needs to decide, including *why* a caller is
 * already authorised when they never signed in (a trusted-network device).
 */
export async function GET(req: Request) {
  const identity = resolveIdentity({
    cookieHeader: req.headers.get("cookie"),
    authorization: req.headers.get("authorization"),
    peer: req.headers.get(PEER_HEADER),
  });

  return NextResponse.json({
    /** No accounts exist: the panel has never been claimed. */
    firstRun: isFirstRun(),
    /** Whether registration will additionally demand the setup token. */
    tokenConfigured: breakGlassTokenConfigured(),
    user: identity?.user ?? null,
    role: identity?.role ?? null,
    source: identity?.source ?? null,
  });
}

/** Signs this browser out. Other sessions for the same account are untouched. */
export async function DELETE(req: Request) {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (token) destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}
