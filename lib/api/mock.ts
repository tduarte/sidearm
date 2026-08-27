import type { BanRecord } from "@/lib/cs2/bans";
import type {
  ChatMessage,
  ConsoleEvent,
  MapEntry,
  MatchHistoryDetail,
  MatchState,
  Player,
  ServerConfig,
  ServerStatus,
} from "./types";

let _id = 0;
export const nextId = () => `${Date.now()}-${++_id}`;

const now = () => new Date().toISOString();

export const OFFICIAL_MAPS: MapEntry[] = [
  { name: "de_mirage", displayName: "Mirage", type: "official" },
  { name: "de_inferno", displayName: "Inferno", type: "official" },
  { name: "de_dust2", displayName: "Dust II", type: "official" },
  { name: "de_nuke", displayName: "Nuke", type: "official" },
  { name: "de_overpass", displayName: "Overpass", type: "official" },
  { name: "de_ancient", displayName: "Ancient", type: "official" },
  { name: "de_anubis", displayName: "Anubis", type: "official" },
  { name: "de_vertigo", displayName: "Vertigo", type: "official" },
  { name: "de_train", displayName: "Train", type: "official" },
  { name: "cs_office", displayName: "Office", type: "official" },
  { name: "cs_italy", displayName: "Italy", type: "official" },
  { name: "ar_baggage", displayName: "Baggage", type: "official" },
  { name: "ar_shoots", displayName: "Shoots", type: "official" },
];

const PLAYER_NAMES = [
  "s1mple", "ZywOo", "NiKo", "device", "sh1ro",
  "b1t", "m0NESY", "broky", "Ax1Le", "ropz",
];

function makePlayer(i: number): Player {
  const team: Player["team"] = i < 5 ? "CT" : "T";
  return {
    steamId: `7656119800000${String(i).padStart(4, "0")}`,
    name: PLAYER_NAMES[i] ?? `Player${i}`,
    team,
    k: Math.floor(Math.random() * 22),
    d: Math.floor(Math.random() * 18),
    a: Math.floor(Math.random() * 10),
    ping: 10 + Math.floor(Math.random() * 60),
    connectedAt: new Date(Date.now() - Math.random() * 1800000).toISOString(),
  };
}

const initialMockState = {
  status: {
    state: "running",
    hostname: "sidearm | 5v5 comp",
    map: "de_mirage",
    gameMode: "competitive",
    players: 10,
    maxPlayers: 16,
    uptimeSec: 3672,
    cpuPct: 24,
    memMb: 1840,
    memMaxMb: 4096,
    // null in mock too, because null is what real mode always returns: CS2 has
    // no server-side FPS or tickrate to report. A mock that invents them sends
    // the UI down code paths production never takes.
    fps: null,
    tickrate: null,
    vacSecure: true,
    build: 14177,
    gotv: { address: "0.0.0.0:27020", delaySec: 30 },
    // A server without plugins, which is what most installs of this panel are
    // — and it is the state with MORE interface to show, since the knife
    // approximation is live rather than standing down for MatchZy. Stated
    // explicitly rather than left undefined by the `as ServerStatus` below,
    // which is how it would otherwise read.
    plugins: { matchzy: false, metamod: false, cssharp: false, regressed: false },
    connectUrl: "steam://connect/192.168.1.20:27015/trusted",
    ip: "192.168.1.20",
    port: 27015,
    control: { docker: true, rcon: true },
  } as ServerStatus,

  config: {
    identity: {
      hostname: "sidearm | 5v5 comp",
    },
    access: {
      serverPassword: "",
    },
    gameplay: {
      mode: "competitive",
      visibleMaxPlayers: 10,
      botsEnabled: false,
      botDifficulty: 2,
      botQuota: 0,
    },
  } as ServerConfig,

  players: Array.from({ length: 10 }, (_, i) => makePlayer(i)) as Player[],

  maps: [...OFFICIAL_MAPS] as MapEntry[],
  rotation: ["de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis"] as string[],
  rotationEnabled: false,
  bans: [] as BanRecord[],

  match: {
    phase: "live",
    score: { ct: 7, t: 5 },
    round: 13,
    maxRounds: 24,
    pause: "running",
    demo: { state: "recording", name: "sidearm_de_mirage_mock" },
    knifeSetupApplied: false,
  } as MatchState,

  console: [] as ConsoleEvent[],
  chat: [] as ChatMessage[],

  history: [
    // A MatchZy-recorded match, so the plugin's scoreboard and its team-based
    // score can be seen without installing anything. This is a real production
    // shape, not an invention: MatchZy records every match it runs, and the
    // panel reads them straight out of its database.
    {
      id: "matchzy:7:0",
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      endedAt: new Date(Date.now() - 3600000 + 2580000).toISOString(),
      map: "de_nuke",
      gameMode: "competitive",
      finalScore: { ct: 13, t: 10 },
      winner: "CT",
      playerCount: 4,
      source: "matchzy",
      teams: [
        { name: "Astra", score: 13 },
        { name: "Nova", score: 10 },
      ],
      winnerLabel: "Astra",
      matchzyPlayers: [
        {
          steamId64: "76561197960265728", name: "vex", team: "Astra",
          kills: 27, deaths: 15, assists: 5, damage: 2185, adr: 95,
          headshotPct: 52, enemiesFlashed: 11, utilityDamage: 214,
          entries: { played: 9, won: 6 }, clutches: { played: 4, won: 3 },
        },
        {
          steamId64: "76561198000000042", name: "kori", team: "Astra",
          kills: 19, deaths: 17, assists: 9, damage: 1702, adr: 74,
          headshotPct: 31, enemiesFlashed: 24, utilityDamage: 388,
          entries: { played: 3, won: 1 }, clutches: { played: 2, won: 0 },
        },
        {
          steamId64: "76561199000000001", name: "brim", team: "Nova",
          kills: 21, deaths: 20, assists: 3, damage: 1893, adr: 82,
          headshotPct: 43, enemiesFlashed: 6, utilityDamage: 97,
          entries: { played: 7, won: 3 }, clutches: { played: 3, won: 1 },
        },
        {
          // No kills at all, so no headshot percentage exists to report —
          // the one row that proves nulls render as a dash, not as 0%.
          steamId64: "76561199000000002", name: "sova", team: "Nova",
          kills: 0, deaths: 22, assists: 12, damage: 640, adr: 27,
          headshotPct: null, enemiesFlashed: 31, utilityDamage: 502,
          entries: { played: 0, won: 0 }, clutches: { played: 0, won: 0 },
        },
      ],
    },
    {
      id: "m1",
      startedAt: new Date(Date.now() - 86400000).toISOString(),
      endedAt: new Date(Date.now() - 86400000 + 2400000).toISOString(),
      map: "de_mirage",
      gameMode: "competitive",
      finalScore: { ct: 13, t: 9 },
      winner: "CT",
      playerCount: 10,
    },
    {
      id: "m2",
      startedAt: new Date(Date.now() - 172800000).toISOString(),
      endedAt: new Date(Date.now() - 172800000 + 2700000).toISOString(),
      map: "de_inferno",
      gameMode: "competitive",
      finalScore: { ct: 11, t: 13 },
      winner: "T",
      playerCount: 10,
    },
    {
      id: "m3",
      startedAt: new Date(Date.now() - 259200000).toISOString(),
      endedAt: new Date(Date.now() - 259200000 + 1200000).toISOString(),
      map: "de_dust2",
      gameMode: "deathmatch",
      finalScore: { ct: 0, t: 0 },
      winner: "DRAW",
      playerCount: 14,
    },
  ] as MatchHistoryDetail[],
};

/**
 * Pinned to `globalThis` for the same reason as `lib/ws/bus.ts` and
 * `__cs2Cache`: `server.ts` runs under tsx while `app/api/**` is bundled by
 * Turbopack, so a plain module-level singleton exists once per registry.
 *
 * Without this, a mutation made by a route handler is invisible to the WS
 * emitter that broadcasts state to the browser — the REST response and the live
 * stream disagree, which is exactly what the update simulation exposed.
 */
declare global {
  var __sidearmMockState: typeof initialMockState | undefined;
}

export const state: typeof initialMockState = (globalThis.__sidearmMockState ??=
  initialMockState);

export function addConsole(
  level: ConsoleEvent["level"],
  source: string,
  message: string,
): ConsoleEvent {
  const ev: ConsoleEvent = {
    id: nextId(),
    ts: now(),
    level,
    source,
    message,
  };
  state.console.push(ev);
  if (state.console.length > 5000) state.console.shift();
  return ev;
}

export function addChat(msg: Omit<ChatMessage, "id" | "ts">): ChatMessage {
  const m: ChatMessage = { ...msg, id: nextId(), ts: now() };
  state.chat.push(m);
  if (state.chat.length > 2000) state.chat.shift();
  return m;
}

// seed some console + chat history
(function seed() {
  addConsole("info", "server", "Server started on port 27015");
  addConsole("info", "server", "Loading map de_mirage");
  addConsole("info", "engine", "tickrate 128 active");
  addConsole("info", "gc", "GameCoordinator connected");
  addChat({
    steamId: state.players[0].steamId,
    name: state.players[0].name,
    team: "CT",
    message: "gl hf",
  });
  addChat({
    steamId: state.players[5].steamId,
    name: state.players[5].name,
    team: "T",
    message: "glhf",
  });
})();
