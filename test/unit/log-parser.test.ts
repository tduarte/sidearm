import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLine, parseLogBody } from "@/lib/cs2/log-parser";
import type { ChatMessage, WsEvent } from "@/lib/api/types";

/**
 * Regression corpus for the CS2 HTTP log sink.
 *
 * Source-engine log lines are conventionally prefixed with `L ` and use
 * `MM/DD/YYYY - HH:MM:SS` with optional milliseconds. The exact shape CS2 puts
 * on the wire is confirmed against a live server in Tier 3 of the test plan;
 * until then the parser is deliberately tolerant of every observed variant so
 * that whichever one CS2 actually emits, structured events still come out.
 */

const PREFIXES = [
  ["with 'L ' prefix + millis", `L 10/05/2024 - 12:34:56.789 - `],
  ["bare + millis", `10/05/2024 - 12:34:56.789 - `],
  ["with 'L ' prefix, legacy colon, no millis", `L 10/05/2024 - 12:34:56: `],
  ["bare, legacy colon, no millis", `10/05/2024 - 12:34:56: `],
] as const;

function pick<T extends WsEvent["type"]>(
  events: WsEvent[],
  type: T,
): Extract<WsEvent, { type: T }> | undefined {
  return events.find((e) => e.type === type) as
    | Extract<WsEvent, { type: T }>
    | undefined;
}

describe("timestamp prefix tolerance", () => {
  for (const [label, prefix] of PREFIXES) {
    it(`parses chat ${label}`, () => {
      const { events, chatMessages } = parseLine(
        `${prefix}"Neo<2><[U:1:12345]><CT>" say "hello team"`,
      );
      assert.equal(chatMessages.length, 1, "expected one chat message");
      assert.equal(chatMessages[0].message, "hello team");
      assert.equal(chatMessages[0].name, "Neo");
      assert.equal(chatMessages[0].steamId, "[U:1:12345]");
      assert.equal(chatMessages[0].team, "CT");
      assert.ok(pick(events, "chat.message"), "expected a chat.message event");
    });
  }

  it("uses the timestamp from the log line, not wall clock", () => {
    const { chatMessages } = parseLine(
      `L 10/05/2024 - 12:34:56.789 - "Neo<2><[U:1:1]><CT>" say "hi"`,
    );
    const ts = new Date(chatMessages[0].ts);
    assert.equal(ts.getFullYear(), 2024);
    assert.equal(ts.getMonth(), 9); // October, zero-indexed
    assert.equal(ts.getDate(), 5);
    assert.equal(ts.getHours(), 12);
    assert.equal(ts.getMinutes(), 34);
    assert.equal(ts.getSeconds(), 56);
  });
});

describe("chat", () => {
  it("flags say_team separately from say", () => {
    const open = parseLine(`10/05/2024 - 12:34:56.789 - "N<2><[U:1:1]><T>" say "all chat"`);
    const team = parseLine(`10/05/2024 - 12:34:56.789 - "N<2><[U:1:1]><T>" say_team "team chat"`);
    assert.equal(open.chatMessages[0].teamOnly, false);
    assert.equal(team.chatMessages[0].teamOnly, true);
  });

  it("handles quotes and angle brackets inside player names", () => {
    const { chatMessages } = parseLine(
      `10/05/2024 - 12:34:56.789 - "<<x>>y<9><[U:1:9]><CT>" say "gg"`,
    );
    assert.equal(chatMessages.length, 1);
    assert.equal(chatMessages[0].message, "gg");
    assert.equal(chatMessages[0].steamId, "[U:1:9]");
  });

  it("maps TERRORIST to T and unknown teams to SPEC", () => {
    const t = parseLine(`10/05/2024 - 12:34:56.789 - "N<2><[U:1:1]><TERRORIST>" say "x"`);
    const u = parseLine(`10/05/2024 - 12:34:56.789 - "N<2><[U:1:1]><Unassigned>" say "x"`);
    assert.equal(t.chatMessages[0].team, "T");
    assert.equal(u.chatMessages[0].team, "SPEC");
  });
});

describe("kills", () => {
  it("parses kill lines carrying position vectors", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "A<2><[U:1:1]><CT>" [-100 200 64] killed "B<3><[U:1:2]><TERRORIST>" [50 60 64] with "ak47"`,
    );
    const kill = pick(events, "player.kill");
    assert.ok(kill, "expected a player.kill event");
    assert.equal(kill.attackerSteamId, "[U:1:1]");
    assert.equal(kill.victimSteamId, "[U:1:2]");
  });

  it("parses kill lines without position vectors", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "A<2><[U:1:1]><CT>" killed "B<3><[U:1:2]><TERRORIST>" with "awp"`,
    );
    assert.ok(pick(events, "player.kill"), "expected a player.kill event");
  });

  it("parses headshot kills", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "A<2><[U:1:1]><CT>" [1 2 3] killed "B<3><[U:1:2]><TERRORIST>" [4 5 6] with "deagle" (headshot)`,
    );
    assert.ok(pick(events, "player.kill"), "expected a player.kill event");
  });

  it("parses assists", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "C<4><[U:1:3]><CT>" assisted killing "B<3><[U:1:2]><TERRORIST>"`,
    );
    const assist = pick(events, "player.assist");
    assert.ok(assist, "expected a player.assist event");
    assert.equal(assist.steamId, "[U:1:3]");
  });

  it("does not treat a suicide as a kill", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "A<2><[U:1:1]><CT>" [1 2 3] committed suicide with "world"`,
    );
    assert.equal(pick(events, "player.kill"), undefined);
  });
});

describe("match phase and score", () => {
  it("Game_Commencing enters warmup", () => {
    const { events } = parseLine(`10/05/2024 - 12:34:56.789 - World triggered "Game_Commencing"`);
    assert.equal(pick(events, "match.phase")?.phase, "warmup");
  });

  it("Match_Start goes live", () => {
    const { events } = parseLine(`10/05/2024 - 12:34:56.789 - World triggered "Match_Start" on "de_mirage"`);
    assert.equal(pick(events, "match.phase")?.phase, "live");
  });

  it("Round_End alone does NOT end the match", () => {
    // A match has ~24 rounds; treating each Round_End as the end of the match
    // would close a history record every round.
    const { events } = parseLine(`10/05/2024 - 12:34:56.789 - World triggered "Round_End"`);
    assert.notEqual(pick(events, "match.phase")?.phase, "ended");
  });

  it("Game Over ends the match", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - Game Over: competitive mg_active de_mirage score 16:14 after 45 min`,
    );
    assert.equal(pick(events, "match.phase")?.phase, "ended");
  });

  it("extracts the score from a team round-win trigger", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - Team "CT" triggered "SFUI_Notice_CTs_Win" (CT "9") (T "5")`,
    );
    const score = pick(events, "match.score");
    assert.ok(score, "expected a match.score event");
    assert.deepEqual(score.score, { ct: 9, t: 5 });
    assert.equal(score.round, 14, "round should be rounds played so far");
  });
});

describe("team switch", () => {
  // RCON `status` has no team column, so this is the only source of team data.
  it("emits player.team on a team switch", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "Neo<2><[U:1:1]><Unassigned>" switched from team <Unassigned> to <CT>`,
    );
    const ev = pick(events, "player.team");
    assert.ok(ev, "expected a player.team event");
    assert.equal(ev.steamId, "[U:1:1]");
    assert.equal(ev.team, "CT");
  });

  it("maps a switch to TERRORIST as T", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "Neo<2><[U:1:1]><CT>" switched from team <CT> to <TERRORIST>`,
    );
    assert.equal(pick(events, "player.team")?.team, "T");
  });

  it("ignores bot team switches", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "Bot Kyle<3><BOT><Unassigned>" switched from team <Unassigned> to <CT>`,
    );
    assert.equal(pick(events, "player.team"), undefined);
  });
});

describe("connect / disconnect", () => {
  it("emits player.join on entered the game", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "Neo<2><[U:1:12345]><>" entered the game`,
    );
    const join = pick(events, "player.join");
    assert.ok(join, "expected a player.join event");
    assert.equal(join.player.steamId, "[U:1:12345]");
    assert.equal(join.player.name, "Neo");
  });

  it("emits player.leave on disconnect", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "Neo<2><[U:1:12345]><CT>" disconnected (reason "Disconnect")`,
    );
    assert.equal(pick(events, "player.leave")?.steamId, "[U:1:12345]");
  });

  it("ignores BOT steamids for join", () => {
    const { events } = parseLine(
      `10/05/2024 - 12:34:56.789 - "Bot Kyle<3><BOT><CT>" entered the game`,
    );
    assert.equal(pick(events, "player.join"), undefined);
  });
});

describe("robustness", () => {
  it("never throws on malformed or partial input", () => {
    const junk = [
      "",
      "   ",
      "L ",
      "not a log line at all",
      `L 10/05/2024 - 12:34:56.789 - "unterminated<2><[U:1:1]><CT>" say "oops`,
      `"<><><>"`,
      " binary garbage",
    ];
    for (const line of junk) {
      assert.doesNotThrow(() => parseLine(line), `threw on: ${JSON.stringify(line)}`);
    }
  });

  it("every recognised line still produces a console event", () => {
    const { consoleEvents } = parseLine(
      `10/05/2024 - 12:34:56.789 - "N<2><[U:1:1]><CT>" say "hi"`,
    );
    assert.equal(consoleEvents.length, 1);
    assert.equal(consoleEvents[0].level, "chat");
  });

  it("parseLogBody handles multi-line payloads and skips blanks", () => {
    const body = [
      `L 10/05/2024 - 12:34:56.789 - "A<2><[U:1:1]><CT>" say "one"`,
      "",
      `L 10/05/2024 - 12:34:57.000 - "B<3><[U:1:2]><T>" say "two"`,
      "   ",
    ].join("\n");
    const { chatMessages } = parseLogBody(body);
    assert.equal(chatMessages.length, 2);
    assert.deepEqual(
      chatMessages.map((m: ChatMessage) => m.message),
      ["one", "two"],
    );
  });

  it("assigns unique ids across a batch", () => {
    const body = Array.from(
      { length: 20 },
      (_, i) => `L 10/05/2024 - 12:34:56.789 - "A<2><[U:1:1]><CT>" say "msg${i}"`,
    ).join("\n");
    const { chatMessages } = parseLogBody(body);
    assert.equal(new Set(chatMessages.map((m) => m.id)).size, 20);
  });
});
