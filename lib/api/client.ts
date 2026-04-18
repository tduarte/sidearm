import type {
  ChatMessage,
  ConsoleEvent,
  MapEntry,
  MatchHistoryDetail,
  MatchState,
  Player,
  ServerConfig,
  ServerStatus,
} from "./types";
import { addConsole, state } from "./mock";

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms));

export const api = {
  async getStatus(): Promise<ServerStatus> {
    await delay();
    return { ...state.status };
  },

  async setServerState(
    next: "running" | "stopped",
  ): Promise<ServerStatus> {
    await delay(200);
    if (next === "running") {
      state.status.state = "starting";
      setTimeout(() => {
        state.status.state = "running";
        state.status.uptimeSec = 0;
        addConsole("info", "server", "Server started");
      }, 800);
    } else {
      state.status.state = "stopping";
      setTimeout(() => {
        state.status.state = "stopped";
        state.status.players = 0;
        state.players = [];
        addConsole("warn", "server", "Server stopped by admin");
      }, 800);
    }
    return { ...state.status };
  },

  async restart(): Promise<void> {
    await this.setServerState("stopped");
    setTimeout(() => this.setServerState("running"), 1200);
  },

  async getConfig(): Promise<ServerConfig> {
    await delay();
    return JSON.parse(JSON.stringify(state.config));
  },

  async putConfig(cfg: ServerConfig): Promise<ServerConfig> {
    await delay();
    state.config = cfg;
    addConsole("info", "admin", "Config updated");
    return JSON.parse(JSON.stringify(state.config));
  },

  async getPlayers(): Promise<Player[]> {
    await delay();
    return [...state.players];
  },

  async kick(steamId: string, reason?: string): Promise<void> {
    await delay();
    const p = state.players.find((x) => x.steamId === steamId);
    state.players = state.players.filter((x) => x.steamId !== steamId);
    state.status.players = state.players.length;
    addConsole(
      "warn",
      "admin",
      `Kicked ${p?.name ?? steamId}${reason ? `: ${reason}` : ""}`,
    );
  },

  async getMaps(): Promise<{
    current: string;
    rotation: string[];
    all: MapEntry[];
  }> {
    await delay();
    return {
      current: state.status.map,
      rotation: [...state.rotation],
      all: [...state.maps],
    };
  },

  async changeMap(name: string): Promise<void> {
    await delay(200);
    state.status.map = name;
    state.match.phase = "warmup";
    state.match.score = { ct: 0, t: 0 };
    state.match.round = 0;
    addConsole("info", "admin", `changelevel ${name}`);
  },

  async subscribeWorkshop(
    workshopId: string,
    displayName?: string,
  ): Promise<MapEntry> {
    await delay(300);
    const entry: MapEntry = {
      name: `workshop/${workshopId}/${displayName ?? "map"}`,
      displayName: displayName ?? `Workshop ${workshopId}`,
      type: "workshop",
      workshopId,
    };
    state.maps.push(entry);
    addConsole("info", "workshop", `Subscribed to ${workshopId}`);
    return entry;
  },

  async setRotation(rotation: string[]): Promise<void> {
    await delay();
    state.rotation = rotation;
    addConsole("info", "admin", "Map rotation updated");
  },

  async getMatch(): Promise<MatchState> {
    await delay();
    return { ...state.match };
  },

  async setMatchPhase(phase: MatchState["phase"]): Promise<MatchState> {
    await delay();
    state.match.phase = phase;
    if (phase === "warmup") {
      state.match.score = { ct: 0, t: 0 };
      state.match.round = 0;
    }
    addConsole("info", "match", `Phase → ${phase}`);
    return { ...state.match };
  },

  async togglePause(): Promise<MatchState> {
    await delay();
    state.match.paused = !state.match.paused;
    addConsole(
      "info",
      "match",
      state.match.paused ? "Match paused" : "Match resumed",
    );
    return { ...state.match };
  },

  async toggleDemo(): Promise<MatchState> {
    await delay();
    state.match.demoRecording = !state.match.demoRecording;
    addConsole(
      "info",
      "match",
      state.match.demoRecording
        ? "Demo recording started"
        : "Demo recording stopped",
    );
    return { ...state.match };
  },

  async getConsole(): Promise<ConsoleEvent[]> {
    await delay();
    return state.console.slice(-500);
  },

  async rcon(command: string): Promise<string> {
    await delay(120);
    addConsole("info", "rcon", `> ${command}`);
    const out = mockRconResponse(command);
    addConsole("info", "rcon", out);
    return out;
  },

  async getChat(): Promise<ChatMessage[]> {
    await delay();
    return [...state.chat];
  },

  async getHistory(): Promise<MatchHistoryDetail[]> {
    await delay();
    return [...state.history];
  },
};

function mockRconResponse(cmd: string): string {
  const c = cmd.trim().toLowerCase();
  if (c === "status") {
    return `hostname: ${state.config.identity.hostname}\nmap: ${state.status.map}\nplayers: ${state.status.players}/${state.status.maxPlayers}`;
  }
  if (c.startsWith("mp_")) return `${c} updated`;
  if (c === "say_team") return "";
  if (c === "") return "";
  return `(ok) ${cmd}`;
}
