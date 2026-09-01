import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PRESETS,
  bootDiffers,
  envLines,
  findPreset,
} from "@/lib/presets";

const setupSh = readFileSync(
  path.join(process.cwd(), "scripts", "setup.sh"),
  "utf8",
);

describe("mode presets", () => {
  it("always budgets a slot for GOTV", () => {
    // The single most common way a new server is set up wrong: ten slots looks
    // right for a 5v5, and then only nine people can join because GOTV holds
    // slot 0. Every preset states GOTV is on, so every preset owes the +1.
    for (const p of PRESETS) {
      assert.equal(
        p.boot.TV_ENABLE,
        1,
        `${p.id} advertises GOTV in the UI, so it must enable it`,
      );
      assert.ok(
        p.boot.CS2_MAXPLAYERS > p.live.visibleMaxPlayers,
        `${p.id} advertises ${p.live.visibleMaxPlayers} players but only reserves ${p.boot.CS2_MAXPLAYERS} slots`,
      );
    }
  });

  it("keeps the numbers the user asked for by name", () => {
    // Stated directly in the request that produced this feature: Wingman is
    // 2v2 so four slots plus GOTV, Deathmatch defaults to 24 players.
    assert.equal(findPreset("wingman")?.live.visibleMaxPlayers, 4);
    assert.equal(findPreset("wingman")?.boot.CS2_MAXPLAYERS, 5);
    assert.equal(findPreset("deathmatch")?.live.visibleMaxPlayers, 24);
  });

  it("agrees with scripts/setup.sh", () => {
    /**
     * The setup script cannot import TypeScript, so the same slot counts are
     * written twice. This is the thing that keeps them honest: a preset
     * retuned in one place and not the other means a server whose panel and
     * whose `.env` disagree about how many people can join.
     */
    const inScript = new Set(
      [...setupSh.matchAll(/CS2_MAXPLAYERS=(\d+)/g)].map((m) => Number(m[1])),
    );
    for (const id of ["competitive", "wingman", "deathmatch", "casual"]) {
      const p = findPreset(id)!;
      assert.ok(
        inScript.has(p.boot.CS2_MAXPLAYERS),
        `setup.sh offers no ${p.boot.CS2_MAXPLAYERS}-slot option for ${id}`,
      );
    }
  });

  it("emits .env lines in the shape .env.example uses", () => {
    for (const line of envLines(findPreset("wingman")!)) {
      assert.match(line, /^[A-Z0-9_]+=\S+$/);
    }
    assert.deepEqual(envLines(findPreset("wingman")!), [
      "CS2_MAXPLAYERS=5",
      "CS2_GAMETYPE=0",
      "CS2_GAMEMODE=2",
      "TV_ENABLE=1",
    ]);
  });

  it("says it cannot tell rather than guessing when the slot count is unknown", () => {
    // A null here is "not polled yet". Reporting it as a mismatch would tell
    // people to recreate a container that is already correct.
    const wingman = findPreset("wingman")!;
    assert.equal(bootDiffers(wingman, null), null);
    assert.equal(bootDiffers(wingman, undefined), null);
    assert.equal(bootDiffers(wingman, 5), false);
    assert.equal(bootDiffers(wingman, 11), true);
  });

  it("has unique ids", () => {
    assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
  });
});
