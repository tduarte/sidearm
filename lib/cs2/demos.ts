import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
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

/** Only `.dem`, and only a single path segment — never a path. */
function isDemoName(name: string): boolean {
  return name.endsWith(".dem") && !name.includes("/") && !name.includes("\\");
}

/** Collects the `.dem` files directly inside one directory. */
async function collectDemos(
  dir: string,
  prefix: string,
  out: DemoFile[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (!isDemoName(name)) continue;
    try {
      const info = await stat(path.join(dir, name));
      if (!info.isFile()) continue;
      out.push({
        name: prefix ? `${prefix}/${name}` : name,
        sizeBytes: info.size,
        modifiedAt: info.mtime.toISOString(),
      });
    } catch {
      // Raced with a delete, or unreadable; skip it rather than failing the list.
    }
  }
}

/**
 * Every demo on the volume, newest first.
 *
 * Looks one level down as well as at the top, because the two things that
 * record demos here do not agree on where they go: the panel's own `tv_record`
 * writes into `game/csgo`, while MatchZy writes into `matchzy_demo_path`, which
 * defaults to `MatchZy/`. Reading only the top level meant that installing the
 * plugin made the Demos card silently stop showing new recordings — the worst
 * shape of bug, since the demos are there and the panel looks fine.
 *
 * Subdirectories are discovered rather than hardcoded, so changing
 * `matchzy_demo_path` does not break it again. One level only: the point is to
 * find where a recorder put its files, not to walk 70 GB of game content.
 */
export async function listDemos(): Promise<DemoFile[]> {
  const root = demoDir();
  const demos: DemoFile[] = [];

  await collectDemos(root, "", demos);

  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    // No mount, or the directory does not exist yet because nothing has been
    // recorded. Both mean the same thing to a caller.
    return demos;
  }

  await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map((e) => collectDemos(path.join(root, e.name), e.name, demos)),
  );

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

  // Names can now carry a subdirectory (`MatchZy/foo.dem`), so the "it was in
  // the listing" guarantee is restated here as a containment check rather than
  // left implicit in the absence of separators.
  const root = path.resolve(demoDir());
  const full = path.resolve(root, match.name);
  if (full !== root && !full.startsWith(root + path.sep)) return null;

  try {
    return { stream: createReadStream(full), sizeBytes: match.sizeBytes };
  } catch {
    return null;
  }
}
