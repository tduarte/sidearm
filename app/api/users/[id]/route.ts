import { NextResponse } from "next/server";
import { identityFrom, requireRole } from "@/lib/auth/guard";
import { validatePassword } from "@/lib/auth/credentials";
import { hashPassword } from "@/lib/auth/passwords";
import { isRole } from "@/lib/auth/permissions";
import { destroyUserSessions } from "@/lib/auth/session";
import { route } from "@/lib/api/route";
import {
  deleteUser,
  findUserById,
  otherActiveAdminCount,
  setUserDisabled,
  setUserPassword,
  setUserRole,
} from "@/lib/db/users";

export const dynamic = "force-dynamic";

/**
 * Refuses an edit that would leave the panel with no way back in.
 *
 * Demoting, disabling or deleting the only admin locks everyone out of a
 * self-hosted box permanently — recovery means a shell on the host and a SQLite
 * client. Cheaper to make it impossible.
 */
function wouldStrandPanel(targetId: string): boolean {
  return otherActiveAdminCount(targetId) === 0;
}

const LAST_ADMIN = {
  error:
    "That is the only admin left. Give someone else the Admin role first, or the panel would be locked out.",
};

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const denied = requireRole(req, "admin");
  if (denied) return denied;

  const { id } = await ctx.params;
  const target = findUserById(id);
  if (!target) return NextResponse.json({ error: "No such account." }, { status: 404 });

  let body: { role?: unknown; password?: unknown; disabled?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const actor = identityFrom(req);
  const isSelf = actor?.user?.id === target.id;

  if (body.role !== undefined) {
    if (!isRole(body.role)) {
      return NextResponse.json({ error: "Unknown role." }, { status: 400 });
    }
    if (target.role === "admin" && body.role !== "admin" && wouldStrandPanel(target.id)) {
      return NextResponse.json(LAST_ADMIN, { status: 409 });
    }
    setUserRole(target.id, body.role);
  }

  if (body.disabled !== undefined) {
    const disabled = body.disabled === true;
    if (disabled && isSelf) {
      return NextResponse.json(
        { error: "You cannot disable your own account." },
        { status: 409 },
      );
    }
    if (disabled && target.role === "admin" && wouldStrandPanel(target.id)) {
      return NextResponse.json(LAST_ADMIN, { status: 409 });
    }
    setUserDisabled(target.id, disabled);
  }

  if (body.password !== undefined) {
    if (typeof body.password !== "string") {
      return NextResponse.json({ error: "Malformed request." }, { status: 400 });
    }
    const invalid = validatePassword(body.password);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    setUserPassword(target.id, await hashPassword(body.password));
  }

  // Any change to what this account may do, or to how it proves who it is,
  // invalidates the cookies it already holds. Without this a demoted moderator
  // keeps their old authority for up to 30 days.
  if (body.role !== undefined || body.password !== undefined || body.disabled !== undefined) {
    destroyUserSessions(target.id);
  }

  return NextResponse.json({ user: findUserById(target.id) });
});

export const DELETE = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const denied = requireRole(req, "admin");
  if (denied) return denied;

  const { id } = await ctx.params;
  const target = findUserById(id);
  if (!target) return NextResponse.json({ error: "No such account." }, { status: 404 });

  const actor = identityFrom(req);
  if (actor?.user?.id === target.id) {
    return NextResponse.json(
      { error: "You cannot delete the account you are signed in as." },
      { status: 409 },
    );
  }
  if (target.role === "admin" && wouldStrandPanel(target.id)) {
    return NextResponse.json(LAST_ADMIN, { status: 409 });
  }

  deleteUser(target.id);
  return NextResponse.json({ ok: true });
});
