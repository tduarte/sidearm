"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { Player } from "@/lib/api/types";
import { useServerEvents } from "@/lib/ws/client";

export function useLivePlayers() {
  const qc = useQueryClient();
  const q = useQuery<Player[]>({
    queryKey: ["players"],
    queryFn: () => api.getPlayers(),
    staleTime: Infinity,
  });

  useServerEvents(["player.join", "player.leave", "player.update"], (e) => {
    qc.setQueryData<Player[]>(["players"], (prev = []) => {
      if (e.type === "player.join") {
        if (prev.some((p) => p.steamId === e.player.steamId)) return prev;
        return [...prev, e.player];
      }
      if (e.type === "player.leave") {
        return prev.filter((p) => p.steamId !== e.steamId);
      }
      if (e.type === "player.update") {
        return prev.map((p) => (p.steamId === e.player.steamId ? e.player : p));
      }
      return prev;
    });
  });

  return q;
}
