"use client";

import { ArrowUUpLeft, Crown, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  draftTurn,
  releasePlayer,
  setCaptain,
  pickPlayer,
  teamMembers,
  undoPick,
  undrafted,
  type DraftState,
  type Side,
} from "@/lib/match/draft";
import { cn } from "@/lib/utils";

/**
 * Captains picking teams, one at a time, with the turn on screen.
 *
 * The team builder next door is the right tool when the teams are already
 * decided. This is for the way the evening actually starts — two captains,
 * everyone else waiting to be called — and the one thing that always goes
 * wrong there is losing track of whose turn it is. So the turn is the loudest
 * thing in the component, the pool is one tap per player, and every step is
 * undoable, because a misclick during a draft is a social problem.
 *
 * The turn is derived from team sizes in `lib/match/draft.ts`, not counted
 * here: a player released after someone leaves hands the turn back correctly.
 */
export function CaptainDraft({
  state,
  onChange,
  pool,
  nameOf,
  team1Name,
  team2Name,
  onTeam1Name,
  onTeam2Name,
}: {
  state: DraftState;
  onChange: (next: DraftState) => void;
  /** Connected, roster-eligible Steam64s, in roster order. */
  pool: string[];
  nameOf: (id: string) => string;
  team1Name: string;
  team2Name: string;
  onTeam1Name: (name: string) => void;
  onTeam2Name: (name: string) => void;
}) {
  const turn = draftTurn(state);
  const waiting = undrafted(state, pool);
  const bothCaptains = Boolean(state.captains.team1 && state.captains.team2);

  const columns = [
    {
      key: "team1" as Side,
      name: team1Name,
      onName: onTeam1Name,
      accent: "text-primary",
      dot: "bg-primary",
      ring: "ring-primary",
    },
    {
      key: "team2" as Side,
      name: team2Name,
      onName: onTeam2Name,
      accent: "text-info",
      dot: "bg-info",
      ring: "ring-info",
    },
  ];

  const captainless = columns.find((c) => !state.captains[c.key]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-sm">
          {!bothCaptains ? (
            <>
              Pick a captain for{" "}
              <span className={cn("font-medium", captainless?.accent)}>
                {captainless?.name}
              </span>
              .
            </>
          ) : waiting.length === 0 ? (
            <span className="text-muted-foreground">
              Everyone is on a team.
            </span>
          ) : (
            <>
              <span
                className={cn(
                  "font-medium",
                  turn === "team1" ? "text-primary" : "text-info",
                )}
              >
                {turn === "team1" ? team1Name : team2Name}
              </span>{" "}
              picks — {waiting.length} left.
            </>
          )}
        </p>
        {state.picks.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(undoPick(state))}
          >
            <ArrowUUpLeft className="size-4" />
            Undo pick
          </Button>
        )}
      </div>

      {/*
        The pool. One tap sends a player to whoever is up, so nobody has to
        aim at the right column under pressure — and while the captains are
        still missing, the same tap makes them a captain instead.
      */}
      {waiting.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {waiting.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                onChange(
                  bothCaptains
                    ? pickPlayer(state, id)
                    : setCaptain(
                        state,
                        state.captains.team1 ? "team2" : "team1",
                        id,
                      ),
                )
              }
              className={cn(
                "flex min-h-11 items-center gap-1.5 border bg-card px-3 text-sm transition-colors",
                bothCaptains
                  ? turn === "team1"
                    ? "hover:border-primary hover:bg-primary/10"
                    : "hover:border-info hover:bg-info/10"
                  : "hover:border-foreground/40 hover:bg-muted/40",
              )}
              aria-label={
                bothCaptains
                  ? `Pick ${nameOf(id)} for ${turn === "team1" ? team1Name : team2Name}`
                  : `Make ${nameOf(id)} captain of ${captainless?.name}`
              }
            >
              {!bothCaptains && (
                <Crown className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="max-w-40 truncate">{nameOf(id)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {columns.map((col) => {
          const members = teamMembers(state, col.key);
          const captain = state.captains[col.key];
          return (
            <div
              key={col.key}
              className={cn(
                "border bg-card",
                bothCaptains && turn === col.key && waiting.length > 0
                  ? cn("ring-1", col.ring)
                  : null,
              )}
            >
              <div className="flex items-center gap-2 border-b px-2.5 py-2">
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", col.dot)}
                />
                <Input
                  aria-label={`${col.key === "team1" ? "Team 1" : "Team 2"} name`}
                  value={col.name}
                  onChange={(e) => col.onName(e.target.value)}
                  className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-1"
                />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {members.length}
                </span>
              </div>
              {members.length === 0 ? (
                <p className="px-2.5 py-3.5 text-xs text-muted-foreground">
                  No captain yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {members.map((id) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onChange(releasePlayer(state, id))}
                        aria-label={`Take ${nameOf(id)} off ${col.name}`}
                        className="flex min-h-11 w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {id === captain && (
                            <Crown
                              weight="fill"
                              className={cn("size-3.5 shrink-0", col.accent)}
                              aria-label="Captain"
                            />
                          )}
                          <span className="truncate">{nameOf(id)}</span>
                        </span>
                        <X className="size-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
