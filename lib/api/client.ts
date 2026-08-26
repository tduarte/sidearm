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
} from "./types";

/**
 * Browser-side API client. Every method maps to an `app/api/*` route handler;
 * the server dispatches to the mock or real adapter based on `API_MODE`.
 *
 * Kept hand-rolled rather than generated — the surface is small and the types
 * are already the source of truth.
 */

/** Thrown when the panel requires an admin token and we do not have one. */
export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.error ?? "";
    } catch {
      // ignore — use status text
    }
    throw new Error(
      detail || `${res.status} ${res.statusText} for ${path}`,
    );
  }
  // 204 handling
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const api = {
  /** Whether the panel is configured to require an admin token. */
  authStatus: () => request<{ authRequired: boolean }>("/api/auth"),

  /** Exchanges the admin token for a session cookie. */
  login: (token: string) => request<{ ok: true }>("/api/auth", json({ token })),

  getStatus: () => request<ServerStatus>("/api/status"),

  setServerState: (next: "running" | "stopped") =>
    request<ServerStatus>("/api/status/state", json({ next })),

  restart: async () => {
    await request<{ ok: true }>("/api/status/restart", { method: "POST" });
  },

  getConfig: () => request<ServerConfig>("/api/config"),

  putConfig: (cfg: ServerConfig) =>
    request<ServerConfig>("/api/config", {
      method: "PUT",
      body: JSON.stringify(cfg),
    }),

  getPlayers: () => request<Player[]>("/api/players"),

  kick: async (steamId: string, reason?: string) => {
    await request<{ ok: true }>(
      "/api/players/kick",
      json({ steamId, reason }),
    );
  },

  getMaps: () =>
    request<{ current: string; rotation: string[]; all: MapEntry[] }>(
      "/api/maps",
    ),

  changeMap: async (name: string) => {
    await request<{ ok: true }>("/api/maps/current", json({ name }));
  },

  subscribeWorkshop: (workshopId: string, displayName?: string) =>
    request<MapEntry>(
      "/api/maps/workshop",
      json({ workshopId, displayName }),
    ),

  setRotation: async (rotation: string[]) => {
    await request<{ ok: true }>("/api/maps/rotation", {
      method: "PUT",
      body: JSON.stringify({ rotation }),
    });
  },

  getMatch: () => request<MatchState>("/api/match"),

  setMatchPhase: (phase: MatchState["phase"]) =>
    request<MatchState>("/api/match/phase", json({ phase })),

  knife: (action: "setup" | "restore") =>
    request<MatchState>("/api/match/knife", json({ action })),

  swapTeams: () => request<MatchState>("/api/match/swap", json({})),

  setPause: (action: "pause" | "unpause") =>
    request<MatchState>("/api/match/pause", json({ action })),

  setDemo: (action: "start" | "stop") =>
    request<MatchState>("/api/match/demo", json({ action })),

  getConsole: () => request<ConsoleEvent[]>("/api/console"),

  rcon: async (command: string) => {
    const { output } = await request<{ output: string }>(
      "/api/rcon",
      json({ command }),
    );
    return output;
  },

  getChat: () => request<ChatMessage[]>("/api/chat"),

  getHistory: () => request<MatchHistoryDetail[]>("/api/history"),

  getUpdateStatus: () => request<UpdateStatus>("/api/updates"),

  checkForUpdate: () =>
    request<UpdateStatus>("/api/updates/check", { method: "POST" }),

  applyUpdate: async () => {
    await request<{ ok: true }>("/api/updates/apply", { method: "POST" });
  },
};
