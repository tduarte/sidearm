import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSameMap,
  shortMapName,
  workshopIdFromMapName,
  workshopMapPath,
} from "@/lib/cs2/workshop";

describe("workshopIdFromMapName", () => {
  it("reads the id from both the bare and the resolved form", () => {
    assert.equal(workshopIdFromMapName("workshop/3070563536"), "3070563536");
    assert.equal(
      workshopIdFromMapName("workshop/3070563536/de_cache"),
      "3070563536",
    );
    assert.equal(workshopIdFromMapName("  workshop/3070563536  "), "3070563536");
  });

  it("returns null for anything that is not a workshop path", () => {
    for (const name of [
      "de_mirage",
      "workshop/abc/de_cache",
      "workshop/",
      "workshop/123/de_cache; quit",
      "",
    ]) {
      assert.equal(workshopIdFromMapName(name), null, `should reject ${name}`);
    }
  });
});

describe("workshopMapPath", () => {
  it("appends the filename only when one is known", () => {
    assert.equal(workshopMapPath("3070563536"), "workshop/3070563536");
    assert.equal(
      workshopMapPath("3070563536", "de_cache"),
      "workshop/3070563536/de_cache",
    );
    // Unresolved names arrive as null from the cache, not as undefined.
    assert.equal(workshopMapPath("3070563536", null), "workshop/3070563536");
  });
});

describe("shortMapName", () => {
  it("strips the workshop prefix", () => {
    assert.equal(shortMapName("workshop/3070563536/de_cache"), "de_cache");
    assert.equal(shortMapName("de_mirage"), "de_mirage");
  });

  it("leaves an unresolved workshop path alone", () => {
    // There is no filename to return, and "3070563536" would be a lie.
    assert.equal(shortMapName("workshop/3070563536"), "workshop/3070563536");
  });
});

describe("isSameMap", () => {
  it("matches a workshop entry against the short name status reports", () => {
    assert.ok(isSameMap("workshop/3070563536/de_cache", "de_cache"));
    assert.ok(isSameMap("de_cache", "workshop/3070563536/de_cache"));
  });

  it("matches on id when only one side has been resolved", () => {
    assert.ok(isSameMap("workshop/3070563536", "workshop/3070563536/de_cache"));
  });

  it("does not match different maps", () => {
    assert.ok(!isSameMap("de_mirage", "de_dust2"));
    assert.ok(!isSameMap("workshop/1111/de_cache", "workshop/2222/de_cache"));
    // An unresolved entry carries no filename, so it cannot be matched against
    // a loaded map by name — guessing here would light up the wrong tile.
    assert.ok(!isSameMap("workshop/3070563536", "de_cache"));
  });
});
