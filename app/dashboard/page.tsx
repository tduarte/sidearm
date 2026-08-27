"use client";

import {
  Cpu,
  Clipboard,
  Memory,
  UsersThree,
} from "@phosphor-icons/react";
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
import { Roster } from "@/components/players/roster";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useStatHistory } from "@/lib/hooks/use-stat-history";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
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
    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
      VAC secure
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-red-500/30 bg-red-500/15 text-red-400"
      title="The server is running but unlisted and unprotected — usually a dead or missing GSLT. Reissue it at steamcommunity.com/dev/managegameservers."
    >
      VAC insecure
    </Badge>
  );
}

export default function DashboardPage() {
  const isNarrow = useMediaQuery("(max-width: 639px)");
  const { data: status, isPending, error, refetch } = useServerStatus();
  const { data: match } = useMatchState();
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
      {/* Hero */}
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
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Match</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {match ? (
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 lg:gap-16">
              <div className="min-w-[5rem] text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-400">
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
                <p className="text-xs font-medium uppercase tracking-wide text-amber-400">
                  T
                </p>
                <p className="text-5xl font-bold tabular-nums leading-none sm:text-6xl md:text-7xl">
                  {match.score.t}
                </p>
              </div>
            </div>
          ) : (
            <Skeleton className="h-24 w-full max-w-2xl mx-auto" />
          )}
        </CardContent>
      </Card>

      {/* The roster, absorbed from /players — see components/players/roster.tsx */}
      <Roster />

      {/* Stats */}
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
    </div>
  );
}
