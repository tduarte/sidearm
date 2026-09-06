import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchzyOwns } from "@/lib/match/matchzy";

describe("matchzyOwns", () => {
  it("does not hand the server to an idle MatchZy", () => {
    // The bug this exists for: `get5_status` answers "none" whenever the
    // plugin is loaded and no match config is, which is every server this
    // project deploys, sitting idle. A truthiness test read that as ownership
    // and disabled the mode picker, the round limit and the map cycle on a
    // server that would have accepted all three.
    assert.equal(matchzyOwns("none"), false);
  });

  it("says no when MatchZy is absent", () => {
    assert.equal(matchzyOwns(null), false);
  });

  it("says yes once a config is loaded", () => {
    for (const state of [
      "warmup",
      "waiting_for_players",
      "knife",
      "waiting_for_knife_decision",
      "going_live",
      "live",
      "post_game",
      "pending_restore",
    ] as const) {
      assert.equal(matchzyOwns(state), true, state);
    }
  });

  it("assumes a state it has never heard of is a loaded match", () => {
    // Standing down from a match MatchZy is running is recoverable; writing
    // cvars underneath one is two systems fighting over a server.
    assert.equal(matchzyOwns("some_future_state"), true);
  });
});
