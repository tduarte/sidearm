import { getDb } from "./index";
import type { MapEntry } from "@/lib/api/types";

export function upsertWorkshopMap(entry: MapEntry & { workshopId: string }): void {
  getDb().prepare(`
    INSERT INTO workshop_maps (workshop_id, name, display_name)
    VALUES (@workshopId, @name, @displayName)
    ON CONFLICT(workshop_id) DO UPDATE SET
      name = excluded.name,
      display_name = excluded.display_name
  `).run(entry);
}

/** Steam's own facts about a workshop item, once they have been looked up. */
export interface WorkshopMetaRow {
  title: string | null;
  fileSize: number | null;
  timeUpdated: number | null;
  thumbFile: string | null;
}

export function setWorkshopMeta(
  workshopId: string,
  meta: Partial<WorkshopMetaRow> & { previewUrl?: string | null },
): void {
  getDb()
    .prepare(
      `UPDATE workshop_maps
          SET title        = COALESCE(@title, title),
              preview_url  = COALESCE(@previewUrl, preview_url),
              file_size    = COALESCE(@fileSize, file_size),
              time_updated = COALESCE(@timeUpdated, time_updated),
              thumb_file   = COALESCE(@thumbFile, thumb_file)
        WHERE workshop_id = @workshopId`,
    )
    .run({
      workshopId,
      title: meta.title ?? null,
      previewUrl: meta.previewUrl ?? null,
      fileSize: meta.fileSize ?? null,
      timeUpdated: meta.timeUpdated ?? null,
      thumbFile: meta.thumbFile ?? null,
    });
}

export function getWorkshopThumbFile(workshopId: string): string | null {
  const row = getDb()
    .prepare(`SELECT thumb_file FROM workshop_maps WHERE workshop_id = ?`)
    .get(workshopId) as { thumb_file: string | null } | undefined;
  return row?.thumb_file ?? null;
}

export function getWorkshopMaps(): MapEntry[] {
  const rows = getDb().prepare(`
    SELECT workshop_id, name, display_name, title, thumb_file
    FROM workshop_maps
    ORDER BY added_at ASC
  `).all() as Array<{
    workshop_id: string;
    name: string;
    display_name: string;
    title: string | null;
    thumb_file: string | null;
  }>;
  return rows.map((r) => ({
    name: r.name,
    // Steam's own title beats whatever was typed in when the map was added,
    // unless a display name was explicitly set.
    displayName: r.display_name || r.title || r.name,
    type: "workshop" as const,
    workshopId: r.workshop_id,
    // Served by the panel from its own volume, not hotlinked to Steam.
    thumbnailUrl: r.thumb_file ? `/api/maps/thumb/${r.workshop_id}` : undefined,
  }));
}

/**
 * Forgets a workshop map.
 *
 * There was no delete path at any layer, so a mistyped workshop ID stayed in
 * the list forever. This removes the panel's bookmark only — the downloaded
 * files stay in the cs2-data volume until it is wiped, which the UI says.
 */
export function deleteWorkshopMap(workshopId: string): void {
  getDb().prepare(`DELETE FROM workshop_maps WHERE workshop_id = ?`).run(workshopId);
}
