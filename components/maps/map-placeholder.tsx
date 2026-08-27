"use client";

/**
 * The tile for a map with no bundled art.
 *
 * Every map without a picture used to render the same grey gradient with a pin
 * icon, so ten of the twenty-three maps on a real server were visually
 * identical and unreadable at a glance. This derives its look from the map
 * name, so each is distinguishable and stable across reloads.
 *
 * Not decoration for its own sake: on the Maps page the picture is how you
 * find the tile you want.
 */
export function MapPlaceholder({ name }: { name: string }) {
  const hue = hueFor(name);
  const label = shortLabel(name);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      // Inline because the hue is data, not a design token; a Tailwind class
      // cannot be generated per map name.
      style={{
        background: `linear-gradient(135deg,
          oklch(0.32 0.06 ${hue}) 0%,
          oklch(0.22 0.04 ${hue}) 55%,
          oklch(0.16 0.02 ${hue}) 100%)`,
      }}
      aria-hidden
    >
      <span
        className="font-heading text-4xl font-semibold tracking-tight"
        style={{ color: `oklch(0.72 0.11 ${hue})` }}
      >
        {label}
      </span>
    </div>
  );
}

/** Stable hue from the name, so a map always looks the same. */
function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360;
  }
  return h;
}

/**
 * `de_eldorado` → `EL`, `workshop/123/aim_botz` → `AI`.
 *
 * Two letters from the part that identifies the map, skipping the gamemode
 * prefix, which every map shares and so distinguishes nothing.
 */
function shortLabel(name: string): string {
  const base = name.split("/").pop() ?? name;
  const stripped = base.replace(/^[a-z]{2,6}_/i, "") || base;
  return stripped.slice(0, 2).toUpperCase();
}
