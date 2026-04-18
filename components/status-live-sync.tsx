"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { ServerStatus } from "@/lib/api/types";
import { useServerEvents } from "@/lib/ws/client";

/** Merge live WS payloads onto cached status so identity fields never flash empty between ticks. */
function mergeStatus(
  prev: ServerStatus | undefined,
  incoming: ServerStatus,
): ServerStatus {
  if (!prev) return incoming;
  return {
    ...prev,
    ...incoming,
    hostname:
      incoming.hostname?.trim() !== "" ? incoming.hostname : prev.hostname,
  };
}

/**
 * Single subscription for `status.update` → React Query cache.
 * (Avoids duplicate listeners when multiple components use `useServerStatus`.)
 */
export function StatusLiveSync() {
  const qc = useQueryClient();
  useServerEvents("status.update", (e) => {
    if (e.type !== "status.update") return;
    qc.setQueryData<ServerStatus>(["status"], (prev) =>
      mergeStatus(prev, e.status),
    );
  });
  return null;
}
