import type { ChatMessage, ConsoleEvent, MatchPhase, Team, WsEvent } from "@/lib/api/types";

/**
 * Parser for the CS2 HTTP log sink (`logaddress_add_http`).
 *
 * Line shape varies between builds, so the timestamp preamble is parsed
 * permissively: an optional Source-style `L ` prefix, optional milliseconds,
 * and either `-` or `:` separating the timestamp from the body. All of these
 * are accepted:
 *
 *   L 10/05/2024 - 12:34:56.789 - World triggered "Round_Start"
 *     10/05/2024 - 12:34:56.789 - World triggered "Round_Start"
 *   L 10/05/2024 - 12:34:56: World triggered "Round_Start"
 *
 * Anything that doesn't match a known pattern still surfaces as a console line,
 * so the `/console` tail never silently loses output.
 */

const LOG_LINE_RE =
  /^(?:L\s+)?(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?\s*[-:]\s*(.*)$/;

/** `"Name<userid><STEAMID><TEAM>"` — the token CS2 uses for every player reference. */
const PLAYER = `"(.+?)<(\\d+)><([^>]*)><([^>]*)>"`;
/** Optional world-position vector, e.g. ` [-100 200 64]`, present on combat lines. */
const POS = `(?:\\s*\\[[^\\]]*\\])?`;

const CHAT_RE = new RegExp(`^${PLAYER}\\s+say(_team)?\\s+"(.*)"$`);
const ENTERED_RE = new RegExp(`^${PLAYER}\\s+entered the game`);
const DISCONNECT_RE = new RegExp(`^${PLAYER}\\s+disconnected`);
const KILL_RE = new RegExp(
  `^${PLAYER}${POS}\\s+killed\\s+${PLAYER}${POS}\\s+with\\s+"([^"]+)"`,
);
const ASSIST_RE = new RegExp(`^${PLAYER}\\s+assisted\\s+killing\\s+${PLAYER}`);
/**
 * `"Neo<2><[U:1:1]><Unassigned>" switched from team <Unassigned> to <CT>`
 *
 * RCON `status` carries no team column, so the log stream is the only source of
 * team membership. Without this the roster is permanently all-SPEC.
 */
const TEAM_SWITCH_RE = new RegExp(
  `^${PLAYER}\\s+switched from team\\s+<([^>]*)>\\s+to\\s+<([^>]*)>`,
);

const WORLD_TRIGGER_RE = /^World triggered "([^"]+)"/;
const TEAM_TRIGGER_RE = /^Team "([^"]+)" triggered "([^"]+)"/;
const CT_SCORE_RE = /\(CT "(\d+)"\)/;
const T_SCORE_RE = /\(T "(\d+)"\)/;
/** `Game Over: competitive mg_active de_mirage score 16:14 after 45 min` */
const GAME_OVER_RE = /^Game Over:/;
const LOADING_MAP_RE = /^Loading map "([^"]+)"/;

/**
 * World triggers that move the match phase. `Round_End` is deliberately absent:
 * it fires every round, and treating it as the end of the match would close a
 * history record ~24 times per game. The real match terminator is `Game Over:`.
 */
const PHASE_TRIGGERS: Record<string, MatchPhase> = {
  Game_Commencing: "warmup",
  Match_Start: "live",
  Round_Start: "live",
};

function parseTeam(raw: string): Team {
  if (raw === "CT") return "CT";
  if (raw === "TERRORIST" || raw === "T") return "T";
  return "SPEC";
}

/**
 * Stable identity for a player reference. Prefers the SteamID; falls back to
 * the name when CS2 emits an empty one (it does, briefly, during connect).
 * Bots have the literal steamid `BOT` and carry no stable identity at all.
 */
function identity(steamId: string, name: string): { id: string; isBot: boolean } {
  const isBot = steamId === "BOT";
  return { id: isBot ? name : steamId || name, isBot };
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

  const trimmed = raw.trim();
  const lineMatch = LOG_LINE_RE.exec(trimmed);

  // Prefer the timestamp CS2 stamped on the line over wall-clock time: log
  // POSTs arrive batched, so wall clock would collapse a whole round onto one
  // instant and scramble ordering in the chat history.
  let ts = new Date().toISOString();
  let line = trimmed;
  if (lineMatch) {
    const [, mm, dd, yyyy, hh, min, sec, ms, body] = lineMatch;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(sec),
      ms ? Number(ms.padEnd(3, "0")) : 0,
    );
    if (!Number.isNaN(d.getTime())) ts = d.toISOString();
    line = body.trim();
  }

  const console_ = (level: ConsoleEvent["level"], source: string, message: string) => {
    const ev: ConsoleEvent = { id: crypto.randomUUID(), ts, level, source, message };
    consoleEvents.push(ev);
    events.push({ type: "console.line", event: ev });
    return ev;
  };

  if (!line) return { events, consoleEvents, chatMessages };

  // Chat ------------------------------------------------------------------
  const chat = CHAT_RE.exec(line);
  if (chat) {
    const [, name, , steamId, teamRaw, teamOnlySuffix, message] = chat;
    const { id } = identity(steamId, name);
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      ts,
      steamId: id,
      name,
      team: parseTeam(teamRaw),
      message,
      teamOnly: Boolean(teamOnlySuffix),
    };
    chatMessages.push(msg);
    events.push({ type: "chat.message", message: msg });
    console_("chat", name, message);
    return { events, consoleEvents, chatMessages };
  }

  // Join ------------------------------------------------------------------
  const entered = ENTERED_RE.exec(line);
  if (entered) {
    const [, name, userId, steamId, teamRaw] = entered;
    const { id, isBot } = identity(steamId, name);
    console_("info", "server", `${name} entered the game`);
    if (!isBot) {
      events.push({
        type: "player.join",
        player: {
          steamId: id,
          userId,
          name,
          team: parseTeam(teamRaw),
          k: 0,
          d: 0,
          a: 0,
          ping: 0,
          connectedAt: ts,
        },
      });
    }
    return { events, consoleEvents, chatMessages };
  }

  // Leave -----------------------------------------------------------------
  const disconnect = DISCONNECT_RE.exec(line);
  if (disconnect) {
    const [, name, , steamId] = disconnect;
    const { id, isBot } = identity(steamId, name);
    console_("info", "server", `${name} disconnected`);
    if (!isBot) events.push({ type: "player.leave", steamId: id });
    return { events, consoleEvents, chatMessages };
  }

  // Kill ------------------------------------------------------------------
  const kill = KILL_RE.exec(line);
  if (kill) {
    const [, aName, , aSteamId, , vName, , vSteamId, , weapon] = kill;
    console_("info", "game", `${aName} killed ${vName} with ${weapon}`);
    events.push({
      type: "player.kill",
      attackerSteamId: identity(aSteamId, aName).id,
      victimSteamId: identity(vSteamId, vName).id,
    });
    return { events, consoleEvents, chatMessages };
  }

  // Assist ----------------------------------------------------------------
  const assist = ASSIST_RE.exec(line);
  if (assist) {
    const [, aName, , aSteamId, , vName] = assist;
    console_("info", "game", `${aName} assisted killing ${vName}`);
    events.push({ type: "player.assist", steamId: identity(aSteamId, aName).id });
    return { events, consoleEvents, chatMessages };
  }

  // Team switch -----------------------------------------------------------
  const teamSwitch = TEAM_SWITCH_RE.exec(line);
  if (teamSwitch) {
    const [, name, , steamId, , , toTeam] = teamSwitch;
    const { id, isBot } = identity(steamId, name);
    console_("info", "server", `${name} joined ${parseTeam(toTeam)}`);
    if (!isBot) {
      events.push({ type: "player.team", steamId: id, team: parseTeam(toTeam) });
    }
    return { events, consoleEvents, chatMessages };
  }

  // Match end -------------------------------------------------------------
  if (GAME_OVER_RE.test(line)) {
    console_("info", "match", line);
    events.push({ type: "match.phase", phase: "ended" });
    return { events, consoleEvents, chatMessages };
  }

  // World triggers → phase ------------------------------------------------
  const world = WORLD_TRIGGER_RE.exec(line);
  if (world) {
    const phase = PHASE_TRIGGERS[world[1]];
    console_("info", "match", line);
    if (phase) events.push({ type: "match.phase", phase });
    return { events, consoleEvents, chatMessages };
  }

  // Team triggers → score -------------------------------------------------
  const teamTrigger = TEAM_TRIGGER_RE.exec(line);
  if (teamTrigger) {
    console_("info", "match", line);
    const ct = CT_SCORE_RE.exec(line);
    const t = T_SCORE_RE.exec(line);
    if (ct && t) {
      const score = { ct: Number(ct[1]), t: Number(t[1]) };
      events.push({ type: "match.score", score, round: score.ct + score.t });
    }
    return { events, consoleEvents, chatMessages };
  }

  // Map change ------------------------------------------------------------
  const mapLoad = LOADING_MAP_RE.exec(line);
  if (mapLoad) {
    console_("info", "server", `Loading map: ${mapLoad[1]}`);
    return { events, consoleEvents, chatMessages };
  }

  // Anything else still reaches the console tail.
  console_("info", "server", line);
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
