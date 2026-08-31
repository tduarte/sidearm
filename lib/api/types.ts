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

export interface PluginStatus {
  /** MatchZy answered `get5_status`. */
  matchzy: boolean | null;
  /** Metamod answered `meta list`. Probed only when MatchZy is missing. */
  metamod: boolean | null;
  /** CounterStrikeSharp answered `css_plugins list`. Same condition. */
  cssharp: boolean | null;
  /**
   * MatchZy has answered before on this install and is not answering now.
   *
   * The distinction the banner turns on: most people run this panel without
   * plugins and never want to hear about it, but a server that *had* them and
   * lost them has a real problem — almost always a CS2 update.
   */
  regressed: boolean;
}

/**
 * Only phases the log stream can actually report.
 *
 * `knife` and `halftime` used to be members and were the panel's clearest lie:
 * `setMatchPhase` mapped both to an empty command list, so nothing was sent,
 * the cache was updated anyway and success was toasted. Neither can ever come
 * back from the server either — `PHASE_TRIGGERS` in lib/cs2/log-parser.ts can
 * only emit warmup, live and ended — so a phase the server can never confirm
 * could only ever be the panel talking to itself.
 *
 * Both survive as explicit actions instead; see `knife()` and `mp_swapteams`
 * in lib/api/server/real.ts.
 */
export type MatchPhase = "idle" | "warmup" | "live" | "ended";

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
  /**
   * GOTV, when it is actually running. Read from `status`'s `sourcetv[0]` line:
   * `tv_status` is the obvious source and returns an empty string over RCON.
   *
   * Note GOTV occupies a player slot, which `maxPlayers` already accounts for.
   */
  gotv: { address: string; delaySec: number | null } | null;
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
   * Which of the three plugin layers answered on the last probe, and whether
   * MatchZy has gone missing since it was last seen.
   *
   * `null` on a field means "not probed, or RCON did not answer" — never
   * "absent", the same rule `control` follows. `null` for the whole object
   * means the panel has not managed a probe yet.
   *
   * This exists for a failure that is invisible everywhere else: a CS2 update
   * rewrites `gameinfo.gi`, the container restarts to apply it, and the server
   * comes back healthy, secure and silently without MatchZy.
   */
  plugins: PluginStatus | null;
  /**
   * What the panel is still waiting to see take effect, if anything. Cleared
   * by the status poll observing the result, never by the request returning.
   */
  pendingOp?: PendingOp | null;
  /** Present only while `state` is `updating`. */
  updateProgress?: UpdateProgress | null;
}

/**
 * Server settings the panel can actually change, and nothing else.
 *
 * Nine fields used to live here that `putConfig` silently dropped — tags,
 * region, tickrate, both ports, the workshop collection, and the RCON password
 * and GSLT — while the form reported "Config saved". They are launch arguments
 * or have no cvar at all, so the panel cannot apply them at any price; showing
 * them as editable was the lie. What is left is exactly what goes over RCON.
 */
export interface ServerConfig {
  identity: {
    hostname: string;
  };
  access: {
    /** Empty means an open server. Never echoed back; see REDACTED. */
    serverPassword: string;
  };
  gameplay: {
    mode: GameMode;
    /**
     * `sv_visiblemaxplayers` — what the server browser advertises. NOT the
     * slot ceiling, which is the `-maxplayers` launch argument and is reported
     * read-only as `ServerStatus.maxPlayers`.
     */
    visibleMaxPlayers: number;
    botsEnabled: boolean;
    botDifficulty: 0 | 1 | 2 | 3;
    botQuota: number;
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
  /**
   * From `mp_maxrounds`, read on the status poll. `null` until the server has
   * answered — it used to be the hardcoded constant 24, which is simply wrong
   * on any server not running the default competitive length.
   */
  maxRounds: number | null;
  /**
   * CS2 has no `mp_paused` cvar and `status` carries no pause column, so this
   * cannot be read back. It is also not instantaneous: `mp_pause_match` takes
   * effect at the END of the current round, so even an optimistic flip is
   * wrong for up to a couple of minutes.
   *
   * Hence a state rather than a boolean, and two explicit actions rather than
   * a toggle — a toggle driven by panel memory sends the wrong command after
   * any reload.
   */
  pause: PauseState;
  /**
   * Demo recording goes through GOTV (`tv_record`). `state` is `unknown` when
   * the panel has not issued anything this process; `name` is the file it
   * asked for, which is the panel's own record, not the server's.
   */
  demo: { state: DemoState; name: string | null };
  /**
   * Whether the panel has applied the knife-round cvars and holds a baseline
   * to undo them with. Persisted, so a panel restart mid-knife can still put
   * the server back.
   */
  knifeSetupApplied: boolean;
  /**
   * MatchZy's own gamestate, read from `get5_status`, when a match config is
   * loaded. `null` when MatchZy is absent or nothing is loaded — which includes
   * pug matches started in-game with `.start`, since `get5_status` only
   * populates for config-loaded matches.
   *
   * While this is non-null, MatchZy owns the map cycle, the gameplay cvars and
   * demo recording, and the panel stands down from all three.
   */
  matchzyState: MatchZyGameState | null;
}

/**
 * The values MatchZy reports for `gamestate`.
 *
 * `none` is deliberately part of the union rather than mapped to `null`: it is
 * a real answer meaning "MatchZy is loaded and running nothing", which is a
 * different thing from "MatchZy is not there".
 */
export type MatchZyGameState =
  | "none"
  | "pending_restore"
  | "waiting_for_players"
  | "warmup"
  | "knife"
  | "waiting_for_knife_decision"
  | "going_live"
  | "live"
  | "post_game"
  /** Anything a future MatchZy adds; carried through rather than dropped. */
  | (string & {});

export type PauseState =
  /** Not paused, as far as the panel knows. */
  | "running"
  /** `mp_pause_match` sent; CS2 applies it at the end of the current round. */
  | "pause_requested"
  | "paused"
  /** Fresh panel, or after a map change — nothing observed yet. */
  | "unknown";

export type DemoState = "idle" | "recording" | "unknown";

/** A cvar the panel is allowed to write, and how to render it. */
export interface CvarSpec {
  name: string;
  label: string;
  kind: "toggle" | "stepper";
  /** Value that turns it on / raises it. */
  on: string;
  /** Value that turns it off, used when no baseline was captured. */
  off: string;
  min?: number;
  max?: number;
  /** Requires `sv_cheats 1`; the server refuses it otherwise. */
  cheatProtected: boolean;
}

/**
 * What the server said about one cvar.
 *
 * `value: null` means the server has not answered — NOT that the cvar is off.
 * Collapsing those two is how a panel ends up confidently showing a state it
 * never observed, so the UI renders unknown distinctly.
 */
export interface CvarState {
  name: string;
  value: string | null;
  /** False when the build answered `Unknown command`. */
  supported: boolean;
  /** Value seen before the panel first changed it, for a truthful "off". */
  baseline: string | null;
  readAt: string | null;
}

export type CvarGroup = "practice";

export interface CvarSnapshot {
  group: CvarGroup;
  cvars: CvarState[];
  /** Null when the read failed outright. */
  readAt: string | null;
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

/**
 * Per-player stats as MatchZy recorded them.
 *
 * Only present on matches MatchZy ran: the panel's own log parser can count
 * kills and assists but has no access to damage, flashes, entry duels or
 * clutches, so these have no plugin-less equivalent.
 */
export interface MatchZyPlayerStats {
  /** Steam64, as a string — an identifier, never a number to do maths on. */
  steamId64: string;
  name: string;
  team: string;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  /** Average damage per round. `null` when the round count is unknown. */
  adr: number | null;
  /** Percent of kills that were headshots. `null` when the player got none. */
  headshotPct: number | null;
  enemiesFlashed: number;
  utilityDamage: number;
  entries: { played: number; won: number };
  clutches: { played: number; won: number };
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
  /**
   * Who recorded this match. `matchzy` records are authoritative where both
   * exist — see `getHistory`.
   */
  source?: "panel" | "matchzy";
  /**
   * MatchZy tracks **teams**, which swap sides at half-time; the panel's log
   * parser tracks **sides**. When this is present it is the real pair and is
   * what should be rendered — `finalScore` cannot express a named team that
   * played both sides.
   */
  teams?: [{ name: string; score: number }, { name: string; score: number }];
  /** Team name that won, when `teams` is present. Empty means a draw. */
  winnerLabel?: string;
}

export interface MatchHistoryDetail extends MatchHistoryEntry {
  /** Round-by-round record, when the log stream captured one. */
  rounds?: RoundRecord[];
  players: Array<{
    steamId: string;
    name: string;
    team: Team;
    k: number;
    d: number;
    a: number;
  }>;
  /** Full scoreboard, on matches MatchZy recorded. */
  matchzyPlayers?: MatchZyPlayerStats[];
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
  /**
   * Smoothed transfer rate, or `null` until two samples of the same phase have
   * been seen. steamcmd reports no rate of its own, and the panel throttles its
   * log reads, so this is derived from successive `bytesDone` readings.
   */
  bytesPerSec?: number | null;
  /**
   * Seconds left at the current rate, or `null` when that cannot be computed —
   * no rate yet, or a stalled download. Never a guess: a 70 GB re-download is
   * the difference between waiting and giving up on the evening.
   */
  etaSec?: number | null;
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

/** Things worth recording inside a round. */
export type RoundEventKind = "bomb_planted" | "bomb_defused" | "mvp";

/** One completed round, as the log stream reports it. */
export interface RoundRecord {
  round: number;
  winner: Team;
  /** Win condition, e.g. `bomb_defused`, `t_win_elimination`, `target_saved`. */
  reason: string;
  score: { ct: number; t: number };
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
  | { type: "server.update"; update: UpdateStatus }
  | { type: "round.start" }
  | ({ type: "round.end" } & RoundRecord)
  | {
      type: "round.event";
      kind: RoundEventKind;
      steamId: string;
      name: string;
    };
