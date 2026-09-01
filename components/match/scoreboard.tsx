"use client";

import { Pause, Record, Timer, Users } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import type { MatchState, MatchZySeries, Team } from "@/lib/api/types";

/**
 * The team playing a given side right now, when MatchZy has told us.
 *
 * Sides are read every poll rather than assumed from team1/team2 order,
 * because they swap at the half — pinning a name to a score by position would
 * be right for twelve rounds and wrong for the rest.
 */
function teamOnSide(series: MatchZySeries | null, side: Team): string | null {
  if (!series) return null;
  if (series.team1.side === side) return series.team1.name;
  if (series.team2.side === side) return series.team2.name;
  return null;
}

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
  const paused = match.pause === "paused" || match.pause === "pause_requested";
  const matchzyLabel =
    match.matchzyState && match.matchzyState !== "none"
      ? (MATCHZY_STATE_LABEL[match.matchzyState] ?? match.matchzyState)
      : null;
  const series = match.series;
  const ctName = teamOnSide(series, "CT");
  const tName = teamOnSide(series, "T");
  // Only worth saying for a series: "Map 1 of 1" is noise on a bo1.
  const mapLine =
    series && series.maps.length > 1
      ? `Map ${series.mapNumber + 1} of ${series.maps.length} · ${series.maps[series.mapNumber] ?? "?"}`
      : null;
  // Named, not just two numbers: the big score is by side and the series score
  // is by team, and after a half those are not in the same order.
  const seriesScore =
    series && series.team1.seriesScore + series.team2.seriesScore > 0
      ? `${series.team1.name} ${series.team1.seriesScore}–${series.team2.seriesScore} ${series.team2.name}`
      : null;

  return (
    <Card>
      <CardContent className="py-2">
        <div className="flex items-center justify-center gap-8">
          {/*
            Sides stay put — CT left, T right — and the names move between them
            at the half. The alternative, following each team across the
            screen, means the two big numbers swap places mid-match, which is
            the one thing a scoreboard must never do.
          */}
          <div className="min-w-0 text-center">
            {ctName && (
              <p
                className="mx-auto max-w-32 truncate text-sm font-medium"
                title={ctName}
              >
                {ctName}
              </p>
            )}
            <p className="text-xs uppercase tracking-wide text-team-ct">CT</p>
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
            {(mapLine || seriesScore) && (
              <p className="text-xs text-muted-foreground">
                {[mapLine, seriesScore].filter(Boolean).join(" · ")}
              </p>
            )}
            {match.demo.state === "recording" && (
              <Badge
                variant="outline"
                className="gap-1.5 border-danger/40 text-danger"
              >
                <Record className="h-3 w-3" weight="fill" />
                REC
              </Badge>
            )}
          </div>
          <div className="min-w-0 text-center">
            {tName && (
              <p
                className="mx-auto max-w-32 truncate text-sm font-medium"
                title={tName}
              >
                {tName}
              </p>
            )}
            <p className="text-xs uppercase tracking-wide text-team-t">T</p>
            <p className="text-6xl font-bold tabular-nums">{match.score.t}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The one-line read that sits under the page title in every state.
 *
 * It leads with MatchZy's gamestate whenever a config is loaded, because
 * vanilla `phase` is the misleading one: this server is up around the clock
 * and reports `live` with nobody on it. The player count is here for the same
 * reason — "live · 0 players" is an honest description of an empty server,
 * and "live" alone is not.
 */
export function StatusStrip({ match }: { match: MatchState }) {
  const { data: status } = useServerStatus();
  const paused = match.pause === "paused" || match.pause === "pause_requested";
  const matchzyLabel =
    match.matchzyState && match.matchzyState !== "none"
      ? (MATCHZY_STATE_LABEL[match.matchzyState] ?? match.matchzyState)
      : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Badge
        variant="outline"
        className={matchzyLabel ? "gap-1.5" : "gap-1.5 capitalize"}
      >
        <Timer className="h-3 w-3" />
        {matchzyLabel ?? match.phase}
      </Badge>
      {/*
        Visible from the Setup tab too, which is the point: "what is loaded
        right now" is the question you ask before changing anything.
      */}
      {match.series && (
        <span className="min-w-0 max-w-60 truncate text-xs text-muted-foreground">
          {match.series.team1.name} vs {match.series.team2.name}
        </span>
      )}
      {typeof status?.players === "number" && (
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <Users className="h-3 w-3" />
          {status.players} player{status.players === 1 ? "" : "s"}
        </span>
      )}
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
          className="gap-1.5 border-danger/40 text-danger"
        >
          <Record className="h-3 w-3" weight="fill" />
          REC
        </Badge>
      )}
    </div>
  );
}
