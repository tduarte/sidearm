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

// In-memory state — replaced each poll cycle
let cachedStatus: ServerStatus | null = null;
let cachedPlayers: Player[] = [];
let cachedMatch: MatchState = {
  phase: "idle",
  score: { ct: 0, t: 0 },
  round: 0,
  maxRounds: 24,
  paused: false,
  demoRecording: false,
};
let consoleRing: ConsoleEvent[] = [];
let chatHistory: ChatMessage[] = [];

export function updateCache(status: ServerStatus, players: Player[]) {
  cachedStatus = status;
  cachedPlayers = players;
}

export function updateMatchState(match: Partial<MatchState>) {
  cachedMatch = { ...cachedMatch, ...match };
}

export function appendConsole(event: ConsoleEvent) {
  consoleRing.push(event);
  if (consoleRing.length > 500) consoleRing.shift();
}

export function appendChat(msg: ChatMessage) {
  chatHistory.push(msg);
  if (chatHistory.length > 1000) chatHistory.shift();
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
    if (cachedStatus) return { ...cachedStatus };
    const { status } = await fetchStatus();
    cachedStatus = status;
    return { ...status };
  },

  async setServerState(next: "running" | "stopped"): Promise<ServerStatus> {
    const action = next === "running" ? "start" : "stop";
    await containerAction("cs2", action);
    const { status } = await fetchStatus();
    cachedStatus = { ...status, state: next === "running" ? "starting" : "stopping" };
    bus.emit({ type: "status.update", status: { ...cachedStatus } });
    return { ...cachedStatus };
  },

  async restart(): Promise<void> {
    await containerAction("cs2", "restart");
    if (cachedStatus) {
      cachedStatus = { ...cachedStatus, state: "starting" };
      bus.emit({ type: "status.update", status: { ...cachedStatus } });
    }
  },

  async getConfig(): Promise<ServerConfig> {
    // Config is write-only in Phase C; return defaults shaped from env
    return {
      identity: {
        hostname: cachedStatus?.hostname ?? "CS2 Server",
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
        maxPlayers: cachedStatus?.maxPlayers ?? 10,
        botsEnabled: false,
        botDifficulty: 1,
        botQuota: 0,
      },
      networking: {
        port: cachedStatus?.port ?? 27015,
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
    return [...cachedPlayers];
  },

  async kick(steamId: string, reason?: string): Promise<void> {
    const cmd = reason
      ? `kickid ${steamId} "${reason}"`
      : `kickid ${steamId}`;
    await rconExec(cmd);
    cachedPlayers = cachedPlayers.filter((p) => p.steamId !== steamId);
    bus.emit({ type: "player.leave", steamId });
  },

  async getMaps(): Promise<{
    current: string;
    rotation: string[];
    all: MapEntry[];
  }> {
    const current = cachedStatus?.map ?? "unknown";
    return { current, rotation: [], all: [] };
  },

  async changeMap(name: string): Promise<void> {
    await rconExec(`changelevel ${name}`);
    if (cachedStatus) {
      cachedStatus = { ...cachedStatus, map: name };
      bus.emit({ type: "status.update", status: { ...cachedStatus } });
    }
    bus.emit({ type: "match.phase", phase: "warmup" });
  },

  async subscribeWorkshop(
    workshopId: string,
    displayName?: string,
  ): Promise<MapEntry> {
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
    return { ...cachedMatch };
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
    cachedMatch = { ...cachedMatch, phase };
    bus.emit({ type: "match.phase", phase });
    return { ...cachedMatch };
  },

  async togglePause(): Promise<MatchState> {
    await rconExec(cachedMatch.paused ? "mp_unpause_match" : "mp_pause_match");
    cachedMatch = { ...cachedMatch, paused: !cachedMatch.paused };
    return { ...cachedMatch };
  },

  async toggleDemo(): Promise<MatchState> {
    if (cachedMatch.demoRecording) {
      await rconExec("stop");
    } else {
      const name = `demo_${Date.now()}`;
      await rconExec(`record ${name}`);
    }
    cachedMatch = { ...cachedMatch, demoRecording: !cachedMatch.demoRecording };
    return { ...cachedMatch };
  },

  async getConsole(): Promise<ConsoleEvent[]> {
    return consoleRing.slice(-500);
  },

  async rcon(command: string): Promise<string> {
    const out = await rconExec(command);
    const ev = makeConsoleEvent("info", "rcon", `> ${command}\n${out}`);
    appendConsole(ev);
    bus.emit({ type: "console.line", event: ev });
    return out;
  },

  async getChat(): Promise<ChatMessage[]> {
    return [...chatHistory];
  },

  async getHistory(): Promise<MatchHistoryDetail[]> {
    return [];
  },
};
