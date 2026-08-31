import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  matchzyOwnsMatch,
  partitionOwnedCvars,
  updateMatchState,
} from "@/lib/api/server/real";

/**
 * With a match loaded, MatchZy owns the map cycle, the gameplay cvars and demo
 * recording. The panel doing any of them anyway does not error — it produces
 * two systems fighting over one server, which is the harder thing to debug.
 */
describe("matchzyOwnsMatch", () => {
  beforeEach(() => updateMatchState({ matchzyState: null }));

  it("is false without the plugin, or before the probe has run", () => {
    assert.equal(matchzyOwnsMatch(), false);
  });

  it("is false when MatchZy is loaded but idle", () => {
    // `none` is a real answer meaning "loaded, running nothing" — including
    // every pug started in-game, which get5_status does not report on. The
    // panel must keep working normally there.
    updateMatchState({ matchzyState: "none" });
    assert.equal(matchzyOwnsMatch(), false);
  });

  it("is true through every stage of a loaded match", () => {
    for (const state of [
      "waiting_for_players",
      "warmup",
      "knife",
      "waiting_for_knife_decision",
      "going_live",
      "live",
      "post_game",
    ]) {
      updateMatchState({ matchzyState: state });
      assert.equal(matchzyOwnsMatch(), true, `expected ownership during ${state}`);
    }
  });

  it("is true for a gamestate a future MatchZy invents", () => {
    // Unknown means "something is loaded"; standing down is the safe read.
    updateMatchState({ matchzyState: "some_new_phase" });
    assert.equal(matchzyOwnsMatch(), true);
  });
});

describe("partitionOwnedCvars", () => {
  it("holds back what live.cfg would revert", () => {
    const { safe, held } = partitionOwnedCvars([
      'hostname "sidearm"',
      "game_type 0",
      "game_mode 1",
      "sv_visiblemaxplayers 10",
      "bot_quota 0",
    ]);
    assert.deepEqual(held, [
      "game_type 0",
      "game_mode 1",
      "sv_visiblemaxplayers 10",
      "bot_quota 0",
    ]);
    assert.deepEqual(safe, ['hostname "sidearm"']);
  });

  it("lets identity and access through", () => {
    // MatchZy does not touch these, so renaming the server or setting a
    // password mid-match is still perfectly reasonable.
    const { safe, held } = partitionOwnedCvars([
      'hostname "sidearm"',
      'sv_password "hunter2"',
      'matchzy_hostname_format "sidearm"',
    ]);
    assert.equal(held.length, 0);
    assert.equal(safe.length, 3);
  });

  it("matches on the cvar name, not on a substring", () => {
    // `mp_maxrounds` is owned; a cvar that merely contains it is not.
    const { held } = partitionOwnedCvars(["mp_maxrounds_something 3"]);
    assert.deepEqual(held, []);
  });

  it("is case-insensitive and tolerates leading space", () => {
    const { held } = partitionOwnedCvars(["  GAME_TYPE 0"]);
    assert.deepEqual(held, ["  GAME_TYPE 0"]);
  });
});

describe("applyMatchZyState via updateCache", () => {
  it("finally reads the pause state instead of inferring it", async () => {
    // CS2 has no mp_paused cvar and no pause column in `status`, so the panel
    // could only ever say "a pause was requested" and hope. get5_status
    // answers directly, so there is no `pause_requested` limbo any more.
    const { updateCache, getMatchState } = await import("@/lib/api/server/real");
    const status = await import("./helpers/status-fixture").then((m) => m.default);

    updateCache(status(), null, undefined, {
      gamestate: "live",
      paused: true,
      series: null,
      raw: {},
    });
    assert.equal(getMatchState().pause, "paused");
    assert.equal(getMatchState().phase, "live");

    updateCache(status(), null, undefined, {
      gamestate: "live",
      paused: false,
      series: null,
      raw: {},
    });
    assert.equal(getMatchState().pause, "running");
  });

  it("leaves the log-derived state alone when nothing is loaded", async () => {
    // A pug started with `.start` reports gamestate `none`, and the log parser
    // is the only thing that knows anything about it.
    const { updateCache, getMatchState, updateMatchState } = await import(
      "@/lib/api/server/real"
    );
    const status = await import("./helpers/status-fixture").then((m) => m.default);

    // Explicit precondition: nothing has ever been loaded. Without this the
    // cache carries whatever the previous test left, and "no match loaded" and
    // "a match just ended" are deliberately different cases now.
    updateMatchState({ matchzyState: null, phase: "warmup", pause: "pause_requested" });
    updateCache(status(), null, undefined, { gamestate: "none", paused: false, series: null, raw: {} });
    assert.equal(getMatchState().phase, "warmup");
    assert.equal(getMatchState().pause, "pause_requested");
    assert.equal(getMatchState().matchzyState, "none");
  });

  it("stops claiming 'paused' once MatchZy stops answering", async () => {
    // Ending a paused match left the panel saying "paused" forever: the only
    // thing that could have said otherwise had stopped reporting. Observed on
    // the live server after css_endmatch. Unknown is the honest answer.
    const { updateCache, getMatchState } = await import("@/lib/api/server/real");
    const status = await import("./helpers/status-fixture").then((m) => m.default);

    updateCache(status(), null, undefined, { gamestate: "live", paused: true, series: null, raw: {} });
    assert.equal(getMatchState().pause, "paused");

    updateCache(status(), null, undefined, { gamestate: "none", paused: false, series: null, raw: {} });
    assert.equal(getMatchState().pause, "unknown");
    assert.equal(getMatchState().matchzyState, "none");
  });

  it("does not touch the pause on a server that never had a match loaded", async () => {
    // A pug's pause state is the log parser's business, and blanking it every
    // poll would undo `pause_requested` two seconds after it was set.
    const { updateCache, getMatchState, updateMatchState } = await import(
      "@/lib/api/server/real"
    );
    const status = await import("./helpers/status-fixture").then((m) => m.default);

    updateMatchState({ matchzyState: "none" });
    updateMatchState({ pause: "pause_requested" });
    updateCache(status(), null, undefined, { gamestate: "none", paused: false, series: null, raw: {} });
    assert.equal(getMatchState().pause, "pause_requested");
  });

  it("maps the knife round to live, not warmup", async () => {
    // The panel's MatchPhase has no knife value, and calling it warmup would
    // say the round does not count when it decides which side everyone plays.
    const { updateCache, getMatchState } = await import("@/lib/api/server/real");
    const status = await import("./helpers/status-fixture").then((m) => m.default);
    updateCache(status(), null, undefined, { gamestate: "knife", paused: false, series: null, raw: {} });
    assert.equal(getMatchState().phase, "live");
  });
});
