/**
 * Fixture data for the design explorations under `/design`.
 *
 * Deliberately not wired to `lib/api` — these pages exist to argue about how
 * the panel should look, and a direction that only renders when a CS2 server
 * happens to be reachable cannot be compared side by side with four others.
 * Every direction reads this same object, so any difference between them is a
 * design difference and never a data one.
 *
 * The numbers are a real Friday: ten friends on, a best-of-three underway,
 * second map, one round from the half.
 */

export interface MockPlayer {
  id: string;
  name: string;
  side: "ct" | "t";
  kills: number;
  deaths: number;
  assists: number;
  /** Average damage per round — the stat people actually argue about. */
  adr: number;
  ping: number;
  captain?: boolean;
}

export const SERVER = {
  hostname: "sidearm",
  connectUrl: "connect 76.226.161.203:27015",
  ip: "76.226.161.203",
  port: 27015,
  state: "running" as const,
  vacSecure: true,
  uptimeHours: 31,
  cpuPct: 34,
  memMb: 5120,
  memMaxMb: 12288,
  slotsUsed: 10,
  slotsTotal: 12,
  tickrate: 64,
  build: "1.41.7.8/14178",
};

export const MATCH = {
  mode: "Competitive",
  map: "de_mirage",
  mapLabel: "Mirage",
  phase: "live" as const,
  round: 12,
  maxRounds: 24,
  ct: { name: "Team Fang", score: 7 },
  t: { name: "Team p4ul", score: 5 },
  series: { format: "BO3", mapIndex: 2, wonCt: 1, wonT: 0 },
  overtime: true,
  recording: "2026-09-01_21-04-12_2_de_mirage.dem",
};

export const PLAYERS: MockPlayer[] = [
  { id: "1", name: "MORTALFANG", side: "ct", kills: 19, deaths: 9, assists: 4, adr: 92, ping: 12, captain: true },
  { id: "2", name: "kettle", side: "ct", kills: 14, deaths: 11, assists: 6, adr: 78, ping: 24 },
  { id: "3", name: "nine", side: "ct", kills: 11, deaths: 12, assists: 2, adr: 64, ping: 31 },
  { id: "4", name: "Bracket", side: "ct", kills: 9, deaths: 13, assists: 7, adr: 58, ping: 18 },
  { id: "5", name: "hollow", side: "ct", kills: 7, deaths: 14, assists: 3, adr: 44, ping: 47 },
  { id: "6", name: "p4ul", side: "t", kills: 17, deaths: 10, assists: 3, adr: 88, ping: 15 },
  { id: "7", name: "dusk", side: "t", kills: 15, deaths: 11, assists: 5, adr: 81, ping: 22 },
  { id: "8", name: "Ferro", side: "t", kills: 12, deaths: 12, assists: 4, adr: 70, ping: 19 },
  { id: "9", name: "otter", side: "t", kills: 10, deaths: 13, assists: 8, adr: 61, ping: 55 },
  { id: "10", name: "SLATE", side: "t", kills: 6, deaths: 15, assists: 2, adr: 39, ping: 28 },
];

export const CT_PLAYERS = PLAYERS.filter((p) => p.side === "ct");
export const T_PLAYERS = PLAYERS.filter((p) => p.side === "t");

/** The pool a veto is running against. `state` is where each map ended up. */
export const MAP_POOL = [
  { name: "de_mirage", label: "Mirage", state: "picked" as const, by: "Team Fang" },
  { name: "de_inferno", label: "Inferno", state: "picked" as const, by: "Team p4ul" },
  { name: "de_nuke", label: "Nuke", state: "decider" as const, by: null },
  { name: "de_ancient", label: "Ancient", state: "banned" as const, by: "Team Fang" },
  { name: "de_anubis", label: "Anubis", state: "banned" as const, by: "Team p4ul" },
  { name: "de_dust2", label: "Dust II", state: "banned" as const, by: "Team Fang" },
  { name: "de_train", label: "Train", state: "banned" as const, by: "Team p4ul" },
];

export const PRESETS = [
  { id: "competitive", label: "Competitive", shape: "5v5", note: "MR12, no bots" },
  { id: "wingman", label: "Wingman", shape: "2v2", note: "Short bombsites" },
  { id: "deathmatch", label: "Deathmatch", shape: "24", note: "Instant respawn" },
  { id: "retakes", label: "Retakes", shape: "3v4", note: "Site executes" },
  { id: "practice", label: "Practice", shape: "10", note: "Nades and cheats" },
];

export const ACTIONS = [
  { id: "pause", label: "Pause", hint: "Freeze at the next round" },
  { id: "swap", label: "Swap sides", hint: "Halftime, manually" },
  { id: "knife", label: "Knife round", hint: "Set up and restart" },
  { id: "restart", label: "Restart server", hint: "Drops everyone" },
];

export function mapArt(name: string): string {
  return `/maps/official/${name}.png`;
}

export function kd(p: MockPlayer): string {
  return (p.kills / Math.max(1, p.deaths)).toFixed(2);
}

/** The five explorations, in the order the index lists them. */
export const DIRECTIONS = [
  {
    slug: "broadcast",
    name: "Broadcast",
    line: "The match is the product. Scoreboard first, at stadium scale.",
  },
  {
    slug: "terminal",
    name: "Terminal",
    line: "Monospace, keyboard-first, everything on one screen as text.",
  },
  {
    slug: "launcher",
    name: "Launcher",
    line: "Cinematic map art, few words, one big thing to press.",
  },
  {
    slug: "editorial",
    name: "Editorial",
    line: "Light, printed, typographic. A report you would read on paper.",
  },
  {
    slug: "soft",
    name: "Soft app",
    line: "A friendly phone app: rounded, roomy, thumb-driven.",
  },
];
