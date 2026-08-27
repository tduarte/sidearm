/**
 * Is the plugin stack actually loaded?
 *
 * This exists because of a failure mode that is invisible from every other
 * angle. CS2 updates rewrite `gameinfo.gi`, removing the search path Metamod
 * needs; applying a CS2 update here *is* a container restart; so a server can
 * come back healthy, listening, secure, accepting players — and silently
 * without MatchZy. Nothing in `status` says so. `docker/cs2/install-plugins.sh`
 * re-applies the line on every boot to prevent it, but a detector you never
 * watched fail is not a detector, and the panel should not have to trust its
 * own installer.
 *
 * Three layers stack, and knowing *which* one broke is the difference between a
 * useful banner and a shrug:
 *
 *   Metamod  →  CounterStrikeSharp  →  MatchZy
 *
 * so each gets its own probe rather than inferring the lot from one answer.
 */

/**
 * The probe for MatchZy is `get5_status`.
 *
 * Not a version convar — MatchZy publishes none. Not
 * `matchzy_remote_log_url`, which is a console command rather than a ConVar and
 * reads back as nothing. `get5_status` answers with JSON when loaded and with
 * the engine's refusal when not, and it is the same command Phase 1 polls for
 * match state, so detection is a by-product rather than a second mechanism.
 */
export const MATCHZY_PROBE = "get5_status";
export const METAMOD_PROBE = "meta list";
export const CSSHARP_PROBE = "css_plugins list";

/**
 * Did the engine refuse this command as unknown?
 *
 * CS2 quotes only the FIRST TOKEN back: `meta list` comes back as
 * `Unknown command 'meta'!`, not `Unknown command 'meta list'!`. Verified
 * against the live server — comparing against the whole command string looks
 * obviously correct and never matches.
 *
 * The comparison is deliberately narrow. A blanket "does the text contain
 * Unknown command" would misread a *reply that merely mentions* one, and more
 * importantly would read an empty string — RCON not answering at all — as proof
 * of absence, which is the one wrong answer that matters here.
 */
export function isUnknownCommand(text: string, command: string): boolean {
  const first = command.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return false;
  for (const m of text.matchAll(/Unknown command\s+['"]([^'"]+)['"]/gi)) {
    if (m[1]?.toLowerCase() === first) return true;
  }
  return false;
}

/**
 * What `get5_status` reports. Only the fields the panel reads are typed; the
 * rest of the payload is carried through untouched.
 *
 * `plugin_version` is deliberately absent: MatchZy hardcodes it to the Get5
 * string `"0.15.0"`, so reading it as MatchZy's version would be a fabrication.
 */
export interface Get5Status {
  /** `none` / `warmup` / `knife` / `waiting_for_knife_decision` / `live` / … */
  gamestate: string | null;
  /**
   * Whether the match is paused. This is the first honest answer the panel has
   * had to that question: CS2 exposes nothing, so `MatchState.pause` has only
   * ever been able to say "a pause was requested".
   */
  paused: boolean | null;
  /** The whole payload, for callers that want more than the above. */
  raw: Record<string, unknown>;
}

export interface Get5Probe {
  /** True when MatchZy answered; false when the engine refused the command. */
  loaded: boolean;
  /** Parsed payload, or `null` when MatchZy is absent. */
  status: Get5Status | null;
}

/**
 * Reads a `get5_status` reply.
 *
 * Returns `null` for "cannot tell" — an empty reply, or output that is neither
 * JSON nor a refusal. That third state is the whole point: RCON drops are
 * routine, and a dropped poll must not be reported as "the plugins are gone"
 * and set off the banner.
 */
export function parseGet5Status(text: string): Get5Probe | null {
  if (text.trim() === "") return null;

  if (isUnknownCommand(text, MATCHZY_PROBE)) {
    return { loaded: false, status: null };
  }

  // The reply may carry console noise around the payload, so take the outermost
  // brace pair rather than assuming the whole string is JSON.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;
  return {
    loaded: true,
    status: {
      gamestate: typeof obj.gamestate === "string" ? obj.gamestate : null,
      paused: typeof obj.paused === "boolean" ? obj.paused : null,
      raw: obj,
    },
  };
}

/**
 * Which layers answered.
 *
 * `null` on any field means "not probed, or RCON did not answer" — never
 * "absent". Same rule as `ServerStatus.control`: the panel says what it knows.
 */
export interface PluginProbe {
  matchzy: boolean | null;
  metamod: boolean | null;
  cssharp: boolean | null;
}

/**
 * Turns the probe into the sentence a banner can show, or `null` when there is
 * nothing worth saying.
 *
 * Deliberately silent when MatchZy is simply absent and always has been: most
 * installs of this panel will never have plugins, and a permanent banner
 * telling them so is noise. Only `everHadMatchZy` makes it speak — the
 * alarming transition is *was loaded, now is not*.
 */
export function describePluginFailure(
  probe: PluginProbe,
  everHadMatchZy: boolean,
): { title: string; detail: string; likelyCause: string } | null {
  if (probe.matchzy !== false) return null;
  if (!everHadMatchZy) return null;

  // Walk the stack outward from the bottom: the lowest layer that failed is the
  // one to name, because the ones above it could not possibly have loaded.
  if (probe.metamod === false) {
    return {
      title: "Metamod is not loaded",
      detail:
        "The server is running without Metamod, so CounterStrikeSharp and MatchZy cannot load either. Match control falls back to the panel's own cvar approximation.",
      likelyCause:
        "A CS2 update rewrites gameinfo.gi and drops Metamod's search path. Restarting the container re-applies it; if it keeps coming back, check the cs2 logs for lines tagged [sidearm].",
    };
  }

  if (probe.cssharp === false) {
    return {
      title: "CounterStrikeSharp is not loaded",
      detail:
        "Metamod is up but CounterStrikeSharp is not, so MatchZy cannot load. Match control falls back to the panel's own cvar approximation.",
      likelyCause:
        "CounterStrikeSharp is usually broken by a CS2 update until a new build ships. Check `css_plugins list` in the console and the pinned version in docker/cs2/Dockerfile.",
    };
  }

  return {
    title: "MatchZy is not loaded",
    detail:
      "The plugin loader is up but MatchZy is not answering, so knife rounds, vetoes and match backups are unavailable. Match control falls back to the panel's own cvar approximation.",
    likelyCause:
      "MatchZy failed to start even though CounterStrikeSharp did — its own log in game/csgo/addons/counterstrikesharp/logs is the place to look.",
  };
}
