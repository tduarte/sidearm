"use client";

/**
 * The match so far, as a row of rounds, and what is happening in the one on
 * screen.
 *
 * The rounds have been written to the database on every `Round_End` for a
 * while, and only History could read them — so the panel could tell you a
 * finished match went 13-11 but never, during it, that the last six rounds had
 * all gone one way. This is that same data one match earlier, which is the
 * point at which it can still change what you do.
 *
 * On the stage rather than in a card: it is the story of the score above it,
 * and it earns a strip the way the health readout does.
 *
 * It renders nothing until there is something to say. A server sitting in
 * warmup gets no empty box.
 */

import { useState } from "react";
import { Bomb, Scissors, Star } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useLiveRounds } from "@/lib/hooks/use-live-rounds";
import { useServerEvents } from "@/lib/ws/client";
import { describeReason } from "@/components/history/round-timeline";
import type { MatchState, RoundEventKind } from "@/lib/api/types";

const ROUND_EVENT: Record<RoundEventKind, { icon: Icon; label: string }> = {
  bomb_planted: { icon: Bomb, label: "planted the bomb" },
  bomb_defused: { icon: Scissors, label: "defused it" },
  mvp: { icon: Star, label: "took MVP" },
};

export function RoundStrip({ match }: { match: MatchState | undefined }) {
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
    setCurrent((prev) => [...prev, { id: prev.length, kind: e.kind, name: e.name }]);
  });

  if (rounds.length === 0 && current.length === 0) return null;

  // Where the sides swap. Only drawn when the limit is known and even — MR12
  // is 24, but `maxRounds` is null until the status poll has answered, and a
  // divider in the wrong place is worse than none.
  const halfAt =
    match?.maxRounds != null && match.maxRounds % 2 === 0
      ? match.maxRounds / 2
      : null;

  // How many the side currently ahead has taken in a row. Two is not a run;
  // three is the thing someone calls a timeout over.
  const last = rounds.at(-1);
  let streak = 0;
  for (let i = rounds.length - 1; i >= 0 && rounds[i].winner === last?.winner; i--) {
    streak++;
  }

  return (
    <div className="bc__rounds">
      <span className="bc__roundsTag">
        {rounds.length} played
        {streak >= 3 && last && (
          <span
            className={`bc__roundsRun bc__roundsRun--${last.winner === "CT" ? "ct" : "t"}`}
          >
            {last.winner} on {streak}
          </span>
        )}
      </span>

      <div className="bc__rndRow" role="list" aria-label="Round results">
        {rounds.map((r) => (
          <span key={r.round} style={{ display: "contents" }}>
            {halfAt !== null && r.round === halfAt + 1 && (
              <span className="bc__rndGap" aria-hidden />
            )}
            <span
              role="listitem"
              className={`bc__rnd bc__rnd--${r.winner === "CT" ? "ct" : "t"}`}
              title={`Round ${r.round} · ${r.winner} · ${describeReason(r.reason)} · ${r.score.ct}–${r.score.t}`}
            >
              {r.round}
            </span>
          </span>
        ))}
      </div>

      {current.length > 0 && (
        <ul className="bc__rndNow">
          {current.map((e) => {
            const { icon: EventIcon, label } = ROUND_EVENT[e.kind];
            return (
              <li key={e.id}>
                <EventIcon size={13} weight="fill" aria-hidden />
                <b>{e.name}</b> {label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
