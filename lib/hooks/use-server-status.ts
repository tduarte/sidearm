"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { ServerStatus } from "@/lib/api/types";
import { useServerEvents } from "@/lib/ws/client";

export function useServerStatus() {
  const qc = useQueryClient();
  const q = useQuery<ServerStatus>({
    queryKey: ["status"],
    queryFn: () => api.getStatus(),
    staleTime: Infinity,
  });

  useServerEvents("status.update", (e) => {
    if (e.type === "status.update") qc.setQueryData(["status"], e.status);
  });

  return q;
}
