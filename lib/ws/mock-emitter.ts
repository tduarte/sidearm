"use client";

import { addChat, addConsole, nextId, state } from "@/lib/api/mock";
import type { ConsoleEvent, Player, Team } from "@/lib/api/types";
import { bus } from "./bus";

let started = false;

const LOG_LINES: Array<{ level: ConsoleEvent["level"]; source: string; msg: string }> = [
  { level: "info", source: "engine", msg: "net_channels_ok" },
  { level: "info", source: "server", msg: "Sending heartbeat to master" },
  { level: "info", source: "gc", msg: "Game coordinator ping 34ms" },
  { level: "warn", source: "net", msg: "packet loss detected for 1 client" },
  { level: "info", source: "match", msg: "Round_End: CT bomb defused" },
  { level: "info", source: "match", msg: "Round_Start" },
];

const CHAT_LINES = [
  "nt",
  "gg",
  "rotate B",
  "push A",
  "one left",
  "save",
  "eco round",
  "force buy",
  "go go go",
  "nice",
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(current: number, delta: number, min: number, max: number) {
  const next = current + (Math.random() * 2 - 1) * delta;
  return Math.max(min, Math.min(max, Math.round(next)));
}

export function startMockEmitter() {
  if (started) return;
  started = true;

  // 1s: status/stats jitter + uptime
  setInterval(() => {
    if (state.status.state !== "running") return;
    state.status.uptimeSec += 1;
    state.status.cpuPct = jitter(state.status.cpuPct, 4, 8, 78);
    state.status.memMb = jitter(state.status.memMb, 30, 1200, state.status.memMaxMb - 200);
    state.status.fps = jitter(state.status.fps, 3, 90, 128);
    bus.emit({ type: "status.update", status: { ...state.status } });
  }, 1000);

  // 2–4s: console line
  (function tickConsole() {
    const wait = 2000 + Math.random() * 2000;
    setTimeout(() => {
      if (state.status.state === "running") {
        const { level, source, msg } = randomItem(LOG_LINES);
        const ev = addConsole(level, source, msg);
        bus.emit({ type: "console.line", event: ev });
      }
      tickConsole();
    }, wait);
  })();

  // 5–10s: chat
  (function tickChat() {
    const wait = 5000 + Math.random() * 5000;
    setTimeout(() => {
      if (state.status.state === "running" && state.players.length > 0) {
        const p = randomItem(state.players);
        const m = addChat({
          steamId: p.steamId,
          name: p.name,
          team: p.team,
          message: randomItem(CHAT_LINES),
        });
        bus.emit({ type: "chat.message", message: m });
        bus.emit({
          type: "console.line",
          event: {
            id: nextId(),
            ts: m.ts,
            level: "chat",
            source: p.team,
            message: `${p.name}: ${m.message}`,
            player: { steamId: p.steamId, name: p.name, team: p.team },
          },
        });
      }
      tickChat();
    }, wait);
  })();

  // 8s: match score progression when live
  setInterval(() => {
    if (state.status.state !== "running") return;
    if (state.match.phase !== "live" || state.match.paused) return;
    const winner: Team = Math.random() > 0.5 ? "CT" : "T";
    if (winner === "CT") state.match.score.ct++;
    else state.match.score.t++;
    state.match.round++;
    if (state.match.score.ct + state.match.score.t >= state.match.maxRounds) {
      state.match.phase = "ended";
      bus.emit({ type: "match.phase", phase: "ended" });
    }
    bus.emit({
      type: "match.score",
      score: { ...state.match.score },
      round: state.match.round,
    });
  }, 8000);

  // 30s: player churn
  setInterval(() => {
    if (state.status.state !== "running") return;
    if (Math.random() > 0.5 && state.players.length > 2) {
      const removed = state.players.pop()!;
      state.status.players = state.players.length;
      bus.emit({ type: "player.leave", steamId: removed.steamId });
      addConsole("info", "server", `${removed.name} disconnected`);
    } else if (state.players.length < state.config.gameplay.maxPlayers) {
      const idx = state.players.length;
      const p: Player = {
        steamId: `7656119800099${String(idx).padStart(4, "0")}`,
        name: `guest_${Math.floor(Math.random() * 999)}`,
        team: state.players.filter((p) => p.team === "CT").length <= state.players.filter((p) => p.team === "T").length ? "CT" : "T",
        k: 0,
        d: 0,
        a: 0,
        ping: 20 + Math.floor(Math.random() * 60),
        connectedAt: new Date().toISOString(),
      };
      state.players.push(p);
      state.status.players = state.players.length;
      bus.emit({ type: "player.join", player: p });
      addConsole("info", "server", `${p.name} connected`);
    }
  }, 30000);
}
