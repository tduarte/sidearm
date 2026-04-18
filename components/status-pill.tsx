"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServerState } from "@/lib/api/types";

const LABEL: Record<ServerState, string> = {
  running: "Running",
  starting: "Starting",
  stopping: "Stopping",
  stopped: "Stopped",
  crashed: "Crashed",
};

const CLASS: Record<ServerState, string> = {
  running:
    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  starting: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  stopping: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  stopped: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  crashed: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function StatusPill({ state }: { state: ServerState }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", CLASS[state])}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          state === "running" && "bg-emerald-400 animate-pulse",
          state === "starting" && "bg-amber-400 animate-pulse",
          state === "stopping" && "bg-amber-400 animate-pulse",
          state === "stopped" && "bg-zinc-400",
          state === "crashed" && "bg-red-400",
        )}
      />
      {LABEL[state]}
    </Badge>
  );
}
