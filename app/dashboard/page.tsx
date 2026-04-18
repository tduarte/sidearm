"use client";

import {
  Pulse,
  Cpu,
  GameController,
  GlobeHemisphereWest,
  MapPin,
  Memory,
  UsersThree,
  Link as LinkIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/sparkline";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useStatHistory } from "@/lib/hooks/use-stat-history";
import { useMatchState } from "@/lib/hooks/use-match-state";

function formatUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

export default function DashboardPage() {
  const { data: status, isLoading } = useServerStatus();
  const { data: match } = useMatchState();
  const { cpu, mem, fps } = useStatHistory();

  if (isLoading || !status) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const memPct = Math.round((status.memMb / status.memMaxMb) * 100);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <StatusPill state={status.state} />
                <Badge variant="secondary">{status.gameMode}</Badge>
                <Badge variant="outline">tick {status.tickrate}</Badge>
              </div>
              <h1 className="text-2xl font-semibold">
                {status.map}
              </h1>
              <p className="text-sm text-muted-foreground">
                Uptime {formatUptime(status.uptimeSec)} · {status.ip}:{status.port}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(status.connectUrl);
                  toast.success("Connect URL copied");
                }}
              >
                <LinkIcon className="h-4 w-4" />
                Copy connect URL
              </Button>
              <code className="rounded-md bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">
                {status.connectUrl}
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Players"
          value={`${status.players}/${status.maxPlayers}`}
          sub={match ? `round ${match.round}/${match.maxRounds}` : undefined}
          icon={<UsersThree className="h-5 w-5" />}
        />
        <StatCard
          label="CPU"
          value={`${status.cpuPct}%`}
          sub={<Sparkline data={cpu} />}
          icon={<Cpu className="h-5 w-5" />}
        />
        <StatCard
          label="Memory"
          value={`${(status.memMb / 1024).toFixed(1)} GB`}
          sub={
            <div className="space-y-1">
              <Progress value={memPct} className="h-1.5" />
              <span className="text-xs">{memPct}% of {(status.memMaxMb / 1024).toFixed(0)}GB</span>
            </div>
          }
          icon={<Memory className="h-5 w-5" />}
        />
        <StatCard
          label="FPS"
          value={status.fps}
          sub={<Sparkline data={fps} />}
          icon={<Pulse className="h-5 w-5" />}
        />
      </div>

      {/* Match summary + connect */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Match</CardTitle>
          </CardHeader>
          <CardContent>
            {match ? (
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-xs uppercase text-blue-400">CT</p>
                  <p className="text-4xl font-bold tabular-nums">{match.score.ct}</p>
                </div>
                <div className="flex-1 text-center">
                  <Badge variant="outline" className="capitalize">
                    {match.phase}
                    {match.paused ? " · paused" : ""}
                  </Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Round {match.round} of {match.maxRounds}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs uppercase text-amber-400">T</p>
                  <p className="text-4xl font-bold tabular-nums">{match.score.t}</p>
                </div>
              </div>
            ) : (
              <Skeleton className="h-16" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Network</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                <GlobeHemisphereWest className="h-4 w-4" /> IP
              </span>
              <span className="font-mono">{status.ip}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> Port
              </span>
              <span className="font-mono">{status.port}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                <GameController className="h-4 w-4" /> Mode
              </span>
              <span className="capitalize">{status.gameMode}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Memory trend</span>
              <div className="w-24">
                <Sparkline data={mem} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
