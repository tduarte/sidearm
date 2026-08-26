"use client";

import { useEffect, useState } from "react";
import type { PendingOp } from "@/lib/api/types";
import { useServerStatus } from "@/lib/hooks/use-server-status";

/**
 * The operation the panel is still waiting to see land, with a live elapsed
 * clock.
 *
 * Elapsed time is the whole point: these operations legitimately take from
 * thirty seconds to several minutes, and a spinner with no clock is
 * indistinguishable from one that is stuck.
 */
export function usePendingOp(): { op: PendingOp | null; elapsedSec: number } {
  const { data: status } = useServerStatus();
  const op = status?.pendingOp ?? null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!op) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [op?.kind, op?.target, op?.since, op]);

  if (!op) return { op: null, elapsedSec: 0 };
  const elapsedSec = Math.max(
    0,
    Math.floor((now - new Date(op.since).getTime()) / 1000),
  );
  return { op, elapsedSec };
}

/** `95` → `1m 35s`. Compact enough to sit inside a button or a badge. */
export function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * What the panel is waiting for, in the admin's terms, plus the documented
 * reason it is slow where there is one.
 */
export function describePendingOp(op: PendingOp): {
  label: string;
  detail: string;
} {
  switch (op.kind) {
    case "map":
      return {
        label: `Loading ${op.target ?? "the map"}`,
        detail:
          "Workshop maps download before they load — a first fetch takes about a minute.",
      };
    case "restart":
      return {
        label: "Restarting the server",
        detail: "The container is coming back up.",
      };
    case "start":
      return { label: "Starting the server", detail: "Waiting for RCON to answer." };
    case "stop":
      return { label: "Stopping the server", detail: "Waiting for the container to exit." };
    case "update":
      return {
        label: "Applying the CS2 update",
        detail:
          "The container re-runs steamcmd on boot; a large update takes a while.",
      };
  }
}
