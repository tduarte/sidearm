import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_CVARS,
  PRACTICE_READ_NAMES,
  offValueFor,
  practiceSpec,
} from "@/lib/cs2/practice";

describe("practice cvar registry", () => {
  it("excludes the two names CS2 does not have", () => {
    // Both answered `Unknown command` on a live server. sv_grenade_trajectory
    // was removed in CS2; cl_grenadepreview is a client cvar that RCON cannot
    // set for connected players even where the name resolves.
    const names = PRACTICE_CVARS.map((c) => c.name);
    assert.ok(!names.includes("sv_grenade_trajectory"));
    assert.ok(!names.includes("cl_grenadepreview"));
  });

  it("reads sv_cheats alongside the tiles that depend on it", () => {
    assert.equal(PRACTICE_READ_NAMES[0], "sv_cheats");
  });

  it("gives every managed cvar a way back off", () => {
    // The defect this replaces: each tile wrote a value with no off command,
    // so the only way to undo it was the raw console.
    for (const spec of PRACTICE_CVARS) {
      assert.notEqual(spec.off, undefined);
      assert.notEqual(spec.off, spec.on, spec.name);
    }
  });

  it("treats the numeric cvars as steppers, not switches", () => {
    assert.equal(practiceSpec("sv_grenade_trajectory_prac_trailtime")?.kind, "stepper");
    assert.equal(practiceSpec("ammo_grenade_limit_total")?.kind, "stepper");
    assert.equal(practiceSpec("sv_infinite_ammo")?.kind, "toggle");
  });

  it("uses the real competitive default for the grenade limit", () => {
    // Confirmed live: ammo_grenade_limit_total = 4.
    assert.equal(practiceSpec("ammo_grenade_limit_total")?.off, "4");
  });
});

describe("offValueFor", () => {
  const spec = practiceSpec("ammo_grenade_limit_total")!;

  it("restores the value the server had before the panel touched it", () => {
    assert.equal(offValueFor(spec, "3"), "3");
  });

  it("falls back to the documented default with no baseline", () => {
    assert.equal(offValueFor(spec, null), "4");
  });

  it("ignores a baseline contaminated by the on-value", () => {
    // A panel restart while the tile was already on captures the on-value as
    // the "baseline"; restoring it would leave the cvar on forever.
    assert.equal(offValueFor(spec, spec.on), spec.off);
  });

  it("ignores an empty baseline", () => {
    assert.equal(offValueFor(spec, "  "), spec.off);
  });
});
