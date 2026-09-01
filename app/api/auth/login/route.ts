import { NextResponse } from "next/server";
import { PEER_HEADER } from "@/lib/auth";
import { burnPasswordTime, verifyPassword } from "@/lib/auth/passwords";
import { clearRateLimit, rateLimit } from "@/lib/auth/rate-limit";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { route } from "@/lib/api/route";
import { findUserForLogin } from "@/lib/db/users";

export const dynamic = "force-dynamic";

/** One message for every failure, so nothing here tells an attacker which half was wrong. */
const REJECTED = "That username and password do not match.";

export const POST = route(async (req: Request) => {
  const peer = req.headers.get(PEER_HEADER) ?? "unknown";
  const limit = rateLimit(`login:${peer}`, { limit: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  let username = "";
  let password = "";
  try {
    const body = (await req.json()) as { username?: unknown; password?: unknown };
    if (typeof body.username === "string") username = body.username.trim();
    if (typeof body.password === "string") password = body.password;
  } catch {
    /* malformed body — one failed attempt like any other */
  }

  if (!username || !password) {
    return NextResponse.json({ error: REJECTED }, { status: 401 });
  }

  const user = findUserForLogin(username);
  if (!user || user.disabled) {
    // Spend the same time as a real verification. Returning early here would
    // make a missing account measurably faster to probe than a real one.
    await burnPasswordTime(password);
    return NextResponse.json({ error: REJECTED }, { status: 401 });
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: REJECTED }, { status: 401 });
  }

  clearRateLimit(`login:${peer}`);
  const { token } = createSession(user.id);
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
});
