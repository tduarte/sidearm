"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServerState } from "@/lib/api/types";

const LABEL: Record<ServerState, string> = {
  running: "Running",
  starting: "Starting",
  updating: "Updating",
  stopping: "Stopping",
  stopped: "Stopped",
  crashed: "Crashed",
  unknown: "Unknown",
};

/**
 * State to semantic token. No raw palette classes: these are the same six
 * meanings the console levels and the control-plane banner use, so they have
 * to be the same six colours, in both themes.
 */
const CLASS: Record<ServerState, string> = {
  running: "bg-ok/12 text-ok border-ok/30",
  starting: "bg-pending/12 text-pending border-pending/30",
  updating: "bg-info/12 text-info border-info/30",
  stopping: "bg-pending/12 text-pending border-pending/30",
  stopped: "bg-unknown/12 text-unknown border-unknown/30",
  crashed: "bg-danger/12 text-danger border-danger/30",
  unknown: "bg-unknown/12 text-unknown border-unknown/40 border-dashed",
};

const DOT: Record<ServerState, string> = {
  running: "bg-ok animate-pulse",
  starting: "bg-pending animate-pulse",
  updating: "bg-info animate-pulse",
  stopping: "bg-pending animate-pulse",
  stopped: "bg-unknown",
  crashed: "bg-danger",
  // Deliberately not pulsing: nothing is in progress, we simply cannot see.
  unknown: "bg-unknown",
};

/**
 * Why the panel is reporting this state, for the states where "what you see"
 * and "what is true" can differ. Shown as the pill's tooltip.
 */
const WHY: Partial<Record<ServerState, string>> = {
  unknown:
    "Neither Docker nor RCON is answering, so the panel cannot tell what the server is doing.",
  crashed: "The container exited, or its healthcheck is failing.",
  updating: "The container is up but still downloading game files.",
};

export function StatusPill({
  state,
  /** Appended to the label while updating, e.g. "Updating 68%". */
  pct,
}: {
  state: ServerState;
  pct?: number | null;
}) {
  const label =
    state === "updating" && typeof pct === "number"
      ? `${LABEL[state]} ${Math.floor(pct)}%`
      : LABEL[state];

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium tabular-nums", CLASS[state])}
      title={WHY[state]}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[state])} />
      {label}
    </Badge>
  );
}
