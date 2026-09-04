"use client";

import { Fragment } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RoundRecord } from "@/lib/api/types";

/**
 * How a match was actually won, round by round.
 *
 * The win condition was matched by the log parser and thrown away, so a match
 * was one row with a final score and no story: a 16-14 that went to overtime
 * looked exactly like a 16-14 where one side collapsed at halftime.
 */
export function RoundTimeline({
  rounds,
  /**
   * Round number the sides swap after, if known. Drawn as a gap, because
   * "CT won rounds 1-12" and "CT won rounds 13-24" describe two different
   * sets of five people and a timeline that does not show the switch invites
   * reading them as one.
   */
  halfAt,
}: {
  rounds: RoundRecord[];
  halfAt?: number | null;
}) {
  if (rounds.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No round detail recorded for this match.
      </p>
    );
  }

  return (
    <div
      className="flex flex-wrap gap-1"
      role="list"
      aria-label="Round results"
    >
      {rounds.map((r) => (
        <Fragment key={r.round}>
          {halfAt != null && r.round === halfAt + 1 && (
            <span aria-hidden className="mx-1 h-5 w-px self-center bg-border" />
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="listitem"
                className={cn(
                  "h-5 w-5 border text-center text-[0.6rem] leading-[1.15rem] tabular-nums",
                  r.winner === "CT"
                    ? "border-team-ct/40 bg-team-ct/12 text-team-ct"
                    : "border-team-t/40 bg-team-t/12 text-team-t",
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
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Turns the SFUI id into something readable, without hiding one it has not
 * seen before — an unknown condition shows its own name rather than "other".
 */
export function describeReason(reason: string): string {
  // Keyed on what `winReason` actually produces from CS2's SFUI notice ids —
  // `SFUI_Notice_CTs_Win` comes through as `cts_win`, verified against the
  // live server's own recorded rounds. The invented spellings that used to be
  // here (`c_ts_win`, `ct_win_elimination`) matched nothing, so the one
  // outcome most rounds end with fell through to the raw id.
  const known: Record<string, string> = {
    bomb_defused: "bomb defused",
    target_bombed: "bomb detonated",
    target_saved: "time expired",
    cts_win: "CT elimination",
    terrorists_win: "T elimination",
    all_hostages_rescued: "hostages rescued",
    hostages_rescued: "hostages rescued",
    hostages_not_rescued: "hostages held",
  };
  return known[reason] ?? reason.replace(/_/g, " ");
}
