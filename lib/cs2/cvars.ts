/**
 * Reading cvars back from the server.
 *
 * Sending a bare cvar name over RCON returns its current value, which is the
 * only way the panel can render a control from what the server actually has
 * rather than from what the panel last asked for. `parseGameMode` in status.ts
 * already relied on this; this generalises it.
 *
 * Two things to know before using it:
 *
 *  - **Probing is safe for cvars and never for commands.** A bare cvar name
 *    reads; a bare *command* name RUNS. Asking whether `mp_swapteams` exists
 *    would swap the teams. Command support can only be discovered from the
 *    reply to a real invocation.
 *  - **A name that is absent from the reply is unknown, not off.** Defaulting a
 *    missing answer to `0`/false is how a panel ends up claiming a server state
 *    it never observed.
 */

/**
 * CS2 answers `name = value`, unquoted, with booleans as `true`/`false`:
 *
 *   sv_cheats = false
 *   mp_maxrounds = 24
 *   sv_password =
 *
 * Source and CS:GO used `"name" = "value"`, and some builds still do, so both
 * shapes are accepted. Verified against a live CS2 server (build 1.41.7.7).
 */
const ECHO_RE =
  /^\s*"?([a-z0-9_]+)"?\s*=\s*(?:"([^"]*)"|([^\r\n(]*?))\s*(?:\(\s*(?:def|default)[^)]*\)\s*)?$/gim;

/** `Unknown command 'sv_grenade_trajectory'!` — single quotes, trailing bang. */
const UNKNOWN_RE = /Unknown command\s+['"]([^'"]+)['"]/gi;

export interface CvarRead {
  /** Name → raw value, exactly as the server rendered it. */
  values: Map<string, string>;
  /** Names the server does not recognise on this build. */
  unknown: Set<string>;
}

export function parseCvarEcho(text: string): CvarRead {
  const values = new Map<string, string>();
  const unknown = new Set<string>();

  UNKNOWN_RE.lastIndex = 0;
  for (const m of text.matchAll(UNKNOWN_RE)) unknown.add(m[1]);

  ECHO_RE.lastIndex = 0;
  for (const m of text.matchAll(ECHO_RE)) {
    const name = m[1].toLowerCase();
    // Group 2 is the quoted form, group 3 the bare one. An empty value is
    // meaningful (`sv_password = ` means no password), so `??` not `||`.
    const value = (m[2] ?? m[3] ?? "").trim();
    if (!unknown.has(name)) values.set(name, value);
  }

  return { values, unknown };
}

/** Builds one batched read: `a; b; c` in a single RCON round-trip. */
export function cvarReadCommand(names: readonly string[]): string {
  return names.join("; ");
}

/**
 * `true`/`false`, `1`/`0`. Returns null for anything else, including a value
 * the server never sent — unknown must stay distinguishable from off.
 */
export function asBool(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

/** Finite integer, or null when absent or unparseable. */
export function asInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) ? n : null;
}
