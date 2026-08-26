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
  /**
   * The real slot ceiling — `-maxplayers` on the launch line, read from the
   * container's own env.
   *
   * Deliberately NOT taken from `status`'s `(N max)`: with
   * `sv_visiblemaxplayers` at its default of -1, CS2 prints `(0 max)`, which is
   * how the panel came to display `0/0` players on a working server.
   * `null` when the container cannot be inspected.
   */
  maxPlayers: number | null;
  /**
   * Slots advertised to the server browser (`sv_visiblemaxplayers`), when it
   * differs from the ceiling. A display knob, never enforcement.
   */
  visibleMaxPlayers?: number | null;
  /** From the container's `StartedAt`; `null` when Docker is unreachable. */
  uptimeSec: number | null;
  cpuPct: number;
  memMb: number;
  memMaxMb: number;
  /**
   * `null` always, for now: CS2 removed the `stats` table that carried server
   * FPS, and `host_framerate` is a client cvar that reads 0 on a dedicated
   * server. Kept in the contract so a future source can fill it — never
   * fabricated as 0.
   */
  fps: number | null;
  /**
   * `null` unless something authoritative reports it. CS2 has no tickrate cvar
   * and the image passes no `-tickrate` (that was a CS:GO launch argument), so
   * there is nothing honest to show.
   */
  tickrate: number | null;
  /**
   * VAC state from `status`'s `version :` line. `false` is the signature of a
   * dead GSLT: the server runs and looks healthy but is insecure and unlisted.
   * `null` when RCON did not answer.
   */
  vacSecure: boolean | null;
  /** Steam build number from the same line; feeds the update check. */
  build: number | null;
  connectUrl: string;
  ip: string;
  port: number;
  /**
   * Which control planes answered on the last poll.
   *
   * They fail independently and the panel is differently broken by each: with
   * the Docker socket gone, Start/Stop/Restart and the resource tiles are dead
   * while RCON and chat keep working; with RCON silent, the reverse. Without
   * this the UI shows a healthy server and buttons that quietly do nothing.
   */
  control: { docker: boolean; rcon: boolean };
  /**
   * What the panel is still waiting to see take effect, if anything. Cleared
   * by the status poll observing the result, never by the request returning.
   */
  pendingOp?: PendingOp | null;
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

/**
 * An operation the panel asked for whose effect has not been observed yet.
 *
 * These all outlive their HTTP request by a wide margin: a workshop map
 * downloads before it loads (about a minute on a first fetch), a container
 * restart takes 30-90s, applying a CS2 update pulls tens of GB. Reporting
 * success when the request returned 200 told the admin the work was finished
 * while it had barely started, so the panel now holds the request open until
 * live status confirms it.
 */
export type PendingOpKind = "map" | "restart" | "start" | "stop" | "update";

export interface PendingOp {
  kind: PendingOpKind;
  /** The map that was asked for, when `kind` is `map`. */
  target?: string;
  /** ISO timestamp of when the panel issued the command. */
  since: string;
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
