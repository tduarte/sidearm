import { NextResponse } from "next/server";
import { AUTH_COOKIE, PEER_HEADER, authRequired, isTrustedPeer, safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Lets the UI find out whether it needs to prompt for a token.
 *
 * A caller inside `PANEL_TRUSTED_CIDRS` is told `false`, so the LAN never sees
 * the login screen — matching what the proxy will actually enforce.
 */
export async function GET(req: Request) {
  const trusted = isTrustedPeer(req.headers.get(PEER_HEADER));
  const configured = authRequired();
  return NextResponse.json({
    authRequired: configured && !trusted,
    /** Whether PANEL_ADMIN_TOKEN is set at all, regardless of this caller. */
    tokenConfigured: configured,
    /** This caller is exempt because its address is in PANEL_TRUSTED_CIDRS. */
    trustedPeer: trusted,
  });
}

/** Exchanges the admin token for an HttpOnly session cookie. */
export async function POST(req: Request) {
  const expected = process.env.PANEL_ADMIN_TOKEN ?? "";
  if (expected === "") {
    return NextResponse.json({ ok: true, authRequired: false });
  }

  let token = "";
  try {
    const body = (await req.json()) as { token?: unknown };
    if (typeof body.token === "string") token = body.token;
  } catch {
    /* malformed body — treated as a failed attempt */
  }

  if (!safeEqual(token, expected)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // The panel is commonly served over plain HTTP on a LAN, so `secure` would
    // silently drop the cookie there. Opt in when running behind TLS.
    secure: process.env.PANEL_HTTPS === "1",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

/** Clears the session cookie. The token itself is unchanged, of course. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.PANEL_HTTPS === "1",
    maxAge: 0,
  });
  return res;
}
