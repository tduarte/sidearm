import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseStatusText } from "@/lib/cs2/status";
import { matchUnderway } from "@/lib/match/underway";
import type { MatchState } from "@/lib/api/types";
import {
  DEMO_ABANDON_POLLS,
  demoAllowed,
  demoStopReason,
} from "@/lib/api/server/real";

/**
 * The demo that ran for twenty-six hours.
 *
 * A real match ended, MatchZy dropped its config (`get5_status` went back to
 * `gamestate: "none"`) and never issued `tv_stoprecord`. GOTV kept writing.
 * By the time anyone looked the file was 709 MB and still growing, and the
 * panel's match card reported `demo: "unknown"` throughout — while `status`
 * had been printing the filename the whole time.
 *
 * Two separate failures, so two separate defences: read the recording state
 * instead of remembering it, and stop one that has no business running.
 */

/** Trimmed from the live server, 2026-09-01. */
const RECORDING_STATUS = `
hostname : sidearm
version  : 1.41.7.8/14178 10896 secure  public
udp/ip   : 0.0.0.0:27015 (public 76.226.161.203:27015)
sourcetv[0] : 0.0.0.0:27020 (public 76.226.161.203:27020) delay 30.0s
players  : 0 humans, 1 bots (0 max) (not hibernating) (unreserved)
loaded spawngroup(  1)  : SV:  [1: cobblewingman | main lump | mapload]
--- SourceTV[0] Status ---
Local Slots 10, Spectators 0, Proxies 0
Now recording to "MatchZy/2026-08-31_04-10-31_3_cobblewingman_team_A_vs_team_B.dem", recorded length so far is 25:47:38.
#end
`;

const IDLE_STATUS = `
hostname : sidearm
version  : 1.41.7.8/14178 10896 secure  public
sourcetv[0] : 0.0.0.0:27020 (public 76.226.161.203:27020) delay 30.0s
players  : 0 humans, 1 bots (0 max) (not hibernating) (unreserved)
loaded spawngroup(  1)  : SV:  [1: cobblewingman | main lump | mapload]
#end
`;

describe("reading the recording out of status", () => {
  it("finds the file GOTV is writing", () => {
    assert.equal(
      parseStatusText(RECORDING_STATUS).recordingTo,
      "MatchZy/2026-08-31_04-10-31_3_cobblewingman_team_A_vs_team_B.dem",
    );
  });

  it("keeps the subdirectory", () => {
    // MatchZy writes into `matchzy_demo_path` while the panel's own tv_record
    // writes to the game directory. lib/cs2/demos.ts resolves the one-level
    // prefix, so throwing it away here would break the download link.
    assert.match(parseStatusText(RECORDING_STATUS).recordingTo ?? "", /^MatchZy\//);
  });

  it("reports null when nothing is recording", () => {
    assert.equal(parseStatusText(IDLE_STATUS).recordingTo, null);
  });
});

describe("which sessions may record", () => {
  it("records competitive", () => {
    assert.equal(demoAllowed("competitive", false), true);
  });

  it("does not record the kickabout modes", () => {
    for (const mode of ["casual", "deathmatch", "practice", "wingman"] as const) {
      assert.equal(demoAllowed(mode, false), false, `${mode} should not record`);
    }
  });

  it("records a loaded match whatever the game mode is", () => {
    // Loading a match config is the act of saying "this one counts", so a
    // wingman BO3 is still a match and still worth a demo.
    assert.equal(demoAllowed("wingman", true), true);
  });
});

describe("when a running demo must stop", () => {
  it("leaves a competitive match with people in it alone", () => {
    assert.equal(demoStopReason(true, "competitive", false, 0), null);
  });

  it("stops a demo running outside a competitive match", () => {
    assert.equal(demoStopReason(true, "deathmatch", false, 0), "not-competitive");
  });

  it("stops a competitive demo once everyone has left", () => {
    assert.equal(
      demoStopReason(true, "competitive", true, DEMO_ABANDON_POLLS),
      "abandoned",
    );
  });

  it("gives an empty server one poll of grace", () => {
    // A demo is not cheap to lose, and a single tick with an empty player
    // table during a map change must not end the recording of a live match.
    assert.equal(demoStopReason(true, "competitive", true, DEMO_ABANDON_POLLS - 1), null);
  });

  it("says nothing when no demo is running", () => {
    assert.equal(demoStopReason(false, "deathmatch", false, 99), null);
  });
});

describe("is a match actually being played", () => {
  const m = (over: Partial<MatchState>): MatchState =>
    ({
      phase: "warmup",
      score: { ct: 0, t: 0 },
      round: 0,
      maxRounds: 24,
      pause: "running",
      demo: { state: "idle", name: null },
      knifeSetupApplied: false,
      matchzyState: null,
      series: null,
      ...over,
    }) as MatchState;

  it("trusts MatchZy whatever the roster says", () => {
    assert.equal(matchUnderway(m({ matchzyState: "live" }), 0), true);
  });

  it("counts an in-game pug that MatchZy never reports on", () => {
    // `.start` pugs leave get5_status empty, so MatchZy alone would open
    // Match Control on Setup while the dashboard announced a live match.
    assert.equal(matchUnderway(m({ phase: "live" }), 10), true);
  });

  it("does not call a stale live phase a match", () => {
    // The phantom: phase latched live for days with nobody connected.
    assert.equal(matchUnderway(m({ phase: "live" }), 0), false);
  });

  it("does not guess while RCON is silent", () => {
    assert.equal(matchUnderway(m({ phase: "live" }), null), false);
  });

  it("leaves the setup form up during warmup", () => {
    assert.equal(matchUnderway(m({ matchzyState: "warmup" }), 10), false);
  });
});
