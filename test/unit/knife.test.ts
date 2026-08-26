import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KNIFE_CVARS, restoreCommands, setupCommands } from "@/lib/cs2/knife";
import { parseCvarEcho } from "@/lib/cs2/cvars";

describe("knife setup", () => {
  const cmds = setupCommands();

  it("ends warmup, strips the loadout and restarts", () => {
    assert.equal(cmds[0], "mp_warmup_end");
    assert.equal(cmds.at(-1), "mp_restartgame 1");
    assert.ok(cmds.includes('mp_ct_default_primary ""'));
    assert.ok(cmds.includes('mp_t_default_melee "weapon_knife"'));
    assert.ok(cmds.includes("mp_give_player_c4 0"));
    assert.ok(cmds.includes("mp_buytime 0"));
  });

  it("actually sends something", () => {
    // The bug this replaces: `knife` was a MatchPhase mapped to an empty
    // command list, so the panel reported success having sent nothing.
    assert.ok(cmds.length > 5);
  });
});

describe("knife restore", () => {
  it("puts back what the server reported, not a guessed default", () => {
    const baseline = {
      mp_buytime: "20",
      mp_startmoney: "800",
      mp_free_armor: "0",
    };
    const cmds = restoreCommands(baseline);
    assert.ok(cmds.includes("mp_buytime 20"));
    assert.ok(cmds.includes("mp_startmoney 800"));
    assert.ok(cmds.includes("mp_free_armor 0"));
  });

  it("re-quotes an empty value instead of emitting a bare read", () => {
    // `mp_ct_default_primary` with no argument READS the cvar; only
    // `mp_ct_default_primary ""` clears it.
    const cmds = restoreCommands({ mp_ct_default_primary: "" });
    assert.deepEqual(cmds, ['mp_ct_default_primary ""']);
  });

  it("skips cvars the build never reported rather than inventing them", () => {
    const cmds = restoreCommands({ mp_buytime: "20" });
    assert.deepEqual(cmds, ["mp_buytime 20"]);
  });

  it("restores nothing from an empty baseline", () => {
    assert.deepEqual(restoreCommands({}), []);
  });

  it("round-trips a baseline captured from a real cvar echo", () => {
    const echo = KNIFE_CVARS.map((n) => `${n} = 0`).join("\n");
    const read = parseCvarEcho(echo);
    const baseline: Record<string, string> = {};
    for (const name of KNIFE_CVARS) {
      const v = read.values.get(name);
      if (v !== undefined) baseline[name] = v;
    }
    assert.equal(restoreCommands(baseline).length, KNIFE_CVARS.length);
  });
});
