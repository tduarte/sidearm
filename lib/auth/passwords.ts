import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt parameters. N=16384 (2^14), r=8, p=1 is the widely used interactive
 * baseline: ~16 MB and tens of milliseconds per hash, which is the right shape
 * for a login form on a home server's CPU.
 *
 * Node's default `maxmem` is 32 MB, which these parameters sit just under; it
 * is passed explicitly so that raising N later fails loudly here rather than
 * throwing inside a login request.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

/**
 * `scrypt$N$r$p$salt$hash`, all base64url.
 *
 * The parameters travel inside the hash so that stored passwords stay verifiable
 * when the cost is raised, and so a future move to argon2 can be told apart by
 * its prefix instead of by guessing. Nothing today reads the prefix, but a
 * format that cannot describe itself is a migration that has to be a flag day.
 */
const SCHEME = "scrypt";

function b64(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Hashes a password for storage. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return [SCHEME, N, R, P, b64(salt), b64(key)].join("$");
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash: a corrupted row must
 * fail one login, not crash the endpoint for everyone.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [scheme, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  if (scheme !== SCHEME) return false;

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltRaw, "base64url");
    expected = Buffer.from(hashRaw, "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A hash of a password nobody has, used to spend the same time on a login for a
 * username that does not exist as one that does.
 *
 * Without it, "no such user" returns in microseconds while a real user costs
 * ~50ms, and that gap enumerates accounts.
 */
let decoyHash: string | null = null;

export async function burnPasswordTime(password: string): Promise<void> {
  decoyHash ??= await hashPassword(randomBytes(24).toString("base64url"));
  await verifyPassword(password, decoyHash);
}

/** The rules the register and change-password forms state up front. */
export const MIN_PASSWORD_LENGTH = 10;

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 256) return "That is longer than 256 characters.";
  return null;
}

export function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return "Use 3–32 characters: letters, numbers, dot, dash or underscore.";
  }
  return null;
}
