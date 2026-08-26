import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Workshop thumbnails, mirrored onto the panel's own volume.
 *
 * The image is copied rather than hotlinked to Steam's CDN for three reasons:
 * the panel is a LAN tool that has to render with no internet at all;
 * `next.config.ts` has no `images.remotePatterns`, so a remote host would need
 * configuring; and a CDN URL can rot while the map is still installed.
 *
 * Lives beside the SQLite file, so both are on the `panel-data` volume and a
 * `cs2-data` wipe leaves them alone.
 */
const THUMB_DIR = path.join(
  path.dirname(process.env.SQLITE_PATH ?? path.join(process.cwd(), "sidearm.db")),
  "thumbs",
);

/** Steam serves JPEG or PNG; the extension is kept so the type is known. */
function extensionFor(url: string, contentType: string | null): string {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  const fromUrl = /\.(png|jpe?g)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase();
  return fromUrl === "png" ? "png" : "jpg";
}

/** Refuses anything implausible for a preview image. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Downloads a preview image and stores it locally.
 *
 * Returns the stored filename, or null on any failure — a map with no
 * thumbnail is fine and must never block adding it.
 */
export async function mirrorThumbnail(
  workshopId: string,
  previewUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(previewUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;

    const type = res.headers.get("content-type");
    if (type && !type.startsWith("image/")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;

    // `workshopId` is digits-only by the time it reaches here
    // (`assertWorkshopId`), so it cannot escape the directory.
    const file = `${workshopId}.${extensionFor(previewUrl, type)}`;
    await mkdir(THUMB_DIR, { recursive: true });
    await writeFile(path.join(THUMB_DIR, file), buffer);
    return file;
  } catch {
    return null;
  }
}

export async function readThumbnail(
  file: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  // Defence in depth: only ever a bare filename, never a path.
  if (file.includes("/") || file.includes("\\") || file.includes("..")) {
    return null;
  }
  try {
    const body = await readFile(path.join(THUMB_DIR, file));
    return {
      body,
      contentType: file.endsWith(".png") ? "image/png" : "image/jpeg",
    };
  } catch {
    return null;
  }
}
