"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowCounterClockwise,
  Flag,
  Knife,
  Pause,
  Play,
  Record,
  Stop,
  Timer,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { useMatchState } from "@/lib/hooks/use-match-state";
import type { MatchPhase } from "@/lib/api/types";

const PHASES: { value: MatchPhase; label: string }[] = [
  { value: "warmup", label: "Warmup" },
  { value: "knife", label: "Knife" },
  { value: "live", label: "Live" },
  { value: "halftime", label: "Halftime" },
  { value: "ended", label: "Ended" },
];

export default function MatchPage() {
  const { data: match, isLoading } = useMatchState();
  const qc = useQueryClient();

  const setPhase = useMutation({
    mutationFn: (phase: MatchPhase) => api.setMatchPhase(phase),
    onSuccess: (_, phase) => {
      toast.success(`Phase: ${phase}`);
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const pause = useMutation({
    mutationFn: () => api.togglePause(),
    onSuccess: (r) => {
      toast(r.paused ? "Match paused" : "Match resumed");
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const demo = useMutation({
    mutationFn: () => api.toggleDemo(),
    onSuccess: (r) => {
      toast(r.demoRecording ? "Demo recording started" : "Demo recording stopped");
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const rcon = useMutation({
    mutationFn: (cmd: string) => api.rcon(cmd),
    onSuccess: (_, cmd) => toast(`rcon: ${cmd}`),
  });

  if (isLoading || !match) {
    return <Skeleton className="h-96" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Match Control</h1>
        <p className="text-sm text-muted-foreground">
          Drive the match flow: warmup → knife → live, pause, score.
        </p>
      </div>

      <Tabs defaultValue="competitive">
        <TabsList>
          <TabsTrigger value="competitive">Competitive 5v5</TabsTrigger>
          <TabsTrigger value="casual">Casual / DM</TabsTrigger>
          <TabsTrigger value="practice">Practice</TabsTrigger>
        </TabsList>

        <TabsContent value="competitive" className="space-y-4 mt-4">
          {/* Scoreboard */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wide text-blue-400">CT</p>
                  <p className="text-6xl font-bold tabular-nums">{match.score.ct}</p>
                </div>
                <div className="flex-1 max-w-xs text-center space-y-2">
                  <Badge
                    variant={match.paused ? "destructive" : "outline"}
                    className="gap-1.5 capitalize"
                  >
                    {match.paused ? <Pause className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
                    {match.phase}
                    {match.paused ? " · paused" : ""}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    Round {match.round} / {match.maxRounds}
                  </p>
                  {match.demoRecording && (
                    <Badge variant="outline" className="gap-1.5 text-red-400 border-red-500/40">
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

          {/* Phase controller */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Phase</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {PHASES.map((p) => (
                  <Button
                    key={p.value}
                    variant={match.phase === p.value ? "default" : "outline"}
                    size="sm"
                    disabled={setPhase.isPending}
                    onClick={() => setPhase.mutate(p.value)}
                    className={cn(match.phase === p.value && "pointer-events-none")}
                  >
                    {p.value === "knife" && <Knife className="h-4 w-4" />}
                    {p.value === "live" && <Play className="h-4 w-4" weight="fill" />}
                    {p.value === "ended" && <Flag className="h-4 w-4" />}
                    {p.value === "warmup" && <Timer className="h-4 w-4" />}
                    {p.value === "halftime" && <Pause className="h-4 w-4" />}
                    {p.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Live actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant={match.paused ? "default" : "outline"}
                onClick={() => pause.mutate()}
                disabled={pause.isPending}
              >
                {match.paused ? <Play className="h-4 w-4" weight="fill" /> : <Pause className="h-4 w-4" />}
                {match.paused ? "Resume" : "Pause"}
              </Button>
              <Button
                variant="outline"
                onClick={() => rcon.mutate("mp_restartgame 1")}
              >
                <ArrowCounterClockwise className="h-4 w-4" />
                Restart round
              </Button>
              <Button
                variant={match.demoRecording ? "destructive" : "outline"}
                onClick={() => demo.mutate()}
                disabled={demo.isPending}
              >
                {match.demoRecording ? <Stop className="h-4 w-4" weight="fill" /> : <Record className="h-4 w-4" />}
                {match.demoRecording ? "Stop demo" : "Record demo"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="casual" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Casual / Deathmatch</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => rcon.mutate("game_type 1; game_mode 2")}>
                Set deathmatch
              </Button>
              <Button variant="outline" onClick={() => rcon.mutate("game_type 0; game_mode 0")}>
                Set casual
              </Button>
              <Button variant="outline" onClick={() => rcon.mutate("mp_restartgame 1")}>
                <ArrowCounterClockwise className="h-4 w-4" />
                Restart
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="practice" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Practice / Solo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => rcon.mutate("sv_cheats 1")}>
                sv_cheats 1
              </Button>
              <Button variant="outline" onClick={() => rcon.mutate("mp_warmup_end")}>
                End warmup
              </Button>
              <Button variant="outline" onClick={() => rcon.mutate("bot_add_ct")}>
                Add CT bot
              </Button>
              <Button variant="outline" onClick={() => rcon.mutate("bot_add_t")}>
                Add T bot
              </Button>
              <Button variant="outline" onClick={() => rcon.mutate("bot_kick")}>
                Kick all bots
              </Button>
              <Button variant="outline" onClick={() => rcon.mutate("sv_infinite_ammo 1")}>
                Infinite ammo
              </Button>
              <Button variant="outline" onClick={() => rcon.mutate("mp_buy_anywhere 1")}>
                Buy anywhere
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
