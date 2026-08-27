import type { CvarSpec } from "@/lib/api/types";

/**
 * The practice cvars the panel manages, and the only names it will write.
 *
 * Every entry was checked against a live CS2 server (build 1.41.7.7). Two that
 * the UI used to offer are absent because the build does not have them:
 *
 *  - `sv_grenade_trajectory` → `Unknown command`. CS2 kept only the
 *    `_prac_` variants.
 *  - `cl_grenadepreview` → `Unknown command` server-side, and it is a *client*
 *    cvar regardless: RCON cannot set it for connected players, so no
 *    server-side control could ever be honest about it. It is offered as a
 *    line to paste into your own console instead.
 *
 * Each tile used to be a one-shot write with no off state and no read-back:
 * once pressed, the only way back was the raw console. `off` is the value that
 * undoes it, and `default` is what CS2 ships, used only when no baseline was
 * captured.
 */
export const PRACTICE_CVARS: readonly CvarSpec[] = [
  {
    name: "sv_infinite_ammo",
    label: "Infinite ammo",
    kind: "toggle",
    on: "1",
    off: "0",
    cheatProtected: true,
  },
  {
    name: "mp_buy_anywhere",
    label: "Buy anywhere",
    kind: "toggle",
    on: "1",
    off: "0",
    cheatProtected: false,
  },
  {
    name: "sv_grenade_trajectory_prac_pipreview",
    label: "Landing preview",
    kind: "toggle",
    on: "1",
    off: "0",
    cheatProtected: true,
  },
  {
    // Seconds the thrown-grenade trail stays visible. A number, so it is a
    // stepper — rendering it as an on/off switch is the same category error as
    // the pause toggle.
    name: "sv_grenade_trajectory_prac_trailtime",
    label: "Flight trail",
    kind: "stepper",
    on: "8",
    off: "0",
    min: 0,
    max: 20,
    cheatProtected: true,
  },
  {
    name: "ammo_grenade_limit_total",
    label: "Grenade limit",
    kind: "stepper",
    on: "5",
    // 4 is the competitive default, confirmed on the live server.
    off: "4",
    min: 1,
    max: 10,
    cheatProtected: false,
  },
];

/** `sv_cheats` gates several of the above; read alongside them. */
export const PRACTICE_READ_NAMES = [
  "sv_cheats",
  ...PRACTICE_CVARS.map((c) => c.name),
] as const;

export function practiceSpec(name: string): CvarSpec | undefined {
  return PRACTICE_CVARS.find((c) => c.name === name);
}

/**
 * The value that turns a managed cvar off.
 *
 * Prefers the baseline captured from the server over the documented default,
 * so "off" restores what the admin had. One guard: if the baseline equals the
 * on-value, it was captured while the tile was already on (a panel restart
 * mid-session) and is contaminated — fall back to the default rather than
 * leaving the cvar on forever.
 */
export function offValueFor(spec: CvarSpec, baseline: string | null): string {
  if (baseline === null) return spec.off;
  if (baseline.trim() === "") return spec.off;
  return baseline === spec.on ? spec.off : baseline;
}
