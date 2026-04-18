"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowCounterClockwise,
  ChartLine,
  Coffee,
  Crosshair,
  FastForward,
  Fire,
  Flag,
  GameController,
  Infinity as InfinityIcon,
  Knife,
  Package,
  Path,
  Pause,
  PictureInPicture,
  Play,
  Prohibit,
  Record,
  Shield,
  ShoppingCart,
  Stop,
  Timer,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MatchActionGrid,
  MatchActionTile,
} from "@/components/match/match-action-tile";
import { api } from "@/lib/api/client";
import { useMatchState } from "@/lib/hooks/use-match-state";
import type { MatchPhase } from "@/lib/api/types";

const PHASES: {
  value: MatchPhase;
  label: string;
  icon: Icon;
  iconWeight?: "fill" | "regular";
}[] = [
  { value: "warmup", label: "Warmup", icon: Timer },
  { value: "knife", label: "Knife", icon: Knife },
  { value: "live", label: "Live", icon: Play, iconWeight: "fill" },
  { value: "halftime", label: "Halftime", icon: Pause },
  { value: "ended", label: "Ended", icon: Flag },
];

export default function MatchPage() {
  const { data: match, isLoading } = useMatchState();
  const qc = useQueryClient();
  const [svCheatsOn, setSvCheatsOn] = useState(false);

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
      toast(
        r.demoRecording
          ? "Demo recording started"
          : "Demo recording stopped",
      );
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

  const cheatLocked = !svCheatsOn;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Match Control</h1>
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

        <TabsContent value="competitive" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wide text-blue-400">
                    CT
                  </p>
                  <p className="text-6xl font-bold tabular-nums">
                    {match.score.ct}
                  </p>
                </div>
                <div className="max-w-xs flex-1 space-y-2 text-center">
                  <Badge
                    variant={match.paused ? "destructive" : "outline"}
                    className="gap-1.5 capitalize"
                  >
                    {match.paused ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Timer className="h-3 w-3" />
                    )}
                    {match.phase}
                    {match.paused ? " · paused" : ""}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    Round {match.round} / {match.maxRounds}
                  </p>
                  {match.demoRecording && (
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
                  <p className="text-xs uppercase tracking-wide text-amber-400">
                    T
                  </p>
                  <p className="text-6xl font-bold tabular-nums">
                    {match.score.t}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Phase</CardTitle>
            </CardHeader>
            <CardContent>
              <MatchActionGrid layout="phase">
                {PHASES.map((p) => {
                  const isCurrent = match.phase === p.value;
                  const Icon = p.icon;
                  return (
                    <MatchActionTile
                      key={p.value}
                      icon={Icon}
                      iconWeight={p.iconWeight}
                      label={p.label}
                      variant={isCurrent ? "active" : "outline"}
                      pressed={isCurrent}
                      disabled={setPhase.isPending}
                      pending={setPhase.isPending}
                      onClick={() => setPhase.mutate(p.value)}
                    />
                  );
                })}
              </MatchActionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Live actions</CardTitle>
            </CardHeader>
            <CardContent>
              <MatchActionGrid layout="actions">
                <MatchActionTile
                  icon={match.paused ? Play : Pause}
                  iconWeight={match.paused ? "fill" : "regular"}
                  label={match.paused ? "Resume" : "Pause"}
                  variant={match.paused ? "default" : "outline"}
                  disabled={pause.isPending}
                  pending={pause.isPending}
                  onClick={() => pause.mutate()}
                />
                <MatchActionTile
                  icon={ArrowCounterClockwise}
                  label="Restart round"
                  description="mp_restartgame 1"
                  variant="outline"
                  disabled={rcon.isPending}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("mp_restartgame 1")}
                />
                <MatchActionTile
                  icon={match.demoRecording ? Stop : Record}
                  iconWeight={match.demoRecording ? "fill" : "regular"}
                  label={match.demoRecording ? "Stop demo" : "Record demo"}
                  variant={match.demoRecording ? "destructive" : "outline"}
                  disabled={demo.isPending}
                  pending={demo.isPending}
                  onClick={() => demo.mutate()}
                />
              </MatchActionGrid>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="casual" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Casual / Deathmatch</CardTitle>
            </CardHeader>
            <CardContent>
              <MatchActionGrid layout="casual">
                <MatchActionTile
                  icon={GameController}
                  label="Deathmatch"
                  description="game_type 1 · game_mode 2"
                  variant="outline"
                  disabled={rcon.isPending}
                  pending={rcon.isPending}
                  onClick={() =>
                    rcon.mutate("game_type 1; game_mode 2")
                  }
                />
                <MatchActionTile
                  icon={Coffee}
                  label="Casual"
                  description="game_type 0 · game_mode 0"
                  variant="outline"
                  disabled={rcon.isPending}
                  pending={rcon.isPending}
                  onClick={() =>
                    rcon.mutate("game_type 0; game_mode 0")
                  }
                />
                <MatchActionTile
                  icon={ArrowCounterClockwise}
                  label="Restart"
                  description="mp_restartgame 1"
                  variant="outline"
                  disabled={rcon.isPending}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("mp_restartgame 1")}
                />
              </MatchActionGrid>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="practice" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Developer cheats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-none border p-3">
                <div>
                  <Label htmlFor="sv-cheats">sv_cheats</Label>
                  <p className="text-xs text-muted-foreground">
                    Sends <span className="font-mono text-foreground">sv_cheats 1</span>{" "}
                    or <span className="font-mono text-foreground">0</span> via
                    RCON. While off, cheat-dependent utility below is disabled.
                  </p>
                </div>
                <Switch
                  id="sv-cheats"
                  checked={svCheatsOn}
                  disabled={rcon.isPending}
                  onCheckedChange={(on) => {
                    rcon.mutate(on ? "sv_cheats 1" : "sv_cheats 0", {
                      onSuccess: () => setSvCheatsOn(on),
                    });
                  }}
                  aria-label="Toggle sv_cheats"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Practice / Solo</CardTitle>
            </CardHeader>
            <CardContent>
              <MatchActionGrid layout="practice">
                <MatchActionTile
                  icon={FastForward}
                  label="End warmup"
                  description="mp_warmup_end"
                  variant="outline"
                  disabled={rcon.isPending}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("mp_warmup_end")}
                />
                <MatchActionTile
                  icon={Shield}
                  label="Add CT bot"
                  variant="outline"
                  disabled={rcon.isPending}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("bot_add_ct")}
                />
                <MatchActionTile
                  icon={Fire}
                  label="Add T bot"
                  variant="outline"
                  disabled={rcon.isPending}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("bot_add_t")}
                />
                <MatchActionTile
                  icon={Prohibit}
                  label="Kick all bots"
                  description="bot_kick"
                  variant="outline"
                  disabled={rcon.isPending}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("bot_kick")}
                />
                <MatchActionTile
                  icon={InfinityIcon}
                  label="Infinite ammo"
                  description="sv_infinite_ammo 1"
                  variant="outline"
                  disabled={rcon.isPending || cheatLocked}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("sv_infinite_ammo 1")}
                />
                <MatchActionTile
                  icon={ShoppingCart}
                  label="Buy anywhere"
                  description="mp_buy_anywhere 1"
                  variant="outline"
                  disabled={rcon.isPending || cheatLocked}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("mp_buy_anywhere 1")}
                />
              </MatchActionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Grenade practice</CardTitle>
              <CardDescription>
                CS2 utility helpers: picture-in-picture landing preview, aim
                trajectory, and post-throw flight trails. Turn on{" "}
                <span className="font-medium text-foreground">
                  Developer cheats
                </span>{" "}
                above first. Only works on servers where cheats / RCON are
                allowed (not Valve matchmaking).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MatchActionGrid layout="nades">
                <MatchActionTile
                  icon={PictureInPicture}
                  label="Landing PIP"
                  description="sv_grenade_trajectory_prac_pipreview 1"
                  variant="outline"
                  disabled={rcon.isPending || cheatLocked}
                  pending={rcon.isPending}
                  onClick={() =>
                    rcon.mutate("sv_grenade_trajectory_prac_pipreview 1")
                  }
                />
                <MatchActionTile
                  icon={Crosshair}
                  label="Aim trajectory"
                  description="cl_grenadepreview 1"
                  variant="outline"
                  disabled={rcon.isPending || cheatLocked}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("cl_grenadepreview 1")}
                />
                <MatchActionTile
                  icon={ChartLine}
                  label="Flight trail"
                  description="sv_grenade_trajectory_prac_trailtime 8"
                  variant="outline"
                  disabled={rcon.isPending || cheatLocked}
                  pending={rcon.isPending}
                  onClick={() =>
                    rcon.mutate("sv_grenade_trajectory_prac_trailtime 8")
                  }
                />
                <MatchActionTile
                  icon={Path}
                  label="Trajectory lines"
                  description="sv_grenade_trajectory 1"
                  variant="outline"
                  disabled={rcon.isPending || cheatLocked}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("sv_grenade_trajectory 1")}
                />
                <MatchActionTile
                  icon={Package}
                  label="5 grenades"
                  description="ammo_grenade_limit_total 5"
                  variant="outline"
                  disabled={rcon.isPending || cheatLocked}
                  pending={rcon.isPending}
                  onClick={() => rcon.mutate("ammo_grenade_limit_total 5")}
                />
              </MatchActionGrid>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
