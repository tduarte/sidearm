"use client";

import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A player on a roster. `id` is a Steam64 — the stable key MatchZy matches
 * against — never the volatile RCON slot id.
 */
export type TeamEntry = {
  id: string;
  name: string;
  /**
   * Whether this player is on the server right now. Rosters can carry offline
   * players on purpose: a template saved last week lists the whole group, and
   * MatchZy locks each of them to their team as they connect.
   */
  connected: boolean;
};

/**
 * The roster forms as two visible columns rather than a chip you tap through
 * three states. The old cycle (none → team1 → team2 → none) meant reading tint
 * to know where anyone was and three taps to undo one mistake; here each
 * unassigned player has one arrow per team, pointing at the column it fills,
 * and one tap on a rostered player sends them back.
 */
export function TeamBuilder({
  pool,
  team1,
  team2,
  team1Name,
  team2Name,
  onTeam1Name,
  onTeam2Name,
  onAssign,
  onRemove,
}: {
  /** Connected, roster-eligible players not yet on a team. */
  pool: { id: string; name: string }[];
  team1: TeamEntry[];
  team2: TeamEntry[];
  team1Name: string;
  team2Name: string;
  onTeam1Name: (name: string) => void;
  onTeam2Name: (name: string) => void;
  onAssign: (id: string, side: "team1" | "team2") => void;
  onRemove: (id: string) => void;
}) {
  const columns = [
    {
      key: "team1" as const,
      label: "Team 1",
      name: team1Name,
      onName: onTeam1Name,
      entries: team1,
      dot: "bg-primary",
    },
    {
      key: "team2" as const,
      label: "Team 2",
      name: team2Name,
      onName: onTeam2Name,
      entries: team2,
      dot: "bg-info",
    },
  ];

  return (
    <div className="space-y-3">
      {pool.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pool.map((p) => (
            <div
              key={p.id}
              className="flex items-stretch overflow-hidden border bg-card"
            >
              <button
                type="button"
                aria-label={`Put ${p.name} on ${team1Name}`}
                onClick={() => onAssign(p.id, "team1")}
                className="flex min-h-11 items-center px-3 text-primary transition-colors hover:bg-primary/15"
              >
                <CaretLeft weight="bold" className="size-4" />
              </button>
              <span className="flex min-h-11 min-w-0 items-center border-x px-2.5 text-sm">
                <span className="max-w-40 truncate">{p.name}</span>
              </span>
              <button
                type="button"
                aria-label={`Put ${p.name} on ${team2Name}`}
                onClick={() => onAssign(p.id, "team2")}
                className="flex min-h-11 items-center px-3 text-info transition-colors hover:bg-info/15"
              >
                <CaretRight weight="bold" className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {columns.map((col) => (
          <div key={col.key} className="border bg-card">
            <div className="flex items-center gap-2 border-b px-2.5 py-2">
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", col.dot)}
              />
              <Input
                aria-label={`${col.label} name`}
                value={col.name}
                onChange={(e) => col.onName(e.target.value)}
                className="h-7 min-w-0 flex-1 rounded-md border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-1"
              />
              <span className="text-xs tabular-nums text-muted-foreground">
                {col.entries.length}
              </span>
            </div>
            {col.entries.length === 0 ? (
              <p className="px-2.5 py-3.5 text-xs text-muted-foreground">
                No one yet — use the arrows.
              </p>
            ) : (
              <ul className="divide-y">
                {col.entries.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onRemove(p.id)}
                      aria-label={`Take ${p.name} off ${col.name}`}
                      className="flex min-h-11 w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                    >
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          !p.connected && "text-muted-foreground",
                        )}
                      >
                        {p.name}
                        {!p.connected && (
                          <span className="ml-1.5 text-xs">· offline</span>
                        )}
                      </span>
                      <X className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
