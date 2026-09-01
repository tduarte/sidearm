import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_DUTY, activeDutyPool } from "@/lib/cs2/map-pools";

describe("ACTIVE_DUTY", () => {
  it("is the seven-map pool", () => {
    assert.equal(ACTIVE_DUTY.length, 7);
    assert.equal(new Set(ACTIVE_DUTY).size, 7);
  });

  it("holds Cache and neither of the maps it displaced", () => {
    // Cache replaced Overpass for Premier Season 5 on 2026-07-06; Train left
    // the pool before that. Both are still installed on any CS2 server, so
    // nothing but this list keeps them out of a competitive veto.
    const pool: readonly string[] = ACTIVE_DUTY;
    assert.ok(pool.includes("de_cache"));
    assert.ok(!pool.includes("de_overpass"));
    assert.ok(!pool.includes("de_train"));
  });
});

describe("activeDutyPool", () => {
  it("splits the pool by what the server actually has", () => {
    const { present, missing } = activeDutyPool([
      "de_ancient",
      "de_anubis",
      "de_dust2",
      "de_inferno",
      "de_mirage",
      "de_nuke",
      "de_train",
      "cs_office",
    ]);

    // de_cache is the one a server that has not updated will be missing, and
    // silently handing back a six-map pool is how a veto surprises someone.
    assert.deepEqual(missing, ["de_cache"]);
    assert.equal(present.length, 6);
    assert.ok(!present.includes("de_train"));
  });

  it("reports the whole pool missing on a server that answered nothing", () => {
    const { present, missing } = activeDutyPool([]);
    assert.deepEqual(present, []);
    assert.equal(missing.length, 7);
  });
});
