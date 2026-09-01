"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/load-error";
import { DemoList } from "@/components/match/demo-list";
import { LiveActionsCard } from "@/components/match/live-actions";
import { LiveScoreboard } from "@/components/match/live-scoreboard";
import { LiveTimeline } from "@/components/match/live-timeline";
import { ManualControls } from "@/components/match/manual-controls";
import { MatchSetup } from "@/components/match/match-setup";
import { ModeSections } from "@/components/match/mode-sections";
import { RoundBackups } from "@/components/match/round-backups";
import { ScoreboardHero, StatusStrip } from "@/components/match/scoreboard";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { matchUnderway } from "@/lib/match/underway";


/**
 * Match Control, split by the two jobs it serves.
 *
 * The page used to show everything at once behind three *mode* tabs
 * (competitive / casual / practice), which put the setup form — the longest
 * thing here — above every mid-match control. The moment you need Pause is
 * never the moment you are building a roster.
 *
 * So the split is now by job rather than by mode: **Live** is what you press
 * while something is happening, **Setup** is what you prepare beforehand. The
 * opening tab is chosen from what the server is doing, and after that the
 * operator's choice wins — both are always one click away, because no
 * derived "is a match on" signal is good enough to justify hiding half the
 * page behind it.
 */
export default function MatchPage() {
  const { data: match, isPending, error, refetch } = useMatchState();
  // Only for the tab default: a pug has no MatchZy state, so "is anyone
  // actually playing" is what separates a live match from a stale phase.
  const { data: status } = useServerStatus();
  const [tab, setTab] = useState<string | null>(null);

  if (error && !match) {
    return <LoadError what="match state" error={error} onRetry={() => refetch()} />;
  }

  if (isPending || !match) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="space-y-3 rounded-lg border p-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="space-y-3 rounded-lg border p-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-9 w-1/2" />
        </div>
      </div>
    );
  }

  const underway = matchUnderway(match, status?.players ?? null);
  // MatchZy owns the map cycle, the gameplay cvars and demo recording from the
  // moment a config is loaded — including its warmup, where the server already
  // refuses `tv_record` from the panel. That is a wider window than `underway`.
  const matchzyLoaded =
    match.matchzyState !== null && match.matchzyState !== "none";
  // Loaded but not started: the ready-up window, where Force start is the
  // only control that changes anything.
  const awaitingStart =
    matchzyLoaded &&
    (match.matchzyState === "warmup" ||
      match.matchzyState === "waiting_for_players");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Match Control</h1>
        <p className="text-sm text-muted-foreground">
          Drive the match: warmup → live → end, pause, sides, demos.
        </p>
        <StatusStrip match={match} />
      </div>

      <Tabs value={tab ?? (underway ? "live" : "setup")} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-4 space-y-4">
          {underway && <ScoreboardHero match={match} />}
          {/*
            The timeline sits with the score because it is the score's story,
            and the controls stay above the fold on a phone: it renders
            nothing at all until a round has been played.
          */}
          <LiveTimeline match={match} />
          <LiveActionsCard
            takeover={matchzyLoaded}
            awaitingStart={awaitingStart}
          />
          <LiveScoreboard />
          {matchzyLoaded && <RoundBackups />}
          <DemoList />
        </TabsContent>

        <TabsContent value="setup" className="mt-4 space-y-4">
          <MatchSetup />
          <ManualControls />
          <ModeSections />
        </TabsContent>
      </Tabs>
    </div>
  );
}
