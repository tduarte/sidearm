import type {
  ChatMessage,
  ConsoleEvent,
  MapEntry,
  MatchHistoryDetail,
  MatchState,
  Player,
  ServerConfig,
  ServerStatus,
} from "../types";
import { rconExec } from "@/lib/cs2/rcon";
import { containerAction } from "@/lib/cs2/docker";
import { fetchStatus } from "@/lib/cs2/status";
import { bus } from "@/lib/ws/bus";
import { OFFICIAL_MAPS } from "@/lib/api/mock";

// Use Node.js global so the poll loop in server.ts and the Next.js API route
// handlers share the same state regardless of how modules are bundled.
declare global {
  // eslint-disable-next-line no-var
  var __cs2Cache: {
    status: ServerStatus | null;
    players: Player[];
    match: MatchState;
    console: ConsoleEvent[];
    chat: ChatMessage[];
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
};

const cache = () => global.__cs2Cache;

export function updateCache(status: ServerStatus, players: Player[]) {
  cache().status = status;
  cache().players = players;
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
      access: {
        serverPassword: process.env.SERVER_PASSWORD ?? "",
        rconPassword: process.env.RCON_PASSWORD ?? "",
        gsltToken: process.env.GSLT ?? "",
      },
      gameplay: {
        mode: "competitive",
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
    const cvars = [
      `hostname "${cfg.identity.hostname}"`,
      cfg.access.serverPassword
        ? `sv_password "${cfg.access.serverPassword}"`
        : `sv_password ""`,
      `mp_maxrounds ${cfg.gameplay.maxPlayers}`,
    ];
    for (const cvar of cvars) await rconExec(cvar);
    const ev = makeConsoleEvent("info", "admin", "Config applied via RCON");
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
    return cfg;
  },

  async getPlayers(): Promise<Player[]> {
    return [...cache().players];
  },

  async kick(steamId: string, reason?: string): Promise<void> {
    const cmd = reason ? `kickid ${steamId} "${reason}"` : `kickid ${steamId}`;
    await rconExec(cmd);
    cache().players = cache().players.filter((p) => p.steamId !== steamId);
    bus.emit({ type: "player.leave", steamId });
  },

  async getMaps(): Promise<{ current: string; rotation: string[]; all: MapEntry[] }> {
    return { current: cache().status?.map ?? "unknown", rotation: [], all: [...OFFICIAL_MAPS] };
  },

  async changeMap(name: string): Promise<void> {
    await rconExec(`changelevel ${name}`);
    const s = cache().status;
    if (s) {
      const updated = { ...s, map: name };
      cache().status = updated;
      bus.emit({ type: "status.update", status: updated });
    }
    bus.emit({ type: "match.phase", phase: "warmup" });
  },

  async subscribeWorkshop(workshopId: string, displayName?: string): Promise<MapEntry> {
    await rconExec(`host_workshop_collection ${workshopId}`);
    return {
      name: `workshop/${workshopId}/${displayName ?? "map"}`,
      displayName: displayName ?? `Workshop ${workshopId}`,
      type: "workshop",
      workshopId,
    };
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
      await rconExec(`record demo_${Date.now()}`);
    }
    cache().match = { ...cache().match, demoRecording: !cache().match.demoRecording };
    return { ...cache().match };
  },

  async getConsole(): Promise<ConsoleEvent[]> {
    return cache().console.slice(-500);
  },

  async rcon(command: string): Promise<string> {
    const out = await rconExec(command);
    const ev = makeConsoleEvent("info", "rcon", `> ${command}\n${out}`);
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
    return out;
  },

  async getChat(): Promise<ChatMessage[]> {
    return [...cache().chat];
  },

  async getHistory(): Promise<MatchHistoryDetail[]> {
    return [];
  },
};
