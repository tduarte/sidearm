"use client";

import { Pause, Record, Timer } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { MatchState } from "@/lib/api/types";

/**
 * Human-readable labels for MatchZy's gamestate.
 *
 * `none` never reaches the UI — the takeover layout only renders when
 * something is actually loaded.
 */
export const MATCHZY_STATE_LABEL: Record<string, string> = {
  pending_restore: "Restoring a round backup",
  waiting_for_players: "Waiting for players",
  warmup: "Warmup — waiting for teams to ready up",
  knife: "Knife round",
  waiting_for_knife_decision: "Knife won — waiting for a side decision",
  going_live: "Going live",
  live: "Live",
  post_game: "Match over",
};

function pauseSuffix(match: MatchState): string {
  if (match.pause === "paused") return " · paused";
  if (match.pause === "pause_requested") return " · pausing at round end";
  return "";
}

/** The big score read: leads the page whenever a match is actually on. */
export function ScoreboardHero({ match }: { match: MatchState }) {
  const paused =
    match.pause === "paused" || match.pause === "pause_requested";
  const matchzyLabel =
    match.matchzyState && match.matchzyState !== "none"
      ? (MATCHZY_STATE_LABEL[match.matchzyState] ?? match.matchzyState)
      : null;

  return (
    <Card>
      <CardContent className="py-2">
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-blue-400">CT</p>
            <p className="text-6xl font-bold tabular-nums">{match.score.ct}</p>
          </div>
          <div className="max-w-xs flex-1 space-y-2 text-center">
            <Badge
              variant={paused ? "destructive" : "outline"}
              className={matchzyLabel ? "gap-1.5" : "gap-1.5 capitalize"}
            >
              {paused ? (
                <Pause className="h-3 w-3" />
              ) : (
                <Timer className="h-3 w-3" />
              )}
              {matchzyLabel ?? match.phase}
              {pauseSuffix(match)}
            </Badge>
            <p className="text-sm text-muted-foreground">
              Round {match.round}
              {match.maxRounds === null ? "" : ` / ${match.maxRounds}`}
            </p>
            {match.demo.state === "recording" && (
              <Badge
                variant="outline"
                className="gap-1.5 border-red-500/40 text-red-400"
              >
                <Record className="h-3 w-3" weight="fill" />
                REC
              </Badge>
            )}
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-amber-400">T</p>
            <p className="text-6xl font-bold tabular-nums">{match.score.t}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The one-line read for when nothing urgent is on: phase, score if any, and
 * whatever the panel is still holding (pause, recording). Sits under the page
 * title so the big scoreboard card is not dead weight on an idle server.
 */
export function StatusStrip({ match }: { match: MatchState }) {
  const paused =
    match.pause === "paused" || match.pause === "pause_requested";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Badge variant="outline" className="gap-1.5 capitalize">
        <Timer className="h-3 w-3" />
        {match.phase}
      </Badge>
      {(match.round > 0 || match.score.ct + match.score.t > 0) && (
        <span className="text-xs tabular-nums text-muted-foreground">
          Round {match.round}
          {match.maxRounds === null ? "" : ` / ${match.maxRounds}`} · CT{" "}
          {match.score.ct} – {match.score.t} T
        </span>
      )}
      {paused && (
        <Badge variant="destructive" className="gap-1.5">
          <Pause className="h-3 w-3" />
          {match.pause === "paused" ? "Paused" : "Pausing at round end"}
        </Badge>
      )}
      {match.demo.state === "recording" && (
        <Badge
          variant="outline"
          className="gap-1.5 border-red-500/40 text-red-400"
        >
          <Record className="h-3 w-3" weight="fill" />
          REC
        </Badge>
      )}
    </div>
  );
}
