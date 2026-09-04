"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { MatchHistoryDetail } from "@/lib/api/types";

type HistoryPlayer = MatchHistoryDetail["players"][number];

/**
 * Who played, from the panel's own record.
 *
 * These rows were fetched, hydrated and thrown away: `getMatchDetail` has
 * always read `match_players`, `MatchHistoryDetail.players` has always carried
 * them, and nothing rendered them — so a match without MatchZy was a score and
 * a round strip, and the question "who was even playing" had no answer at all.
 *
 * Four columns, because four is what the log parser can honestly produce.
 * Damage, headshot rate and clutches are MatchZy's, and where MatchZy ran the
 * match {@link MatchZyScoreboard} shows them instead of this.
 *
 * Grouped by the side each player *finished* on, and labelled that way. The
 * sides swap at half-time and the panel does not track who started where, so
 * calling these "teams" would attach ten names to a pairing that never existed.
 */
export function PanelScoreboard({ players }: { players: HistoryPlayer[] }) {
  if (players.length === 0) return null;

  const sides: Array<{ key: "CT" | "T" | "SPEC"; label: string }> = [
    { key: "CT", label: "Finished CT" },
    { key: "T", label: "Finished T" },
    { key: "SPEC", label: "Spectating" },
  ];

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-1.5 text-left font-medium">Player</th>
            <th className="px-3 py-1.5 text-right font-medium">K</th>
            <th className="px-3 py-1.5 text-right font-medium">D</th>
            <th className="px-3 py-1.5 text-right font-medium">A</th>
            <th className="px-3 py-1.5 text-right font-medium">K/D</th>
          </tr>
        </thead>
        <tbody>
          {sides.map(({ key, label }) => {
            const side = players
              .filter((p) => p.team === key)
              .sort((a, b) => b.k - a.k);
            if (side.length === 0) return null;
            return (
              <Fragment key={key}>
                <tr className="border-b bg-muted/40">
                  <td
                    colSpan={5}
                    className={cn(
                      "px-3 py-1 font-medium",
                      key === "CT" && "text-team-ct",
                      key === "T" && "text-team-t",
                      key === "SPEC" && "text-muted-foreground",
                    )}
                  >
                    {label}
                  </td>
                </tr>
                {side.map((p) => (
                  <tr key={p.steamId} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{p.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.k}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.d}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.a}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {/*
                        Deaths, not rounds, in the denominator — and a player
                        who never died divides by one rather than by zero.
                      */}
                      {(p.k / Math.max(1, p.d)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
