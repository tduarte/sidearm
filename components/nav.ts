import {
  ClockCounterClockwise,
  Gauge,
  Gear,
  Trophy,
} from "@phosphor-icons/react";
import type { Role } from "@/lib/auth/permissions";

/**
 * Every destination in the panel, once.
 *
 * The rail and the ⌘K palette used to keep separate lists and had already
 * drifted apart — the palette offered a Dashboard entry the rail did not, and
 * either could gain a page the other never learned about. Two renderings of one
 * fact is a nav that disagrees with itself about where the product is.
 *
 * The list is short on purpose. The console is a mode of the palette rather
 * than a page; Maps and Config folded into Settings. All three are redirects
 * for old links, and none of them is a place worth a permanent seat in the
 * rail.
 *
 * `role` is the minimum needed to reach the page at all — the same bar
 * `lib/auth/permissions.ts` enforces on the routes each page calls. A viewer
 * shown a Console link would arrive at a page of 403s, so the entry is not
 * drawn rather than being drawn and disabled.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: typeof Gauge;
  role: Role;
  /**
   * Whether the rail draws it. The dashboard is the surface you are already on
   * and the wordmark is the way back to it, so a rail entry for it is one
   * nobody presses — but the palette still offers it, because a fuzzy search
   * for "dashboard" that returns nothing reads as the palette being broken.
   */
  rail: boolean;
};

export const DESTINATIONS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge, role: "viewer", rail: false },
  { href: "/match", label: "Match", icon: Trophy, role: "moderator", rail: true },
  {
    href: "/history",
    label: "History",
    icon: ClockCounterClockwise,
    role: "viewer",
    rail: true,
  },
  { href: "/settings", label: "Settings", icon: Gear, role: "viewer", rail: true },
];

/** The subset the rail draws, in rail order. */
export const RAIL_NAV = DESTINATIONS.filter((d) => d.rail);
