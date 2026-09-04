/**
 * A small fixed-window limiter for the login endpoint.
 *
 * In memory on purpose: this panel is one process serving a handful of people,
 * and the threat is an script guessing passwords over a LAN or a forwarded
 * port, not a distributed campaign. A restart clearing the counters is an
 * acceptable trade for having no new dependency and no table.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Keeps the map from growing without bound when keys are one-shot. */
const MAX_KEYS = 4096;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_KEYS) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      if (windows.size >= MAX_KEYS) windows.clear();
    }
    windows.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > opts.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Forgets a key, so a successful login does not leave the user throttled. */
export function clearRateLimit(key: string): void {
  windows.delete(key);
}

/** Test seam. */
export function resetAllRateLimits(): void {
  windows.clear();
}
