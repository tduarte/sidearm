"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { MatchState } from "@/lib/api/types";
import { useServerEvents } from "@/lib/ws/client";

export function useMatchState() {
  const qc = useQueryClient();
  const q = useQuery<MatchState>({
    queryKey: ["match"],
    queryFn: () => api.getMatch(),
    staleTime: Infinity,
  });

  useServerEvents(["match.phase", "match.score", "match.update"], (e) => {
    // The whole state as the server has it, which is authoritative over
    // anything cached here — including the fields no delta event covers, such
    // as the round limit. `staleTime: Infinity` means nothing else ever
    // refreshes them.
    if (e.type === "match.update") {
      qc.setQueryData<MatchState>(["match"], e.match);
      return;
    }
    qc.setQueryData<MatchState>(["match"], (prev) => {
      if (!prev) return prev;
      if (e.type === "match.phase") return { ...prev, phase: e.phase };
      if (e.type === "match.score")
        return { ...prev, score: e.score, round: e.round };
      return prev;
    });
  });

  return q;
}
