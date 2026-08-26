"use client";

import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PendingOp, ServerStatus, UpdateStatus } from "@/lib/api/types";
import { useServerEvents } from "@/lib/ws/client";

/**
 * Values the status parser emits when RCON did not answer. They are placeholders
 * for "unknown", not facts, so keep whatever we already knew instead — otherwise
 * the header flips to "CS2 Server / unknown" for the whole of a game update,
 * which is exactly when RCON is silent for the longest.
 */
const PLACEHOLDER_HOSTNAME = "CS2 Server";
const PLACEHOLDER_MAP = "unknown";

/** Merge live WS payloads onto cached status so identity fields never flash empty between ticks. */
function mergeStatus(
  prev: ServerStatus | undefined,
  incoming: ServerStatus,
): ServerStatus {
  if (!prev) return incoming;
  const known = (next: string, previous: string, placeholder: string) =>
    next?.trim() !== "" && next !== placeholder ? next : previous;
  return {
    ...prev,
    ...incoming,
    hostname: known(incoming.hostname, prev.hostname, PLACEHOLDER_HOSTNAME),
    map: known(incoming.map, prev.map, PLACEHOLDER_MAP),
  };
}

/**
 * Single subscription for `status.update` → React Query cache.
 * (Avoids duplicate listeners when multiple components use `useServerStatus`.)
 */
export function StatusLiveSync() {
  const qc = useQueryClient();
  /**
   * The operation we last saw in flight, so its completion can be announced.
   * A ref rather than state: this is a comparison against the previous frame,
   * and re-rendering on it would buy nothing.
   */
  const pending = useRef<PendingOp | null>(null);

  useServerEvents(["status.update", "server.update"], (e) => {
    if (e.type === "status.update") {
      // Success is reported here, when the poll observes the result — not in
      // the mutation's onSuccess, which only knows the command was accepted.
      const was = pending.current;
      const now = e.status.pendingOp ?? null;
      if (was && !now) {
        toast.success(completionMessage(was, e.status));
      }
      pending.current = now;

      qc.setQueryData<ServerStatus>(["status"], (prev) =>
        mergeStatus(prev, e.status),
      );
      return;
    }
    if (e.type === "server.update") {
      qc.setQueryData<UpdateStatus>(["update-status"], e.update);
    }
  });
  return null;
}

function completionMessage(op: PendingOp, status: ServerStatus): string {
  switch (op.kind) {
    case "map":
      return `Now playing ${status.map}`;
    case "restart":
      return "Server is back up";
    case "start":
      return "Server is running";
    case "stop":
      return "Server stopped";
    case "update":
      return "Update applied — server is back up";
  }
}
