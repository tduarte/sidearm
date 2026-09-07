import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  changedKeys,
  fieldsForMode,
  modeNeedsMapReload,
  planApply,
  type Draft,
  type PanelValues,
} from "@/lib/dashboard/panel";
import { presetActive, presetDraft } from "@/lib/dashboard/panel";
import { findPreset } from "@/lib/presets";
import type { ServerConfig } from "@/lib/api/types";

const current: PanelValues = {
  hostname: "sidearm",
  map: "de_mirage",
  mode: "competitive",
  serverPassword: "",
  botsEnabled: false,
  botQuota: 0,
  botDifficulty: 2,
  visibleMaxPlayers: 10,
  maxRounds: 24,
  overtime: true,
};

const baseConfig: ServerConfig = {
  identity: { hostname: "sidearm" },
  access: { serverPassword: "" },
  gameplay: {
    mode: "competitive",
    visibleMaxPlayers: 10,
    botsEnabled: false,
    botDifficulty: 2,
    botQuota: 0,
  },
} as ServerConfig;

describe("complexity follows the mode", () => {
  it("gives every round-based mode the match machinery", () => {
    // Competitive is MR12, wingman MR8, casual 15-and-first-to-8. All three
    // end on a round number, so all three can set one.
    for (const mode of ["competitive", "wingman", "casual"] as const) {
      const f = fieldsForMode(mode);
      assert.ok(f.includes("maxRounds"), `${mode} should offer a round limit`);
      assert.ok(f.includes("overtime"), `${mode} should offer overtime`);
    }
  });

  it("hides the round limit and overtime where rounds do not end anything", () => {
    // Deathmatch ends on `mp_timelimit` and practice keeps no score, so a
    // round limit there is noise around the mode and the map, which are the
    // only two things anyone came to change.
    for (const mode of ["deathmatch", "practice"] as const) {
      const f = fieldsForMode(mode);
      assert.ok(!f.includes("maxRounds"), `${mode} should not offer a round limit`);
      assert.ok(!f.includes("overtime"), `${mode} should not offer overtime`);
    }
  });

  it("always offers the mode and the map", () => {
    for (const mode of ["competitive", "casual", "deathmatch", "practice"] as const) {
      const f = fieldsForMode(mode);
      assert.ok(f.includes("mode"));
      assert.ok(f.includes("map"));
    }
  });
});

describe("what counts as changed", () => {
  it("ignores a value set back to what it already was", () => {
    // Clicking a select and picking the same option is not an edit, and a Save
    // button that lights up for it teaches people the button means nothing.
    assert.deepEqual(changedKeys(current, { mode: "competitive" }), []);
  });

  it("reports only touched keys", () => {
    assert.deepEqual(changedKeys(current, { map: "de_nuke", mode: "competitive" }), [
      "map",
    ]);
  });

  it("treats an empty draft as no change", () => {
    assert.deepEqual(changedKeys(current, {}), []);
  });
});

describe("planning a save", () => {
  it("does nothing when nothing changed", () => {
    assert.deepEqual(planApply(current, {}, baseConfig), []);
  });

  it("puts the map last", () => {
    /*
     * The level reload has to happen after everything else in the same save,
     * or the cvars and the config land on the map you just left.
     */
    const draft: Draft = { map: "de_nuke", maxRounds: 16, hostname: "scrim" };
    const steps = planApply(current, draft, baseConfig);
    assert.equal(steps[steps.length - 1]?.kind, "map");
    assert.equal(steps[0]?.kind, "cvar");
  });

  it("batches every config field into one write", () => {
    // One RCON round trip for the lot, which is the whole reason for staging.
    const draft: Draft = {
      hostname: "scrim",
      botsEnabled: true,
      botQuota: 4,
      mode: "casual",
    };
    const steps = planApply(current, draft, baseConfig);
    assert.equal(steps.filter((s) => s.kind === "config").length, 1);
  });

  it("carries the edited values into the config it sends", () => {
    const steps = planApply(current, { botsEnabled: true, botQuota: 6 }, baseConfig);
    const step = steps.find((s) => s.kind === "config");
    assert.equal(step?.kind, "config");
    if (step?.kind === "config") {
      assert.equal(step.config.gameplay.botsEnabled, true);
      assert.equal(step.config.gameplay.botQuota, 6);
      // Untouched fields keep the server's value, not a default.
      assert.equal(step.config.identity.hostname, "sidearm");
    }
  });

  it("does not write a cvar the server never reported", () => {
    // maxRounds is null until the poll answers. Sending "null" would set the
    // round limit to nothing on a server that was working fine.
    const steps = planApply(
      { ...current, maxRounds: null },
      { maxRounds: undefined },
      baseConfig,
    );
    assert.deepEqual(steps, []);
  });

  it("sends overtime as the 1/0 the cvar expects", () => {
    const steps = planApply(current, { overtime: false }, baseConfig);
    assert.deepEqual(steps, [
      {
        kind: "cvar",
        name: "mp_overtime_enable",
        value: "0",
        label: "Overtime → off",
      },
    ]);
  });
});

describe("a mode change that will not show up yet", () => {
  it("warns when the mode changes without a map", () => {
    // game_type and game_mode are read when a map loads, so this save appears
    // to do nothing until the level cycles.
    assert.equal(modeNeedsMapReload(current, { mode: "casual" }), true);
  });

  it("stays quiet when the map changes too", () => {
    assert.equal(
      modeNeedsMapReload(current, { mode: "casual", map: "de_nuke" }),
      false,
    );
  });

  it("stays quiet when the mode is untouched", () => {
    assert.equal(modeNeedsMapReload(current, { map: "de_nuke" }), false);
  });
});

describe("one-tap presets", () => {
  const wingman = findPreset("wingman")!;

  it("stages only what actually differs", () => {
    // A preset that always reported five changes would make the save bar's
    // count meaningless, which is the one thing it is for.
    const d = presetDraft(wingman, current);
    assert.equal(d.mode, "wingman");
    assert.equal(d.visibleMaxPlayers, 4);
    // Bots are already off and already on difficulty 2, so neither is staged.
    assert.ok(!("botsEnabled" in d));
    assert.ok(!("botDifficulty" in d));
  });

  it("brings the mode's own round limit with it", () => {
    // A wingman preset that left `mp_maxrounds 24` behind would run a 2v2 to
    // 13. The official numbers travel with the mode.
    assert.equal(presetDraft(wingman, current).maxRounds, 16);
  });

  it("does not stage a round limit the server has not reported yet", () => {
    // null is "not polled", not "no limit"; staging against it would claim a
    // change nobody can read.
    const unknown: PanelValues = { ...current, maxRounds: null };
    assert.ok(!("maxRounds" in presetDraft(wingman, unknown)));
  });

  it("stages nothing when the server already matches", () => {
    const already: PanelValues = {
      ...current,
      mode: "wingman",
      visibleMaxPlayers: 4,
      maxRounds: 16,
    };
    assert.deepEqual(presetDraft(wingman, already), {});
    assert.equal(presetActive(wingman, already), true);
  });

  it("still counts a mode as active on a custom round limit", () => {
    // A 30-round scrim is still competitive. Judging the mode by its round
    // limit would leave the menu showing nothing selected.
    const scrim: PanelValues = {
      ...current,
      mode: "wingman",
      visibleMaxPlayers: 4,
      maxRounds: 30,
    };
    assert.equal(presetActive(wingman, scrim), true);
  });

  it("leaves the map alone", () => {
    // Presets say how to play, not where. One that also moved everyone to a
    // different map would be something you never dare press mid-session.
    assert.ok(!("map" in presetDraft(wingman, current)));
  });

  it("goes out as one config write, after the round limit cvar", () => {
    const steps = planApply(current, presetDraft(wingman, current), baseConfig);
    assert.deepEqual(
      steps.map((s) => s.kind),
      ["cvar", "config"],
    );
  });
});
