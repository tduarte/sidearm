import type { RotationState } from "@/lib/cs2/rotation";
import type { BanRecord } from "@/lib/cs2/bans";
import type { DemoFile } from "@/lib/cs2/demos";
import type { MatchDefinition } from "@/lib/cs2/match-config";
import type { StoredMatchConfig } from "@/lib/db/match-configs";
import type { RoundBackup } from "@/lib/cs2/round-backups";
import type { Role } from "@/lib/auth/permissions";
import type {
  ChatMessage,
  CvarGroup,
  CvarSnapshot,
  CvarState,
  ConsoleEvent,
  MapEntry,
  MatchHistoryDetail,
  MatchState,
  Player,
  RoundRecord,
  ServerConfig,
  ServerStatus,
  UpdateStatus,
} from "./types";

export type SessionUser = { id: string; username: string; role: Role };

export type PanelUser = {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
  disabled: boolean;
};

/**
 * Browser-side API client. Every method maps to an `app/api/*` route handler;
 * the server dispatches to the mock or real adapter based on `API_MODE`.
 *
 * Kept hand-rolled rather than generated — the surface is small and the types
 * are already the source of truth.
 */

/** Thrown when nobody is signed in, so the gate should ask for credentials. */
export class UnauthorizedError extends Error {
  /** `first-run` means the panel has no accounts yet and wants registration. */
  readonly code: "unauthenticated" | "first-run";
  constructor(code: "unauthenticated" | "first-run" = "unauthenticated") {
    super(code);
    this.name = "UnauthorizedError";
    this.code = code;
  }
}

/**
 * Thrown when the caller *is* signed in but their role does not reach the
 * action.
 *
 * Distinct from `UnauthorizedError` on purpose: signing in again cannot fix a
 * 403, so the gate must not react to one by throwing up a login form. The
 * message from the server names the role required.
 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
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
  if (!res.ok) {
    let detail = "";
    let code = "";
    try {
      const j = await res.json();
      detail = j.error ?? "";
      code = j.code ?? "";
    } catch {
      // ignore — use status text
    }
    if (res.status === 401) {
      throw new UnauthorizedError(code === "first-run" ? "first-run" : "unauthenticated");
    }
    if (res.status === 403) {
      throw new ForbiddenError(detail || "You are not allowed to do that.");
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
  /** Who this browser is, and which gate screen to show if nobody. */
  authStatus: () =>
    request<{
      firstRun: boolean;
      tokenConfigured: boolean;
      user: SessionUser | null;
      role: Role | null;
      source: "session" | "token" | "trusted-peer" | null;
    }>("/api/auth"),

  logout: () => request<{ ok: true }>("/api/auth", { method: "DELETE" }),

  login: (username: string, password: string) =>
    request<{ ok: true; user: SessionUser }>(
      "/api/auth/login",
      json({ username, password }),
    ),

  /** Claims an unclaimed panel. Only works while no accounts exist. */
  register: (input: { username: string; password: string; setupToken?: string }) =>
    request<{ ok: true; user: SessionUser }>("/api/auth/register", json(input)),

  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>(
      "/api/auth/password",
      json({ currentPassword, newPassword }),
    ),

  listUsers: () => request<{ users: PanelUser[] }>("/api/users"),

  createUser: (input: { username: string; password: string; role: Role }) =>
    request<{ user: PanelUser }>("/api/users", json(input)),

  updateUser: (
    id: string,
    patch: { role?: Role; password?: string; disabled?: boolean },
  ) =>
    request<{ user: PanelUser }>(`/api/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteUser: (id: string) =>
    request<{ ok: true }>(`/api/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

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

  banPlayer: (steamId: string, minutes: number | null, reason?: string) =>
    request<BanRecord>("/api/players/ban", json({ steamId, minutes, reason })),

  unbanPlayer: (steamId: string) =>
    request<void>(`/api/players/ban?steamId=${encodeURIComponent(steamId)}`, {
      method: "DELETE",
    }),

  getBans: () => request<BanRecord[]>("/api/players/ban"),

  getDemos: () => request<DemoFile[]>("/api/demos"),

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

  unsubscribeWorkshop: (id: string) =>
    request<void>(`/api/maps/workshop?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  getRotation: () => request<RotationState>("/api/maps/rotation"),

  putRotation: (next: { enabled?: boolean; maps?: string[] }) =>
    request<RotationState>("/api/maps/rotation", {
      method: "PUT",
      body: JSON.stringify(next),
    }),

  getMatch: () => request<MatchState>("/api/match"),

  setMatchPhase: (phase: MatchState["phase"]) =>
    request<MatchState>("/api/match/phase", json({ phase })),

  getCvars: (group: CvarGroup) =>
    request<CvarSnapshot>(`/api/match/cvars?group=${encodeURIComponent(group)}`),

  setCvar: (name: string, value: string) =>
    request<CvarState>("/api/match/cvars", json({ name, value })),

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

  getMatchConfigs: () => request<StoredMatchConfig[]>("/api/matches"),

  forceStartMatch: async () => {
    await request<{ ok: true }>("/api/match/start", json({}));
  },

  getRoundBackups: () => request<RoundBackup[]>("/api/match/backups"),

  getLiveRounds: () => request<RoundRecord[]>("/api/match/rounds"),

  restoreRound: async (round: number) => {
    await request<{ ok: true }>("/api/match/restore", json({ round }));
  },

  saveMatch: (def: MatchDefinition) =>
    request<{ warnings: string[] }>("/api/matches", json(def)),

  loadMatch: async (id: string) => {
    await request<{ ok: true }>(`/api/matches/${encodeURIComponent(id)}/load`, {
      method: "POST",
    });
  },

  endMatch: async () => {
    await request<{ ok: true }>("/api/matches/end", { method: "POST" });
  },

  deleteMatch: async (id: string) => {
    await request<{ ok: true }>(`/api/matches/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  getUpdateStatus: () => request<UpdateStatus>("/api/updates"),

  checkForUpdate: () =>
    request<UpdateStatus>("/api/updates/check", { method: "POST" }),

  applyUpdate: async () => {
    await request<{ ok: true }>("/api/updates/apply", { method: "POST" });
  },
};
