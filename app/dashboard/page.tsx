"use client";

import {
  Cpu,
  Clipboard,
  Memory,
  UsersThree,
} from "@phosphor-icons/react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MemoryStatCard } from "@/components/memory-stat-card";
import { Sparkline } from "@/components/sparkline";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { LoadError } from "@/components/load-error";
import { FirstRun, isFirstRun } from "@/components/first-run";
import { UpdateProgressCard } from "@/components/update-progress-card";
import { Roster } from "@/components/players/roster";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useStatHistory } from "@/lib/hooks/use-stat-history";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useCan } from "@/components/session-provider";
import { cn } from "@/lib/utils";

function formatUptime(s: number | null) {
  if (s === null) return "unknown";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

/** `null` = RCON has not answered; `false` is the dead-GSLT signature. */
function VacBadge({ secure }: { secure: boolean | null }) {
  if (secure === null) return null;
  return secure ? (
    <Badge variant="outline" className="border-ok/30 bg-ok/12 text-ok">
      VAC secure
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-danger/30 bg-danger/12 text-danger"
      title="The server is running but unlisted and unprotected — usually a dead or missing GSLT. Reissue it at steamcommunity.com/dev/managegameservers."
    >
      VAC insecure
    </Badge>
  );
}

export default function DashboardPage() {
  const isNarrow = useMediaQuery("(max-width: 639px)");
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
        <Skeleton className="h-32" />
        <Skeleton className="min-h-64 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
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
        Hero.

        The map is the headline at every size. A previous pass moved it to
        mobile-only because the top bar also carries it, which was the wrong
        trade: the top bar is a sticky context strip and repeating the map
        there is what a breadcrumb is for, while "what are we on" is the single
        most-asked question about a server and belongs in the largest type on
        the page. What that pass got right — telemetry above the roster — is
        kept below.
      */}
      <Card>
        <CardContent className="p-6 max-sm:pr-8">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill state={status.state} />
              <Badge variant="secondary">{status.gameMode}</Badge>
              <VacBadge secure={status.vacSecure} />
            </div>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 shrink">
                <p className="truncate text-sm text-muted-foreground" title={status.hostname}>
                  {status.hostname}
                </p>
                <h1 className="min-w-0 truncate font-mono text-2xl font-semibold tracking-tight">
                  {status.map}
                </h1>
              </div>
              <div className="flex w-full min-w-0 justify-stretch sm:w-auto sm:shrink-0 sm:justify-end">
                <InputGroup className="h-9 w-full min-w-0 max-w-full sm:w-max">
                  <InputGroupInput
                    readOnly
                    spellCheck={false}
                    value={status.connectUrl}
                    aria-label="Server connect URL"
                    size={
                      isNarrow
                        ? undefined
                        : Math.max(status.connectUrl.length, 12)
                    }
                    className={cn(
                      "font-mono text-xs text-foreground",
                      isNarrow
                        ? "!w-full min-w-0 flex-1 overflow-x-auto"
                        : "!w-auto !max-w-full !flex-none",
                    )}
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-sm"
                      variant="ghost"
                      className="text-primary hover:bg-primary/15 hover:text-primary dark:hover:bg-primary/20"
                      aria-label="Copy connect URL"
                      onClick={() => {
                        navigator.clipboard.writeText(status.connectUrl);
                        toast.success("Connect URL copied");
                      }}
                    >
                      <Clipboard className="size-4" />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Uptime {formatUptime(status.uptimeSec)} · {status.ip}:{status.port}
            </p>
          </div>
        </CardContent>
      </Card>

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

      {/*
        Stats sit above the roster: a ten-row table pushed CPU and memory three
        scrolls down, so the page answered "who is on" long before "is this
        machine coping", which is the question the tiles exist for.
      */}
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

      {/* The roster, absorbed from /players — see components/players/roster.tsx */}
      <Roster />
    </div>
  );
}
