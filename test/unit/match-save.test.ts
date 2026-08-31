import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mockAdapter } from "@/lib/api/server/mock";
import type { MatchDefinition } from "@/lib/cs2/match-config";

/**
 * The setup form sends `matchNumber: 0` to mean "assign one" — the field is a
 * non-optional number, so it cannot send null. `saveMatch` must treat that 0
 * as unassigned; coalescing with `??` kept it and every new match failed
 * validation with "must be a positive whole number".
 */

const formDef = (over: Partial<MatchDefinition> = {}): MatchDefinition => ({
  id: "sentinel-check",
  matchNumber: 0,
  team1: { name: "Astra", players: [{ steamId: "[U:1:22202]", name: "ace" }] },
  team2: { name: "Nova", players: [{ steamId: "[U:1:33301]", name: "brim" }] },
  maps: ["de_mirage"],
  numMaps: 1,
  playersPerTeam: 1,
  minPlayersToReady: 1,
  skipVeto: true,
  clinchSeries: true,
  wingman: false,
  ...over,
});

describe("saveMatch match-number assignment", () => {
  it("assigns a number when the form sends the 0 sentinel", async () => {
    await mockAdapter.saveMatch(formDef());
    const saved = (await mockAdapter.getMatchConfigs()).find(
      (m) => m.id === "sentinel-check",
    );
    assert.ok(saved);
    assert.ok(Number.isInteger(saved.definition.matchNumber));
    assert.ok(saved.definition.matchNumber >= 1);
  });

  it("keeps the number an existing setup already has on re-save", async () => {
    const before = (await mockAdapter.getMatchConfigs()).find(
      (m) => m.id === "sentinel-check",
    );
    assert.ok(before);
    await mockAdapter.saveMatch(formDef({ team1: { name: "Astra2", players: formDef().team1.players } }));
    const after = (await mockAdapter.getMatchConfigs()).find(
      (m) => m.id === "sentinel-check",
    );
    assert.ok(after);
    assert.equal(after.definition.matchNumber, before.definition.matchNumber);
  });
});
