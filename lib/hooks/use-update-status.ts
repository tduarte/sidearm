"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { UpdateStatus } from "@/lib/api/types";

/**
 * CS2 update state. Kept fresh by the `server.update` WS event
 * (see `components/status-live-sync.tsx`); the refetch below is only a
 * backstop for a client that connected between checks.
 */
export function useUpdateStatus() {
  return useQuery<UpdateStatus>({
    queryKey: ["update-status"],
    queryFn: () => api.getUpdateStatus(),
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  });
}
