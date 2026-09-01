"use client";

import { Cpu, Memory, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MemoryStatCard } from "@/components/memory-stat-card";
import { Sparkline } from "@/components/sparkline";
import { StatCard } from "@/components/stat-card";
import { LoadError } from "@/components/load-error";
import { FirstRun, isFirstRun } from "@/components/first-run";
import { UpdateProgressCard } from "@/components/update-progress-card";
import { Roster } from "@/components/players/roster";
import { ServerPanel } from "@/components/dashboard/server-panel";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useStatHistory } from "@/lib/hooks/use-stat-history";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { useCan } from "@/components/session-provider";

export default function DashboardPage() {
  const { data: status, isPending, error, refetch } = useServerStatus();
  const { data: match, isPending: matchPending, error: matchError } = useMatchState();
  const canModerate = useCan("moderator");
  const { cpu } = useStatHistory();

  if (error && !status) {
    return <LoadError what="server status" error={error} onRetry={() => refetch()} />;
  }

  // A server that has never been reachable is downloading itself, not broken.
  if (status && isFirstRun(status)) {
    return <FirstRun status={status} />;
  }

  if (isPending || !status) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64" />
        <Skeleton className="min-h-48 w-full" />
        <Skeleton className="min-h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/*
        An update reaches here rather than `FirstRun` whenever the client has
        ever seen the server up: `status-live-sync` keeps the last known map so
        the header does not flash "unknown", which also means `isFirstRun`'s
        map test can never match again in that tab.
      */}
      {status.state === "updating" && (
        <UpdateProgressCard progress={status.updateProgress ?? null} />
      )}

      {/*
        The server, and how it is set, in one card — see
        components/dashboard/server-panel.tsx. It replaces a read-only hero that
        stated the map and the mode and then made you go to Config to change
        either of them.
      */}
      <ServerPanel status={status} match={match} />

      {/* Match + scoreboard */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Match</CardTitle>
          {/*
            The score is the one thing on this page you routinely want to act
            on, and until now the only way from here to the controls was the
            sidebar. Moderators only: for a viewer the link leads to a wall.
          */}
          {canModerate && (
            <Link
              href="/match"
              className="text-xs font-medium text-info hover:underline"
            >
              Match Control
            </Link>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {match ? (
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 lg:gap-16">
              <div className="min-w-[5rem] text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-team-ct">
                  CT
                </p>
                <p className="text-5xl font-bold tabular-nums leading-none sm:text-6xl md:text-7xl">
                  {match.score.ct}
                </p>
              </div>
              <div className="flex max-w-sm flex-col items-center gap-2 text-center">
                <Badge variant="outline" className="capitalize">
                  {match.phase}
                  {match.pause === "paused" ? " · paused" : ""}
                  {match.pause === "pause_requested" ? " · pausing" : ""}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {match.maxRounds === null
                    ? `Round ${match.round}`
                    : `Round ${match.round} of ${match.maxRounds}`}
                </p>
              </div>
              <div className="min-w-[5rem] text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-team-t">
                  T
                </p>
                <p className="text-5xl font-bold tabular-nums leading-none sm:text-6xl md:text-7xl">
                  {match.score.t}
                </p>
              </div>
            </div>
          ) : matchPending ? (
            <div className="mx-auto flex w-full max-w-2xl items-center justify-center gap-12">
              {/* Shaped like the scoreline it stands in for, not a grey slab. */}
              <Skeleton className="h-16 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-16 w-20" />
            </div>
          ) : (
            /*
              An undefined match used to render the loading skeleton forever,
              which said "still fetching" about a request that had already
              finished. These are different situations and read differently.
            */
            <div className="py-6 text-center text-sm text-muted-foreground">
              {matchError ? (
                <>
                  <p>Could not read the match state.</p>
                  <p className="text-xs">
                    The server answers this over RCON; it may be starting up.
                  </p>
                </>
              ) : (
                <>
                  <p>No match is running.</p>
                  <p className="text-xs">
                    Scores appear here once a match goes live.
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* The roster, absorbed from /players — see components/players/roster.tsx */}
      <Roster />

      {/*
        Server health, demoted.

        These tiles used to sit above the roster, on the argument that a
        ten-row table pushed CPU and memory three scrolls down. True, but it
        put "is this machine coping" — asked about once a month — ahead of "who
        is on and what are we playing", which is why anyone opens this page at
        all. They answer a real question, so they stay; they stop being the
        thing you scroll past to reach the answer you came for.
      */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Server health
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-h-0">
          {/*
            The Players tile used to embed a second, smaller roster table — a
            third rendering of the same query, on the same screen as the real one.
          */}
          <StatCard
            label="Players"
            value={`${status.players}/${status.maxPlayers ?? "?"}`}
            sub={
              status.visibleMaxPlayers &&
              status.visibleMaxPlayers !== status.maxPlayers ? (
                <p className="text-xs text-muted-foreground">
                  advertising {status.visibleMaxPlayers}
                </p>
              ) : null
            }
            icon={<UsersThree className="h-5 w-5" />}
          />
          <StatCard
            label="CPU"
            value={`${status.cpuPct}%`}
            sub={<Sparkline data={cpu} variant="cpu" />}
            icon={<Cpu className="h-5 w-5" />}
          />
          <MemoryStatCard
            memMb={status.memMb}
            memMaxMb={status.memMaxMb}
            icon={<Memory className="h-5 w-5" />}
          />
          {/*
            There was an FPS card here. CS2 removed the `stats` table that
            reported server framerate, so the value was the constant 0 and the
            sparkline was a flat line of zeros presented as telemetry. Nothing
            honest can fill it, so it is gone rather than faked.
          */}
        </div>
      </section>
    </div>
  );
}
