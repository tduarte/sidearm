"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RoundRecord } from "@/lib/api/types";

/**
 * How a match was actually won, round by round.
 *
 * The win condition was matched by the log parser and thrown away, so a match
 * was one row with a final score and no story: a 16-14 that went to overtime
 * looked exactly like a 16-14 where one side collapsed at halftime.
 */
export function RoundTimeline({ rounds }: { rounds: RoundRecord[] }) {
  if (rounds.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No round detail recorded for this match.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1" role="list" aria-label="Round results">
      {rounds.map((r) => (
        <Tooltip key={r.round}>
          <TooltipTrigger asChild>
            <span
              role="listitem"
              className={cn(
                "h-5 w-5 border text-center text-[0.6rem] leading-[1.15rem] tabular-nums",
                r.winner === "CT"
                  ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                  : "border-amber-500/40 bg-amber-500/15 text-amber-300",
              )}
            >
              {r.round}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <span className="font-mono text-xs">
              Round {r.round} · {r.winner} · {describeReason(r.reason)} ·{" "}
              {r.score.ct}–{r.score.t}
            </span>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * Turns the SFUI id into something readable, without hiding one it has not
 * seen before — an unknown condition shows its own name rather than "other".
 */
function describeReason(reason: string): string {
  const known: Record<string, string> = {
    bomb_defused: "bomb defused",
    target_bombed: "bomb detonated",
    target_saved: "time expired",
    terrorists_win: "T elimination",
    c_ts_win: "CT elimination",
    ct_win_elimination: "CT elimination",
    t_win_elimination: "T elimination",
    hostages_rescued: "hostages rescued",
    hostages_not_rescued: "hostages held",
  };
  return known[reason] ?? reason.replace(/_/g, " ");
}
