import { NextResponse } from "next/server";

/**
 * Turns a thrown adapter error into something an admin can act on.
 *
 * The two control planes fail in very different ways and the raw errors read
 * alike from the browser — a bare `500 Internal Server Error` for both. Naming
 * which half is down, and what still works, is the difference between "the
 * panel is broken" and "the socket proxy is down, RCON is fine".
 */
export function describeServerError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  // dockerode surfaces the transport error verbatim when the socket proxy is
  // gone. AGENTS.md calls this out as the confusing half-broken panel: the
  // resource tiles and every lifecycle button die while RCON keeps answering.
  if (/ECONNREFUSED|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/.test(message)) {
    if (/docker|2375/i.test(message)) {
      return (
        "The Docker socket proxy is unreachable, so the panel cannot start, " +
        "stop or restart the server or read CPU and memory. RCON, chat and " +
        "the console are unaffected."
      );
    }
    return `A service the panel depends on is unreachable: ${message}`;
  }

  if (/no such container/i.test(message)) {
    return "There is no container named `cs2` on this host.";
  }

  return message.trim() || "The server gave no reason.";
}

/**
 * Wraps a route handler so a thrown error becomes `{ error }` with a real
 * reason instead of Next's generic 500.
 *
 * The client reads `error` off the body (`lib/api/client.ts`), and the global
 * mutation handler in `components/providers.tsx` puts it in front of the user.
 * Without this the chain has nothing to show but the status line.
 */
export function route<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      return NextResponse.json(
        { error: describeServerError(err) },
        { status: 500 },
      );
    }
  };
}
