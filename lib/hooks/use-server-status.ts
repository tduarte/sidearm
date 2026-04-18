"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { ServerStatus } from "@/lib/api/types";

export function useServerStatus() {
  return useQuery<ServerStatus>({
    queryKey: ["status"],
    queryFn: () => api.getStatus(),
    staleTime: Infinity,
  });
}
