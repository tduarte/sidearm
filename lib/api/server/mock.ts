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
} from "../types";
import { addConsole, state } from "../mock";
import { bus } from "@/lib/ws/bus";

/**
 * Mock backend adapter. Mirrors the shape of `lib/api/client.ts` but runs
 * server-side — route handlers delegate here when `API_MODE !== 'real'`.
 *
 * No artificial latency (vs. the original in-process client) because real
 * network round-trip already provides a plausible delay.
 */
export const mockAdapter = {
  async getStatus(): Promise<ServerStatus> {
    return { ...state.status };
  },

  async setServerState(next: "running" | "stopped"): Promise<ServerStatus> {
    if (next === "running") {
      state.status.state = "starting";
      setTimeout(() => {
        state.status.state = "running";
        state.status.uptimeSec = 0;
        const ev = addConsole("info", "server", "Server started");
        bus.emit({ type: "console.line", event: ev });
        bus.emit({ type: "status.update", status: { ...state.status } });
      }, 800);
    } else {
      state.status.state = "stopping";
      setTimeout(() => {
        state.status.state = "stopped";
        state.status.players = 0;
        state.players = [];
        const ev = addConsole("warn", "server", "Server stopped by admin");
        bus.emit({ type: "console.line", event: ev });
        bus.emit({ type: "status.update", status: { ...state.status } });
      }, 800);
    }
    bus.emit({ type: "status.update", status: { ...state.status } });
    return { ...state.status };
  },

  async restart(): Promise<void> {
    await this.setServerState("stopped");
    setTimeout(() => {
      this.setServerState("running");
    }, 1200);
  },

  async getConfig(): Promise<ServerConfig> {
    return JSON.parse(JSON.stringify(state.config));
  },

  async putConfig(cfg: ServerConfig): Promise<ServerConfig> {
    state.config = cfg;
    state.status.hostname = cfg.identity.hostname;
    const ev = addConsole("info", "admin", "Config updated");
    bus.emit({ type: "console.line", event: ev });
    bus.emit({ type: "status.update", status: { ...state.status } });
    return JSON.parse(JSON.stringify(state.config));
  },

  async getPlayers(): Promise<Player[]> {
    return [...state.players];
  },

  async kick(steamId: string, reason?: string): Promise<void> {
    const p = state.players.find((x) => x.steamId === steamId);
    state.players = state.players.filter((x) => x.steamId !== steamId);
    state.status.players = state.players.length;
    const ev = addConsole(
      "warn",
      "admin",
      `Kicked ${p?.name ?? steamId}${reason ? `: ${reason}` : ""}`,
    );
    bus.emit({ type: "console.line", event: ev });
    bus.emit({ type: "player.leave", steamId });
    bus.emit({ type: "status.update", status: { ...state.status } });
  },

  async getMaps(): Promise<{
    current: string;
    rotation: string[];
    all: MapEntry[];
  }> {
    return {
      current: state.status.map,
      rotation: [...state.rotation],
      all: [...state.maps],
    };
  },

  async changeMap(name: string): Promise<void> {
    state.status.map = name;
    state.match.phase = "warmup";
    state.match.score = { ct: 0, t: 0 };
    state.match.round = 0;
    const ev = addConsole("info", "admin", `changelevel ${name}`);
    bus.emit({ type: "console.line", event: ev });
    bus.emit({ type: "status.update", status: { ...state.status } });
    bus.emit({ type: "match.phase", phase: state.match.phase });
  },

  async subscribeWorkshop(
    workshopId: string,
    displayName?: string,
  ): Promise<MapEntry> {
    const entry: MapEntry = {
      name: `workshop/${workshopId}/${displayName ?? "map"}`,
      displayName: displayName ?? `Workshop ${workshopId}`,
      type: "workshop",
      workshopId,
    };
    state.maps.push(entry);
    const ev = addConsole("info", "workshop", `Subscribed to ${workshopId}`);
    bus.emit({ type: "console.line", event: ev });
    return entry;
  },

  async setRotation(rotation: string[]): Promise<void> {
    state.rotation = rotation;
    const ev = addConsole("info", "admin", "Map rotation updated");
    bus.emit({ type: "console.line", event: ev });
  },

  async getMatch(): Promise<MatchState> {
    return { ...state.match };
  },

  async setMatchPhase(phase: MatchState["phase"]): Promise<MatchState> {
    state.match.phase = phase;
    if (phase === "warmup") {
      state.match.score = { ct: 0, t: 0 };
      state.match.round = 0;
    }
    const ev = addConsole("info", "match", `Phase → ${phase}`);
    bus.emit({ type: "console.line", event: ev });
    bus.emit({ type: "match.phase", phase });
    return { ...state.match };
  },

  async togglePause(): Promise<MatchState> {
    state.match.paused = !state.match.paused;
    const ev = addConsole(
      "info",
      "match",
      state.match.paused ? "Match paused" : "Match resumed",
    );
    bus.emit({ type: "console.line", event: ev });
    return { ...state.match };
  },

  async toggleDemo(): Promise<MatchState> {
    state.match.demoRecording = !state.match.demoRecording;
    const ev = addConsole(
      "info",
      "match",
      state.match.demoRecording
        ? "Demo recording started"
        : "Demo recording stopped",
    );
    bus.emit({ type: "console.line", event: ev });
    return { ...state.match };
  },

  async getConsole(): Promise<ConsoleEvent[]> {
    return state.console.slice(-500);
  },

  async rcon(command: string): Promise<string> {
    const echo = addConsole("info", "rcon", `> ${command}`);
    bus.emit({ type: "console.line", event: echo });
    const out = mockRconResponse(command);
    const reply = addConsole("info", "rcon", out);
    bus.emit({ type: "console.line", event: reply });
    return out;
  },

  async getChat(): Promise<ChatMessage[]> {
    return [...state.chat];
  },

  async getHistory(): Promise<MatchHistoryDetail[]> {
    return [...state.history];
  },

  async getUpdateStatus(): Promise<UpdateStatus> {
    return { ...mockUpdate };
  },

  async checkForUpdate(): Promise<UpdateStatus> {
    mockUpdate = { ...mockUpdate, checkedAt: new Date().toISOString() };
    bus.emit({ type: "server.update", update: { ...mockUpdate } });
    return { ...mockUpdate };
  },

  /**
   * Plays through a shortened version of the real thing — steamcmd progress
   * followed by srcds boot — so the updating UI can be demoed without a server.
   */
  async applyUpdate(): Promise<void> {
    let pct = 0;
    state.status.state = "updating";
    const tick = setInterval(() => {
      pct = Math.min(100, pct + 7);
      state.status.updateProgress = {
        phase: "downloading",
        pct,
        bytesDone: Math.round((pct / 100) * 71_089_555_502),
        bytesTotal: 71_089_555_502,
      };
      bus.emit({ type: "status.update", status: { ...state.status } });
      if (pct < 100) return;

      clearInterval(tick);
      state.status.updateProgress = null;
      state.status.state = "starting";
      bus.emit({ type: "status.update", status: { ...state.status } });
      setTimeout(() => {
        state.status.state = "running";
        mockUpdate = {
          ...mockUpdate,
          installedVersion: mockUpdate.requiredVersion,
          upToDate: true,
          checkedAt: new Date().toISOString(),
          message: "Server is up to date",
        };
        bus.emit({ type: "status.update", status: { ...state.status } });
        bus.emit({ type: "server.update", update: { ...mockUpdate } });
      }, 1500);
    }, 400);
  },
};

let mockUpdate: UpdateStatus = {
  installedVersion: 14_150,
  requiredVersion: 14_177,
  upToDate: false,
  checkedAt: new Date().toISOString(),
  autoRestart: false,
  message: "Server version required: 1.41.7.7",
};

function mockRconResponse(cmd: string): string {
  const c = cmd.trim().toLowerCase();
  if (c === "status") {
    return `hostname: ${state.status.hostname}\nmap: ${state.status.map}\nplayers: ${state.status.players}/${state.status.maxPlayers}`;
  }
  if (c.startsWith("mp_")) return `${c} updated`;
  if (c === "say_team") return "";
  if (c === "") return "";
  return `(ok) ${cmd}`;
}
