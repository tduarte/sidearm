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

export function getWorkshopMaps(): MapEntry[] {
  const rows = getDb().prepare(`
    SELECT workshop_id, name, display_name
    FROM workshop_maps
    ORDER BY added_at ASC
  `).all() as Array<{ workshop_id: string; name: string; display_name: string }>;
  return rows.map((r) => ({
    name: r.name,
    displayName: r.display_name,
    type: "workshop" as const,
    workshopId: r.workshop_id,
  }));
}
