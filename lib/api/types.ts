export type ServerState =
  | "running"
  | "stopped"
  | "starting"
  /** Container is up but steamcmd is still pulling game files; srcds is not listening. */
  | "updating"
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
  /** Present only while `state` is `updating`. */
  updateProgress?: UpdateProgress | null;
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
  /** Stable identity. Real SteamID (e.g. `[U:1:12345]`) whenever one is known. */
  steamId: string;
  /**
   * Per-connection RCON slot id from `status`. Required by `kickid` and friends,
   * which do NOT accept a SteamID. Not stable across reconnects — never use it
   * as an identity key.
   */
  userId?: string;
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
  /** `say_team` (team-only) rather than `say` (all-chat). */
  teamOnly?: boolean;
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

/** steamcmd download progress while the container is fetching game files. */
export interface UpdateProgress {
  phase: string;
  pct: number;
  bytesDone: number;
  bytesTotal: number;
}

/**
 * CS2 update state, derived from the build the running server reports versus the
 * build Steam currently requires.
 */
export interface UpdateStatus {
  /** Build the running server reports; null when it could not be determined. */
  installedVersion: number | null;
  /** Build Steam currently requires; null when the check has not succeeded. */
  requiredVersion: number | null;
  /**
   * `null` means *unknown*, not "up to date" — either the check has never run,
   * or the server's build could not be parsed. Auto-restart never fires on null.
   */
  upToDate: boolean | null;
  /** ISO timestamp of the last completed check, or null if it never ran. */
  checkedAt: string | null;
  /** Whether the panel is configured to restart the container on its own. */
  autoRestart: boolean;
  /** Note from Steam, or the reason the check could not produce an answer. */
  message: string;
}

export type WsEvent =
  | { type: "status.update"; status: ServerStatus }
  | { type: "player.join"; player: Player }
  | { type: "player.leave"; steamId: string }
  | { type: "player.update"; player: Player }
  | { type: "player.kill"; attackerSteamId: string; victimSteamId: string }
  | { type: "player.assist"; steamId: string }
  | { type: "player.team"; steamId: string; team: Team }
  | { type: "console.line"; event: ConsoleEvent }
  | { type: "chat.message"; message: ChatMessage }
  | { type: "match.phase"; phase: MatchPhase }
  | { type: "match.score"; score: { ct: number; t: number }; round: number }
  | { type: "server.update"; update: UpdateStatus };
