"use client";

import { MatchScoreboard } from "@/components/match-scoreboard";
import { useLivePlayers } from "@/lib/hooks/use-live-players";

/**
 * Who is playing and how they are doing, updating as the log stream reports
 * kills and assists.
 *
 * Deliberately not wrapped in a Card: the two team panels already carry their
 * own border and background, and nesting them inside another one stacks three
 * surfaces to say one thing.
 *
 * The Players page shows the same roster with kick and ban attached — that is
 * the moderation view. This is the watching view, and on an empty server it
 * renders nothing rather than an empty table.
 */
export function LiveScoreboard() {
  const { data: players = [] } = useLivePlayers();
  if (players.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-base font-medium">Scoreboard</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {players.length} connected
        </span>
      </div>
      <MatchScoreboard players={players} />
    </section>
  );
}
