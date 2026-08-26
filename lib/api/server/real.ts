import type {
  ChatMessage,
  ConsoleEvent,
  MapEntry,
  MatchHistoryDetail,
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
import { OFFICIAL_MAPS } from "@/lib/api/mock";
import { insertChatMessage, getChatMessages } from "@/lib/db/chat";
import { getMatches, getMatchDetail } from "@/lib/db/matches";
import { getWorkshopMaps, upsertWorkshopMap } from "@/lib/db/maps";
import {
  assertCommandAllowed,
  assertValidMapName,
  assertWorkshopId,
  quoteArg,
  REDACTED,
  safeInt,
  safeToken,
} from "@/lib/cs2/sanitize";
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
  };
}
global.__cs2Cache ??= {
  status: null,
  players: [],
  match: {
    phase: "idle",
    score: { ct: 0, t: 0 },
    round: 0,
    maxRounds: 24,
    paused: false,
    demoRecording: false,
  },
  console: [],
  chat: [],
  workshopMaps: null,
  update: null,
  pendingWorkshopMap: null,
  pendingOp: null,
};

const cache = () => global.__cs2Cache;

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

export function updateCache(status: ServerStatus, players: Player[] | null) {
  resolveWorkshopMapName(status.map);

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

export function updateMatchState(match: Partial<MatchState>) {
  cache().match = { ...cache().match, ...match };
}

export function appendConsole(event: ConsoleEvent) {
  cache().console.push(event);
  if (cache().console.length > 500) cache().console.shift();
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
    return {
      identity: {
        hostname: cache().status?.hostname ?? "CS2 Server",
        tags: [],
        region: "local",
      },
      // Secrets are write-only. `GET /api/config` previously returned the live
      // RCON password and GSLT in plain JSON to any browser that asked.
      access: {
        serverPassword: REDACTED,
        rconPassword: REDACTED,
        gsltToken: REDACTED,
      },
      gameplay: {
        mode: cache().status?.gameMode ?? "competitive",
        tickrate: 64,
        maxPlayers: cache().status?.maxPlayers ?? 10,
        botsEnabled: false,
        botDifficulty: 1,
        botQuota: 0,
      },
      networking: {
        port: cache().status?.port ?? 27015,
        tvPort: 27020,
        workshopCollectionId: "",
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
      `sv_visiblemaxplayers ${safeInt(cfg.gameplay.maxPlayers, 1, 64, 10)}`,
      `bot_quota ${cfg.gameplay.botsEnabled ? safeInt(cfg.gameplay.botQuota, 0, 64, 0) : 0}`,
      `bot_difficulty ${safeInt(cfg.gameplay.botDifficulty, 0, 3, 1)}`,
    ];

    for (const cvar of cvars) await rconExec(cvar);

    const ev = makeConsoleEvent("info", "admin", "Config applied via RCON");
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });

    // Fields that cannot be hot-applied are reported back rather than silently
    // dropped: tickrate and maxplayers are launch arguments, and rotating the
    // GSLT or RCON password needs the container recreated.
    return {
      ...cfg,
      access: { serverPassword: REDACTED, rconPassword: REDACTED, gsltToken: REDACTED },
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

  async getMaps(): Promise<{ current: string; rotation: string[]; all: MapEntry[] }> {
    return {
      current: cache().status?.map ?? "unknown",
      rotation: [],
      all: [...workshopLibrary(), ...OFFICIAL_MAPS],
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
    const entry: MapEntry = {
      // Keep a filename already learned from an earlier play (see
      // `resolveWorkshopMapName`) rather than dropping back to the bare id.
      name:
        existing && workshopIdFromMapName(existing.name) === workshopId
          ? existing.name
          : workshopMapPath(workshopId),
      displayName:
        displayName?.trim().slice(0, 64) ||
        existing?.displayName ||
        `Workshop ${workshopId}`,
      type: "workshop",
      workshopId,
    };

    try { upsertWorkshopMap({ ...entry, workshopId }); } catch { /* non-critical */ }
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

  async setRotation(_rotation: string[]): Promise<void> {
    // Phase F will write mapcycle.txt
  },

  async getMatch(): Promise<MatchState> {
    return { ...cache().match };
  },

  async setMatchPhase(phase: MatchState["phase"]): Promise<MatchState> {
    const cmds: Record<string, string[]> = {
      warmup: ["mp_warmup_start"],
      live: ["mp_warmup_end", "mp_restartgame 3"],
      halftime: [],
      ended: ["mp_restartgame 1"],
      idle: [],
      knife: [],
    };
    for (const cmd of cmds[phase] ?? []) await rconExec(cmd);
    cache().match = { ...cache().match, phase };
    bus.emit({ type: "match.phase", phase });
    return { ...cache().match };
  },

  async togglePause(): Promise<MatchState> {
    await rconExec(cache().match.paused ? "mp_unpause_match" : "mp_pause_match");
    cache().match = { ...cache().match, paused: !cache().match.paused };
    return { ...cache().match };
  },

  async toggleDemo(): Promise<MatchState> {
    if (cache().match.demoRecording) {
      await rconExec("stop");
    } else {
      await rconExec(`record ${safeToken(`demo_${Date.now()}`)}`);
    }
    cache().match = { ...cache().match, demoRecording: !cache().match.demoRecording };
    return { ...cache().match };
  },

  async getConsole(): Promise<ConsoleEvent[]> {
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
