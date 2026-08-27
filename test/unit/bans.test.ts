import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  banCommands,
  expiredBans,
  expiryFrom,
  formatDuration,
  unbanCommand,
  type BanRecord,
} from "@/lib/cs2/bans";

const ban = (over: Partial<BanRecord> = {}): BanRecord => ({
  steamId: "[U:1:1]",
  name: "Neo",
  reason: null,
  bannedAt: "2026-08-26T07:00:00.000Z",
  expiresAt: null,
  ...over,
});

describe("banCommands", () => {
  it("always uses banid 0, never the minutes form", () => {
    // A timed Source ban is deleted at the next map change, so passing the
    // duration to CS2 would look right and quietly stop working. The panel
    // owns the clock instead.
    const cmds = banCommands("3");
    assert.deepEqual(cmds, ["banid 0 3", "kickid 3"]);
    assert.ok(!cmds.some((c) => /banid\s+[1-9]/.test(c)));
  });

  it("kicks as well as bans, so it takes effect now", () => {
    assert.ok(banCommands("3").some((c) => c.startsWith("kickid")));
  });

  it("lifts by SteamID, which is the stable identity", () => {
    assert.equal(unbanCommand("[U:1:1]"), "removeid [U:1:1]");
  });
});

describe("expiryFrom", () => {
  it("computes an absolute expiry from a length", () => {
    const now = new Date("2026-08-26T07:00:00.000Z");
    assert.equal(expiryFrom(60, now), "2026-08-26T08:00:00.000Z");
  });

  it("treats no-expiry as a real choice, not a missing value", () => {
    assert.equal(expiryFrom(null), null);
    assert.equal(expiryFrom(0), null);
    assert.equal(expiryFrom(-5), null);
  });
});

describe("expiredBans", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");

  it("finds bans whose clock has run out", () => {
    const list = [
      ban({ steamId: "a", expiresAt: "2026-08-26T11:00:00.000Z" }),
      ban({ steamId: "b", expiresAt: "2026-08-26T13:00:00.000Z" }),
    ];
    assert.deepEqual(
      expiredBans(list, now).map((b) => b.steamId),
      ["a"],
    );
  });

  it("never expires a ban with no expiry", () => {
    assert.deepEqual(expiredBans([ban({ expiresAt: null })], now), []);
  });

  it("expires exactly on the boundary rather than a tick later", () => {
    const list = [ban({ expiresAt: now.toISOString() })];
    assert.equal(expiredBans(list, now).length, 1);
  });
});

describe("formatDuration", () => {
  it("reads naturally at every scale", () => {
    assert.equal(formatDuration(15), "15m");
    assert.equal(formatDuration(60), "1h");
    assert.equal(formatDuration(90), "1h 30m");
    assert.equal(formatDuration(60 * 24), "1d");
    assert.equal(formatDuration(60 * 24 * 7), "7d");
    assert.equal(formatDuration(null), "no expiry");
  });
});
