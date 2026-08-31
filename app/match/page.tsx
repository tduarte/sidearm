"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/load-error";
import { DemoList } from "@/components/match/demo-list";
import { LiveActionsCard } from "@/components/match/live-actions";
import { ManualControls } from "@/components/match/manual-controls";
import { MatchSetup } from "@/components/match/match-setup";
import { ModeSections } from "@/components/match/mode-sections";
import { RoundBackups } from "@/components/match/round-backups";
import { ScoreboardHero, StatusStrip } from "@/components/match/scoreboard";
import { useMatchState } from "@/lib/hooks/use-match-state";
import type { MatchState } from "@/lib/api/types";

/**
 * Is a match actually being played right now?
 *
 * Deliberately NOT `phase === "live"`. This server is up essentially all the
 * time and vanilla `phase` reports live with nobody connected, so treating it
 * as evidence would hide the setup form almost permanently.
 *
 * MatchZy's own gamestate is the only trustworthy signal, and only past the
 * point where the teams have readied up: a loaded config sitting in
 * `warmup` or `waiting_for_players` is the setup still resolving, and that is
 * exactly when you are most likely to want to change it.
 */
function matchUnderway(match: MatchState): boolean {
  switch (match.matchzyState) {
    case "knife":
    case "waiting_for_knife_decision":
    case "going_live":
    case "live":
    case "pending_restore":
      return true;
    default:
      return false;
  }
}

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
  const [tab, setTab] = useState<string | null>(null);

  if (error && !match) {
    return <LoadError what="match state" error={error} onRetry={() => refetch()} />;
  }

  if (isPending || !match) {
    return <Skeleton className="h-96" />;
  }

  const underway = matchUnderway(match);
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
          <LiveActionsCard
            takeover={matchzyLoaded}
            awaitingStart={awaitingStart}
          />
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
