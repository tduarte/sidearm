"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowCounterClockwise,
  ArrowsLeftRight,
  ChartLine,
  Coffee,
  FastForward,
  Fire,
  Flag,
  GameController,
  Infinity as InfinityIcon,
  Knife,
  Package,
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
import { LoadError } from "@/components/load-error";
import { CvarTile } from "@/components/match/cvar-tile";
import { DemoList } from "@/components/match/demo-list";
import { MatchSetup } from "@/components/match/match-setup";
import { useCvarGroup } from "@/lib/hooks/use-cvar-group";
import { asBool } from "@/lib/cs2/cvars";
import { practiceSpec } from "@/lib/cs2/practice";
import { api } from "@/lib/api/client";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import type { CvarSpec, MatchPhase } from "@/lib/api/types";

const PHASES: {
  value: MatchPhase;
  label: string;
  icon: Icon;
  iconWeight?: "fill" | "regular";
}[] = [
  // Only phases the server can actually report. Knife and Halftime used to sit
  // here and sent no RCON at all while reporting success; both are now explicit
  // actions below, labelled for what they really do.
  { value: "warmup", label: "Warmup", icon: Timer },
  { value: "live", label: "Live", icon: Play, iconWeight: "fill" },
  { value: "ended", label: "End match", icon: Flag },
];

export default function MatchPage() {
  const { data: match, isLoading, error, refetch } = useMatchState();
  const { data: status } = useServerStatus();
  const qc = useQueryClient();
  // Which tab is open gates the cvar polling: RCON is one serialised socket,
  // so the practice values are only read while they are on screen.
  const [tab, setTab] = useState("competitive");
  const cvars = useCvarGroup("practice", tab === "practice");

  const setPhase = useMutation({
    mutationFn: (phase: MatchPhase) => api.setMatchPhase(phase),
    meta: { action: "Phase change" },
    onSuccess: (_, phase) => {
      toast.success(`Phase: ${phase}`);
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const pause = useMutation({
    mutationFn: (action: "pause" | "unpause") => api.setPause(action),
    meta: { action: "Pause" },
    onSuccess: (_r, action) => {
      toast(
        action === "pause" ? "Pause requested" : "Match resumed",
        action === "pause"
          ? { description: "CS2 applies it at the end of the current round." }
          : undefined,
      );
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const demo = useMutation({
    mutationFn: (action: "start" | "stop") => api.setDemo(action),
    meta: { action: "Demo recording" },
    onSuccess: (r, action) => {
      toast(
        action === "start" ? "Recording started" : "Recording stopped",
        r.demo.name ? { description: `${r.demo.name}.dem` } : undefined,
      );
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const knife = useMutation({
    mutationFn: (action: "setup" | "restore") => api.knife(action),
    meta: { action: "Knife round" },
    onSuccess: (_r, action) => {
      toast.success(
        action === "setup" ? "Knife round set up" : "Gameplay cvars restored",
      );
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const swap = useMutation({
    mutationFn: () => api.swapTeams(),
    meta: { action: "Swapping sides" },
    onSuccess: () => {
      toast.success("Sides swapped");
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const rcon = useMutation({
    mutationFn: (cmd: string) => api.rcon(cmd),
    meta: { action: "Command" },
    onSuccess: (_, cmd) => toast(`rcon: ${cmd}`),
  });

  if (error && !match) {
    return <LoadError what="match state" error={error} onRetry={() => refetch()} />;
  }

  if (isLoading || !match) {
    return <Skeleton className="h-96" />;
  }

  // Read back from the server, not remembered. The old local boolean reset to
  // false on every reload and re-locked the dependent tiles even when the
  // server still had cheats on.
  const cheatsOn = asBool(cvars.byName.get("sv_cheats")?.value ?? undefined);
  const specOf = (name: string): CvarSpec => {
    const spec = practiceSpec(name);
    if (!spec) throw new Error(`No practice spec for ${name}`);
    return spec;
  };
  const paused = match.pause === "paused" || match.pause === "pause_requested";
  const recording = match.demo.state === "recording";
  // Demo recording runs through GOTV; without it `tv_record` fails, so the
  // tile says why rather than offering a button that cannot work.
  const gotvUp = !!status?.gotv;
  // MatchZy runs a real knife round and rewrites the same loadout cvars the
  // panel's approximation does. Leaving both live means two things fighting
  // over one setting, so when the plugin is there, ours stands down.
  const matchzyUp = status?.plugins?.matchzy === true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Match Control</h1>
        <p className="text-sm text-muted-foreground">
          Drive the match: warmup → live → end, pause, sides, demos.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="competitive">Competitive 5v5</TabsTrigger>
          <TabsTrigger value="casual">Casual / DM</TabsTrigger>
          <TabsTrigger value="practice">Practice</TabsTrigger>
        </TabsList>

        <TabsContent value="competitive" className="mt-4 space-y-4">
          {/*
            First, because with MatchZy installed this is how a match actually
            starts — the cards below are the manual approximations it replaces.
          */}
          <MatchSetup />

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
                    variant={paused ? "destructive" : "outline"}
                    className="gap-1.5 capitalize"
                  >
                    {paused ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Timer className="h-3 w-3" />
                    )}
                    {match.phase}
                    {match.pause === "paused" ? " · paused" : ""}
                    {match.pause === "pause_requested"
                      ? " · pausing at round end"
                      : ""}
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
              <CardTitle className="text-base">Round setup</CardTitle>
              <CardDescription>
                {matchzyUp ? (
                  <>
                    MatchZy is loaded and runs the knife round properly —
                    including detecting who won and letting them pick sides.
                    Start it in-game with{" "}
                    <span className="font-mono">.knife</span>, or from the
                    console with{" "}
                    <span className="font-mono">css_start</span>. The panel&apos;s
                    own cvar approximation is switched off here so the two do not
                    fight over the same loadout settings.
                  </>
                ) : (
                  <>
                    CS2 has no native knife round, and vanilla halftime happens
                    on its own at{" "}
                    <span className="font-mono">mp_maxrounds/2</span>. These are
                    cvar approximations: the panel sets the loadout and swaps
                    sides, but it cannot detect who won a knife round or run a
                    match flow for you. That needs a plugin such as Get5 or
                    MatchZy.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MatchActionGrid layout="actions">
                <MatchActionTile
                  icon={Knife}
                  label="Set up knife"
                  description={
                    matchzyUp
                      ? "MatchZy handles this — say .knife in chat"
                      : "knives only, no buy, restart"
                  }
                  variant={match.knifeSetupApplied ? "default" : "outline"}
                  disabled={knife.isPending || match.knifeSetupApplied || matchzyUp}
                  pending={knife.isPending}
                  onClick={() => knife.mutate("setup")}
                />
                <MatchActionTile
                  icon={ArrowCounterClockwise}
                  label="Restore gameplay"
                  description="puts back the values from before"
                  variant="outline"
                  // Deliberately NOT gated on MatchZy, unlike Set up knife. If
                  // the panel applied a knife setup before the plugin arrived,
                  // the baseline on disk is the only way back — disabling this
                  // would strand the server with a knives-only loadout and no
                  // undo. It is already inert unless the panel has something to
                  // restore.
                  disabled={knife.isPending || !match.knifeSetupApplied}
                  pending={knife.isPending}
                  onClick={() => knife.mutate("restore")}
                />
                <MatchActionTile
                  icon={ArrowsLeftRight}
                  label="Swap sides"
                  description="mp_swapteams"
                  variant="outline"
                  disabled={swap.isPending}
                  pending={swap.isPending}
                  onClick={() => swap.mutate()}
                />
              </MatchActionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Live actions</CardTitle>
            </CardHeader>
            <CardContent>
              <MatchActionGrid layout="actions">
                {/*
                  Two tiles, not one toggle. CS2 exposes no pause state to read
                  back, so a single button has to guess which way to go — and
                  after a panel restart it guesses wrong.
                */}
                <MatchActionTile
                  icon={Pause}
                  label="Pause"
                  description="mp_pause_match · at round end"
                  variant={match.pause === "pause_requested" ? "default" : "outline"}
                  disabled={pause.isPending}
                  pending={pause.isPending}
                  onClick={() => pause.mutate("pause")}
                />
                <MatchActionTile
                  icon={Play}
                  iconWeight="fill"
                  label="Resume"
                  description="mp_unpause_match"
                  variant="outline"
                  disabled={pause.isPending}
                  pending={pause.isPending}
                  onClick={() => pause.mutate("unpause")}
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
                {recording ? (
                  <MatchActionTile
                    icon={Stop}
                    iconWeight="fill"
                    label="Stop demo"
                    description="tv_stoprecord"
                    variant="destructive"
                    disabled={demo.isPending || !gotvUp}
                    pending={demo.isPending}
                    onClick={() => demo.mutate("stop")}
                  />
                ) : (
                  <MatchActionTile
                    icon={Record}
                    label="Record demo"
                    description={
                      gotvUp
                        ? "tv_record"
                        : "needs GOTV — set TV_ENABLE=1 and recreate the container"
                    }
                    variant="outline"
                    disabled={demo.isPending || !gotvUp}
                    pending={demo.isPending}
                    onClick={() => demo.mutate("start")}
                  />
                )}
              </MatchActionGrid>
            </CardContent>
          </Card>

          <DemoList />
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
                    Read from the server, not remembered here. While off, the
                    cheat-dependent tiles below are locked and say so.
                    {cheatsOn === null
                      ? " The server has not reported a value yet."
                      : ""}
                  </p>
                </div>
                <Switch
                  id="sv-cheats"
                  checked={cheatsOn === true}
                  disabled={cvars.setCvar.isPending || cheatsOn === null}
                  onCheckedChange={(on) =>
                    cvars.setCvar.mutate({
                      name: "sv_cheats",
                      value: on ? "1" : "0",
                    })
                  }
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
                <CvarTile
                  spec={specOf("sv_infinite_ammo")}
                  state={cvars.byName.get("sv_infinite_ammo")}
                  icon={InfinityIcon}
                  cheatsOn={cheatsOn}
                  pending={cvars.setCvar.isPending}
                  onSet={(value) =>
                    cvars.setCvar.mutate({ name: "sv_infinite_ammo", value })
                  }
                />
                <CvarTile
                  spec={specOf("mp_buy_anywhere")}
                  state={cvars.byName.get("mp_buy_anywhere")}
                  icon={ShoppingCart}
                  cheatsOn={cheatsOn}
                  pending={cvars.setCvar.isPending}
                  onSet={(value) =>
                    cvars.setCvar.mutate({ name: "mp_buy_anywhere", value })
                  }
                />
              </MatchActionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Grenade practice</CardTitle>
              <CardDescription>
                Server-side grenade helpers, which need{" "}
                <span className="font-medium text-foreground">
                  Developer cheats
                </span>{" "}
                on. Each tile shows the value the server currently reports and
                toggles it back off again.
                <br />
                <span className="mt-2 block">
                  Grenade <em>preview</em> is a client setting — the server
                  cannot turn it on for you. Paste{" "}
                  <code className="font-mono text-foreground">
                    cl_grenadepreview 1
                  </code>{" "}
                  into your own console.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MatchActionGrid layout="nades">
                <CvarTile
                  spec={specOf("sv_grenade_trajectory_prac_pipreview")}
                  state={cvars.byName.get("sv_grenade_trajectory_prac_pipreview")}
                  icon={PictureInPicture}
                  cheatsOn={cheatsOn}
                  pending={cvars.setCvar.isPending}
                  onSet={(value) =>
                    cvars.setCvar.mutate({
                      name: "sv_grenade_trajectory_prac_pipreview",
                      value,
                    })
                  }
                />
                <CvarTile
                  spec={specOf("sv_grenade_trajectory_prac_trailtime")}
                  state={cvars.byName.get("sv_grenade_trajectory_prac_trailtime")}
                  icon={ChartLine}
                  cheatsOn={cheatsOn}
                  pending={cvars.setCvar.isPending}
                  onSet={(value) =>
                    cvars.setCvar.mutate({
                      name: "sv_grenade_trajectory_prac_trailtime",
                      value,
                    })
                  }
                />
                <CvarTile
                  spec={specOf("ammo_grenade_limit_total")}
                  state={cvars.byName.get("ammo_grenade_limit_total")}
                  icon={Package}
                  cheatsOn={cheatsOn}
                  pending={cvars.setCvar.isPending}
                  onSet={(value) =>
                    cvars.setCvar.mutate({
                      name: "ammo_grenade_limit_total",
                      value,
                    })
                  }
                />
              </MatchActionGrid>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
