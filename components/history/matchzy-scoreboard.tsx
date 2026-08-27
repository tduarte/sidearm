"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { MatchZyPlayerStats } from "@/lib/api/types";

/**
 * The scoreboard MatchZy kept, which the panel could not have assembled.
 *
 * The log parser can count kills, deaths and assists off the event stream and
 * nothing more. Damage, headshot rate, flashes, opening duels and clutches are
 * only in MatchZy's own database — so this appears on matches it ran and
 * nowhere else, rather than being faked with zeroes for everyone else.
 *
 * Nulls are rendered as `—`, never 0: a player with no kills has no headshot
 * percentage, and saying "0%" claims a measurement that was never taken.
 */
function Stat({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  return (
    <>
      {value}
      {suffix}
    </>
  );
}

/** `won/played`, with the ratio dimmed when nothing was attempted. */
function Duel({ played, won }: { played: number; won: number }) {
  if (played === 0) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  return (
    <span className="tabular-nums">
      {won}
      <span className="text-muted-foreground">/{played}</span>
    </span>
  );
}

export function MatchZyScoreboard({ players }: { players: MatchZyPlayerStats[] }) {
  if (players.length === 0) return null;

  // Grouped by MatchZy's own team label rather than by CT/T: teams swap sides
  // at half-time, so the side a player finished on is not who they played for.
  const teams = new Map<string, MatchZyPlayerStats[]>();
  for (const p of players) {
    const list = teams.get(p.team);
    if (list) list.push(p);
    else teams.set(p.team, [p]);
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-1.5 text-left font-medium">Player</th>
            <th className="px-2 py-1.5 text-right font-medium">K</th>
            <th className="px-2 py-1.5 text-right font-medium">D</th>
            <th className="px-2 py-1.5 text-right font-medium">A</th>
            <th className="px-2 py-1.5 text-right font-medium">ADR</th>
            <th className="px-2 py-1.5 text-right font-medium">HS%</th>
            <th className="px-2 py-1.5 text-right font-medium">Flashed</th>
            <th className="px-2 py-1.5 text-right font-medium">Util dmg</th>
            <th className="px-2 py-1.5 text-right font-medium">Entry</th>
            <th className="px-3 py-1.5 text-right font-medium">Clutch</th>
          </tr>
        </thead>
        <tbody>
          {[...teams.entries()].map(([team, roster]) => (
            <Fragment key={team}>
              <tr className="border-b bg-muted/30">
                <td
                  colSpan={10}
                  className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {team || "Unassigned"}
                </td>
              </tr>
              {roster.map((p) => (
                <tr key={p.steamId64} className="border-b last:border-0">
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{p.name || "(unnamed)"}</span>
                    {/*
                      The Steam id is the only thing here that reliably
                      identifies a person — names change between matches.
                    */}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {p.steamId64}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.kills}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.deaths}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.assists}</td>
                  <td
                    className={cn(
                      "px-2 py-1.5 text-right tabular-nums",
                      p.adr !== null && p.adr >= 80 && "text-primary",
                    )}
                  >
                    <Stat value={p.adr} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    <Stat value={p.headshotPct} suffix="%" />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {p.enemiesFlashed}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {p.utilityDamage}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Duel {...p.entries} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Duel {...p.clutches} />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
