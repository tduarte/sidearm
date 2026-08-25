import { NextResponse } from "next/server";
import { AUTH_COOKIE, authRequired, safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Lets the UI find out whether it needs to prompt for a token. */
export async function GET() {
  return NextResponse.json({ authRequired: authRequired() });
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
