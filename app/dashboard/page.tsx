"use client";

import {
  Pulse,
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
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useStatHistory } from "@/lib/hooks/use-stat-history";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { useLivePlayers } from "@/lib/hooks/use-live-players";
import { MatchScoreboard } from "@/components/match-scoreboard";
import { RecentPlayersDataTable } from "@/components/recent-players/recent-players-data-table";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";

function formatUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

export default function DashboardPage() {
  const isNarrow = useMediaQuery("(max-width: 639px)");
  const { data: status, isLoading } = useServerStatus();
  const { data: match } = useMatchState();
  const { data: livePlayers, isLoading: playersLoading } = useLivePlayers();
  const { cpu, mem, fps } = useStatHistory();

  if (isLoading || !status) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32" />
        <Skeleton className="min-h-64 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
              <Badge variant="outline">tick {status.tickrate}</Badge>
            </div>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <h1 className="min-w-0 shrink text-2xl font-semibold">
                {status.map}
              </h1>
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
                  {match.paused ? " · paused" : ""}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Round {match.round} of {match.maxRounds}
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
          {playersLoading ? (
            <Skeleton className="min-h-48 w-full" />
          ) : (
            <MatchScoreboard players={livePlayers ?? []} />
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 [&>*]:min-h-0">
        <StatCard
          label="Players"
          value={`${status.players}/${status.maxPlayers}`}
          sub={
            <div className="flex min-h-0 flex-col gap-2">
              {match ? (
                <p className="text-xs text-muted-foreground">
                  round {match.round}/{match.maxRounds}
                </p>
              ) : null}
              <RecentPlayersDataTable
                players={livePlayers}
                loading={playersLoading}
                max={4}
              />
            </div>
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
        <StatCard
          label="FPS"
          value={status.fps}
          sub={<Sparkline data={fps} variant="fps" />}
          icon={<Pulse className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}
