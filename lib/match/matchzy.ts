import type { MatchZyGameState } from "@/lib/api/types";

/**
 * Does MatchZy own the server right now?
 *
 * `"none"` is the trap. MatchZy answers `get5_status` with `gamestate: "none"`
 * whenever it is installed and no match config is loaded, which is the resting
 * state of every server this project deploys — the plugin ships in the CS2
 * image. So the question is not "did MatchZy say anything" but "did it say it
 * has a match", and a truthiness test answers the first one.
 *
 * It lives here because the answer was written twice: the server refused the
 * writes correctly while the dashboard stood down anyway, so an admin got a
 * dead mode picker labelled "MatchZy is running this" on an idle server that
 * would have accepted every one of those writes.
 */
export function matchzyOwns(state: MatchZyGameState | null): boolean {
  return state !== null && state !== "none";
}
