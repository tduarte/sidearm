import type {
  ChatMessage,
  ConsoleEvent,
  MapEntry,
  MatchHistoryDetail,
  MatchState,
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

export function updateCache(status: ServerStatus, players: Player[] | null) {
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
    const { status } = await fetchStatus();
    const updated: ServerStatus = { ...status, state: next === "running" ? "starting" : "stopping" };
    cache().status = updated;
    bus.emit({ type: "status.update", status: updated });
    return updated;
  },

  async restart(): Promise<void> {
    await containerAction("cs2", "restart");
    const s = cache().status;
    if (s) {
      const updated = { ...s, state: "starting" as const };
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
    if (cache().workshopMaps === null) {
      try { cache().workshopMaps = getWorkshopMaps(); } catch { cache().workshopMaps = []; }
    }
    return {
      current: cache().status?.map ?? "unknown",
      rotation: [],
      all: [...(cache().workshopMaps ?? []), ...OFFICIAL_MAPS],
    };
  },

  async changeMap(name: string): Promise<void> {
    const map = assertValidMapName(name);
    await rconExec(`changelevel ${map}`);
    const s = cache().status;
    if (s) {
      const updated = { ...s, map };
      cache().status = updated;
      bus.emit({ type: "status.update", status: updated });
    }
    bus.emit({ type: "match.phase", phase: "warmup" });
  },

  async subscribeWorkshop(workshopId: string, displayName?: string): Promise<MapEntry> {
    workshopId = assertWorkshopId(workshopId);
    const entry: MapEntry = {
      name: `workshop/${workshopId}/${safeToken(displayName ?? "map", 64) || "map"}`,
      displayName: displayName ?? `Workshop ${workshopId}`,
      type: "workshop",
      workshopId,
    };
    try { upsertWorkshopMap({ ...entry, workshopId }); } catch { /* non-critical */ }
    if (cache().workshopMaps === null) {
      try { cache().workshopMaps = getWorkshopMaps(); } catch { cache().workshopMaps = []; }
    }
    const list = cache().workshopMaps ?? [];
    const idx = list.findIndex((m) => m.workshopId === workshopId);
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    cache().workshopMaps = list;
    const ev = makeConsoleEvent("info", "workshop", `Subscribed to ${workshopId}`);
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
  const updated: ServerStatus = { ...s, state };
  cache().status = updated;
  bus.emit({ type: "status.update", status: updated });
}
