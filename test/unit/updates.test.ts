import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  checkSteamVersion,
  createRateTracker,
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

  it("reads a ServerVersion= line", () => {
    assert.equal(
      parseServerVersion("PatchVersion=1.41.7.7\nServerVersion=14177\n"),
      14177,
    );
  });

  it("does not treat a real steam.inf as a source of the build", () => {
    // Reading this file looks like the obvious way to avoid parsing `status`,
    // and it is a trap. A live CS2 install writes ServerVersion=2000899 while
    // `status` reports 1.41.7.8/14178, and 14178 is what UpToDateCheck compares
    // against — numerically. Feed it 2000899 and Steam answers "up to date"
    // forever. The parser reads the number, so the guard has to be that nothing
    // wires steam.inf into the update check.
    const REAL_STEAM_INF = [
      "ClientVersion=2000899",
      "ServerVersion=2000899",
      "PatchVersion=1.41.7.8",
      "ProductName=cs2",
    ].join("\n");
    assert.equal(parseServerVersion(REAL_STEAM_INF), 2_000_899);
    assert.notEqual(parseServerVersion(REAL_STEAM_INF), 14_178);
  });

  it("reads the build out of real CS2 `status` output", () => {
    // Verbatim from a live CS2 server (build 1.41.7.7), which is where the
    // build now comes from: `version` is not a command on CS2.
    const REAL_STATUS = [
      "----- Status -----",
      "hostname : sidearm",
      "version  : 1.41.7.7/14177 10896 secure  public",
      "steamid  : [G:1:15633205] (85568392935672629)",
      "players  : 0 humans, 2 bots (0 max) (not hibernating) (unreserved)",
    ].join("\n");
    assert.equal(parseServerVersion(REAL_STATUS), 14177);
  });

  it("returns null rather than guessing when nothing matches", () => {
    assert.equal(parseServerVersion(""), null);
    // What CS2 actually answers if you ask it for `version`.
    assert.equal(parseServerVersion("Unknown command 'version'!"), null);
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

describe("createRateTracker", () => {
  const TOTAL = 71_089_554_542;
  const at = (phase: string, bytesDone: number) => ({
    phase,
    pct: (bytesDone / TOTAL) * 100,
    bytesDone,
    bytesTotal: TOTAL,
  });

  it("has no answer from a single sample", () => {
    const t = createRateTracker();
    assert.deepEqual(t.observe(at("downloading", 1_000_000), 0), {
      bytesPerSec: null,
      etaSec: null,
    });
  });

  it("derives a rate and an ETA from two samples", () => {
    const t = createRateTracker();
    t.observe(at("downloading", 0), 0);
    // 10 MB in 10s = 1 MB/s, with 20 MB still to go.
    const r = t.observe(
      { ...at("downloading", 10 * 1024 ** 2), bytesTotal: 30 * 1024 ** 2 },
      10_000,
    );
    assert.equal(r.bytesPerSec, 1024 ** 2);
    assert.equal(r.etaSec, 20);
  });

  it("starts over when the download restarts from zero", () => {
    // The failure mode this exists for: steamcmd drops the appmanifest and
    // re-fetches all 70 GB, so the byte count falls off a cliff. A rate carried
    // across that boundary would be negative and the ETA meaningless.
    const t = createRateTracker();
    t.observe(at("downloading", 50_000_000_000), 0);
    t.observe(at("downloading", 50_100_000_000), 10_000);
    const r = t.observe(at("downloading", 18), 20_000);
    assert.deepEqual(r, { bytesPerSec: null, etaSec: null });
  });

  it("starts over when steamcmd changes phase", () => {
    // Each phase counts from zero, so verifying → downloading is not a stall.
    const t = createRateTracker();
    t.observe(at("verifying install", 60_000_000_000), 0);
    const r = t.observe(at("downloading", 500_000_000), 10_000);
    assert.deepEqual(r, { bytesPerSec: null, etaSec: null });
  });

  it("smooths rather than tracking each sample exactly", () => {
    const t = createRateTracker();
    t.observe(at("downloading", 0), 0);
    t.observe(at("downloading", 10 * 1024 ** 2), 10_000);
    // Rate doubles; the reported figure moves toward it without jumping to it.
    const r = t.observe(at("downloading", 30 * 1024 ** 2), 20_000);
    assert.ok(r.bytesPerSec !== null);
    assert.ok(r.bytesPerSec > 1024 ** 2 && r.bytesPerSec < 2 * 1024 ** 2);
  });

  it("reports no ETA for a stalled download", () => {
    const t = createRateTracker();
    t.observe(at("downloading", 1_000_000), 0);
    const r = t.observe(at("downloading", 1_000_000), 10_000);
    assert.equal(r.etaSec, null);
  });

  it("forgets everything on reset", () => {
    const t = createRateTracker();
    t.observe(at("downloading", 0), 0);
    t.observe(at("downloading", 10 * 1024 ** 2), 10_000);
    t.reset();
    assert.deepEqual(t.observe(at("downloading", 20 * 1024 ** 2), 20_000), {
      bytesPerSec: null,
      etaSec: null,
    });
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

  it("uses installedBuild when it answers, without asking RCON", async () => {
    let askedRcon = false;
    const r = await runUpdateCheck(
      baseDeps({
        installedBuild: async () => 14_150,
        rconExec: async () => {
          askedRcon = true;
          return "Server Version: 99999";
        },
      }),
    );
    assert.equal(r.update.installedVersion, 14_150);
    assert.equal(askedRcon, false);
  });

  it("falls back to RCON when installedBuild cannot answer", async () => {
    const r = await runUpdateCheck(
      baseDeps({ installedBuild: async () => null }),
    );
    assert.equal(r.update.installedVersion, 14_150);
    assert.equal(r.update.upToDate, false);
  });

  it("falls back to RCON when installedBuild throws", async () => {
    const r = await runUpdateCheck(
      baseDeps({
        installedBuild: async () => {
          throw new Error("ENOENT");
        },
      }),
    );
    assert.equal(r.update.installedVersion, 14_150);
  });

  it("reports an unknown build when neither source answers", async () => {
    const r = await runUpdateCheck(
      baseDeps({
        installedBuild: async () => null,
        rconExec: async () => "Unknown command 'version'!",
      }),
    );
    assert.equal(r.update.upToDate, null);
    assert.equal(r.restarted, false);
    assert.equal(r.update.installedVersion, null);
  });

  it("never restarts on an undeterminable build", async () => {
    // The failure that hides itself: an unknown build is not "up to date", but
    // it is also not grounds to restart, so the check must do nothing *and*
    // leave upToDate null for the caller to report.
    let restarted = false;
    const r = await runUpdateCheck(
      baseDeps({
        rconExec: async () => "Unknown command 'version'!",
        restartContainer: async () => {
          restarted = true;
        },
      }),
    );
    assert.equal(restarted, false);
    assert.equal(r.update.upToDate, null);
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

  it("asks the server for `status`, never `version`", async () => {
    // Regression guard: CS2 answers `Unknown command 'version'!`, which parses
    // to null, so asking for `version` pinned upToDate at "unknown" forever and
    // the update check could never fire.
    const asked: string[] = [];
    await runUpdateCheck(
      baseDeps({
        rconExec: async (cmd) => {
          asked.push(cmd);
          return "version  : 1.41.7.7/14177 10896 secure  public";
        },
      }),
    );
    assert.deepEqual(asked, ["status"]);
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
