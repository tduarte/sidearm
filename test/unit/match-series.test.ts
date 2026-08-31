import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MatchZySeries, WsEvent } from "@/lib/api/types";

/**
 * When the panel decides MatchZy has started a *different* match.
 *
 * This file is deliberately on its own: the "have we polled yet" flag is
 * module state, and the distinction being tested — first sighting versus a
 * change — only exists once per process.
 */
const seriesWith = (matchId: number, mapNumber = 0): MatchZySeries => ({
  matchId,
  mapNumber,
  maps: ["de_nuke", "de_ancient"],
  team1: { name: "Team A", seriesScore: 0, mapScore: 3, side: "T" },
  team2: { name: "Team B", seriesScore: 0, mapScore: 5, side: "CT" },
});

describe("match.series", () => {
  it("stays quiet on the first poll and speaks up on a change", async () => {
    const { updateCache } = await import("@/lib/api/server/real");
    const { bus } = await import("@/lib/ws/bus");
    const status = await import("./helpers/status-fixture").then((m) => m.default);

    const seen: WsEvent[] = [];
    const off = bus.subscribe((e) => {
      if (e.type === "match.series") seen.push(e);
    });

    // A panel that has just restarted mid-match sees the running match for the
    // first time. Treating that as new would close the record it just resumed.
    updateCache(status(), null, undefined, {
      gamestate: "live",
      paused: false,
      series: seriesWith(7),
      raw: {},
    });
    assert.equal(seen.length, 0, "first sighting is not a change");

    // Same match, next poll.
    updateCache(status(), null, undefined, {
      gamestate: "live",
      paused: false,
      series: seriesWith(7),
      raw: {},
    });
    assert.equal(seen.length, 0, "an unchanged match is not a change");

    // The next map of the same series counts: MatchZy keeps the match id and
    // moves the map number, and it is a different game with its own rounds.
    updateCache(status(), null, undefined, {
      gamestate: "live",
      paused: false,
      series: seriesWith(7, 1),
      raw: {},
    });
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0], { type: "match.series", matchId: 7, mapNumber: 1 });

    // Unloading reports the absence, which the recorder ignores — the phase
    // change is what closes a match that has ended.
    updateCache(status(), null, undefined, {
      gamestate: "none",
      paused: false,
      series: null,
      raw: {},
    });
    assert.equal(seen.length, 2);
    assert.equal(seen[1].type === "match.series" && seen[1].matchId, null);

    off();
  });
});
