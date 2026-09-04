import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { Role } from "@/lib/auth/permissions";

export type User = {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
  disabled: boolean;
};

type UserRow = {
  id: string;
  username: string;
  role: Role;
  created_at: string;
  disabled: number;
};

const COLUMNS = "id, username, role, created_at, disabled";

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    disabled: row.disabled === 1,
  };
}

/**
 * Whether the panel has never been set up.
 *
 * Drives the whole first-run path: with no accounts, the API is closed and the
 * UI offers registration instead of a login form. Counts disabled users too —
 * an install that disabled its way down to zero enabled accounts is locked out,
 * not unclaimed, and must not hand the next visitor an admin account.
 */
export function hasNoUsers(): boolean {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number };
  return row.n === 0;
}

export function listUsers(): User[] {
  const rows = getDb()
    .prepare(`SELECT ${COLUMNS} FROM users ORDER BY created_at ASC`)
    .all() as UserRow[];
  return rows.map(toUser);
}

export function findUserById(id: string): User | null {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id) as
    | UserRow
    | undefined;
  return row ? toUser(row) : null;
}

/** Returns the row including its hash — only the login path should need this. */
export function findUserForLogin(
  username: string,
): (User & { passwordHash: string }) | null {
  const row = getDb()
    .prepare(`SELECT ${COLUMNS}, password_hash FROM users WHERE username = ?`)
    .get(username) as (UserRow & { password_hash: string }) | undefined;
  return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
}

export function getPasswordHash(id: string): string | null {
  const row = getDb().prepare(`SELECT password_hash FROM users WHERE id = ?`).get(id) as
    | { password_hash: string }
    | undefined;
  return row?.password_hash ?? null;
}

/**
 * Creates a user. Throws on a duplicate username (the UNIQUE index), which the
 * caller turns into a 409.
 */
export function createUser(input: {
  username: string;
  passwordHash: string;
  role: Role;
}): User {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO users (id, username, password_hash, role)
       VALUES (@id, @username, @passwordHash, @role)`,
    )
    .run({ id, ...input });
  const created = findUserById(id);
  if (!created) throw new Error("user vanished immediately after insert");
  return created;
}

export function setUserRole(id: string, role: Role): void {
  getDb().prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, id);
}

export function setUserPassword(id: string, passwordHash: string): void {
  getDb().prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, id);
}

export function setUserDisabled(id: string, disabled: boolean): void {
  getDb().prepare(`UPDATE users SET disabled = ? WHERE id = ?`).run(disabled ? 1 : 0, id);
}

export function deleteUser(id: string): void {
  // Sessions cascade: the schema declares ON DELETE CASCADE and `getDb()` turns
  // on `foreign_keys`, so a deleted account cannot leave a live cookie behind.
  getDb().prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

/**
 * Enabled admins other than `exceptId`.
 *
 * Every destructive account edit checks this. Locking the last admin out of a
 * self-hosted panel is unrecoverable without a shell on the box and a SQLite
 * client, so the API refuses rather than trusting the operator to notice.
 */
export function otherActiveAdminCount(exceptId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM users
        WHERE role = 'admin' AND disabled = 0 AND id != ?`,
    )
    .get(exceptId) as { n: number };
  return row.n;
}
