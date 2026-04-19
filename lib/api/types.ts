export type ServerState =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "crashed";

export type GameMode =
  | "competitive"
  | "wingman"
  | "deathmatch"
  | "casual"
  | "practice"
  | "custom";

export type Team = "CT" | "T" | "SPEC";

export type MatchPhase =
  | "idle"
  | "warmup"
  | "knife"
  | "live"
  | "halftime"
  | "ended";

export type ConsoleLevel = "info" | "warn" | "error" | "chat";

export interface ServerStatus {
  state: ServerState;
  /** Server browser name (from config identity; echoed on status for header UI). */
  hostname: string;
  map: string;
  gameMode: GameMode;
  players: number;
  maxPlayers: number;
  uptimeSec: number;
  cpuPct: number;
  memMb: number;
  memMaxMb: number;
  fps: number;
  tickrate: number;
  connectUrl: string;
  ip: string;
  port: number;
}

export interface ServerConfig {
  identity: {
    hostname: string;
    tags: string[];
    region: string;
  };
  access: {
    serverPassword: string;
    rconPassword: string;
    gsltToken: string;
  };
  gameplay: {
    mode: GameMode;
    tickrate: 64 | 128;
    maxPlayers: number;
    botsEnabled: boolean;
    botDifficulty: 0 | 1 | 2 | 3;
    botQuota: number;
  };
  networking: {
    port: number;
    tvPort: number;
    workshopCollectionId: string;
  };
}

export interface Player {
  steamId: string;
  name: string;
  team: Team;
  k: number;
  d: number;
  a: number;
  ping: number;
  connectedAt: string;
  avatarUrl?: string;
}

export interface MapEntry {
  name: string;
  displayName: string;
  type: "official" | "workshop";
  workshopId?: string;
  thumbnailUrl?: string;
}

export interface MatchState {
  phase: MatchPhase;
  score: { ct: number; t: number };
  round: number;
  maxRounds: number;
  paused: boolean;
  demoRecording: boolean;
}

export interface ConsoleEvent {
  id: string;
  ts: string;
  level: ConsoleLevel;
  source: string;
  message: string;
  player?: { steamId: string; name: string; team: Team };
}

export interface ChatMessage {
  id: string;
  ts: string;
  steamId: string;
  name: string;
  team: Team;
  message: string;
}

export interface MatchHistoryEntry {
  id: string;
  startedAt: string;
  endedAt: string;
  map: string;
  gameMode: GameMode;
  finalScore: { ct: number; t: number };
  winner: "CT" | "T" | "DRAW";
  playerCount: number;
}

export interface MatchHistoryDetail extends MatchHistoryEntry {
  players: Array<{
    steamId: string;
    name: string;
    team: Team;
    k: number;
    d: number;
    a: number;
  }>;
}

export type WsEvent =
  | { type: "status.update"; status: ServerStatus }
  | { type: "player.join"; player: Player }
  | { type: "player.leave"; steamId: string }
  | { type: "player.update"; player: Player }
  | { type: "player.kill"; attackerSteamId: string; victimSteamId: string }
  | { type: "console.line"; event: ConsoleEvent }
  | { type: "chat.message"; message: ChatMessage }
  | { type: "match.phase"; phase: MatchPhase }
  | { type: "match.score"; score: { ct: number; t: number }; round: number };
