/**
 * Bundled map art lives under /public/maps/official/{mapName}.png
 * Screenshots sourced from the GhostCap community collection (CS2, 16:9):
 * https://github.com/ghostcap-gaming/cs2-map-images
 */

/**
 * Note the files are named `.png` but are not all PNGs — the bundled set is a
 * mix of WebP and JPEG. Nothing reads the extension: browsers and
 * `next/image` both detect the real format from the bytes. Renaming them would
 * be churn for no behavioural gain, but it surprises people, so: this is
 * deliberate.
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
  // Added once `maps *` revealed the server has more maps than the panel's old
  // hardcoded list of 13. The rest of that set has no art upstream and falls
  // back to the generated tile.
  "de_cache",
  "de_poseidon",
  "ar_pool_day",
]);

export function getOfficialMapArtPath(mapInternalName: string): string | undefined {
  if (!OFFICIAL_WITH_ART.has(mapInternalName)) return undefined;
  return `/maps/official/${mapInternalName}.png`;
}
