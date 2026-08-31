"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/load-error";
import { DemoList } from "@/components/match/demo-list";
import { LiveActionsCard } from "@/components/match/live-actions";
import { ManualControls } from "@/components/match/manual-controls";
import { MatchSetup } from "@/components/match/match-setup";
import { ModeSections } from "@/components/match/mode-sections";
import { ScoreboardHero, StatusStrip } from "@/components/match/scoreboard";
import { useMatchState } from "@/lib/hooks/use-match-state";

/**
 * Match Control, ordered by what the server is doing.
 *
 * The page used to show everything at once behind three mode tabs, which put
 * the setup form — the longest thing here — above every mid-match control. The
 * moment you need Pause is never the moment you are building a roster, so the
 * page now answers one of two questions:
 *
 *  - Nothing running: *what do I set up?* Setup leads.
 *  - Something running: *what do I press right now?* The score and the live
 *    actions lead, in the first viewport, on a phone.
 *
 * `takeover` is the stronger case: MatchZy has a config loaded, so it owns the
 * map cycle, the gameplay cvars and demo recording. Setup and the manual
 * knife/phase approximations are not merely lower down then, they are gone —
 * they would fight the plugin over the same settings.
 */
export default function MatchPage() {
  const { data: match, isPending, error, refetch } = useMatchState();

  if (error && !match) {
    return <LoadError what="match state" error={error} onRetry={() => refetch()} />;
  }

  if (isPending || !match) {
    return <Skeleton className="h-96" />;
  }

  const takeover =
    match.matchzyState !== null && match.matchzyState !== "none";
  // A vanilla live match is not a takeover — the panel still owns everything —
  // but it is just as urgent, so it gets the same lead.
  const active = takeover || match.phase === "live";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Match Control</h1>
        <p className="text-sm text-muted-foreground">
          {takeover
            ? "MatchZy is running this match. These are the controls that still reach it."
            : "Drive the match: warmup → live → end, pause, sides, demos."}
        </p>
        {!active && <StatusStrip match={match} />}
      </div>

      {active && (
        <div className="space-y-4">
          <ScoreboardHero match={match} />
          <LiveActionsCard takeover={takeover} />
        </div>
      )}

      {!takeover && (
        <>
          <MatchSetup />
          {!active && <LiveActionsCard takeover={false} />}
          <ManualControls />
        </>
      )}

      <DemoList />
      <ModeSections />
    </div>
  );
}
