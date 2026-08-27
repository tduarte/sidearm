import { quoteArg } from "./sanitize";

/**
 * The shared secret CS2 presents when fetching a match config.
 *
 * Falls back to `LOG_INGEST_SECRET` so an existing install gains this feature
 * with no new configuration: that secret already exists, is already handed to
 * the game server over RCON, and guards a route on the same trust boundary.
 * Operators who want them separate can set `MATCHZY_CONFIG_SECRET`.
 */
export function matchzyConfigSecret(): string {
  return process.env.MATCHZY_CONFIG_SECRET || process.env.LOG_INGEST_SECRET || "";
}

/**
 * Where CS2 should reach the panel.
 *
 * The compose service name, not a public address: this request is made from
 * inside the compose network, and routing it out through the host and back
 * would make a game-thread-blocking call depend on the internet.
 */
export function panelUrl(): string {
  return process.env.PANEL_URL ?? `http://panel:${process.env.PORT ?? "3000"}`;
}

/** The URL for one match config. */
export function matchConfigUrl(id: string): string {
  return `${panelUrl()}/api/matchzy/config/${matchzyConfigSecret()}/${encodeURIComponent(id)}`;
}

/**
 * The RCON command that makes CS2 fetch and load a match.
 *
 * Loading a match reloads the map and restarts the game for everyone on the
 * server, which is why every caller confirms first.
 */
export function loadMatchCommand(id: string): string {
  return `matchzy_loadmatch_url "${quoteArg(matchConfigUrl(id))}"`;
}
