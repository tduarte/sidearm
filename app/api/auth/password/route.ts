import { NextResponse } from "next/server";
import { identityFrom, requireRole } from "@/lib/auth/guard";
import { validatePassword } from "@/lib/auth/credentials";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import {
  createSession,
  destroyUserSessions,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { route } from "@/lib/api/route";
import { getPasswordHash, setUserPassword } from "@/lib/db/users";

export const dynamic = "force-dynamic";

/**
 * Changes the signed-in user's own password.
 *
 * Requires the current password even though the caller already holds a valid
 * session: a session is evidence that this browser was signed in once, not that
 * the person at the keyboard is the account owner.
 */
export const POST = route(async (req: Request) => {
  const denied = requireRole(req, "viewer");
  if (denied) return denied;

  const identity = identityFrom(req);
  if (!identity?.user) {
    // A bearer-token or trusted-network caller has authority but no account, so
    // there is no password for them to change.
    return NextResponse.json(
      { error: "This credential is not tied to an account, so it has no password." },
      { status: 400 },
    );
  }

  let current = "";
  let next = "";
  try {
    const body = (await req.json()) as { currentPassword?: unknown; newPassword?: unknown };
    if (typeof body.currentPassword === "string") current = body.currentPassword;
    if (typeof body.newPassword === "string") next = body.newPassword;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const stored = getPasswordHash(identity.user.id);
  if (!stored || !(await verifyPassword(current, stored))) {
    return NextResponse.json({ error: "That is not your current password." }, { status: 401 });
  }

  const invalid = validatePassword(next);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  setUserPassword(identity.user.id, await hashPassword(next));

  // Sign every other browser out — the usual reason to change a password is
  // that someone else may have had it. This browser gets a fresh session so the
  // person who just did it is not logged out by their own action.
  destroyUserSessions(identity.user.id);
  const { token } = createSession(identity.user.id);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
});
