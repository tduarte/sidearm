import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isConvertibleSteamId, toSteam64, toSteamId3 } from "@/lib/cs2/steamid";

describe("toSteam64", () => {
  it("converts the SteamID3 form RCON status prints", () => {
    // The canonical pair: account 1 is the very first individual account.
    assert.equal(toSteam64("[U:1:1]"), "76561197960265729");
    assert.equal(toSteam64("[U:1:22202]"), "76561197960287930");
  });

  it("keeps full precision past 2^53", () => {
    // A Steam64 is ~7.6e16 and MAX_SAFE_INTEGER is 9.0e15, so doing this with
    // `+` on numbers rounds the low digits and yields a valid-looking id
    // belonging to somebody else. This is the assertion that catches that.
    const big = toSteam64("[U:1:999999999]");
    assert.equal(big, "76561198960265727");
    assert.equal(
      (BigInt(big!) - BigInt("76561197960265728")).toString(),
      "999999999",
    );
  });

  it("accepts a bare Steam64 unchanged", () => {
    assert.equal(toSteam64("76561197960265729"), "76561197960265729");
  });

  it("converts the STEAM_0:y:z text form", () => {
    // accountid = z*2 + y.
    // 11101*2+1 = 22203, so this is the SteamID3 [U:1:22203] — note it is NOT
    // the same account as [U:1:22202] above, which is the easy mistake here.
    assert.equal(toSteam64("STEAM_0:1:11101"), "76561197960287931");
    assert.equal(toSteam64("STEAM_1:1:11101"), "76561197960287931");
    assert.equal(toSteam64("STEAM_0:0:1"), "76561197960265730");
  });

  it("tolerates surrounding whitespace and case", () => {
    assert.equal(toSteam64("  [u:1:1]  "), "76561197960265729");
    assert.equal(toSteam64("steam_0:1:11101"), "76561197960287931");
  });

  it("refuses everything it cannot convert, rather than guessing", () => {
    // Bots have no Steam identity, `status` prints BOT or an empty column, and
    // older panel rows fall back to a player name. Inventing an id for any of
    // those silently adds a stranger to a match roster.
    for (const bad of ["", "   ", "BOT", "Krikey", "unknown", "[U:1:]", "76561", "STEAM_ID_PENDING"]) {
      assert.equal(toSteam64(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });

  it("refuses account id zero, which is a real wrong answer", () => {
    // `[U:1:0]` appears for unassigned slots and would otherwise convert to the
    // universe base — an id that belongs to an actual account.
    assert.equal(toSteam64("[U:1:0]"), null);
    assert.equal(toSteam64("STEAM_0:0:0"), null);
  });

  it("ignores the optional trailing instance field", () => {
    assert.equal(toSteam64("[U:1:22202:1]"), "76561197960287930");
  });
});

describe("toSteamId3", () => {
  it("round-trips", () => {
    for (const id of ["[U:1:1]", "[U:1:22202]", "[U:1:999999999]"]) {
      assert.equal(toSteamId3(toSteam64(id)!), id);
    }
  });

  it("refuses what is not a Steam64", () => {
    assert.equal(toSteamId3("[U:1:1]"), null);
    assert.equal(toSteamId3("123"), null);
  });
});

describe("isConvertibleSteamId", () => {
  it("agrees with toSteam64", () => {
    assert.equal(isConvertibleSteamId("[U:1:22202]"), true);
    assert.equal(isConvertibleSteamId("BOT"), false);
  });
});
