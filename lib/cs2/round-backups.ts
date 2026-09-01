import { readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * MatchZy's per-round backups, read off the CS2 volume.
 *
 * MatchZy writes one of these at the start of every round of a loaded match,
 * and `css_restore <round>` puts the match back to it — score, sides, money
 * and all. It is the only real answer to the two things that actually ruin a
 * match night: someone crashes mid-round, or a round is played out under the
 * wrong settings.
 *
 * Until now it was invisible here: the files exist on disk, the command exists
 * over RCON, and the panel offered neither, so recovering meant a console and
 * knowing the round number to ask for.
 *
 * Read through the same read-only `/cs2` mount the demo list uses. Absent the
 * mount every function degrades to "no backups", which is the honest answer
 * for a panel that cannot see the directory.
 */

/** Resolved per call, for the same reason `demoDir()` is. */
function backupDir(): string {
  return (
    process.env.CS2_BACKUP_DIR ?? "/cs2/game/csgo/MatchZyDataBackup"
  );
}

export interface RoundBackup {
  /** Round number the backup restores to. */
  round: number;
  /** MatchZy's integer match id — the panel's `matchNumber`. */
  matchId: number;
  /** Which map of a series, 0-based. */
  mapNumber: number;
  fileName: string;
  savedAt: string;
}

/**
 * `matchzy_{matchid}_{mapnumber}_round{NN}.json`, as MatchZy names them.
 *
 * The round is zero-padded, so it is parsed as a number rather than compared
 * as a string — `round10` sorts before `round9` otherwise, which would offer
 * the wrong round to restore.
 */
const BACKUP_RE = /^matchzy_(\d+)_(\d+)_round(\d+)\.json$/;

export function parseBackupName(
  name: string,
): Omit<RoundBackup, "savedAt"> | null {
  const m = BACKUP_RE.exec(name);
  if (!m) return null;
  return {
    matchId: Number(m[1]),
    mapNumber: Number(m[2]),
    round: Number(m[3]),
    fileName: name,
  };
}

/**
 * Every backup on disk, newest match first and highest round first within it.
 *
 * Ordered rather than raw because the useful one is almost always the most
 * recent: "put it back to the start of this round" is the common ask, and
 * hunting for it in an alphabetical listing is how you restore round 1 by
 * accident.
 */
export async function listRoundBackups(): Promise<RoundBackup[]> {
  let entries: string[];
  try {
    entries = await readdir(backupDir());
  } catch {
    return [];
  }

  const out: RoundBackup[] = [];
  for (const name of entries) {
    const parsed = parseBackupName(name);
    if (!parsed) continue;
    try {
      const info = await stat(path.join(backupDir(), name));
      if (!info.isFile()) continue;
      out.push({ ...parsed, savedAt: info.mtime.toISOString() });
    } catch {
      // A file that vanished between readdir and stat is not an error worth
      // failing the whole listing over.
    }
  }

  return out.sort(
    (a, b) =>
      b.matchId - a.matchId ||
      b.mapNumber - a.mapNumber ||
      b.round - a.round,
  );
}
