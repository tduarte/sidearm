"use client";

/**
 * The match is the dashboard.
 *
 * There is no hero card stating the map and the mode above a form that states
 * them again — the scoreboard is the control surface, and everything it shows
 * is either editable in place or honestly read-only. See
 * `components/broadcast/match-stage.tsx` for what that means and what it
 * deliberately leaves to the draft flow.
 *
 * Server health is still on this page, but as a hairline strip under the
 * roster rather than three tiles. CPU and memory answer a question asked about
 * once a month; the roster answers the one asked every time.
 */

import { MatchStage } from "@/components/broadcast/match-stage";
import { LoadError } from "@/components/load-error";
import { FirstRun, isFirstRun } from "@/components/first-run";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useMatchState } from "@/lib/hooks/use-match-state";

export default function DashboardPage() {
  const { data: status, isPending, error, refetch } = useServerStatus();
  const { data: match } = useMatchState();

  if (error && !status) {
    return (
      <div className="bc__stageIn">
        <LoadError
          what="server status"
          error={error}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  // A server that has never been reachable is downloading itself, not broken.
  if (status && isFirstRun(status)) {
    return (
      <div className="bc__stageIn">
        <FirstRun status={status} />
      </div>
    );
  }

  if (isPending || !status) {
    return <p className="bc__wait">Reading the server…</p>;
  }

  return <MatchStage status={status} match={match} />;
}
