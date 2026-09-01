import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  draftComplete,
  draftTurn,
  emptyDraft,
  pickPlayer,
  releasePlayer,
  setCaptain,
  teamMembers,
  undoPick,
  undrafted,
} from "@/lib/match/draft";
import {
  actOn,
  nextAction,
  remainingMaps,
  startVeto,
  undoVeto,
  vetoComplete,
  vetoResult,
  vetoSequence,
} from "@/lib/match/veto";

const POOL = ["a", "b", "c", "d", "e", "f"];

describe("captains picking teams", () => {
  it("has no turn until both captains exist", () => {
    let d = emptyDraft();
    assert.equal(draftTurn(d), null);
    d = setCaptain(d, "team1", "a");
    assert.equal(draftTurn(d), null, "one captain is not a draft");
    d = setCaptain(d, "team2", "b");
    assert.equal(draftTurn(d), "team1");
  });

  it("alternates while the teams stay level", () => {
    let d = setCaptain(setCaptain(emptyDraft(), "team1", "a"), "team2", "b");
    d = pickPlayer(d, "c");
    assert.equal(draftTurn(d), "team2");
    d = pickPlayer(d, "d");
    assert.equal(draftTurn(d), "team1");
    assert.deepEqual(teamMembers(d, "team1"), ["a", "c"]);
    assert.deepEqual(teamMembers(d, "team2"), ["b", "d"]);
  });

  it("gives the turn back to whoever is a player short", () => {
    // Derived from team size, never a stored counter. Someone leaving mid-draft
    // and being released is the whole reason: a counter would keep pointing at
    // the side that is now a player up.
    let d = setCaptain(setCaptain(emptyDraft(), "team1", "a"), "team2", "b");
    d = pickPlayer(d, "c");
    d = pickPlayer(d, "d");
    d = releasePlayer(d, "d");
    assert.equal(draftTurn(d), "team2");
  });

  it("ignores a player who is already taken", () => {
    let d = setCaptain(setCaptain(emptyDraft(), "team1", "a"), "team2", "b");
    d = pickPlayer(d, "c");
    const again = pickPlayer(d, "c");
    assert.deepEqual(again.picks, d.picks);
  });

  it("moves a captain rather than cloning them", () => {
    // The same Steam64 on both rosters is rejected by buildMatchConfig several
    // screens later, with no clue about which click caused it.
    let d = setCaptain(emptyDraft(), "team1", "a");
    d = setCaptain(d, "team2", "a");
    assert.equal(d.captains.team1, null);
    assert.equal(d.captains.team2, "a");
  });

  it("takes a picked player off a roster when they are made captain", () => {
    let d = setCaptain(setCaptain(emptyDraft(), "team1", "a"), "team2", "b");
    d = pickPlayer(d, "c");
    d = setCaptain(d, "team2", "c");
    assert.deepEqual(teamMembers(d, "team1"), ["a"]);
    assert.deepEqual(teamMembers(d, "team2"), ["c"]);
  });

  it("undoes the last pick only", () => {
    let d = setCaptain(setCaptain(emptyDraft(), "team1", "a"), "team2", "b");
    d = pickPlayer(d, "c");
    d = pickPlayer(d, "d");
    d = undoPick(d);
    assert.deepEqual(teamMembers(d, "team2"), ["b"]);
    assert.deepEqual(teamMembers(d, "team1"), ["a", "c"]);
  });

  it("is done when the pool is empty", () => {
    let d = setCaptain(setCaptain(emptyDraft(), "team1", "a"), "team2", "b");
    assert.equal(draftComplete(d, POOL), false);
    for (const id of ["c", "d", "e", "f"]) d = pickPlayer(d, id);
    assert.deepEqual(undrafted(d, POOL), []);
    assert.equal(draftComplete(d, POOL), true);
  });
});

describe("the veto sequence", () => {
  const kinds = (n: number, m: number) =>
    vetoSequence(n, m).map((a) => `${a.side === "team1" ? "1" : "2"}${a.kind[0]}`);

  it("is six bans for a best-of-one out of seven", () => {
    assert.deepEqual(kinds(7, 1), ["1b", "2b", "1b", "2b", "1b", "2b"]);
  });

  it("is ban ban pick pick ban ban for a best-of-three out of seven", () => {
    // The conventional sequence, reproduced by the general rule rather than
    // written down as a table.
    assert.deepEqual(kinds(7, 3), ["1b", "2b", "1p", "2p", "1b", "2b"]);
  });

  it("is two bans then four picks for a best-of-five out of seven", () => {
    // Here the picks decide the *order* of maps that are all going to be
    // played, which is what a best-of-five veto actually is.
    assert.deepEqual(kinds(7, 5), ["1b", "2b", "1p", "2p", "1p", "2p"]);
  });

  it("has nothing to do when the pool is the series", () => {
    assert.deepEqual(kinds(3, 3), []);
    assert.deepEqual(kinds(1, 1), []);
  });

  it("copes with a pool smaller than the conventional seven", () => {
    // Five maps, best of three: nothing to ban up front, two picks, then two
    // bans to settle the decider.
    assert.deepEqual(kinds(5, 3), ["1p", "2p", "1b", "2b"]);
  });

  it("lets the other side act first", () => {
    assert.equal(vetoSequence(7, 3, "team2")[0]?.side, "team2");
  });
});

describe("running a veto", () => {
  const bo3 = () => startVeto(["a", "b", "c", "d", "e", "f", "g"], 3);

  it("plays out to an ordered map list", () => {
    let v = bo3();
    v = actOn(v, "a"); // team1 ban
    v = actOn(v, "b"); // team2 ban
    v = actOn(v, "c"); // team1 pick
    v = actOn(v, "d"); // team2 pick
    v = actOn(v, "e"); // team1 ban
    v = actOn(v, "f"); // team2 ban
    assert.equal(vetoComplete(v), true);
    // Picks in the order made, then the survivor as the decider — with
    // skip_veto MatchZy plays this list top to bottom.
    assert.deepEqual(vetoResult(v), ["c", "d", "g"]);
  });

  it("withholds a result until the last step", () => {
    let v = bo3();
    v = actOn(v, "a");
    assert.equal(vetoResult(v), null);
    assert.deepEqual(nextAction(v), { kind: "ban", side: "team2" });
  });

  it("refuses a map that is already gone", () => {
    let v = bo3();
    v = actOn(v, "a");
    const same = actOn(v, "a");
    assert.equal(same.steps.length, 1);
    assert.ok(!remainingMaps(v).includes("a"));
  });

  it("undoes a step", () => {
    let v = bo3();
    v = actOn(v, "a");
    v = actOn(v, "b");
    v = undoVeto(v);
    assert.deepEqual(nextAction(v), { kind: "ban", side: "team2" });
    assert.ok(remainingMaps(v).includes("b"));
  });

  it("hands back the pool untouched when there is nothing to veto", () => {
    const v = startVeto(["a", "b", "c"], 3);
    assert.equal(vetoComplete(v), true);
    assert.deepEqual(vetoResult(v), ["a", "b", "c"]);
  });

  it("never returns more maps than the series length", () => {
    const v = startVeto(["a", "b", "c", "d"], 1);
    const done = ["a", "b", "c"].reduce(actOn, v);
    assert.deepEqual(vetoResult(done), ["d"]);
  });
});
