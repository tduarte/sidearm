import { isSameMap } from "./workshop";

/**
 * Map rotation, driven by the panel.
 *
 * `getMaps().rotation` was a hardcoded empty array and `setRotation` was an
 * empty stub with a "Phase F will write mapcycle.txt" comment, so the Maps page
 * rendered a card that could only ever say "0 maps".
 *
 * The panel drives it rather than writing `mapcycle.txt` for two reasons:
 * the `cs2-data` mount is read-only, and mapcycle handles workshop maps badly —
 * whereas the panel already knows how to load one (`host_workshop_map`). The
 * cost is that rotation only advances while the panel is running, which the UI
 * says.
 */
export interface RotationState {
  /** Advance to the next map when a match ends. */
  enabled: boolean;
  /** Ordered map names, in the same form `changeMap` accepts. */
  maps: string[];
}

export const EMPTY_ROTATION: RotationState = { enabled: false, maps: [] };

/**
 * The map to load after `current` finishes.
 *
 * Returns null when there is nothing sensible to do: rotation off, empty list,
 * or a single-entry list that already matches the current map — reloading the
 * same level at every match end would be a surprising thing to inflict on
 * players.
 */
export function nextMap(
  rotation: RotationState,
  current: string,
): string | null {
  if (!rotation.enabled) return null;
  const maps = rotation.maps.filter((m) => m.trim() !== "");
  if (maps.length === 0) return null;

  const index = maps.findIndex((m) => isSameMap(m, current));
  if (index === -1) {
    // Current map is not in the rotation — start at the top rather than
    // guessing a position.
    return maps[0];
  }
  if (maps.length === 1) return null;
  return maps[(index + 1) % maps.length];
}

/** Normalises a rotation submitted by the UI. */
export function sanitizeRotation(
  input: Partial<RotationState> | string[],
): RotationState {
  const raw = Array.isArray(input) ? { maps: input } : input;
  const maps = (raw.maps ?? [])
    .map((m) => String(m).trim())
    .filter((m) => m !== "")
    // A duplicate would make the cycle stall on one map.
    .filter((m, i, all) => all.indexOf(m) === i)
    .slice(0, 64);
  return { enabled: raw.enabled === true && maps.length > 0, maps };
}
