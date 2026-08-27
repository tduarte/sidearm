import { readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";

/**
 * Recorded demos, read off the CS2 volume.
 *
 * `tv_record` writes into the game's own directory inside the `cs2-data`
 * volume, which the panel could not see — so recording produced a file with no
 * way to get at it. docker-compose mounts that volume at `/cs2` **read-only**
 * for exactly this, and nothing more: the panel has no business writing to 70
 * GB of game files.
 *
 * Absent the mount, every function here degrades to "no demos", which is the
 * honest answer for a panel that cannot see the directory.
 */
/**
 * Resolved per call rather than at module load: a module-level constant freezes
 * whatever the environment happened to be when the file was first imported,
 * which is wrong for anything that configures itself after startup and makes
 * the module untestable.
 */
function demoDir(): string {
  return process.env.CS2_DEMO_DIR ?? "/cs2/game/csgo";
}

export interface DemoFile {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

/** Only `.dem`, and only files — never a path. */
function isDemoName(name: string): boolean {
  return name.endsWith(".dem") && !name.includes("/") && !name.includes("\\");
}

export async function listDemos(): Promise<DemoFile[]> {
  let entries: string[];
  try {
    entries = await readdir(demoDir());
  } catch {
    // No mount, or the directory does not exist yet because nothing has been
    // recorded. Both mean the same thing to a caller.
    return [];
  }

  const demos: DemoFile[] = [];
  for (const name of entries) {
    if (!isDemoName(name)) continue;
    try {
      const info = await stat(path.join(demoDir(), name));
      if (!info.isFile()) continue;
      demos.push({
        name,
        sizeBytes: info.size,
        modifiedAt: info.mtime.toISOString(),
      });
    } catch {
      // Raced with a delete, or unreadable; skip it rather than failing the list.
    }
  }
  // Newest first: the demo you want is almost always the one just recorded.
  return demos.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/**
 * A readable stream for one demo, or null.
 *
 * The name is validated against the directory listing rather than sanitised by
 * hand — the only names that can be served are ones that actually exist there,
 * so no amount of `../` in the request reaches another directory.
 */
export async function openDemo(
  name: string,
): Promise<{ stream: NodeJS.ReadableStream; sizeBytes: number } | null> {
  const demos = await listDemos();
  const match = demos.find((d) => d.name === name);
  if (!match) return null;

  try {
    return {
      stream: createReadStream(path.join(demoDir(), match.name)),
      sizeBytes: match.sizeBytes,
    };
  } catch {
    return null;
  }
}
