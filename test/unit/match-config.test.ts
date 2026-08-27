import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMatchConfig,
  unconvertiblePlayers,
  type MatchDefinition,
} from "@/lib/cs2/match-config";

const def = (over: Partial<MatchDefinition> = {}): MatchDefinition => ({
  id: "7",
  team1: {
    name: "Astra",
    players: [
      { steamId: "[U:1:22202]", name: "ace" },
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
  maps: ["de_mirage", "de_inferno", "de_nuke", "de_ancient"],
  numMaps: 1,
  playersPerTeam: 2,
  minPlayersToReady: 2,
  skipVeto: true,
  clinchSeries: true,
  wingman: false,
  ...over,
});

describe("buildMatchConfig", () => {
  it("keys rosters by Steam64, which is all MatchZy accepts", () => {
    const { config } = buildMatchConfig(def());
    assert.deepEqual(config!.team1.players, {
      "76561197960287930": "ace",
      "76561197960287931": "kori",
    });
  });

  it("carries the series settings through", () => {
    const { config } = buildMatchConfig(
      def({ numMaps: 3, maps: ["de_mirage", "de_inferno", "de_nuke", "de_ancient"] }),
    );
    assert.equal(config!.num_maps, 3);
    assert.equal(config!.clinch_series, true);
    assert.deepEqual(config!.maplist.length, 4);
  });

  it("omits an empty cvars block rather than sending {}", () => {
    assert.equal("cvars" in buildMatchConfig(def()).config!, false);
    assert.deepEqual(
      buildMatchConfig(def({ cvars: { hostname: "x" } })).config!.cvars,
      { hostname: "x" },
    );
  });
});

describe("buildMatchConfig — the skip_veto trap", () => {
  it("warns that a veto cannot happen when the maps exactly fill the series", () => {
    // MatchZy silently forces skip_veto when maplist.Count == num_maps: there
    // is nothing left to veto. Asking for one does not error, it just never
    // happens — so the operator has to hear about it before the match, not
    // after wondering why the veto never started.
    const r = buildMatchConfig(
      def({ numMaps: 3, maps: ["de_mirage", "de_inferno", "de_nuke"], skipVeto: false }),
    );
    assert.equal(r.config!.skip_veto, true);
    assert.match(r.warnings.join(" "), /nothing to veto/);
  });

  it("leaves a real veto alone", () => {
    const r = buildMatchConfig(
      def({ numMaps: 1, maps: ["de_mirage", "de_inferno", "de_nuke"], skipVeto: false }),
    );
    assert.equal(r.config!.skip_veto, false);
    assert.deepEqual(r.warnings, []);
  });

  it("does not warn when the operator asked to skip anyway", () => {
    const r = buildMatchConfig(
      def({ numMaps: 3, maps: ["de_mirage", "de_inferno", "de_nuke"], skipVeto: true }),
    );
    assert.deepEqual(r.warnings, []);
  });
});

describe("buildMatchConfig — refusals", () => {
  const fails = (d: MatchDefinition, re: RegExp) => {
    const r = buildMatchConfig(d);
    assert.equal(r.config, null, "expected no config");
    assert.match(r.errors.join(" | "), re);
  };

  it("refuses bots on a roster", () => {
    // Bots have no Steam identity. MatchZy would simply never recognise them
    // and the match would sit waiting to ready forever.
    fails(
      def({ team1: { name: "Astra", players: [{ steamId: "BOT", name: "Lieutenant" }] } }),
      /no Steam ID[\s\S]*Lieutenant/,
    );
  });

  it("refuses a player on both teams", () => {
    fails(
      def({
        team2: { name: "Nova", players: [{ steamId: "[U:1:22202]", name: "ace" }] },
      }),
      /ace is on both teams/,
    );
  });

  it("refuses a series with fewer maps than it needs", () => {
    fails(def({ numMaps: 3, maps: ["de_mirage"] }), /needs at least 3 maps/);
  });

  it("refuses a ready threshold nobody can reach", () => {
    // Waiting for more ready players than a team can hold means the match can
    // never start, and nothing in game would explain why.
    fails(
      def({ playersPerTeam: 2, minPlayersToReady: 5 }),
      /can never start/,
    );
  });

  it("refuses empty teams, empty names and no maps", () => {
    fails(def({ maps: [] }), /at least one map/i);
    fails(def({ team1: { name: "", players: def().team1.players } }), /Team 1 needs a name/);
    fails(def({ team2: { name: "Nova", players: [] } }), /Team 2 has no players/);
  });

  it("reports every problem at once, not just the first", () => {
    // The form shows these together; fixing one at a time is miserable.
    const r = buildMatchConfig(def({ id: "", maps: [], numMaps: 2 }));
    assert.ok(r.errors.length >= 3, `expected several errors, got ${r.errors.length}`);
  });
});

describe("unconvertiblePlayers", () => {
  it("names exactly who cannot be converted", () => {
    const bad = unconvertiblePlayers({
      name: "T",
      players: [
        { steamId: "[U:1:1]", name: "real" },
        { steamId: "BOT", name: "bot" },
        { steamId: "", name: "blank" },
      ],
    });
    assert.deepEqual(bad.map((p) => p.name), ["bot", "blank"]);
  });
});
