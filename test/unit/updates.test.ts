import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  checkSteamVersion,
  parseServerVersion,
  parseUpdateProgress,
  runUpdateCheck,
  type UpdateCheckDeps,
} from "../../lib/cs2/updates";

/** Minimal `fetch` stand-in returning a canned Steam payload. */
function steamFetch(body: unknown, ok = true): typeof fetch {
  return (async () =>
    ({
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? "OK" : "Server Error",
      json: async () => body,
    }) as unknown as Response) as unknown as typeof fetch;
}

const baseDeps = (over: Partial<UpdateCheckDeps> = {}): UpdateCheckDeps => ({
  rconExec: async () => "Server Version: 14150",
  restartContainer: async () => {},
  playerCount: () => 0,
  matchPhase: () => "idle",
  autoRestart: true,
  fetchImpl: steamFetch({
    response: {
      success: true,
      up_to_date: false,
      required_version: 14177,
      message: "Server version required: 1.41.7.7",
    },
  }),
  ...over,
});

describe("parseServerVersion", () => {
  it("reads the build from a status-style composite version line", () => {
    assert.equal(
      parseServerVersion("version : 1.41.7.7/14177 1417 secure"),
      14177,
    );
  });

  it("reads a plain 'Server Version:' line", () => {
    assert.equal(parseServerVersion("Server Version: 14177"), 14177);
  });

  it("reads the Source 'Protocol version' form", () => {
    assert.equal(parseServerVersion("Protocol version 14177"), 14177);
  });

  it("reads ServerVersion from steam.inf", () => {
    assert.equal(
      parseServerVersion("PatchVersion=1.41.7.7\nServerVersion=14177\n"),
      14177,
    );
  });

  it("returns null rather than guessing when nothing matches", () => {
    assert.equal(parseServerVersion(""), null);
    assert.equal(parseServerVersion("Unknown command 'version'"), null);
  });
});

describe("parseUpdateProgress", () => {
  // Verbatim from a real joedwards32/cs2 container mid-download.
  const REAL = [
    " Update state (0x61) downloading, progress: 68.09 (48404306198 / 71089555502)",
    " Update state (0x61) downloading, progress: 68.12 (48427374870 / 71089555502)",
    " Update state (0x61) downloading, progress: 68.16 (48454637846 / 71089555502)",
  ].join("\n");

  it("takes the most recent progress line", () => {
    const p = parseUpdateProgress(REAL);
    assert.ok(p);
    assert.equal(p.phase, "downloading");
    assert.equal(p.pct, 68.16);
    assert.equal(p.bytesDone, 48454637846);
    assert.equal(p.bytesTotal, 71089555502);
  });

  it("handles the verifying phase", () => {
    const p = parseUpdateProgress(
      " Update state (0x81) verifying update, progress: 3.20 (2 / 64)",
    );
    assert.equal(p?.phase, "verifying update");
    assert.equal(p?.pct, 3.2);
  });

  it("reports nothing once steamcmd says the app is installed", () => {
    // Otherwise a finished download stays pinned at its last percentage for as
    // long as those lines remain in the log tail.
    assert.equal(
      parseUpdateProgress(`${REAL}\nSuccess! App '730' fully installed.`),
      null,
    );
  });

  it("ignores unrelated log output", () => {
    assert.equal(parseUpdateProgress("Starting server...\nLoading map"), null);
  });
});

describe("checkSteamVersion", () => {
  it("reports an available update", async () => {
    const r = await checkSteamVersion(
      14150,
      steamFetch({
        response: { success: true, up_to_date: false, required_version: 14177 },
      }),
    );
    assert.equal(r.upToDate, false);
    assert.equal(r.requiredVersion, 14177);
  });

  it("falls back to the installed build when Steam omits required_version", async () => {
    const r = await checkSteamVersion(
      14177,
      steamFetch({ response: { success: true, up_to_date: true } }),
    );
    assert.equal(r.upToDate, true);
    assert.equal(r.requiredVersion, 14177);
  });

  it("throws when Steam reports failure", async () => {
    await assert.rejects(() =>
      checkSteamVersion(1, steamFetch({ response: { success: false } })),
    );
  });

  it("throws on a non-OK response", async () => {
    await assert.rejects(() => checkSteamVersion(1, steamFetch({}, false)));
  });
});

describe("runUpdateCheck", () => {
  it("restarts when an update is pending and the server is empty", async () => {
    let restarted = false;
    const r = await runUpdateCheck(
      baseDeps({ restartContainer: async () => { restarted = true; } }),
    );
    assert.equal(r.update.upToDate, false);
    assert.equal(r.update.installedVersion, 14150);
    assert.equal(r.update.requiredVersion, 14177);
    assert.equal(r.restarted, true);
    assert.equal(restarted, true);
  });

  it("never restarts with players connected", async () => {
    let restarted = false;
    const r = await runUpdateCheck(
      baseDeps({
        playerCount: () => 3,
        matchPhase: () => "live",
        restartContainer: async () => { restarted = true; },
      }),
    );
    assert.equal(r.restarted, false);
    assert.equal(restarted, false);
    assert.match(r.deferredReason ?? "", /3 player\(s\) connected/);
  });

  it("never restarts when the player count is unknown", async () => {
    // A null roster means "not polled yet", not "empty". Treating it as empty
    // would drop whoever is actually connected.
    const r = await runUpdateCheck(baseDeps({ playerCount: () => null }));
    assert.equal(r.restarted, false);
    assert.match(r.deferredReason ?? "", /unknown/);
  });

  it("never restarts when auto-restart is off", async () => {
    const r = await runUpdateCheck(baseDeps({ autoRestart: false }));
    assert.equal(r.restarted, false);
    assert.equal(r.update.autoRestart, false);
    assert.match(r.deferredReason ?? "", /disabled/);
  });

  it("does nothing when already up to date", async () => {
    const r = await runUpdateCheck(
      baseDeps({
        rconExec: async () => "Server Version: 14177",
        fetchImpl: steamFetch({
          response: { success: true, up_to_date: true },
        }),
      }),
    );
    assert.equal(r.update.upToDate, true);
    assert.equal(r.restarted, false);
  });

  it("reports unknown, not up-to-date, when RCON is silent", async () => {
    const r = await runUpdateCheck(
      baseDeps({ rconExec: async () => { throw new Error("ECONNREFUSED"); } }),
    );
    assert.equal(r.update.upToDate, null);
    assert.equal(r.restarted, false);
    assert.match(r.update.message, /RCON did not answer/);
  });

  it("reports unknown when the version cannot be parsed", async () => {
    const r = await runUpdateCheck(baseDeps({ rconExec: async () => "???" }));
    assert.equal(r.update.upToDate, null);
    assert.equal(r.restarted, false);
  });

  it("reports unknown when Steam is unreachable", async () => {
    const r = await runUpdateCheck(
      baseDeps({
        fetchImpl: (async () => { throw new Error("network down"); }) as unknown as typeof fetch,
      }),
    );
    assert.equal(r.update.upToDate, null);
    assert.equal(r.update.installedVersion, 14150);
    assert.equal(r.restarted, false);
  });

  it("surfaces a failed restart instead of claiming success", async () => {
    const r = await runUpdateCheck(
      baseDeps({
        restartContainer: async () => { throw new Error("docker unreachable"); },
      }),
    );
    assert.equal(r.restarted, false);
    assert.match(r.deferredReason ?? "", /docker unreachable/);
  });
});
