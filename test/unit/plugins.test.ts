import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CSSHARP_PROBE,
  METAMOD_PROBE,
  MATCHZY_PROBE,
  describePluginFailure,
  isUnknownCommand,
  parseGet5Status,
} from "@/lib/cs2/plugins";

// Captured over RCON from the live server (build 1.41.7.7) with no plugins
// installed — the state most installs of this panel are in. Note what the
// engine actually echoes back.
const LIVE_UNKNOWN_GET5 = "Unknown command 'get5_status'!\n";
const LIVE_UNKNOWN_META = "Unknown command 'meta'!\n";
const LIVE_UNKNOWN_CSS = "Unknown command 'css_plugins'!\n";

// And from the same server once the plugins were installed — verbatim, because
// documentation drifts and the server does not.
const LIVE_GET5_STATUS =
  '{"plugin_version":"0.15.0","gamestate":"none","paused":false,' +
  '"loaded_config_file":null,"matchid":null,"map_number":null,' +
  '"round_number":-1,"round_time":null,"team1":null,"team2":null,"maps":null}\n';
const LIVE_META_LIST =
  "Listing 1 plugin:\n  [01] CounterStrikeSharp (v1.0.373 @ 3a59f2d) by Roflmuffin\n";
const LIVE_CSS_PLUGINS =
  "  List of all plugins currently loaded by CounterStrikeSharp: 1 plugins loaded.\n" +
  '  [#1:LOADED]: "MatchZy" (0.8.15) by WD- (https://github.com/shobhit-pathak/)\n' +
  "    A plugin for running and managing CS2 practice/pugs/scrims/matches!\n";

describe("isUnknownCommand", () => {
  it("matches the single-token commands verbatim", () => {
    assert.equal(isUnknownCommand(LIVE_UNKNOWN_GET5, MATCHZY_PROBE), true);
  });

  it("matches a two-word command, which CS2 quotes back by its first token only", () => {
    // The trap this whole helper exists for: the engine answers `meta list`
    // with `Unknown command 'meta'!`, so comparing against the full command
    // string reads as "the command exists" forever.
    assert.equal(isUnknownCommand(LIVE_UNKNOWN_META, METAMOD_PROBE), true);
    assert.equal(isUnknownCommand(LIVE_UNKNOWN_CSS, CSSHARP_PROBE), true);
  });

  it("does not match a refusal of some other command", () => {
    assert.equal(isUnknownCommand(LIVE_UNKNOWN_META, MATCHZY_PROBE), false);
    assert.equal(isUnknownCommand(LIVE_UNKNOWN_GET5, CSSHARP_PROBE), false);
  });

  it("reads a real listing as 'the command exists'", () => {
    assert.equal(isUnknownCommand(LIVE_META_LIST, METAMOD_PROBE), false);
    assert.equal(isUnknownCommand(LIVE_CSS_PLUGINS, CSSHARP_PROBE), false);
  });

  it("reads an empty reply as 'no answer', not as absence", () => {
    // RCON dropping a poll must never be reported as the plugins being gone.
    assert.equal(isUnknownCommand("", MATCHZY_PROBE), false);
  });
});

describe("parseGet5Status", () => {
  it("reports absence from the live server's refusal", () => {
    const r = parseGet5Status(LIVE_UNKNOWN_GET5);
    assert.deepEqual(r, { loaded: false, status: null });
  });

  it("reads the live server's payload", () => {
    const r = parseGet5Status(LIVE_GET5_STATUS);
    assert.equal(r?.loaded, true);
    assert.equal(r?.status?.gamestate, "none");
    assert.equal(r?.status?.paused, false);
    // Nulls in the payload are real JSON nulls, not missing keys — the parser
    // must not mistake `"team1": null` for a malformed reply.
    assert.equal(r?.status?.raw.team1, null);
    // Hardcoded by MatchZy to the Get5 string. Never report it as a version.
    assert.equal(r?.status?.raw.plugin_version, "0.15.0");
  });

  it("returns null when RCON said nothing at all", () => {
    // Not `{loaded: false}`. A dropped poll is not evidence.
    assert.equal(parseGet5Status(""), null);
    assert.equal(parseGet5Status("   \n "), null);
  });

  it("reads gamestate and paused out of a JSON reply", () => {
    const r = parseGet5Status(
      '{"plugin_version":"0.15.0","gamestate":"live","paused":true,"map_number":0}',
    );
    assert.equal(r?.loaded, true);
    assert.equal(r?.status?.gamestate, "live");
    assert.equal(r?.status?.paused, true);
  });

  it("carries the whole payload through for the match poller", () => {
    const r = parseGet5Status('{"gamestate":"warmup","paused":false,"matchid":"7"}');
    assert.equal(r?.status?.raw.matchid, "7");
  });

  it("tolerates console noise around the payload", () => {
    const r = parseGet5Status('L 08/27/2026 - 12:00:00: {"gamestate":"none","paused":false}\n');
    assert.equal(r?.loaded, true);
    assert.equal(r?.status?.gamestate, "none");
  });

  it("does not invent fields the payload omits", () => {
    // `plugin_version` is hardcoded to Get5's "0.15.0" and is deliberately not
    // surfaced; gamestate and paused simply read null when absent.
    const r = parseGet5Status('{"plugin_version":"0.15.0"}');
    assert.equal(r?.loaded, true);
    assert.equal(r?.status?.gamestate, null);
    assert.equal(r?.status?.paused, null);
  });

  it("returns null for a reply that is neither JSON nor a refusal", () => {
    assert.equal(parseGet5Status("something went wrong"), null);
    assert.equal(parseGet5Status("{not json}"), null);
    assert.equal(parseGet5Status('["an","array"]'), null);
  });
});

describe("describePluginFailure", () => {
  const gone = { matchzy: false, metamod: true, cssharp: true };

  it("says nothing on a server that never had plugins", () => {
    // Most installs. A permanent banner telling them so is noise.
    assert.equal(describePluginFailure(gone, false), null);
  });

  it("says nothing while MatchZy is loaded", () => {
    assert.equal(
      describePluginFailure({ matchzy: true, metamod: true, cssharp: true }, true),
      null,
    );
  });

  it("says nothing when the probe could not tell", () => {
    // RCON silent: unknown is not a failure.
    assert.equal(
      describePluginFailure({ matchzy: null, metamod: null, cssharp: null }, true),
      null,
    );
  });

  it("names the lowest broken layer, not the top one", () => {
    // With Metamod down, CSSharp and MatchZy could not possibly have loaded, so
    // reporting "MatchZy is not loaded" would send the admin to the wrong log.
    const r = describePluginFailure({ matchzy: false, metamod: false, cssharp: false }, true);
    assert.match(r!.title, /Metamod/);
    assert.match(r!.likelyCause, /gameinfo\.gi/);
  });

  it("blames CounterStrikeSharp when Metamod is fine", () => {
    const r = describePluginFailure({ matchzy: false, metamod: true, cssharp: false }, true);
    assert.match(r!.title, /CounterStrikeSharp/);
  });

  it("blames MatchZy only when everything under it answered", () => {
    const r = describePluginFailure(gone, true);
    assert.match(r!.title, /MatchZy/);
  });

  it("always says what the panel falls back to", () => {
    // The admin's real question is "so what happens to my match now".
    for (const probe of [
      { matchzy: false, metamod: false, cssharp: false },
      { matchzy: false, metamod: true, cssharp: false },
      gone,
    ]) {
      assert.match(describePluginFailure(probe, true)!.detail, /approximation/);
    }
  });
});
