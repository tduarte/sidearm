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
};

const CLASS: Record<ServerState, string> = {
  running:
    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  starting: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  updating: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  stopping: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  stopped: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  crashed: "bg-red-500/15 text-red-400 border-red-500/30",
};

const DOT: Record<ServerState, string> = {
  running: "bg-emerald-400 animate-pulse",
  starting: "bg-amber-400 animate-pulse",
  updating: "bg-sky-400 animate-pulse",
  stopping: "bg-amber-400 animate-pulse",
  stopped: "bg-zinc-400",
  crashed: "bg-red-400",
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
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[state])} />
      {label}
    </Badge>
  );
}
