/**
 * Workshop item details from Steam.
 *
 * `POST ISteamRemoteStorage/GetPublishedFileDetails/v1/` takes a published file
 * id and needs **no API key**, which is why this can ship in a self-hosted
 * panel with nothing to configure.
 *
 * https://partner.steamgames.com/doc/webapi/isteamremotestorage
 */

const ENDPOINT =
  "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";

export interface WorkshopMeta {
  title: string | null;
  /** Steam CDN URL for the item's preview image. */
  previewUrl: string | null;
  fileSize: number | null;
  /** Unix seconds; used to notice the item changed since it was added. */
  timeUpdated: number | null;
}

interface SteamFileDetails {
  result?: number;
  title?: string;
  preview_url?: string;
  file_size?: string | number;
  time_updated?: number;
}

/**
 * Looks up one workshop item.
 *
 * Returns null rather than throwing on any failure: a panel on a LAN with no
 * internet must still be able to add a map, just without a nice title or a
 * thumbnail. `fetchImpl` is injectable so tests never touch the network.
 */
export async function fetchWorkshopMeta(
  workshopId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkshopMeta | null> {
  const body = new URLSearchParams({
    itemcount: "1",
    "publishedfileids[0]": workshopId,
  });

  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      response?: { publishedfiledetails?: SteamFileDetails[] };
    };
    const item = json.response?.publishedfiledetails?.[0];
    // result 1 is success; 9 is "file not found", which a mistyped id gives.
    if (!item || (item.result !== undefined && item.result !== 1)) return null;

    const size =
      typeof item.file_size === "string"
        ? Number.parseInt(item.file_size, 10)
        : item.file_size;

    return {
      title: item.title?.trim() || null,
      previewUrl: item.preview_url || null,
      fileSize: Number.isFinite(size) ? (size as number) : null,
      timeUpdated: item.time_updated ?? null,
    };
  } catch {
    return null;
  }
}
