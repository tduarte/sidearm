import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { validatePassword, validateUsername } from "@/lib/auth/credentials";
import { hashPassword } from "@/lib/auth/passwords";
import { isRole } from "@/lib/auth/permissions";
import { route } from "@/lib/api/route";
import { createUser, listUsers } from "@/lib/db/users";

export const dynamic = "force-dynamic";

/** The accounts on this panel. Admin only — the list itself is sensitive. */
export const GET = route(async (req: Request) => {
  const denied = requireRole(req, "admin");
  if (denied) return denied;
  return NextResponse.json({ users: listUsers() });
});

/**
 * Creates an account with a password the admin hands over out of band.
 *
 * There is no invite email: a self-hosted panel has no mail transport, and
 * inventing one would be a whole subsystem to deliver a string the admin is
 * already going to paste into a chat window.
 */
export const POST = route(async (req: Request) => {
  const denied = requireRole(req, "admin");
  if (denied) return denied;

  let username = "";
  let password = "";
  let role: unknown = "viewer";
  try {
    const body = (await req.json()) as {
      username?: unknown;
      password?: unknown;
      role?: unknown;
    };
    if (typeof body.username === "string") username = body.username.trim();
    if (typeof body.password === "string") password = body.password;
    role = body.role ?? "viewer";
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!isRole(role)) {
    return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  }
  const usernameError = validateUsername(username);
  if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const passwordHash = await hashPassword(password);
  try {
    const user = createUser({ username, passwordHash, role });
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: `There is already an account called ${username}.` },
      { status: 409 },
    );
  }
});
