import type {
  CvarGroup,
  CvarSnapshot,
  CvarState,
  ChatMessage,
  ConsoleEvent,
  MapEntry,
  MatchHistoryDetail,
  MatchState,
  Player,
  RoundRecord,
  ServerConfig,
  ServerStatus,
  UpdateStatus,
} from "../types";
import { addConsole, state } from "../mock";
import { bus } from "@/lib/ws/bus";
import { PRACTICE_READ_NAMES } from "@/lib/cs2/practice";
import type { RotationState } from "@/lib/cs2/rotation";
import { expiryFrom, type BanRecord } from "@/lib/cs2/bans";

/** Mock cvar values, so the Practice tab is exercisable without a server. */
const mockCvars: Record<string, string> = { sv_cheats: "0" };
import { workshopIdFromMapName, workshopMapPath } from "@/lib/cs2/workshop";
import { buildMatchConfig, type MatchDefinition } from "@/lib/cs2/match-config";
import type { StoredMatchConfig } from "@/lib/db/match-configs";
import type { RoundBackup } from "@/lib/cs2/round-backups";

/**
 * One saved match setup, so the form has something to show without a database.
 *
 * Steam ids are real-shaped rather than placeholders: the whole point of the
 * setup form is that it converts SteamID3 to Steam64, and a mock full of
 * `12345` would never exercise that.
 */
const mockRoundBackups: RoundBackup[] = [
  { round: 12, matchId: 2, mapNumber: 0, fileName: "matchzy_2_0_round12.json", savedAt: new Date(Date.now() - 60_000).toISOString() },
  { round: 11, matchId: 2, mapNumber: 0, fileName: "matchzy_2_0_round11.json", savedAt: new Date(Date.now() - 180_000).toISOString() },
  { round: 10, matchId: 2, mapNumber: 0, fileName: "matchzy_2_0_round10.json", savedAt: new Date(Date.now() - 300_000).toISOString() },
];

/**
 * The rounds behind the mock 7-5, so the live timeline has a shape to draw
 * without a server. The running score has to add up: the timeline shows each
 * round's score, and a sequence that disagrees with `state.match.score` is a
 * mock that teaches the wrong thing.
 */
const mockLiveRounds: RoundRecord[] = [
  { round: 1, winner: "CT", reason: "cts_win", score: { ct: 1, t: 0 } },
  { round: 2, winner: "CT", reason: "bomb_defused", score: { ct: 2, t: 0 } },
  { round: 3, winner: "T", reason: "target_bombed", score: { ct: 2, t: 1 } },
  { round: 4, winner: "CT", reason: "target_saved", score: { ct: 3, t: 1 } },
  { round: 5, winner: "T", reason: "terrorists_win", score: { ct: 3, t: 2 } },
  { round: 6, winner: "CT", reason: "cts_win", score: { ct: 4, t: 2 } },
  { round: 7, winner: "T", reason: "target_bombed", score: { ct: 4, t: 3 } },
  { round: 8, winner: "T", reason: "terrorists_win", score: { ct: 4, t: 4 } },
  { round: 9, winner: "CT", reason: "bomb_defused", score: { ct: 5, t: 4 } },
  { round: 10, winner: "CT", reason: "target_saved", score: { ct: 6, t: 4 } },
  { round: 11, winner: "T", reason: "target_bombed", score: { ct: 6, t: 5 } },
  { round: 12, winner: "CT", reason: "cts_win", score: { ct: 7, t: 5 } },
];

const mockMatchConfigs: StoredMatchConfig[] = [
  {
    id: "friday-scrim",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    loadedAt: null,
    definition: {
      id: "friday-scrim",
      matchNumber: 1,
      team1: {
        name: "Astra",
        players: [
          { steamId: "[U:1:22202]", name: "vex" },
          { steamId: "[U:1:22203]", name: "kori" },
        ],
      },
      team2: {
        name: "Nova",
        players: [
          { steamId: "[U:1:33301]", name: "brim" },
          { steamId: "[U:1:33302]", name: "sova" },
        ],
      },
      maps: ["de_mirage", "de_inferno", "de_nuke"],
      numMaps: 1,
      playersPerTeam: 5,
      minPlayersToReady: 1,
      skipVeto: false,
      clinchSeries: true,
      wingman: false,
    },
  },
];

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

  async banPlayer(
    steamId: string,
    minutes: number | null,
    reason?: string,
  ): Promise<BanRecord> {
    const player = state.players.find((p) => p.steamId === steamId);
    state.players = state.players.filter((p) => p.steamId !== steamId);
    const ban: BanRecord = {
      steamId,
      name: player?.name ?? steamId,
      reason: reason ?? null,
      bannedAt: new Date().toISOString(),
      expiresAt: expiryFrom(minutes),
    };
    state.bans = [ban, ...state.bans.filter((b) => b.steamId !== steamId)];
    bus.emit({ type: "player.leave", steamId });
    return ban;
  },

  async unbanPlayer(steamId: string): Promise<void> {
    state.bans = state.bans.filter((b) => b.steamId !== steamId);
  },

  async getBans(): Promise<BanRecord[]> {
    return [...state.bans];
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
    const workshopId = workshopIdFromMapName(name);
    const ev = addConsole(
      "info",
      "admin",
      workshopId ? `host_workshop_map ${workshopId}` : `changelevel ${name}`,
    );
    bus.emit({ type: "console.line", event: ev });
    bus.emit({ type: "status.update", status: { ...state.status } });
    bus.emit({ type: "match.phase", phase: state.match.phase });
  },

  async subscribeWorkshop(
    workshopId: string,
    displayName?: string,
  ): Promise<MapEntry> {
    const entry: MapEntry = {
      // The real filename is only knowable once the server has downloaded the
      // map, so the id alone is the identifier. See lib/cs2/workshop.ts.
      name: workshopMapPath(workshopId),
      displayName: displayName ?? `Workshop ${workshopId}`,
      type: "workshop",
      workshopId,
    };
    state.maps.push(entry);
    const ev = addConsole(
      "info",
      "workshop",
      `Added workshop map ${workshopId}; it downloads on first play`,
    );
    bus.emit({ type: "console.line", event: ev });
    return entry;
  },

  async unsubscribeWorkshop(workshopId: string): Promise<void> {
    state.maps = state.maps.filter((m) => m.workshopId !== workshopId);
    addConsole("info", "admin", `Workshop map ${workshopId} removed`);
  },

  async setRotation(rotation: string[]): Promise<void> {
    state.rotation = rotation;
  },

  async getRotation(): Promise<RotationState> {
    return { enabled: state.rotationEnabled ?? false, maps: state.rotation };
  },

  async putRotation(next: Partial<RotationState>): Promise<RotationState> {
    if (next.maps) state.rotation = next.maps;
    if (next.enabled !== undefined) state.rotationEnabled = next.enabled;
    return { enabled: state.rotationEnabled ?? false, maps: state.rotation };
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

  async getCvars(group: CvarGroup): Promise<CvarSnapshot> {
    const readAt = new Date().toISOString();
    return {
      group,
      cvars: PRACTICE_READ_NAMES.map((name) => ({
        name,
        value: mockCvars[name] ?? "0",
        supported: true,
        baseline: null,
        readAt,
      })),
      readAt,
    };
  },

  async setCvar(name: string, value: string): Promise<CvarState> {
    mockCvars[name] = value;
    return {
      name,
      value,
      supported: true,
      baseline: null,
      readAt: new Date().toISOString(),
    };
  },

  async knife(action: "setup" | "restore"): Promise<MatchState> {
    state.match.knifeSetupApplied = action === "setup";
    addConsole(
      "info",
      "admin",
      action === "setup" ? "Knife round cvars applied" : "Knife cvars restored",
    );
    return { ...state.match };
  },

  async swapTeams(): Promise<MatchState> {
    const { ct, t } = state.match.score;
    state.match.score = { ct: t, t: ct };
    addConsole("info", "admin", "Teams swapped (mp_swapteams)");
    bus.emit({ type: "match.score", score: state.match.score, round: state.match.round });
    return { ...state.match };
  },

  async setPause(action: "pause" | "unpause"): Promise<MatchState> {
    state.match.pause = action === "pause" ? "pause_requested" : "running";
    addConsole(
      "info",
      "admin",
      action === "pause" ? "Match pause requested" : "Match resumed",
    );
    bus.emit({ type: "match.phase", phase: state.match.phase });
    return { ...state.match };
  },

  async setDemo(action: "start" | "stop"): Promise<MatchState> {
    const name = action === "start" ? `sidearm_${state.status.map}_mock` : state.match.demo.name;
    state.match.demo = {
      state: action === "start" ? "recording" : "idle",
      name: name ?? null,
    };
    addConsole(
      "info",
      "admin",
      action === "start" ? `Recording ${name}` : "Recording stopped",
    );
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

  async getMatchConfigs(): Promise<StoredMatchConfig[]> {
    return [...mockMatchConfigs];
  },

  async saveMatch(def: MatchDefinition): Promise<{ warnings: string[] }> {
    const prior = mockMatchConfigs.find((m) => m.id === def.id);
    // The form sends matchNumber: 0 to mean "assign one" — it is a number, not
    // null, so `??` would keep the 0 and validation would reject the save.
    def = {
      ...def,
      matchNumber:
        prior?.definition.matchNumber ??
        (Number.isInteger(def.matchNumber) && def.matchNumber >= 1
          ? def.matchNumber
          : Math.max(0, ...mockMatchConfigs.map((m) => m.definition.matchNumber)) + 1),
    };
    // Validated in mock too: the form's error handling is a real code path and
    // a mock that accepts anything hides it.
    const { config, errors, warnings } = buildMatchConfig(def);
    if (!config) throw new Error(errors.join(" "));

    const existing = mockMatchConfigs.findIndex((m) => m.id === def.id);
    const row: StoredMatchConfig = {
      id: def.id,
      createdAt:
        existing >= 0 ? mockMatchConfigs[existing].createdAt : new Date().toISOString(),
      loadedAt: existing >= 0 ? mockMatchConfigs[existing].loadedAt : null,
      definition: def,
    };
    if (existing >= 0) mockMatchConfigs[existing] = row;
    else mockMatchConfigs.unshift(row);
    return { warnings };
  },

  async loadMatch(id: string): Promise<void> {
    const row = mockMatchConfigs.find((m) => m.id === id);
    if (!row) throw new Error(`No match setup called ${id}.`);
    row.loadedAt = new Date().toISOString();
    // Loading a match puts MatchZy into warmup waiting for players to ready —
    // the same transition the real server makes, so the UI can be seen doing it.
    state.match = { ...state.match, matchzyState: "warmup", phase: "warmup" };
    bus.emit({ type: "match.phase", phase: "warmup" });
  },

  async endMatchZyMatch(): Promise<void> {
    state.match = { ...state.match, matchzyState: "none", phase: "idle" };
    bus.emit({ type: "match.phase", phase: "idle" });
  },

  async forceStartMatch(): Promise<void> {
    state.match = { ...state.match, matchzyState: "live", phase: "live" };
    bus.emit({ type: "match.phase", phase: "live" });
  },

  async getRoundBackups(): Promise<RoundBackup[]> {
    return mockRoundBackups;
  },

  async restoreRound(round: number): Promise<void> {
    state.match = { ...state.match, round, matchzyState: "live" };
    // A restore un-plays the rounds after it, and the timeline reads from
    // here — leaving them would show a match that is ahead of its own score.
    const kept = mockLiveRounds.filter((r) => r.round < round);
    mockLiveRounds.length = 0;
    mockLiveRounds.push(...kept);
  },

  async getLiveRounds(): Promise<RoundRecord[]> {
    return [...mockLiveRounds];
  },

  async deleteMatchConfig(id: string): Promise<void> {
    const i = mockMatchConfigs.findIndex((m) => m.id === id);
    if (i >= 0) mockMatchConfigs.splice(i, 1);
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
    // About what the real thing sustains, so the demo's ETA is plausible
    // rather than a number that counts down in step with the fake progress.
    const BYTES_PER_SEC = 14 * 1024 ** 2;
    const tick = setInterval(() => {
      pct = Math.min(100, pct + 7);
      const bytesDone = Math.round((pct / 100) * 71_089_555_502);
      state.status.updateProgress = {
        phase: "downloading",
        pct,
        bytesDone,
        bytesTotal: 71_089_555_502,
        bytesPerSec: BYTES_PER_SEC,
        etaSec: Math.round((71_089_555_502 - bytesDone) / BYTES_PER_SEC),
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
