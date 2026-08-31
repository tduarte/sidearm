"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { RoundRecord } from "@/lib/api/types";
import { useServerEvents } from "@/lib/ws/client";

/**
 * The rounds of the match in progress, kept current from the log stream.
 *
 * Fetched once so a page opened mid-match starts with the rounds already
 * played, then extended by `round.end` as they happen — the same event
 * `server.ts` writes to the database, so the list on screen and the row on
 * disk cannot drift.
 */
export function useLiveRounds() {
  const qc = useQueryClient();
  const q = useQuery<RoundRecord[]>({
    queryKey: ["live-rounds"],
    queryFn: () => api.getLiveRounds(),
    staleTime: Infinity,
  });

  useServerEvents(["round.end", "match.phase"], (e) => {
    if (e.type === "match.phase") {
      // A match starting or ending replaces the record this reads from, so
      // refetch rather than guess: the old match's rounds must not linger
      // under the new one's score.
      if (e.phase === "live" || e.phase === "ended" || e.phase === "idle") {
        qc.invalidateQueries({ queryKey: ["live-rounds"] });
      }
      return;
    }
    if (e.type !== "round.end") return;
    const record: RoundRecord = {
      round: e.round,
      winner: e.winner,
      reason: e.reason,
      score: e.score,
    };
    qc.setQueryData<RoundRecord[]>(["live-rounds"], (prev = []) => {
      // Replace, not append: `mp_restartgame` and a MatchZy round restore both
      // replay a round number that is already here, and the database does the
      // same thing with INSERT OR REPLACE.
      const next = prev.filter((r) => r.round !== record.round);
      next.push(record);
      return next.sort((a, b) => a.round - b.round);
    });
  });

  return q;
}
