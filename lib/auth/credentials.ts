/**
 * The credential rules, stated once for both sides of the wire.
 *
 * These live apart from `passwords.ts` because the register and change-password
 * forms need them and `passwords.ts` imports `node:crypto`. Importing scrypt
 * into a client component does not merely bloat the bundle: `util.promisify`
 * runs against an undefined `scrypt` in the browser and throws during
 * hydration, which takes down every page in the app, not just the form. Keep
 * this module free of node imports.
 */

/** The rule the register and change-password forms state up front. */
export const MIN_PASSWORD_LENGTH = 10;

/** Long enough to be a paste-in passphrase, short enough to bound scrypt's work. */
const MAX_PASSWORD_LENGTH = 256;

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `That is longer than ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return "Use 3–32 characters: letters, numbers, dot, dash or underscore.";
  }
  return null;
}
