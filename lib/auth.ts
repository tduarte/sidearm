/**
 * Shared auth constants and a constant-time comparison.
 *
 * Runs on the Edge runtime (middleware), so `node:crypto.timingSafeEqual` is not
 * available — hence the hand-rolled compare.
 */

export const AUTH_COOKIE = "sidearm_token";

/** Compares two strings without leaking their contents through timing. */
export function safeEqual(a: string, b: string): boolean {
  // Length is not secret here (the operator chose it), but bail early to avoid
  // indexing past the end.
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Auth is opt-in: with no token configured the panel stays open. */
export function authRequired(): boolean {
  return (process.env.PANEL_ADMIN_TOKEN ?? "") !== "";
}
