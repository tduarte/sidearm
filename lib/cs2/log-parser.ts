import type { ChatMessage, ConsoleEvent, MatchPhase, Team, WsEvent } from "@/lib/api/types";

// CS2 log line format:
//   MM/DD/YYYY - HH:MM:SS.mmm - <message>
const LOG_LINE_RE = /^\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}\.\d{3} - (.+)$/;

// "Name<uid><STEAMID><TEAM>" say "message"
const CHAT_RE = /^"(.+?)<\d+><([^>]*)><([^>]*)>" say(?:_team)? "(.+)"$/;

// "Name<uid><STEAMID><TEAM>" connected, address "..."
const CONNECT_RE = /^"(.+?)<\d+><([^>]*)><[^>]*>" connected/;

// "Name<uid><STEAMID><TEAM>" disconnected (reason "...")
const DISCONNECT_RE = /^"(.+?)<\d+><([^>]*)><[^>]*>" disconnected/;

// "Name<uid><STEAMID><TEAM>" entered the game
const ENTERED_RE = /^"(.+?)<\d+><([^>]*)><[^>]*>" entered the game/;

// "Name<uid><STEAMID><TEAM>" killed "Name<uid><STEAMID><TEAM>" with "weapon"
const KILL_RE = /^"(.+?)<\d+><([^>]*)><([^>]*)>" killed "(.+?)<\d+><[^>]*><[^>]*>" with "([^"]+)"/;

// World triggered "Round_Start" / "Round_End" / "Match_Start" / "Game_Commencing"
const WORLD_TRIGGER_RE = /^World triggered "([^"]+)"/;

// Team triggered "SFUI_Notice_CTs_Win" / "SFUI_Notice_Terrorists_Win" / "SFUI_Notice_Target_Bombed" etc
const TEAM_TRIGGER_RE = /^Team "([^"]+)" triggered "([^"]+)"/;

// Map changes
const LOADING_MAP_RE = /^Loading map "([^"]+)"/;

function parseTeam(raw: string): Team {
  if (raw === "CT") return "CT";
  if (raw === "TERRORIST" || raw === "T") return "T";
  return "SPEC";
}

function makeConsoleEvent(level: ConsoleEvent["level"], source: string, message: string): ConsoleEvent {
  return { id: crypto.randomUUID(), ts: new Date().toISOString(), level, source, message };
}

function makeChatMessage(steamId: string, name: string, team: Team, message: string): ChatMessage {
  return { id: crypto.randomUUID(), ts: new Date().toISOString(), steamId, name, team, message };
}

export interface ParseResult {
  events: WsEvent[];
  consoleEvents: ConsoleEvent[];
  chatMessages: ChatMessage[];
}

export function parseLine(raw: string): ParseResult {
  const events: WsEvent[] = [];
  const consoleEvents: ConsoleEvent[] = [];
  const chatMessages: ChatMessage[] = [];

  const lineMatch = LOG_LINE_RE.exec(raw.trim());
  const line = lineMatch ? lineMatch[1] : raw.trim();

  if (!line) return { events, consoleEvents, chatMessages };

  // Chat
  const chat = CHAT_RE.exec(line);
  if (chat) {
    const [, name, steamId, teamRaw, message] = chat;
    const team = parseTeam(teamRaw);
    const msg = makeChatMessage(steamId || name, name, team, message);
    chatMessages.push(msg);
    events.push({ type: "chat.message", message: msg });
    const ev = makeConsoleEvent("chat", name, message);
    consoleEvents.push(ev);
    events.push({ type: "console.line", event: ev });
    return { events, consoleEvents, chatMessages };
  }

  // Player entered (join)
  const entered = ENTERED_RE.exec(line);
  if (entered) {
    const [, name, steamId] = entered;
    const ev = makeConsoleEvent("info", "server", `${name} entered the game`);
    consoleEvents.push(ev);
    events.push({ type: "console.line", event: ev });
    events.push({
      type: "player.join",
      player: { steamId: steamId || name, name, team: "SPEC", k: 0, d: 0, a: 0, ping: 0, connectedAt: new Date().toISOString() },
    });
    return { events, consoleEvents, chatMessages };
  }

  // Player disconnect
  const disconnect = DISCONNECT_RE.exec(line);
  if (disconnect) {
    const [, name, steamId] = disconnect;
    const ev = makeConsoleEvent("info", "server", `${name} disconnected`);
    consoleEvents.push(ev);
    events.push({ type: "console.line", event: ev });
    events.push({ type: "player.leave", steamId: steamId || name });
    return { events, consoleEvents, chatMessages };
  }

  // Kill
  const kill = KILL_RE.exec(line);
  if (kill) {
    const [, attackerName, , attackerTeamRaw, victimName, weapon] = kill;
    const ev = makeConsoleEvent("info", "game", `${attackerName} killed ${victimName} with ${weapon}`);
    consoleEvents.push(ev);
    events.push({ type: "console.line", event: ev });
    return { events, consoleEvents, chatMessages };
  }

  // World triggers → match phase
  const world = WORLD_TRIGGER_RE.exec(line);
  if (world) {
    const trigger = world[1];
    let phase: MatchPhase | null = null;
    if (trigger === "Round_Start") phase = "live";
    else if (trigger === "Match_Start" || trigger === "Game_Commencing") phase = "warmup";

    if (phase) {
      events.push({ type: "match.phase", phase });
    }
    const ev = makeConsoleEvent("info", "server", line);
    consoleEvents.push(ev);
    events.push({ type: "console.line", event: ev });
    return { events, consoleEvents, chatMessages };
  }

  // Team triggers → round end / score
  const teamTrigger = TEAM_TRIGGER_RE.exec(line);
  if (teamTrigger) {
    const ev = makeConsoleEvent("info", "server", line);
    consoleEvents.push(ev);
    events.push({ type: "console.line", event: ev });
    return { events, consoleEvents, chatMessages };
  }

  // Map change
  const mapLoad = LOADING_MAP_RE.exec(line);
  if (mapLoad) {
    const ev = makeConsoleEvent("info", "server", `Loading map: ${mapLoad[1]}`);
    consoleEvents.push(ev);
    events.push({ type: "console.line", event: ev });
    return { events, consoleEvents, chatMessages };
  }

  // Generic fallback — emit to console only
  const ev = makeConsoleEvent("info", "server", line);
  consoleEvents.push(ev);
  events.push({ type: "console.line", event: ev });
  return { events, consoleEvents, chatMessages };
}

export function parseLogBody(body: string): ParseResult {
  const all: ParseResult = { events: [], consoleEvents: [], chatMessages: [] };
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    const result = parseLine(line);
    all.events.push(...result.events);
    all.consoleEvents.push(...result.consoleEvents);
    all.chatMessages.push(...result.chatMessages);
  }
  return all;
}
