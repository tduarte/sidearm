import type {
  ChatMessage,
  ConsoleEvent,
  MapEntry,
  MatchHistoryDetail,
  CvarGroup,
  CvarSnapshot,
  CvarState,
  MatchPhase,
  MatchState,
  PendingOp,
  PendingOpKind,
  Player,
  ServerConfig,
  ServerStatus,
  UpdateStatus,
  WsEvent,
} from "../types";
import { rconExec } from "@/lib/cs2/rcon";
import { containerAction } from "@/lib/cs2/docker";
import { runUpdateCheck } from "@/lib/cs2/updates";
import { fetchStatus } from "@/lib/cs2/status";
import { bus } from "@/lib/ws/bus";
import { insertChatMessage, getChatMessages } from "@/lib/db/chat";
import { getMatches, getMatchDetail } from "@/lib/db/matches";
import {
  deleteWorkshopMap,
  getWorkshopMaps,
  setWorkshopMeta,
  upsertWorkshopMap,
} from "@/lib/db/maps";
import { fetchWorkshopMeta } from "@/lib/cs2/workshop-meta";
import {
  banCommands,
  expiredBans,
  expiryFrom,
  formatDuration as formatBanDuration,
  unbanCommand,
  type BanRecord,
} from "@/lib/cs2/bans";
import { deleteBan, insertBan, listBans } from "@/lib/db/bans";
import { getConsoleEvents, insertConsoleEvent } from "@/lib/db/console";
import { mirrorThumbnail } from "@/lib/maps/thumbnails";
import {
  assertCommandAllowed,
  assertValidMapName,
  assertWorkshopId,
  quoteArg,
  REDACTED,
  safeInt,
  assertManagedCvarName,
  safeToken,
} from "@/lib/cs2/sanitize";
import { asInt, cvarReadCommand, parseCvarEcho } from "@/lib/cs2/cvars";
import { mapDisplayName, parseMapList } from "@/lib/cs2/maps";
import {
  EMPTY_ROTATION,
  nextMap,
  sanitizeRotation,
  type RotationState,
} from "@/lib/cs2/rotation";
import {
  PRACTICE_READ_NAMES,
  practiceSpec,
} from "@/lib/cs2/practice";
import {
  KNIFE_CVARS,
  restoreCommands,
  setupCommands,
} from "@/lib/cs2/knife";
import {
  deleteSavedConfig,
  getSavedConfig,
  setSavedConfig,
} from "@/lib/db/config";
import {
  isSameMap,
  shortMapName,
  workshopIdFromMapName,
  workshopMapPath,
} from "@/lib/cs2/workshop";

// Use Node.js global so the poll loop in server.ts and the Next.js API route
// handlers share the same state regardless of how modules are bundled.
declare global {
  var __cs2Cache: {
    status: ServerStatus | null;
    players: Player[];
    match: MatchState;
    console: ConsoleEvent[];
    chat: ChatMessage[];
    workshopMaps: MapEntry[] | null;
    update: UpdateStatus | null;
    /** Workshop map we asked the server to host, until its filename is known. */
    pendingWorkshopMap: { id: string; fromMap: string; at: number } | null;
    /** Command issued whose effect the status poll has not observed yet. */
    pendingOp: PendingOp | null;
    /** Installed maps from `maps *`; null until asked, and only asked once. */
    officialMaps: MapEntry[] | null;
    /** Workshop ids already looked up on Steam this process. */
    metaAttempted: Set<string>;
  };
}
global.__cs2Cache ??= {
  status: null,
  players: [],
  match: {
    phase: "idle",
    score: { ct: 0, t: 0 },
    round: 0,
    maxRounds: null,
    pause: "unknown",
    demo: { state: "unknown", name: null },
    knifeSetupApplied: false,
  },
  console: [],
  chat: [],
  workshopMaps: null,
  update: null,
  pendingWorkshopMap: null,
  pendingOp: null,
  officialMaps: null,
  metaAttempted: new Set<string>(),
};

const cache = () => global.__cs2Cache;

/** Where the pre-knife cvar values live, so a restart cannot strand a server. */
const KNIFE_BASELINE_KEY = "knife.baseline";

/** Pre-change values for managed cvars, so "off" restores what was there. */
const CVAR_BASELINE_KEY = "cvar.baseline";

/** Does this string look like a real Steam identity rather than a name fallback? */
function looksLikeSteamId(s: string): boolean {
  return /^\[U:\d/i.test(s) || /^STEAM_/i.test(s) || /^765611\d{11}$/.test(s);
}

/**
 * Merges a freshly polled roster onto the cached one.
 *
 * `status` is authoritative for *who is connected* plus ping, but it carries no
 * team column and no kill counters — those are accumulated from the log stream.
 * Replacing the array wholesale (the previous behaviour) reset every player's
 * k/d/a to 0, their team to SPEC, and their `connectedAt` to "now" on every 2s
 * tick, so stats could never survive long enough to be seen.
 *
 * Players are matched on SteamID, falling back to name for `status` layouts that
 * don't expose a uniqueid column.
 */
export function mergeRoster(prev: Player[], incoming: Player[]): Player[] {
  const byId = new Map<string, Player>();
  for (const p of prev) {
    byId.set(p.steamId, p);
    byId.set(`name:${p.name}`, p);
  }

  return incoming.map((next) => {
    const existing = byId.get(next.steamId) ?? byId.get(`name:${next.name}`);
    if (!existing) return next;

    // Keep whichever side actually has a real SteamID.
    const steamId = looksLikeSteamId(next.steamId)
      ? next.steamId
      : looksLikeSteamId(existing.steamId)
        ? existing.steamId
        : next.steamId;

    return {
      ...existing,
      steamId,
      userId: next.userId ?? existing.userId,
      name: next.name || existing.name,
      ping: next.ping,
      // Accumulated from the log stream — must survive the poll.
      k: existing.k,
      d: existing.d,
      a: existing.a,
      team: existing.team,
      connectedAt: existing.connectedAt,
    };
  });
}

/** Lazily loads the persisted workshop library into the cache. */
function workshopLibrary(): MapEntry[] {
  if (cache().workshopMaps === null) {
    try {
      cache().workshopMaps = getWorkshopMaps();
    } catch {
      cache().workshopMaps = [];
    }
  }
  return cache().workshopMaps!;
}

/**
 * How long to keep waiting for a hosted workshop map to appear.
 *
 * `host_workshop_map` downloads before it loads, and a first fetch of a large
 * map is not instant. Generous, but bounded: a stale id must not be left around
 * to claim whatever map happens to load next.
 */
const WORKSHOP_RESOLVE_TIMEOUT_MS = 10 * 60_000;

/**
 * Learns a workshop map's real filename from the status poll.
 *
 * Steam gives out an id, not a filename, and the server only knows what is
 * inside the .vpk once it has downloaded it — so the first poll that shows a
 * different map after `host_workshop_map` is the moment the name becomes
 * knowable. Until then the entry stays `workshop/<id>`, which is all
 * `host_workshop_map` needs anyway.
 *
 * This also repairs entries written by older builds of the panel, which
 * synthesised the filename from the user-typed display name.
 */
function resolveWorkshopMapName(loadedMap: string): void {
  const pending = cache().pendingWorkshopMap;
  if (!pending) return;

  if (Date.now() - pending.at > WORKSHOP_RESOLVE_TIMEOUT_MS) {
    cache().pendingWorkshopMap = null;
    return;
  }

  // Still on the map we changed away from, or RCON has not answered yet: the
  // download or the level load is not finished.
  const short = shortMapName(loadedMap);
  if (!short || short === "unknown" || short === shortMapName(pending.fromMap)) {
    return;
  }
  cache().pendingWorkshopMap = null;

  const entry = workshopLibrary().find((m) => m.workshopId === pending.id);
  if (!entry) return;

  const name = workshopMapPath(pending.id, short);
  if (entry.name === name) return;
  entry.name = name;
  // A display name the user never typed is a placeholder, and the real
  // filename reads better than `Workshop 3070563536`.
  if (entry.displayName === `Workshop ${pending.id}`) entry.displayName = short;
  try {
    upsertWorkshopMap({ ...entry, workshopId: pending.id });
  } catch {
    /* non-critical */
  }

  const ev = makeConsoleEvent("info", "workshop", `Workshop ${pending.id} is ${short}`);
  appendConsole(ev);
  bus.emit({ type: "console.line", event: ev });
}

/**
 * How long a pending operation may go unconfirmed before the panel stops
 * claiming it is still in flight.
 *
 * Generous on purpose: a first workshop fetch takes about a minute, and a
 * container restart that has to pull a CS2 update can run for hours. This is
 * only a backstop against a pending badge that never clears — the UI already
 * shows elapsed time, so a slow operation looks slow rather than stuck.
 */
const PENDING_OP_MAX_MS = 6 * 60 * 60 * 1000;

/** Records a command whose effect the status poll has yet to observe. */
export function beginPendingOp(kind: PendingOpKind, target?: string): void {
  cache().pendingOp = { kind, target, since: new Date().toISOString() };
}

/**
 * Decides whether a fresh poll shows the pending operation has landed.
 *
 * Everything here is observation, never optimism: the request returning 200
 * only proves the server accepted the command, which for a map change means
 * the download has not started yet.
 */
export function pendingOpSettled(op: PendingOp, status: ServerStatus): boolean {
  switch (op.kind) {
    case "map":
      // isSameMap understands that `workshop/3070602404` and the short name
      // the server reports once loaded are the same map.
      return !!op.target && isSameMap(status.map, op.target);

    case "stop":
      return status.state === "stopped";

    case "start":
      return status.state === "running";

    case "restart":
    case "update": {
      // A restart is only done once the container we are looking at is a
      // *newer* one than the request. Waiting for `running` alone would clear
      // instantly, before Docker had even torn the old process down.
      if (status.uptimeSec === null) return false;
      const startedAtMs = Date.now() - status.uptimeSec * 1000;
      return status.state === "running" &&
        startedAtMs >= new Date(op.since).getTime();
    }
  }
}

export function updateCache(
  status: ServerStatus,
  players: Player[] | null,
  cvars?: { maxRounds: number | null },
) {
  resolveWorkshopMapName(status.map);

  // Only overwrite when the server actually answered: a dropped RCON tick must
  // not wipe a known match length back to unknown.
  if (cvars?.maxRounds != null) cache().match.maxRounds = cvars.maxRounds;

  // A level change cannot carry a pause across, and GOTV stops recording at
  // the same moment. The pause is knowable (it is gone); the recording is not,
  // so it goes back to unknown rather than being asserted either way.
  const previousMap = cache().status?.map;
  if (previousMap && previousMap !== status.map) {
    cache().match = {
      ...cache().match,
      pause: "running",
      demo: { state: "unknown", name: cache().match.demo.name },
    };
  }

  const op = cache().pendingOp;
  if (op) {
    const expired = Date.now() - new Date(op.since).getTime() > PENDING_OP_MAX_MS;
    if (pendingOpSettled(op, status) || expired) cache().pendingOp = null;
  }
  status.pendingOp = cache().pendingOp;

  cache().status = status;
  // A null roster means RCON did not answer this tick — keep the last known
  // roster rather than blanking the players page and losing accumulated stats.
  if (players !== null) cache().players = mergeRoster(cache().players, players);
}

/** `20260826-071144`, for a demo filename that sorts and reads chronologically. */
function nowStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

const APPLIED_CVARS_KEY = "config.applied";

/** The exact commands last applied by `putConfig`, for replay after a restart. */
function saveAppliedCvars(cvars: string[]): void {
  try {
    setSavedConfig(APPLIED_CVARS_KEY, cvars);
  } catch { /* non-critical */ }
}

/**
 * Re-applies the last saved config after the game server restarted.
 *
 * These are all in-memory cvars, so every restart drops them — including the
 * panel's own auto-update restart, which meant applying a CS2 update quietly
 * reset the hostname, password, game mode and bot settings.
 *
 * Deliberately not silent: the console line is how an admin finds out this
 * happened at all.
 */
export async function reapplyConfig(): Promise<void> {
  let cvars: string[] | null;
  try {
    cvars = getSavedConfig<string[]>(APPLIED_CVARS_KEY);
  } catch {
    return;
  }
  if (!cvars || cvars.length === 0) return;

  let applied = 0;
  for (const cvar of cvars) {
    try {
      await rconExec(cvar);
      applied += 1;
    } catch { /* keep going; one bad cvar must not block the rest */ }
  }

  const ev = makeConsoleEvent(
    applied === cvars.length ? "info" : "warn",
    "admin",
    `Re-applied ${applied}/${cvars.length} saved config cvars after the server restarted`,
  );
  appendConsole(ev);
  bus.emit({ type: "console.line", event: ev });
}

/**
 * Lifts bans whose clock has run out.
 *
 * The game server has no expiry of its own for a `banid 0`, so this is the
 * only thing that ends a timed ban.
 */
export async function sweepExpiredBans(): Promise<void> {
  let bans: BanRecord[];
  try { bans = listBans(); } catch { return; }

  for (const ban of expiredBans(bans)) {
    try {
      await rconExec(unbanCommand(safeToken(ban.steamId)));
    } catch { /* the server may have forgotten it already */ }
    try { deleteBan(ban.steamId); } catch { /* non-critical */ }
    const ev = makeConsoleEvent("info", "admin", `Ban on ${ban.name} expired`);
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
  }
}

/**
 * Re-applies unexpired bans after the game server has forgotten them.
 *
 * `banid` lives in the server's memory, so a container restart drops every
 * ban. Without this, "banned for an hour" quietly becomes "banned until the
 * next CS2 update".
 */
export async function reapplyBans(): Promise<void> {
  let bans: BanRecord[];
  try { bans = listBans(); } catch { return; }

  const active = bans.filter(
    (b) => b.expiresAt === null || new Date(b.expiresAt).getTime() > Date.now(),
  );
  for (const ban of active) {
    try { await rconExec(`banid 0 ${safeToken(ban.steamId)}`); } catch { /* best effort */ }
  }
  if (active.length > 0) {
    const ev = makeConsoleEvent(
      "info",
      "admin",
      `Re-applied ${active.length} ban(s) after the server restarted`,
    );
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
  }
}

const ROTATION_KEY = "map.rotation";

/** Rotation as stored. Panel intent, not server state — see lib/db/config.ts. */
export function loadRotation(): RotationState {
  try {
    return sanitizeRotation(getSavedConfig<RotationState>(ROTATION_KEY) ?? EMPTY_ROTATION);
  } catch {
    return EMPTY_ROTATION;
  }
}

function saveRotation(state: RotationState): void {
  try {
    setSavedConfig(ROTATION_KEY, state);
  } catch { /* non-critical */ }
}

/**
 * Loads the next map when a match ends, if rotation is on.
 *
 * Called from the match-lifecycle subscriber in server.ts, so it runs wherever
 * the `Game Over:` line is observed.
 */
export async function advanceRotation(): Promise<string | null> {
  const rotation = loadRotation();
  const current = cache().status?.map ?? "";
  const next = nextMap(rotation, current);
  if (!next) return null;

  try {
    await realAdapter.changeMap(next);
    const ev = makeConsoleEvent("info", "rotation", `Rotating to ${next}`);
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
    return next;
  } catch (err) {
    const ev = makeConsoleEvent(
      "error",
      "rotation",
      `Could not rotate to ${next}: ${(err as Error).message}`,
    );
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
    return null;
  }
}

/**
 * Fills in title and thumbnail for workshop maps added before the panel knew
 * how to ask Steam for them.
 *
 * Deliberately not awaited: the map list must render immediately, and a slow
 * or absent internet connection must not hold it up. The result lands in the
 * database and appears on the next refresh.
 *
 * Each id is attempted once per panel lifetime, so a map Steam has no record of
 * — a mistyped id, or a delisted item — does not mean a request on every poll.
 */
function backfillWorkshopMeta(entries: MapEntry[]): void {
  for (const entry of entries) {
    const id = entry.workshopId;
    if (!id || entry.thumbnailUrl) continue;
    if (cache().metaAttempted.has(id)) continue;
    cache().metaAttempted.add(id);

    void (async () => {
      const meta = await fetchWorkshopMeta(id);
      if (!meta) return;
      const thumbFile = meta.previewUrl
        ? await mirrorThumbnail(id, meta.previewUrl)
        : null;
      try {
        setWorkshopMeta(id, {
          title: meta.title,
          previewUrl: meta.previewUrl,
          fileSize: meta.fileSize,
          timeUpdated: meta.timeUpdated,
          thumbFile,
        });
        // Drop the cached library so the next read picks the new columns up.
        cache().workshopMaps = null;
      } catch { /* non-critical */ }
    })();
  }
}

/**
 * Maps the server actually has, asked for once and kept.
 *
 * The installed set only changes when the game updates, which means the
 * container restarted — and that clears this process's cache anyway. Asking
 * every time would spend an RCON round-trip on a large reply for an answer
 * that cannot have changed.
 */
async function officialLibrary(): Promise<MapEntry[]> {
  const cached = cache().officialMaps;
  if (cached) return cached;

  // No point asking a server that is not up; leaving the cache empty means the
  // next call retries rather than pinning an empty list for the process.
  if (cache().status?.state !== "running") return [];

  let names: string[];
  try {
    names = parseMapList(await rconExec("maps *"));
  } catch {
    return [];
  }
  if (names.length === 0) return [];

  const entries: MapEntry[] = names.map((name) => ({
    name,
    displayName: mapDisplayName(name),
    type: "official" as const,
  }));
  cache().officialMaps = entries;
  return entries;
}

/** Current match state from the cache. Exported for tests. */
export function getMatchState(): MatchState {
  return cache().match;
}

export function updateMatchState(match: Partial<MatchState>) {
  cache().match = { ...cache().match, ...match };
}

export function appendConsole(event: ConsoleEvent) {
  cache().console.push(event);
  if (cache().console.length > 500) cache().console.shift();
  // Also to disk, so a deploy or a panel crash does not throw away the log
  // someone is reading to work out what went wrong.
  try { insertConsoleEvent(event); } catch { /* non-critical */ }
}

export function appendChat(msg: ChatMessage) {
  cache().chat.push(msg);
  if (cache().chat.length > 1000) cache().chat.shift();
  try { insertChatMessage(msg); } catch { /* non-critical */ }
}

/** Locates a cached player by SteamID, falling back to name. */
function findPlayer(id: string): Player | undefined {
  const players = cache().players;
  return (
    players.find((p) => p.steamId === id) ?? players.find((p) => p.name === id)
  );
}

function emitPlayerUpdate(p: Player) {
  bus.emit({ type: "player.update", player: { ...p } });
}

/**
 * Applies one parsed log event to the cache and forwards it to the bus.
 *
 * Stat events (`player.kill` / `.assist` / `.team`) mutate the cached roster and
 * re-emit as `player.update`, because the client keeps a whole `Player` row per
 * SteamID and has no way to apply a bare delta.
 */
export function ingestEvent(event: WsEvent): void {
  switch (event.type) {
    case "player.kill": {
      const attacker = findPlayer(event.attackerSteamId);
      const victim = findPlayer(event.victimSteamId);
      if (attacker && attacker !== victim) {
        attacker.k += 1;
        emitPlayerUpdate(attacker);
      }
      if (victim) {
        victim.d += 1;
        emitPlayerUpdate(victim);
      }
      return;
    }
    case "player.assist": {
      const p = findPlayer(event.steamId);
      if (p) {
        p.a += 1;
        emitPlayerUpdate(p);
      }
      return;
    }
    case "player.team": {
      const p = findPlayer(event.steamId);
      if (p && p.team !== event.team) {
        p.team = event.team;
        emitPlayerUpdate(p);
      }
      return;
    }
    case "player.join": {
      if (!findPlayer(event.player.steamId)) cache().players.push(event.player);
      bus.emit(event);
      return;
    }
    case "player.leave": {
      cache().players = cache().players.filter(
        (p) => p.steamId !== event.steamId && p.name !== event.steamId,
      );
      bus.emit(event);
      return;
    }
    case "match.phase": {
      cache().match = { ...cache().match, phase: event.phase };
      bus.emit(event);
      return;
    }
    case "match.score": {
      cache().match = {
        ...cache().match,
        score: event.score,
        round: event.round,
      };
      bus.emit(event);
      return;
    }
    default:
      bus.emit(event);
  }
}

function makeConsoleEvent(
  level: ConsoleEvent["level"],
  source: string,
  message: string,
): ConsoleEvent {
  return {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    level,
    source,
    message,
  };
}

export const realAdapter = {
  async getStatus(): Promise<ServerStatus> {
    if (cache().status) return { ...cache().status! };
    const { status } = await fetchStatus();
    cache().status = status;
    return { ...status };
  },

  async setServerState(next: "running" | "stopped"): Promise<ServerStatus> {
    const action = next === "running" ? "start" : "stop";
    await containerAction("cs2", action);
    beginPendingOp(next === "running" ? "start" : "stop");
    const { status } = await fetchStatus();
    const updated: ServerStatus = {
      ...status,
      state: next === "running" ? "starting" : "stopping",
      pendingOp: cache().pendingOp,
    };
    cache().status = updated;
    bus.emit({ type: "status.update", status: updated });
    return updated;
  },

  async restart(): Promise<void> {
    await containerAction("cs2", "restart");
    beginPendingOp("restart");
    const s = cache().status;
    if (s) {
      const updated = {
        ...s,
        state: "starting" as const,
        pendingOp: cache().pendingOp,
      };
      cache().status = updated;
      bus.emit({ type: "status.update", status: updated });
    }
  },

  async getConfig(): Promise<ServerConfig> {
    // Read from the server rather than invented. botsEnabled, botDifficulty
    // and botQuota used to be the constants false/1/0 regardless of what the
    // server had, so the form opened showing settings nobody had chosen.
    let bots = { quota: 0, difficulty: 1 };
    let visible = 0;
    try {
      const read = parseCvarEcho(
        await rconExec(
          cvarReadCommand(["bot_quota", "bot_difficulty", "sv_visiblemaxplayers"]),
        ),
      );
      bots = {
        quota: asInt(read.values.get("bot_quota")) ?? 0,
        difficulty: asInt(read.values.get("bot_difficulty")) ?? 1,
      };
      visible = asInt(read.values.get("sv_visiblemaxplayers")) ?? 0;
    } catch {
      // RCON silent: fall through with defaults rather than failing the page.
    }

    const difficulty = Math.min(3, Math.max(0, bots.difficulty)) as 0 | 1 | 2 | 3;

    return {
      identity: {
        hostname: cache().status?.hostname ?? "CS2 Server",
      },
      // Secrets are write-only. `GET /api/config` previously returned the live
      // RCON password and GSLT in plain JSON to any browser that asked.
      access: {
        serverPassword: REDACTED,
      },
      gameplay: {
        mode: cache().status?.gameMode ?? "competitive",
        // -1 is the default meaning "no override"; show the real ceiling then.
        visibleMaxPlayers:
          visible > 0 ? visible : (cache().status?.maxPlayers ?? 10),
        botsEnabled: bots.quota > 0,
        botDifficulty: difficulty,
        botQuota: bots.quota,
      },
    };
  },

  async putConfig(cfg: ServerConfig): Promise<ServerConfig> {
    const gameModeMap: Record<string, [number, number]> = {
      casual:      [0, 0],
      competitive: [0, 1],
      wingman:     [0, 2],
      deathmatch:  [1, 2],
      practice:    [0, 0],
      custom:      [3, 0],
    };
    const [gt, gm] = gameModeMap[cfg.gameplay.mode] ?? [0, 1];

    const cvars = [
      `hostname "${quoteArg(cfg.identity.hostname)}"`,
      `sv_password "${quoteArg(cfg.access.serverPassword ?? "")}"`,
      `game_type ${gt}`,
      `game_mode ${gm}`,
      // Was `mp_maxrounds ${maxPlayers}` — max *players* written to max
      // *rounds*, so changing the slot count silently rewrote match length.
      `sv_visiblemaxplayers ${safeInt(cfg.gameplay.visibleMaxPlayers, 1, 64, 10)}`,
      `bot_quota ${cfg.gameplay.botsEnabled ? safeInt(cfg.gameplay.botQuota, 0, 64, 0) : 0}`,
      `bot_difficulty ${safeInt(cfg.gameplay.botDifficulty, 0, 3, 1)}`,
    ];

    for (const cvar of cvars) await rconExec(cvar);

    // Remembered so a container restart does not silently undo it. Every cvar
    // here lives in the game server's memory, and restarting IS how a CS2
    // update is applied — so the panel's own auto-update was reverting the
    // admin's settings and never mentioning it.
    saveAppliedCvars(cvars);

    const ev = makeConsoleEvent("info", "admin", "Config applied via RCON");
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });

    // Every field in ServerConfig is applied above; the ones that could not be
    // are no longer part of the type. The password comes back redacted because
    // it is write-only.
    return {
      ...cfg,
      access: { serverPassword: REDACTED },
    };
  },

  async getPlayers(): Promise<Player[]> {
    return [...cache().players];
  },

  async kick(steamId: string, reason?: string): Promise<void> {
    // `kickid` takes the RCON userid, not a SteamID. The UI keys players by
    // SteamID, so resolve through the roster to get the slot id.
    const target = safeToken(findPlayer(steamId)?.userId ?? steamId, 32);
    const cmd = reason
      ? `kickid ${target} "${quoteArg(reason, 120)}"`
      : `kickid ${target}`;
    await rconExec(cmd);
    cache().players = cache().players.filter((p) => p.steamId !== steamId);
    bus.emit({ type: "player.leave", steamId });
  },

  /**
   * Bans a player until the panel lifts it.
   *
   * `banid 0`, never the minutes form: a timed Source ban is deleted at the
   * next map change, so it would look right and quietly stop working. The
   * panel holds the clock instead (lib/cs2/bans.ts).
   */
  async banPlayer(
    steamId: string,
    minutes: number | null,
    reason?: string,
  ): Promise<BanRecord> {
    const player = cache().players.find((p) => p.steamId === steamId);
    // `banid`/`kickid` take the per-connection slot id; the SteamID is what we
    // store, because the slot is not stable across reconnects.
    const target = player?.userId ?? steamId;

    for (const cmd of banCommands(safeToken(target))) await rconExec(cmd);

    const ban: BanRecord = {
      steamId,
      name: player?.name ?? steamId,
      reason: reason?.trim().slice(0, 200) || null,
      bannedAt: new Date().toISOString(),
      expiresAt: expiryFrom(minutes),
    };
    try { insertBan(ban); } catch { /* non-critical */ }

    cache().players = cache().players.filter((p) => p.steamId !== steamId);
    bus.emit({ type: "player.leave", steamId });
    const ev = makeConsoleEvent(
      "warn",
      "admin",
      `Banned ${ban.name} (${formatBanDuration(minutes)})`,
    );
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
    return ban;
  },

  async unbanPlayer(steamId: string): Promise<void> {
    try { await rconExec(unbanCommand(safeToken(steamId))); } catch {
      // The server may not hold it any more (a restart clears the list); the
      // panel's record still has to go, or it would be re-applied on reconnect.
    }
    try { deleteBan(steamId); } catch { /* non-critical */ }
  },

  async getBans(): Promise<BanRecord[]> {
    try { return listBans(); } catch { return []; }
  },

  async getMaps(): Promise<{ current: string; rotation: string[]; all: MapEntry[] }> {
    const workshop = workshopLibrary();
    backfillWorkshopMeta(workshop);
    return {
      current: cache().status?.map ?? "unknown",
      rotation: loadRotation().maps,
      all: [...workshop, ...(await officialLibrary())],
    };
  },

  async changeMap(name: string): Promise<void> {
    const map = assertValidMapName(name);
    const workshopId = workshopIdFromMapName(map);

    if (workshopId) {
      // `host_workshop_map` downloads the map when the server does not have it
      // and then hosts it. `changelevel workshop/<id>/<name>` — what this used
      // to send — can do neither: it needs the map installed already and needs
      // its real filename, and a map added through the panel has neither.
      cache().pendingWorkshopMap = {
        id: workshopId,
        fromMap: cache().status?.map ?? "",
        at: Date.now(),
      };
      await rconExec(`host_workshop_map ${workshopId}`);
    } else {
      // Drop any unfinished workshop load: the map that lands now is this one,
      // and must not be recorded as the workshop entry's filename.
      cache().pendingWorkshopMap = null;
      await rconExec(`changelevel ${map}`);
    }

    // No optimistic rewrite of `status.map` here. It used to be set the moment
    // RCON accepted the command, so the UI showed the new map while the server
    // was still downloading it — the panel claiming an outcome it had not
    // observed. The poll reports the map when the level actually loads; until
    // then this is a pending operation.
    beginPendingOp("map", map);
    const s = cache().status;
    if (s) {
      const updated = { ...s, pendingOp: cache().pendingOp };
      cache().status = updated;
      bus.emit({ type: "status.update", status: updated });
    }
    bus.emit({ type: "match.phase", phase: "warmup" });
  },

  async subscribeWorkshop(workshopId: string, displayName?: string): Promise<MapEntry> {
    workshopId = assertWorkshopId(workshopId);
    const list = workshopLibrary();
    const idx = list.findIndex((m) => m.workshopId === workshopId);
    const existing = idx >= 0 ? list[idx] : undefined;

    // Nothing is asked of the game server here: the map downloads on first
    // play, when `changeMap` issues `host_workshop_map`. Doing it now would
    // mean changing the level out from under whoever is playing, since that
    // command hosts the map as well as fetching it.
    // Steam knows the item's real title, so the display-name field is an
    // override rather than something the admin has to supply. No API key is
    // needed for this call. It is best-effort: a panel with no internet still
    // adds the map, just without a title or a thumbnail.
    const meta = await fetchWorkshopMeta(workshopId);

    const entry: MapEntry = {
      // Keep a filename already learned from an earlier play (see
      // `resolveWorkshopMapName`) rather than dropping back to the bare id.
      name:
        existing && workshopIdFromMapName(existing.name) === workshopId
          ? existing.name
          : workshopMapPath(workshopId),
      displayName:
        displayName?.trim().slice(0, 64) ||
        meta?.title?.slice(0, 64) ||
        existing?.displayName ||
        `Workshop ${workshopId}`,
      type: "workshop",
      workshopId,
    };

    try { upsertWorkshopMap({ ...entry, workshopId }); } catch { /* non-critical */ }

    if (meta) {
      const thumbFile = meta.previewUrl
        ? await mirrorThumbnail(workshopId, meta.previewUrl)
        : null;
      try {
        setWorkshopMeta(workshopId, {
          title: meta.title,
          previewUrl: meta.previewUrl,
          fileSize: meta.fileSize,
          timeUpdated: meta.timeUpdated,
          thumbFile,
        });
      } catch { /* non-critical */ }
      if (thumbFile) entry.thumbnailUrl = `/api/maps/thumb/${workshopId}`;
    }
    if (idx >= 0) list[idx] = entry; else list.push(entry);

    const ev = makeConsoleEvent(
      "info",
      "workshop",
      `Added workshop map ${workshopId}; it downloads on first play`,
    );
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
    return entry;
  },

  async unsubscribeWorkshop(workshopId: string): Promise<void> {
    const id = assertWorkshopId(workshopId);
    deleteWorkshopMap(id);
    cache().workshopMaps = null;
    // Not an error if it was mid-resolution; just stop waiting for its name.
    if (cache().pendingWorkshopMap?.id === id) cache().pendingWorkshopMap = null;
    const ev = makeConsoleEvent("info", "admin", `Workshop map ${id} removed`);
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
  },

  async setRotation(rotation: string[]): Promise<void> {
    const current = loadRotation();
    saveRotation(sanitizeRotation({ enabled: current.enabled, maps: rotation }));
  },

  async getRotation(): Promise<RotationState> {
    return loadRotation();
  },

  async putRotation(next: Partial<RotationState>): Promise<RotationState> {
    const state = sanitizeRotation({ ...loadRotation(), ...next });
    saveRotation(state);
    return state;
  },

  async getMatch(): Promise<MatchState> {
    return { ...cache().match };
  },

  async setMatchPhase(phase: MatchPhase): Promise<MatchState> {
    /**
     * Every member must map to real commands. `knife` and `halftime` were
     * silently mapped to `[]` here: no RCON was sent, the cache was updated
     * regardless, and the UI reported success. The `Record<MatchPhase, ...>`
     * type is what now makes an empty entry impossible to add by accident, and
     * the assertion below catches one added on purpose.
     */
    const cmds: Record<MatchPhase, string[]> = {
      warmup: ["mp_warmup_start"],
      live: ["mp_warmup_end", "mp_restartgame 3"],
      ended: ["mp_restartgame 1"],
      // Panel-side only: "no match in progress". Nothing to tell the server.
      idle: [],
    };

    if (phase !== "idle" && cmds[phase].length === 0) {
      throw new Error(`No commands defined for match phase "${phase}"`);
    }

    for (const cmd of cmds[phase]) await rconExec(cmd);
    cache().match = { ...cache().match, phase };
    bus.emit({ type: "match.phase", phase });
    return { ...cache().match };
  },

  /**
   * Reads the practice cvars in one batched round-trip.
   *
   * Called only while the Practice tab is mounted (the client query is
   * `enabled` on that), because RCON is a single serialised socket and the 2s
   * status poll already owns most of its budget.
   */
  async getCvars(group: CvarGroup): Promise<CvarSnapshot> {
    if (group !== "practice") throw new Error(`Unknown cvar group "${group}"`);

    // Reading while the container is down would just fill the RCON queue.
    if (cache().status?.state !== "running") {
      return { group, cvars: [], readAt: null };
    }

    const echo = await rconExec(cvarReadCommand(PRACTICE_READ_NAMES));
    const read = parseCvarEcho(echo);
    const readAt = new Date().toISOString();
    const baselines = getSavedConfig<Record<string, string>>(CVAR_BASELINE_KEY) ?? {};

    const cvars: CvarState[] = PRACTICE_READ_NAMES.map((name) => {
      const value = read.values.get(name) ?? null;
      const spec = practiceSpec(name);
      // First sighting of a value that is not the "on" value is the truthful
      // baseline for restoring later.
      if (spec && value !== null && baselines[name] === undefined && value !== spec.on) {
        baselines[name] = value;
      }
      return {
        name,
        value,
        supported: !read.unknown.has(name),
        baseline: baselines[name] ?? null,
        readAt,
      };
    });

    setSavedConfig(CVAR_BASELINE_KEY, baselines);
    return { group, cvars, readAt };
  },

  /**
   * Writes a managed cvar and reads it back in the same round-trip.
   *
   * The reply is what gets returned, never the requested value: that is what
   * catches a refusal (a cheat-protected cvar while `sv_cheats 0` echoes back
   * unchanged) instead of the tile flipping to a state the server rejected.
   */
  async setCvar(name: string, value: string): Promise<CvarState> {
    const allowed = [...PRACTICE_READ_NAMES];
    const safeName = assertManagedCvarName(name, allowed);
    const spec = practiceSpec(safeName);

    let safeValue: string;
    if (spec?.kind === "stepper") {
      safeValue = String(
        safeInt(value, spec.min ?? 0, spec.max ?? 100, Number(spec.off)),
      );
    } else {
      // Booleans and sv_cheats: only ever 0 or 1 reaches the server.
      safeValue = value.trim() === "1" || value.trim() === "true" ? "1" : "0";
    }

    const echo = await rconExec(`${safeName} ${safeValue}; ${safeName}`);
    const read = parseCvarEcho(echo);
    const baselines = getSavedConfig<Record<string, string>>(CVAR_BASELINE_KEY) ?? {};

    return {
      name: safeName,
      value: read.values.get(safeName) ?? null,
      supported: !read.unknown.has(safeName),
      baseline: baselines[safeName] ?? null,
      readAt: new Date().toISOString(),
    };
  },

  /**
   * Applies or undoes the knife-round cvars.
   *
   * `setup` reads the current values first and persists them, so `restore`
   * puts back what this server had rather than what a default cfg contains —
   * and so a panel restart mid-knife can still undo it.
   */
  async knife(action: "setup" | "restore"): Promise<MatchState> {
    if (action === "restore") {
      const baseline = getSavedConfig<Record<string, string>>(KNIFE_BASELINE_KEY);
      if (!baseline) {
        throw new Error(
          "No knife baseline was recorded, so the panel does not know what to restore. Set the gameplay cvars you want by hand, or run `exec gamemode_competitive.cfg`.",
        );
      }
      for (const cmd of restoreCommands(baseline)) await rconExec(cmd);
      await rconExec("mp_restartgame 1");
      deleteSavedConfig(KNIFE_BASELINE_KEY);
      cache().match = { ...cache().match, knifeSetupApplied: false };
      return { ...cache().match };
    }

    // Read before writing. Anything the build does not have is left out of the
    // baseline entirely rather than recorded as a guess.
    const echo = await rconExec(cvarReadCommand(KNIFE_CVARS));
    const read = parseCvarEcho(echo);
    const baseline: Record<string, string> = {};
    for (const name of KNIFE_CVARS) {
      const value = read.values.get(name);
      if (value !== undefined) baseline[name] = value;
    }
    setSavedConfig(KNIFE_BASELINE_KEY, baseline);

    for (const cmd of setupCommands()) await rconExec(cmd);
    cache().match = { ...cache().match, knifeSetupApplied: true };
    return { ...cache().match };
  },

  /** Swaps sides now. What people actually want when they say "halftime". */
  async swapTeams(): Promise<MatchState> {
    const out = await rconExec("mp_swapteams");
    // Command support cannot be probed safely, so it is discovered here, from
    // the reply to a real invocation.
    if (/Unknown command/i.test(out)) {
      throw new Error("This CS2 build has no `mp_swapteams` command.");
    }
    return { ...cache().match };
  },

  /**
   * Explicit verbs, deliberately not a toggle.
   *
   * The old `togglePause` chose its command from a panel-local boolean that
   * reset on every panel restart, so after one it would send `mp_pause_match`
   * to an already-paused server. There is nothing to read back — CS2 exposes no
   * pause cvar — so the fix is to remove the guess: the caller says which way
   * it wants to go, and a wrong-direction send becomes impossible.
   */
  async setPause(action: "pause" | "unpause"): Promise<MatchState> {
    await rconExec(action === "pause" ? "mp_pause_match" : "mp_unpause_match");
    // `mp_pause_match` lands at the end of the current round, so claiming
    // "paused" now would be wrong for up to a couple of minutes.
    cache().match = {
      ...cache().match,
      pause: action === "pause" ? "pause_requested" : "running",
    };
    return { ...cache().match };
  },

  /**
   * Demo recording via GOTV.
   *
   * `record` / `stop` — what this used to send — are the *client* demo
   * commands and do nothing useful over RCON. The server-side path is
   * `tv_record` / `tv_stoprecord`, and it needs GOTV running, which is why
   * TV_ENABLE is now on by default in docker-compose.yml.
   */
  async setDemo(action: "start" | "stop"): Promise<MatchState> {
    if (!cache().status?.gotv) {
      throw new Error(
        "GOTV is not running, so the server cannot record a demo. Set TV_ENABLE=1 and run `docker compose up -d --force-recreate cs2`.",
      );
    }

    if (action === "stop") {
      await rconExec("tv_stoprecord");
      cache().match = {
        ...cache().match,
        demo: { state: "idle", name: cache().match.demo.name },
      };
      return { ...cache().match };
    }

    const map = shortMapName(cache().status?.map ?? "demo");
    const name = safeToken(`sidearm_${map}_${nowStamp()}`);
    await rconExec(`tv_record ${name}`);
    cache().match = { ...cache().match, demo: { state: "recording", name } };
    return { ...cache().match };
  },

  async getConsole(): Promise<ConsoleEvent[]> {
    // Disk first: after a panel restart the in-memory ring is empty but the
    // log is not, and an empty console is exactly the wrong thing to show
    // someone who just restarted the panel to investigate something.
    try {
      const stored = getConsoleEvents(500);
      if (stored.length > 0) return stored;
    } catch { /* fall back to memory */ }
    return cache().console.slice(-500);
  },

  async rcon(command: string): Promise<string> {
    const safe = assertCommandAllowed(command);
    const out = await rconExec(safe);
    const ev = makeConsoleEvent("info", "rcon", `> ${safe}\n${out}`);
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
    return out;
  },

  async getChat(): Promise<ChatMessage[]> {
    try { return getChatMessages(); } catch { /* fall back to in-memory */ }
    return [...cache().chat];
  },

  /** Runs a full check now, storing and broadcasting the result. */
  async checkForUpdate(): Promise<UpdateStatus> {
    const result = await runUpdateCheck({
      rconExec,
      restartContainer: () => containerAction("cs2", "restart"),
      // `status.players` is the humans count. A null status means we have not
      // polled yet, and `runUpdateCheck` treats that as "do not restart".
      playerCount: () => cache().status?.players ?? null,
      matchPhase: () => cache().match.phase,
      autoRestart: autoRestartEnabled(),
    });

    setUpdateStatus(result.update);
    if (result.restarted) {
      console.log("[update] CS2 update pending and server empty — restarting");
      setServerStatusState("starting");
    } else if (result.deferredReason) {
      console.log(`[update] update pending, deferred: ${result.deferredReason}`);
    }
    return result.update;
  },

  async getUpdateStatus(): Promise<UpdateStatus> {
    return cache().update ?? {
      installedVersion: null,
      requiredVersion: null,
      upToDate: null,
      checkedAt: null,
      autoRestart: autoRestartEnabled(),
      message: "No update check has run yet",
    };
  },

  /** Restarts the container, which re-runs `steamcmd app_update 730` on boot. */
  async applyUpdate(): Promise<void> {
    await containerAction("cs2", "restart");
    beginPendingOp("update");
    setServerStatusState("starting");
  },

  async getHistory(): Promise<MatchHistoryDetail[]> {
    try {
      // Hydrate each entry with its per-player scoreboard; returning an empty
      // `players` array left the match detail view permanently blank.
      return getMatches().map(
        (m) => getMatchDetail(m.id) ?? { ...m, players: [] },
      );
    } catch { return []; }
  },
};

/** `CS2_AUTO_UPDATE=1` lets the panel restart the container by itself. */
export function autoRestartEnabled(): boolean {
  return process.env.CS2_AUTO_UPDATE === "1";
}

/** Stores the latest check and pushes it to connected clients. */
export function setUpdateStatus(update: UpdateStatus): void {
  cache().update = update;
  bus.emit({ type: "server.update", update });
}

function setServerStatusState(state: ServerStatus["state"]): void {
  const s = cache().status;
  if (!s) return;
  const updated: ServerStatus = { ...s, state, pendingOp: cache().pendingOp };
  cache().status = updated;
  bus.emit({ type: "status.update", status: updated });
}
