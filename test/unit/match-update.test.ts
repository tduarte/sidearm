import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { updateCache } from "@/lib/api/server/real";
import { bus } from "@/lib/ws/bus";
import type { MatchState, WsEvent } from "@/lib/api/types";
import status from "./helpers/status-fixture";

/**
 * Every poll republishes the whole match state.
 *
 * The client caches `/api/match` with `staleTime: Infinity` and otherwise only
 * hears about the phase and the score, so a field that arrives late — the
 * round limit is the usual one, read from `mp_maxrounds` on a poll — never
 * reached a tab that was already open. It showed "Round 0" with no limit and
 * no Rounds field until someone reloaded.
 */
function collect(): { seen: MatchState[]; off: () => void } {
  const seen: MatchState[] = [];
  const off = bus.subscribe((e: WsEvent) => {
    if (e.type === "match.update") seen.push(e.match);
  });
  return { seen, off };
}

describe("match.update", () => {
  it("carries the round limit the poll just read", () => {
    const { seen, off } = collect();
    try {
      updateCache(status(), [], { maxRounds: 16 });
    } finally {
      off();
    }
    assert.equal(seen.length, 1);
    assert.equal(seen[0].maxRounds, 16);
  });

  it("keeps being sent when nothing changed", () => {
    // On change only would leave a client that missed a frame — or that
    // reconnected after the socket dropped — wrong until it reloaded.
    const { seen, off } = collect();
    try {
      updateCache(status(), [], { maxRounds: 16 });
      updateCache(status(), [], { maxRounds: 16 });
    } finally {
      off();
    }
    assert.equal(seen.length, 2);
  });

  it("sends a copy, not the live cache", () => {
    const { seen, off } = collect();
    try {
      updateCache(status(), [], { maxRounds: 16 });
      updateCache(status(), [], { maxRounds: 24 });
    } finally {
      off();
    }
    assert.equal(seen[0].maxRounds, 16, "the first frame still says 16");
    assert.equal(seen[1].maxRounds, 24);
  });
});
