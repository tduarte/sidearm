import { NextResponse } from "next/server";
import { breakGlassTokenConfigured, PEER_HEADER, safeEqual } from "@/lib/auth";
import { validatePassword, validateUsername } from "@/lib/auth/credentials";
import { hashPassword } from "@/lib/auth/passwords";
import { rateLimit } from "@/lib/auth/rate-limit";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { route } from "@/lib/api/route";
import { createUser, hasNoUsers } from "@/lib/db/users";

export const dynamic = "force-dynamic";

/**
 * Claims an unclaimed panel: creates the first account, as an admin.
 *
 * Open only while zero accounts exist. Every later account is created by an
 * admin from Settings, so this is a one-time door rather than public signup.
 *
 * **The upgrade path.** An install that already runs with `PANEL_ADMIN_TOKEN`
 * set is a panel someone already owns, reachable by whoever could reach it
 * before. Handing its first visitor an admin account would be a downgrade in
 * security delivered by an update. So when that token is configured,
 * registration also requires it — proving the registrant is the operator who
 * deployed the panel, not the first person to load the page after a redeploy.
 * A panel with no token set (a fresh `docker compose up` on a LAN) registers
 * freely, which is exactly the trust level it had a moment earlier.
 */
export const POST = route(async (req: Request) => {
  const peer = req.headers.get(PEER_HEADER) ?? "unknown";
  const limit = rateLimit(`register:${peer}`, { limit: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  if (!hasNoUsers()) {
    return NextResponse.json(
      {
        error:
          "This panel already has an account. Ask an admin to create one for you, or sign in.",
      },
      { status: 403 },
    );
  }

  let username = "";
  let password = "";
  let setupToken = "";
  try {
    const body = (await req.json()) as {
      username?: unknown;
      password?: unknown;
      setupToken?: unknown;
    };
    if (typeof body.username === "string") username = body.username.trim();
    if (typeof body.password === "string") password = body.password;
    if (typeof body.setupToken === "string") setupToken = body.setupToken;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (breakGlassTokenConfigured()) {
    const expected = process.env.PANEL_ADMIN_TOKEN ?? "";
    if (!safeEqual(setupToken, expected)) {
      return NextResponse.json(
        {
          error:
            "This panel is protected by PANEL_ADMIN_TOKEN. Enter that token to claim it.",
          code: "setup-token-required",
        },
        { status: 401 },
      );
    }
  }

  const usernameError = validateUsername(username);
  if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = createUser({ username, passwordHash, role: "admin" });
  } catch {
    // Two browsers racing to claim the same fresh panel: the UNIQUE index and
    // the `hasNoUsers` check above mean only one wins, and the loser is told to
    // sign in rather than being handed a second admin account.
    return NextResponse.json(
      { error: "That account already exists. Sign in instead." },
      { status: 409 },
    );
  }

  const { token } = createSession(user.id);
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
});
