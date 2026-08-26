import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { asBool, asInt, parseCvarEcho } from "@/lib/cs2/cvars";

/**
 * Verbatim replies from a live CS2 server (build 1.41.7.7), captured by
 * batching eight names into one RCON round-trip.
 */
const REAL_BATCH =
  "sv_cheats = false\n" +
  "sv_infinite_ammo = 0\n" +
  "mp_buy_anywhere = 0\n" +
  "Unknown command 'sv_grenade_trajectory'!\n" +
  "sv_grenade_trajectory_prac_pipreview = false\n" +
  "sv_grenade_trajectory_prac_trailtime = 0\n" +
  "ammo_grenade_limit_total = 4\n" +
  "Unknown command 'cl_grenadepreview'!\n";

describe("parseCvarEcho — real CS2 output", () => {
  const r = parseCvarEcho(REAL_BATCH);

  it("reads every value in a batched reply", () => {
    assert.equal(r.values.get("sv_cheats"), "false");
    assert.equal(r.values.get("sv_infinite_ammo"), "0");
    assert.equal(r.values.get("ammo_grenade_limit_total"), "4");
  });

  it("records names the build does not have", () => {
    assert.ok(r.unknown.has("sv_grenade_trajectory"));
    assert.ok(r.unknown.has("cl_grenadepreview"));
    assert.equal(r.values.has("sv_grenade_trajectory"), false);
  });

  it("leaves a name that was never asked about absent, not false", () => {
    // The distinction the whole module exists for: absent means unknown, and
    // rendering unknown as "off" is how the panel ends up claiming server
    // state it never observed.
    assert.equal(r.values.get("mp_maxrounds"), undefined);
    assert.equal(asBool(r.values.get("mp_maxrounds")), null);
  });
});

describe("parseCvarEcho — shapes", () => {
  it("accepts the Source/CS:GO quoted form too", () => {
    const r = parseCvarEcho('"game_type" = "0"\n"game_mode" = "1"');
    assert.equal(r.values.get("game_type"), "0");
    assert.equal(r.values.get("game_mode"), "1");
  });

  it("does not let an empty value swallow the next line", () => {
    // Verbatim shape from a live server. `mp_ct_default_primary =` has nothing
    // after the `=`, and a `\\s*` there consumes the newline and captures the
    // following cvar's whole line — which then gets written back on restore.
    const r = parseCvarEcho(
      "mp_ct_default_primary =\n" +
        "mp_ct_default_secondary = weapon_hkp2000\n" +
        "mp_ct_default_melee = weapon_knife\n",
    );
    assert.equal(r.values.get("mp_ct_default_primary"), "");
    assert.equal(r.values.get("mp_ct_default_secondary"), "weapon_hkp2000");
    assert.equal(r.values.get("mp_ct_default_melee"), "weapon_knife");
  });

  it("keeps an empty value, which is meaningful", () => {
    // `sv_password = ` means the server has no password — quite different from
    // not knowing what the password setting is.
    const r = parseCvarEcho("sv_password = \n");
    assert.equal(r.values.get("sv_password"), "");
    assert.ok(r.values.has("sv_password"));
  });

  it("reads a negative value", () => {
    const r = parseCvarEcho("sv_visiblemaxplayers = -1");
    assert.equal(asInt(r.values.get("sv_visiblemaxplayers")), -1);
  });

  it("strips a trailing default annotation when a build prints one", () => {
    const r = parseCvarEcho('sv_cheats = 0 ( def. "0" )');
    assert.equal(r.values.get("sv_cheats"), "0");
  });

  it("does not throw on empty or unrelated output", () => {
    assert.equal(parseCvarEcho("").values.size, 0);
    assert.equal(parseCvarEcho("hostname : sidearm\n").values.size, 0);
  });
});

describe("asBool / asInt", () => {
  it("reads both boolean spellings CS2 uses", () => {
    assert.equal(asBool("true"), true);
    assert.equal(asBool("false"), false);
    assert.equal(asBool("1"), true);
    assert.equal(asBool("0"), false);
  });

  it("returns null rather than guessing", () => {
    assert.equal(asBool(undefined), null);
    assert.equal(asBool("banana"), null);
    assert.equal(asInt(undefined), null);
    assert.equal(asInt("banana"), null);
  });

  it("reads integers", () => {
    assert.equal(asInt("24"), 24);
    assert.equal(asInt(" 16 "), 16);
  });
});
