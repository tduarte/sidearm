/**
 * Bundled map art lives under /public/maps/official/{mapName}.png
 * Screenshots sourced from the GhostCap community collection (CS2, 16:9):
 * https://github.com/ghostcap-gaming/cs2-map-images
 */

const OFFICIAL_WITH_ART = new Set([
  "de_mirage",
  "de_inferno",
  "de_dust2",
  "de_nuke",
  "de_overpass",
  "de_ancient",
  "de_anubis",
  "de_vertigo",
  "de_train",
  "cs_office",
  "cs_italy",
  "ar_baggage",
  "ar_shoots",
]);

export function getOfficialMapArtPath(mapInternalName: string): string | undefined {
  if (!OFFICIAL_WITH_ART.has(mapInternalName)) return undefined;
  return `/maps/official/${mapInternalName}.png`;
}
