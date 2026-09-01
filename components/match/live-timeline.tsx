"use client";

import { useState } from "react";
import { Bomb, Scissors, Star } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RoundTimeline } from "@/components/history/round-timeline";
import { useLiveRounds } from "@/lib/hooks/use-live-rounds";
import { useServerEvents } from "@/lib/ws/client";
import type { MatchState, RoundEventKind, RoundRecord } from "@/lib/api/types";

const ROUND_EVENT: Record<RoundEventKind, { icon: Icon; label: string }> = {
  bomb_planted: { icon: Bomb, label: "planted the bomb" },
  bomb_defused: { icon: Scissors, label: "defused it" },
  mvp: { icon: Star, label: "took MVP" },
};

/** How many rounds the side currently ahead has taken in a row. */
function streak(rounds: RoundRecord[]): { team: "CT" | "T"; count: number } | null {
  const last = rounds.at(-1);
  if (!last) return null;
  let count = 0;
  for (let i = rounds.length - 1; i >= 0 && rounds[i].winner === last.winner; i--) {
    count++;
  }
  return count >= 2 ? { team: last.winner as "CT" | "T", count } : null;
}

/**
 * The match as it is being played: every round so far, and what is happening
 * in the one on screen.
 *
 * The rounds were already being written to the database on every `Round_End`,
 * but only history could read them — so the panel could tell you a match ended
 * 16-14 and never that the last eight rounds went one way. This is the same
 * data one match earlier.
 *
 * It renders nothing until there is something to say. On a server sitting in
 * warmup an empty timeline is just a box.
 */
export function LiveTimeline({ match }: { match: MatchState }) {
  const { data: rounds = [] } = useLiveRounds();
  const [current, setCurrent] = useState<
    { id: number; kind: RoundEventKind; name: string }[]
  >([]);

  useServerEvents(["round.event", "round.start"], (e) => {
    // Cleared at the buzzer, not capped at N: these describe the round you are
    // watching, and a bomb plant from two rounds ago reads as one happening now.
    if (e.type === "round.start") {
      setCurrent([]);
      return;
    }
    if (e.type !== "round.event") return;
    setCurrent((prev) => [
      ...prev,
      { id: prev.length, kind: e.kind, name: e.name },
    ]);
  });

  if (rounds.length === 0 && current.length === 0) return null;

  const run = streak(rounds);
  // Sides swap at the half, so a round number means a different five people
  // either side of it. Only marked when the round limit is known and even —
  // MR12 is 24, but `maxRounds` is null until the server has been read.
  const halfAt =
    match.maxRounds != null && match.maxRounds % 2 === 0
      ? match.maxRounds / 2
      : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Round timeline</CardTitle>
        <CardAction className="text-xs tabular-nums text-muted-foreground">
          {rounds.length} played
          {run && (
            <>
              {" · "}
              <span
                className={run.team === "CT" ? "text-blue-400" : "text-amber-400"}
              >
                {run.team} on {run.count}
              </span>
            </>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {rounds.length > 0 && <RoundTimeline rounds={rounds} halfAt={halfAt} />}
        {current.length > 0 && (
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {current.map((e) => {
              const { icon: EventIcon, label } = ROUND_EVENT[e.kind];
              return (
                <li key={e.id} className="flex items-center gap-1.5">
                  <EventIcon
                    className="size-3.5 shrink-0 text-foreground/70"
                    weight="fill"
                  />
                  <span className="truncate text-foreground">{e.name}</span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
