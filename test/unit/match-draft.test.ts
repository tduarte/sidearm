import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDefinition,
  currentSetup,
  movedPlayers,
  resolveSetup,
  setupChanges,
  setupId,
  setupProblems,
  teamRoster,
  pickTurn,
  undrafted,
  withCaptain,
  type SetupValues,
} from "@/lib/dashboard/match-draft";
import type { MatchState, Player, Team } from "@/lib/api/types";

function player(steamId: string, name: string, team: Team): Player {
  return {
    steamId,
    userId: steamId.slice(-2),
    name,
    team,
    k: 0,
    d: 0,
    a: 0,
    ping: 30,
    connectedAt: "2026-09-03T19:00:00Z",
  };
}

const roster = [
  player("7656119800000001", "Ada", "CT"),
  player("7656119800000002", "Bex", "CT"),
  player("7656119800000003", "Cy", "T"),
  player("7656119800000004", "Dov", "T"),
  player("7656119800000005", "Eve", "SPEC"),
];
const order = roster.map((p) => p.steamId);
const nameOf = (id: string) => roster.find((p) => p.steamId === id)?.name ?? id;

function match(side1: Team, maps: string[] = ["de_mirage"]): MatchState {
  return {
    series: {
      matchId: 7,
      mapNumber: 0,
      maps,
      team1: { name: "Reds", seriesScore: 0, mapScore: 5, side: side1 },
      team2: {
        name: "Blues",
        seriesScore: 0,
        mapScore: 3,
        side: side1 === "CT" ? "T" : "CT",
      },
    },
  } as MatchState;
}

describe("reading the setup off a live server", () => {
  it("puts the CT players on team 1 while team 1 is on CT", () => {
    const v = currentSetup(match("CT"), roster, "de_mirage");
    assert.equal(v.team1Name, "Reds");
    assert.equal(v.sides["7656119800000001"], "team1");
    assert.equal(v.sides["7656119800000003"], "team2");
  });

  it("follows the teams across the half-time swap", () => {
    // The bug this exists to prevent: team1 starts on CT and swaps, so binding
    // the name to the side rather than to `side` renames both teams at 12-12
    // and leaves the scoreboard confidently wrong for the whole second half.
    const v = currentSetup(match("T"), roster, "de_mirage");
    assert.equal(v.sides["7656119800000001"], "team2", "Ada is CT, so she is now team 2");
    assert.equal(v.sides["7656119800000003"], "team1");
  });

  it("benches the spectators", () => {
    const v = currentSetup(match("CT"), roster, "de_mirage");
    assert.equal(v.sides["7656119800000005"], "bench");
  });

  it("falls back to side names when MatchZy has no match loaded", () => {
    // A `.start` pug reports every `get5_status` field null, so there are no
    // team names to read — the honest answer is what the sides are called.
    const v = currentSetup(undefined, roster, "de_dust2");
    assert.equal(v.team1Name, "Counter-Terrorists");
    assert.equal(v.team2Name, "Terrorists");
    assert.deepEqual(v.maps, ["de_dust2"]);
    assert.equal(v.numMaps, 1);
  });

  it("never claims to know who the captains are", () => {
    assert.deepEqual(currentSetup(match("CT"), roster, "de_mirage").captains, {
      team1: null,
      team2: null,
    });
  });
});

describe("the draft is sparse", () => {
  const current = currentSetup(match("CT"), roster, "de_mirage");

  it("leaves untouched fields following the server", () => {
    const next = resolveSetup(current, { team1Name: "Ants" });
    assert.equal(next.team1Name, "Ants");
    assert.equal(next.team2Name, "Blues");
    assert.deepEqual(next.sides, current.sides);
  });

  it("moves only the player who was moved", () => {
    const next = resolveSetup(current, {
      sides: { "7656119800000005": "team1" },
    });
    assert.equal(next.sides["7656119800000005"], "team1");
    assert.equal(next.sides["7656119800000001"], "team1");
    assert.equal(next.sides["7656119800000003"], "team2");
  });

  it("can stage a captain back to nobody", () => {
    // `??` would read an explicit null as "not staged" and silently keep the
    // old captain, so the merge has to test for `undefined`.
    const withCap: SetupValues = { ...current, captains: { team1: "7656119800000001", team2: null } };
    const next = resolveSetup(withCap, { captains: { team1: null } });
    assert.equal(next.captains.team1, null);
  });

  it("does not count a move back to where someone already is", () => {
    const moved = movedPlayers(current, {
      sides: { "7656119800000001": "team1", "7656119800000003": "team1" },
    });
    assert.deepEqual(moved, ["7656119800000003"]);
  });
});

describe("what the dock says", () => {
  const current = currentSetup(match("CT"), roster, "de_mirage");

  it("says nothing when nothing was staged", () => {
    assert.deepEqual(setupChanges(current, {}, nameOf), []);
  });

  it("names the players it would move", () => {
    const chips = setupChanges(
      current,
      { sides: { "7656119800000005": "team2" } },
      nameOf,
    );
    const roster_ = chips.find((c) => c.key === "roster");
    assert.equal(roster_?.to, "1 move");
    assert.equal(roster_?.note, "Eve");
  });

  it("admits a captain is only a list position", () => {
    const chips = setupChanges(
      current,
      { captains: { team1: "7656119800000001" } },
      nameOf,
    );
    const cap = chips.find((c) => c.key === "captains");
    assert.equal(cap?.to, "Ada");
    assert.match(cap?.note ?? "", /MatchZy has no captain/);
  });

  it("reports a series length change", () => {
    const chips = setupChanges(current, { numMaps: 3 }, nameOf);
    assert.equal(chips.find((c) => c.key === "numMaps")?.to, "best of 3");
  });

  it("treats a reordered map list as a change", () => {
    const three = currentSetup(match("CT", ["de_mirage", "de_nuke"]), roster, "de_mirage");
    const chips = setupChanges(three, { maps: ["de_nuke", "de_mirage"] }, nameOf);
    assert.ok(chips.some((c) => c.key === "maps"));
  });
});

describe("the roster handed to MatchZy", () => {
  const current = currentSetup(match("CT"), roster, "de_mirage");

  it("puts the captain first, because that is all a captain is", () => {
    const v = resolveSetup(current, { captains: { team1: "7656119800000002" } });
    assert.deepEqual(teamRoster(v, "team1", order), [
      "7656119800000002",
      "7656119800000001",
    ]);
  });

  it("ignores a captain who has since been moved off the team", () => {
    const v = resolveSetup(current, {
      captains: { team1: "7656119800000002" },
      sides: { "7656119800000002": "bench" },
    });
    assert.deepEqual(teamRoster(v, "team1", order), ["7656119800000001"]);
  });

  it("builds a definition MatchZy will accept", () => {
    const v = resolveSetup(current, { captains: { team2: "7656119800000004" } });
    const def = buildDefinition(v, { id: "reds-vs-blues", order, nameOf, wingman: false });
    assert.equal(def.matchNumber, 0, "the server assigns the integer matchid");
    assert.equal(def.team1.name, "Reds");
    assert.deepEqual(def.team2.players.map((p) => p.name), ["Dov", "Cy"]);
    assert.equal(def.playersPerTeam, 2);
    assert.equal(def.numMaps, 1);
  });

  it("leaves the bench out of both teams", () => {
    const def = buildDefinition(current, { id: "x", order, nameOf, wingman: false });
    const ids = [...def.team1.players, ...def.team2.players].map((p) => p.steamId);
    assert.ok(!ids.includes("7656119800000005"));
  });
});

describe("refusing to load a config that cannot work", () => {
  const current = currentSetup(match("CT"), roster, "de_mirage");

  it("passes a setup that is ready", () => {
    assert.deepEqual(setupProblems(current, order), []);
  });

  it("catches an empty side", () => {
    const v = resolveSetup(current, {
      sides: { "7656119800000003": "bench", "7656119800000004": "bench" },
    });
    assert.match(setupProblems(v, order).join(" "), /Blues has nobody/);
  });

  it("catches a best-of with too few maps", () => {
    const v = resolveSetup(current, { numMaps: 3 });
    assert.match(setupProblems(v, order).join(" "), /at least 3 maps/);
  });

  it("catches two teams with the same name", () => {
    const v = resolveSetup(current, { team1Name: "Blues" });
    assert.match(setupProblems(v, order).join(" "), /same name/);
  });

  it("catches a blank name", () => {
    const v = resolveSetup(current, { team1Name: "  " });
    assert.match(setupProblems(v, order).join(" "), /name is empty/);
  });
});

describe("naming the saved setup", () => {
  const current = currentSetup(match("CT"), roster, "de_mirage");

  it("dates it, so next Friday does not overwrite this one", () => {
    const id = setupId(current, new Date("2026-09-03T20:00:00Z"));
    assert.equal(id, "reds-vs-blues-2026-09-03");
  });

  it("survives a name made entirely of punctuation", () => {
    const v = resolveSetup(current, { team1Name: "!!!" });
    assert.equal(setupId(v, new Date("2026-09-03T20:00:00Z")), "team-vs-blues-2026-09-03");
  });
});

describe("drafting off the bench", () => {
  const current = currentSetup(match("CT"), roster, "de_mirage");
  // Everyone on the bench, which is what a draft starts from.
  const empty = resolveSetup(current, {
    sides: Object.fromEntries(order.map((id) => [id, "bench" as const])),
  });
  const twoCaptains = () =>
    withCaptain(
      withCaptain({}, "team1", "7656119800000001"),
      "team2",
      "7656119800000003",
    );

  it("will not start before both captains are named", () => {
    const one = resolveSetup(empty, withCaptain({}, "team1", "7656119800000001"));
    assert.equal(pickTurn(one, order), null);
  });

  it("gives the pick to whichever side is short", () => {
    const two = resolveSetup(empty, twoCaptains());
    assert.equal(pickTurn(two, order), "team1", "equal sizes: team 1 opens");
    const after = resolveSetup(two, { sides: { "7656119800000002": "team1" } });
    assert.equal(pickTurn(after, order), "team2");
  });

  it("hands the turn back when a picked player leaves the side", () => {
    // A stored counter would still be pointing at team 2 here.
    const picked = twoCaptains();
    const two = resolveSetup(empty, {
      ...picked,
      sides: { ...picked.sides, "7656119800000002": "team1" },
    });
    assert.equal(pickTurn(two, order), "team2");
    const undone = resolveSetup(two, { sides: { "7656119800000002": "bench" } });
    assert.equal(pickTurn(undone, order), "team1");
  });

  it("puts a new captain on their own side", () => {
    const d = withCaptain({}, "team1", "7656119800000005");
    assert.equal(d.sides?.["7656119800000005"], "team1");
  });

  it("does not let one person captain both teams", () => {
    const d = withCaptain(
      withCaptain({}, "team1", "7656119800000001"),
      "team2",
      "7656119800000001",
    );
    assert.equal(d.captains?.team1, null);
    assert.equal(d.captains?.team2, "7656119800000001");
  });

  it("leaves a demoted captain on the team", () => {
    const named = withCaptain({}, "team1", "7656119800000005");
    const demoted = withCaptain(named, "team1", null);
    assert.equal(demoted.captains?.team1, null);
    assert.equal(demoted.sides?.["7656119800000005"], "team1");
  });

  it("counts only the bench as still available", () => {
    const two = resolveSetup(empty, twoCaptains());
    assert.deepEqual(undrafted(two, order), [
      "7656119800000002",
      "7656119800000004",
      "7656119800000005",
    ]);
  });
});
