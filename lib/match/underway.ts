import type { MatchState } from "@/lib/api/types";

/**
 * Is a match actually being played right now?
 *
 * MatchZy's gamestate is the strongest signal, and only past the point where
 * the teams have readied up: a loaded config sitting in `warmup` or
 * `waiting_for_players` is the setup still resolving, and that is exactly when
 * you are most likely to want to change it.
 */
export function matchUnderway(match: MatchState, playersConnected: number | null): boolean {
  switch (match.matchzyState) {
    case "knife":
    case "waiting_for_knife_decision":
    case "going_live":
    case "live":
    case "pending_restore":
      return true;
  }

  /*
    A pug started in-game with `.start` is a real match that MatchZy will not
    report on, so MatchZy alone is not enough: the page opened on Setup while
    the dashboard next door announced a live match, which is two surfaces
    disagreeing about the same server.

    The log-derived phase is only usable now that it is reset on a map change
    and on an empty server — before that it latched to "live" and stayed there
    for days, which is what this function was written to defend against.
    Requiring someone to actually be connected is the second half of that
    defence, and it is why `null` (RCON silent) does not count.
  */
  return match.phase === "live" && playersConnected !== null && playersConnected > 0;
}
