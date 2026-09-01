import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listRoundBackups, parseBackupName } from "@/lib/cs2/round-backups";

describe("parseBackupName", () => {
  it("reads MatchZy's own naming", () => {
    assert.deepEqual(parseBackupName("matchzy_2_0_round12.json"), {
      matchId: 2,
      mapNumber: 0,
      round: 12,
      fileName: "matchzy_2_0_round12.json",
    });
  });

  it("ignores the Valve-format .txt beside it and anything else", () => {
    // MatchZy writes a .txt next to every .json; offering both would show
    // every round twice.
    assert.equal(parseBackupName("matchzy_2_0_round12.txt"), null);
    assert.equal(parseBackupName("de_mirage.dem"), null);
    assert.equal(parseBackupName("matchzy_backup.json"), null);
  });
});

describe("listRoundBackups", () => {
  it("orders rounds numerically, not by filename", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sidearm-backups-"));
    for (const n of ["00", "02", "09", "10"]) {
      await writeFile(path.join(dir, `matchzy_1_0_round${n}.json`), "{}");
    }
    // The bug this guards: round numbers are zero-padded, so a string sort
    // puts round10 before round09 and the panel offers the wrong round.
    await writeFile(path.join(dir, "matchzy_1_0_round12.txt"), "ignored");

    process.env.CS2_BACKUP_DIR = dir;
    const rounds = (await listRoundBackups()).map((b) => b.round);
    delete process.env.CS2_BACKUP_DIR;

    assert.deepEqual(rounds, [10, 9, 2, 0]);
  });

  it("says there are none when the volume is not mounted", async () => {
    process.env.CS2_BACKUP_DIR = "/nonexistent/sidearm-test";
    assert.deepEqual(await listRoundBackups(), []);
    delete process.env.CS2_BACKUP_DIR;
  });
});
