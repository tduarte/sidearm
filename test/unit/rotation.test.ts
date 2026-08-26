import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextMap, sanitizeRotation } from "@/lib/cs2/rotation";

const on = (maps: string[]) => ({ enabled: true, maps });

describe("nextMap", () => {
  it("advances to the map after the current one", () => {
    assert.equal(nextMap(on(["de_mirage", "de_nuke", "de_cache"]), "de_nuke"), "de_cache");
  });

  it("wraps around at the end", () => {
    assert.equal(nextMap(on(["de_mirage", "de_nuke"]), "de_nuke"), "de_mirage");
  });

  it("starts at the top when the current map is not in the list", () => {
    assert.equal(nextMap(on(["de_nuke", "de_cache"]), "de_dust2"), "de_nuke");
  });

  it("matches a workshop map by id, not by string equality", () => {
    // The rotation holds `workshop/3070563536`; the server reports the map
    // under its filename once loaded.
    assert.equal(
      nextMap(on(["workshop/3070563536", "de_nuke"]), "workshop/3070563536/de_lake"),
      "de_nuke",
    );
  });

  it("does nothing when rotation is off", () => {
    assert.equal(nextMap({ enabled: false, maps: ["de_nuke"] }, "de_mirage"), null);
  });

  it("does nothing with an empty list", () => {
    assert.equal(nextMap(on([]), "de_mirage"), null);
  });

  it("does not reload the same map forever on a single-entry rotation", () => {
    // Reloading the current level at every match end would be a surprising
    // thing to inflict on players.
    assert.equal(nextMap(on(["de_mirage"]), "de_mirage"), null);
    // But a single entry that is NOT the current map is a legitimate move.
    assert.equal(nextMap(on(["de_nuke"]), "de_mirage"), "de_nuke");
  });
});

describe("sanitizeRotation", () => {
  it("drops blanks and duplicates", () => {
    // A duplicate would make the cycle stall on one map.
    const r = sanitizeRotation({
      enabled: true,
      maps: ["de_nuke", "", "  ", "de_nuke", "de_cache"],
    });
    assert.deepEqual(r.maps, ["de_nuke", "de_cache"]);
  });

  it("cannot be enabled with nothing to rotate through", () => {
    assert.equal(sanitizeRotation({ enabled: true, maps: [] }).enabled, false);
  });

  it("accepts a bare array for the legacy setRotation shape", () => {
    assert.deepEqual(sanitizeRotation(["de_nuke"]).maps, ["de_nuke"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 200 }, (_, i) => `de_map${i}`);
    assert.equal(sanitizeRotation({ enabled: true, maps: many }).maps.length, 64);
  });
});
