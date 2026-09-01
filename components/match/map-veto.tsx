"use client";

import Image from "next/image";
import { ArrowUUpLeft, Prohibit, Check } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { MapPlaceholder } from "@/components/maps/map-placeholder";
import { getOfficialMapArtPath } from "@/lib/maps/official-art";
import { shortMapName } from "@/lib/cs2/workshop";
import {
  nextAction,
  remainingMaps,
  undoVeto,
  vetoResult,
  vetoSequence,
  actOn,
  type VetoState,
} from "@/lib/match/veto";
import type { MapEntry } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * The veto, run here rather than in chat.
 *
 * MatchZy's own veto lives in the in-game console: captains type `.ban`, and
 * the record of what happened scrolls away. Running it in the panel hands the
 * plugin a finished, ordered map list with `skip_veto`, so there is one
 * authority instead of two — and everyone can see, at once, what is gone, what
 * is picked, and who acts next.
 *
 * Whose turn it is comes from `lib/match/veto.ts`, which also owns the
 * sequence. This file only draws it.
 */
export function MapVeto({
  state,
  onChange,
  onCommit,
  onCancel,
  entries,
  team1Name,
  team2Name,
}: {
  state: VetoState;
  onChange: (next: VetoState) => void;
  /** Called with the finished, ordered map list. */
  onCommit: (maps: string[]) => void;
  onCancel: () => void;
  entries: Map<string, MapEntry>;
  team1Name: string;
  team2Name: string;
}) {
  const action = nextAction(state);
  const remaining = remainingMaps(state);
  const result = vetoResult(state);
  const sequence = vetoSequence(state.pool.length, state.numMaps, state.firstSide);
  const sideName = (side: "team1" | "team2") =>
    side === "team1" ? team1Name : team2Name;

  const decided = new Map(state.steps.map((s) => [s.map, s]));

  return (
    <div className="space-y-3 border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-sm">
          {action ? (
            <>
              <span
                className={cn(
                  "font-medium",
                  action.side === "team1" ? "text-primary" : "text-info",
                )}
              >
                {sideName(action.side)}
              </span>{" "}
              {action.kind === "ban" ? "bans" : "picks"} — step{" "}
              {state.steps.length + 1} of {sequence.length}.
            </>
          ) : (
            <span className="font-medium">
              Veto done. {result?.length ?? 0} map
              {result?.length === 1 ? "" : "s"} in order.
            </span>
          )}
        </p>
        <div className="flex items-center gap-1">
          {state.steps.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onChange(undoVeto(state))}>
              <ArrowUUpLeft className="size-4" />
              Undo
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {result && (
            <Button size="sm" onClick={() => onCommit(result)}>
              <Check className="size-4" />
              Use these maps
            </Button>
          )}
        </div>
      </div>

      {/*
        What is coming, not just what is now. A chat veto never tells captains
        whether their next turn is a ban or a pick, which is exactly what they
        need to plan the one in front of them.
      */}
      <ol className="flex flex-wrap gap-1">
        {sequence.map((a, i) => (
          <li
            key={i}
            className={cn(
              "border px-1.5 py-0.5 text-xs tabular-nums",
              i < state.steps.length
                ? "border-foreground/10 text-muted-foreground line-through"
                : i === state.steps.length
                  ? a.side === "team1"
                    ? "border-primary text-primary"
                    : "border-info text-info"
                  : "border-dashed border-foreground/15 text-muted-foreground",
            )}
          >
            {sideName(a.side)} {a.kind}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {state.pool.map((name) => {
          const step = decided.get(name);
          const entry = entries.get(name);
          const art = entry?.thumbnailUrl ?? getOfficialMapArtPath(name);
          const banned = step?.kind === "ban";
          const picked = step?.kind === "pick";
          const order = result ? result.indexOf(name) : -1;
          return (
            <button
              key={name}
              type="button"
              disabled={!action || !remaining.includes(name)}
              onClick={() => onChange(actOn(state, name))}
              aria-label={
                step
                  ? `${name}, ${step.kind}ed by ${sideName(step.side)}`
                  : action
                    ? `${sideName(action.side)} ${action.kind} ${name}`
                    : name
              }
              className={cn(
                "group relative aspect-video overflow-hidden border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                banned && "border-foreground/10 grayscale",
                picked && "border-primary ring-1 ring-primary",
                !step &&
                  (action
                    ? "border-foreground/20 hover:border-foreground/50"
                    : "border-foreground/10"),
              )}
            >
              {art ? (
                <Image
                  src={art}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 33vw, 16vw"
                  className={cn(
                    "object-cover object-center transition",
                    banned ? "opacity-20" : step ? "opacity-90" : "opacity-60",
                  )}
                />
              ) : (
                <MapPlaceholder name={name} />
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-background/85 px-1.5 py-1 text-xs">
                {banned && (
                  <Prohibit className="size-3 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    "min-w-0 truncate font-mono",
                    banned && "text-muted-foreground line-through",
                  )}
                >
                  {shortMapName(name)}
                </span>
                {order >= 0 && (
                  <span className="ml-auto shrink-0 font-medium tabular-nums text-primary">
                    {order + 1}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
